// 音声チャット（[55][56][57][58][64]）
// - マイク: ブラウザのノイズ抑制・エコー除去を使い、Web Audio で音量を変えてから送る
// - 相手の声: 頭の位置に置いた PositionalAudio（HRTF）で鳴らし、距離で小さくする
// - 声の大きさを測って、話しているかの表示と口の動き（リップシンク）に使う
import { AudioListener, PositionalAudio } from 'three'
import { settings } from '../state/settings'

export interface VoiceLevel {
  /** 0〜1 の音量 */
  level: number
  /** 口の形（あ・い・う・え・お）の重み */
  visemes: { aa: number; ih: number; ou: number; ee: number; oh: number }
  talking: boolean
}

const silent = (): VoiceLevel => ({ level: 0, visemes: { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 }, talking: false })

/** 声の大きさと大まかな周波数から口の形を推定する */
class LevelMeter {
  private buf: Float32Array<ArrayBuffer>
  private freq: Uint8Array<ArrayBuffer>
  private smooth = 0
  private hold = 0
  readonly out = silent()
  constructor(readonly analyser: AnalyserNode) {
    analyser.fftSize = 1024
    analyser.smoothingTimeConstant = 0.5
    this.buf = new Float32Array(analyser.fftSize)
    this.freq = new Uint8Array(analyser.frequencyBinCount)
  }
  update(dt: number) {
    this.analyser.getFloatTimeDomainData(this.buf)
    let sum = 0
    for (let i = 0; i < this.buf.length; i++) sum += this.buf[i] * this.buf[i]
    const rms = Math.sqrt(sum / this.buf.length)
    const level = Math.min(1, Math.max(0, (20 * Math.log10(rms + 1e-6) + 52) / 40))
    const k = 1 - Math.exp(-dt * 18)
    this.smooth += (level - this.smooth) * k
    this.hold = level > 0.18 ? 0.3 : Math.max(0, this.hold - dt)
    this.out.level = this.smooth
    this.out.talking = this.hold > 0
    // 周波数の重心で母音を大まかに分ける（低い: お・う、中: あ、高い: い・え）
    this.analyser.getByteFrequencyData(this.freq)
    const hz = this.analyser.context.sampleRate / this.analyser.fftSize
    let e = 0, c = 0
    for (let i = Math.floor(150 / hz); i < Math.min(this.freq.length, Math.floor(4000 / hz)); i++) {
      e += this.freq[i]
      c += this.freq[i] * i * hz
    }
    const centroid = e > 0 ? c / e : 0
    const open = Math.max(0, this.smooth - 0.12) * 1.6
    const v = this.out.visemes
    const target = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 }
    if (open > 0.01) {
      if (centroid < 700) { target.oh = open * 0.7; target.ou = open * 0.5 }
      else if (centroid < 1100) target.aa = open
      else if (centroid < 1600) { target.ee = open * 0.8; target.aa = open * 0.3 }
      else target.ih = open * 0.9
    }
    const kk = 1 - Math.exp(-dt * 25)
    for (const key of Object.keys(v) as (keyof typeof v)[]) v[key] += (Math.min(1, target[key]) - v[key]) * kk
  }
}

interface Remote {
  stream: MediaStream
  el: HTMLAudioElement
  audio: PositionalAudio
  meter: LevelMeter
  gain: number
}

export class VoiceManager {
  readonly listener: AudioListener
  private micStream: MediaStream | null = null
  private micSource: MediaStreamAudioSourceNode | null = null
  private micGain: GainNode | null = null
  private micDest: MediaStreamAudioDestinationNode | null = null
  private micMeter: LevelMeter | null = null
  private remotes = new Map<string, Remote>()
  private gains = new Map<string, number>()
  private worldGains = new Map<string, number>()
  private silenced = new Set<string>()
  muted = false
  /** Push-to-Talk のキーを押している間 */
  pttDown = false
  micError: string | null = null
  private onTrack: (track: MediaStreamTrack | null) => void = () => {}

  constructor(listener: AudioListener) {
    this.listener = listener
    this.muted = settings().startMuted
  }

  /** マイクの音を送る先（通信）を決める */
  bindSender(f: (track: MediaStreamTrack | null) => void) {
    this.onTrack = f
    f(this.micDest?.stream.getAudioTracks()[0] ?? null)
  }

  async startMic() {
    const s = settings()
    this.stopMic()
    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: s.micDeviceId ? { exact: s.micDeviceId } : undefined,
          noiseSuppression: s.noiseSuppression,
          echoCancellation: s.echoCancellation,
          autoGainControl: s.autoGain,
          channelCount: 1,
        },
      })
    } catch (e) {
      this.micError = e instanceof Error && e.name === 'NotAllowedError' ? 'マイクの使用が許可されていません' : 'マイクを使えません'
      return false
    }
    this.micError = null
    const ctx = this.listener.context
    this.micSource = ctx.createMediaStreamSource(this.micStream)
    this.micGain = ctx.createGain()
    this.micDest = ctx.createMediaStreamDestination()
    const analyser = ctx.createAnalyser()
    this.micSource.connect(this.micGain)
    this.micGain.connect(this.micDest)
    this.micSource.connect(analyser)
    this.micMeter = new LevelMeter(analyser)
    this.applyMicGain()
    this.onTrack(this.micDest.stream.getAudioTracks()[0] ?? null)
    return true
  }

  stopMic() {
    this.micStream?.getTracks().forEach((t) => t.stop())
    this.micSource?.disconnect()
    this.micGain?.disconnect()
    this.micStream = null
    this.micSource = null
    this.micGain = null
    this.micDest = null
    this.micMeter = null
    this.onTrack(null)
  }

  /** 送っているか（ミュート・Push-to-Talk を考える） */
  transmitting() {
    if (!this.micStream || this.muted) return false
    return settings().pushToTalk ? this.pttDown : true
  }

  applyMicGain() {
    if (!this.micGain) return
    this.micGain.gain.setTargetAtTime(this.transmitting() ? settings().micGain : 0, this.listener.context.currentTime, 0.02)
  }

  setMuted(m: boolean) {
    this.muted = m
    this.applyMicGain()
  }
  setPtt(down: boolean) {
    this.pttDown = down
    this.applyMicGain()
  }

  localLevel(dt: number): VoiceLevel {
    if (!this.micMeter || !this.transmitting()) return silent()
    this.micMeter.update(dt)
    return this.micMeter.out
  }

  // ---------------- 相手の声 ----------------

  addRemote(peerId: string, stream: MediaStream) {
    this.removeRemote(peerId)
    // Chrome は、音声要素で再生していない WebRTC の音を Web Audio に流さないため、消音で再生しておく
    const el = new Audio()
    el.muted = true
    el.srcObject = stream
    void el.play().catch(() => {})
    const audio = new PositionalAudio(this.listener)
    audio.setMediaStreamSource(stream)
    audio.setDistanceModel('inverse')
    audio.setRefDistance(1.2)
    audio.setRolloffFactor(1.4)
    audio.setMaxDistance(settings().voiceRange)
    audio.panner.panningModel = 'HRTF'
    const analyser = this.listener.context.createAnalyser()
    // 距離で小さくなる前の音で、話しているかを測る
    const src = (audio as unknown as { source: AudioNode }).source
    src?.connect(analyser)
    const r: Remote = { stream, el, audio, meter: new LevelMeter(analyser), gain: 1 }
    this.remotes.set(peerId, r)
    this.applyGain(peerId)
    return audio
  }

  removeRemote(peerId: string) {
    const r = this.remotes.get(peerId)
    if (!r) return
    r.el.srcObject = null
    try {
      r.audio.disconnect()
    } catch {
      // すでに外れている
    }
    r.audio.removeFromParent()
    this.remotes.delete(peerId)
  }

  remoteAudio(peerId: string) {
    return this.remotes.get(peerId)?.audio ?? null
  }

  remoteLevel(peerId: string, dt: number): VoiceLevel {
    const r = this.remotes.get(peerId)
    if (!r || this.silenced.has(peerId)) return silent()
    r.meter.update(dt)
    return r.meter.out
  }

  /** 人ごとの音量（[58]、0〜2） */
  setUserGain(peerId: string, g: number) {
    this.gains.set(peerId, g)
    this.applyGain(peerId)
  }
  userGain(peerId: string) {
    return this.gains.get(peerId) ?? 1
  }
  /** ワールドが決める音量（null で解除） */
  setWorldGain(peerId: string, g: number | null) {
    if (g === null) this.worldGains.delete(peerId)
    else this.worldGains.set(peerId, Math.max(0, Math.min(2, g)))
    this.applyGain(peerId)
  }
  /** ミュート・ブロック（[166][167]） */
  setSilenced(peerId: string, on: boolean) {
    if (on) this.silenced.add(peerId)
    else this.silenced.delete(peerId)
    this.applyGain(peerId)
  }
  isSilenced(peerId: string) {
    return this.silenced.has(peerId)
  }
  applyGain(peerId: string) {
    const r = this.remotes.get(peerId)
    if (!r) return
    const s = settings()
    const g = this.silenced.has(peerId) ? 0 : s.voiceVolume * (this.gains.get(peerId) ?? 1) * (this.worldGains.get(peerId) ?? 1)
    r.audio.setVolume(g)
    r.audio.setMaxDistance(s.voiceRange)
  }
  applyAllGains() {
    for (const id of this.remotes.keys()) this.applyGain(id)
    this.applyMicGain()
  }

  dispose() {
    this.stopMic()
    for (const id of [...this.remotes.keys()]) this.removeRemote(id)
  }
}

export { listDevices } from './devices'
