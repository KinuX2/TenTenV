// 声の中継（P2P がつながらない相手・IP アドレスを隠したいとき）
// WebRTC の音声が使えない相手には、マイクの音を Opus（WebCodecs）にして、データと同じ経路（親サーバーの中継）で送る
// 受け手は復号して、ほかの人の声と同じように頭の位置で鳴らす
import { BINARY_VOICE } from '@tentenv/protocol'
import type { InstanceSession } from './session'
import type { VoiceManager } from './voice'

const RATE = 48000
const FRAME = 960 // 20ms

const CAPTURE_WORKLET = `
class Cap extends AudioWorkletProcessor {
  constructor() { super(); this.buf = new Float32Array(${FRAME}); this.n = 0 }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0]
    if (!ch) return true
    for (let i = 0; i < ch.length; i++) {
      this.buf[this.n++] = ch[i]
      if (this.n === ${FRAME}) { this.port.postMessage({ pcm: this.buf.slice(0), t: currentTime }); this.n = 0 }
    }
    return true
  }
}
registerProcessor('ttv-voice-capture', Cap)
class Play extends AudioWorkletProcessor {
  constructor() {
    super()
    this.q = []; this.cur = null; this.pos = 0; this.started = false
    this.port.onmessage = (e) => { this.q.push(e.data); if (this.q.length > 25) this.q.splice(0, this.q.length - 6) }
  }
  process(_, outputs) {
    const out = outputs[0][0]
    // 3 つ（60ms）たまってから鳴らし始める（揺らぎを吸収する）
    if (!this.started) { if (this.q.length < 3) { out.fill(0); return true } this.started = true }
    for (let i = 0; i < out.length; i++) {
      if (!this.cur || this.pos >= this.cur.length) {
        this.cur = this.q.shift() || null; this.pos = 0
        if (!this.cur) { out.fill(0, i); this.started = false; return true }
      }
      out[i] = this.cur[this.pos++]
    }
    return true
  }
}
registerProcessor('ttv-voice-play', Play)
`

export const voiceRelaySupported = () => typeof AudioEncoder !== 'undefined' && typeof AudioDecoder !== 'undefined' && typeof AudioWorkletNode !== 'undefined'

interface Rx {
  decoder: AudioDecoder
  node: AudioWorkletNode
  dest: MediaStreamAudioDestinationNode
  lastSeq: number
}

export class VoiceRelay {
  private ctx: AudioContext
  private ready: Promise<boolean>
  private encoder: AudioEncoder | null = null
  private cap: AudioWorkletNode | null = null
  private src: MediaStreamAudioSourceNode | null = null
  private rx = new Map<string, Rx>()
  private seq = 0
  private ts = 0
  private offs: (() => void)[] = []

  constructor(
    private session: InstanceSession,
    private voice: VoiceManager,
  ) {
    this.ctx = voice.listener.context as AudioContext
    this.ready = voiceRelaySupported()
      ? this.ctx.audioWorklet
          .addModule(URL.createObjectURL(new Blob([CAPTURE_WORKLET], { type: 'text/javascript' })))
          .then(() => true)
          .catch(() => false)
      : Promise.resolve(false)
    this.offs.push(this.session.voiceEv.on((from, buf) => void this.receive(from, buf)))
    this.offs.push(this.session.t.onPeers((ev) => ev.kind === 'leave' && this.dropRx(ev.peerId)))
  }

  /** 中継で話す相手がいるか */
  private relayPeers() {
    return this.session.verifiedMembers().filter((m) => this.session.t.link(m.desc.peerId) === 'relay')
  }

  /** マイクの音（送る用に加工したもの）をつなぐ */
  async setMic(track: MediaStreamTrack | null) {
    this.src?.disconnect()
    this.cap?.disconnect()
    this.encoder?.close()
    this.src = null
    this.cap = null
    this.encoder = null
    if (!track || !(await this.ready)) return
    this.encoder = new AudioEncoder({
      output: (chunk) => this.send(chunk),
      error: (e) => console.warn('[voice-relay] 符号化に失敗', e),
    })
    this.encoder.configure({ codec: 'opus', sampleRate: RATE, numberOfChannels: 1, bitrate: 24000 })
    this.src = this.ctx.createMediaStreamSource(new MediaStream([track]))
    this.cap = new AudioWorkletNode(this.ctx, 'ttv-voice-capture', { numberOfInputs: 1, numberOfOutputs: 0, channelCount: 1 })
    this.src.connect(this.cap)
    this.cap.port.onmessage = (e: MessageEvent<{ pcm: Float32Array; t: number }>) => {
      // 画面の処理が詰まってたまった古い音は捨てる（まとめて送ると相手にも親サーバーにも負担になる）
      if (this.ctx.currentTime - e.data.t > 0.15) return
      // 中継の相手がいて、話しているときだけ送る
      if (!this.encoder || this.encoder.state !== 'configured' || !this.voice.transmitting() || !this.relayPeers().length) return
      const pcm = new Float32Array(this.resample(e.data.pcm))
      const data = new AudioData({ format: 'f32', sampleRate: RATE, numberOfFrames: pcm.length, numberOfChannels: 1, timestamp: this.ts, data: pcm })
      this.ts += (pcm.length / RATE) * 1e6
      this.encoder.encode(data)
      data.close()
    }
  }

  /** 端末の音の速さ（44.1kHz など）が 48kHz でないときは、簡単に合わせる */
  private resample(x: Float32Array) {
    const sr = this.ctx.sampleRate
    if (sr === RATE) return x
    const n = Math.round((x.length * RATE) / sr)
    const out = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      const p = (i * sr) / RATE
      const a = Math.floor(p)
      const t = p - a
      out[i] = (x[a] ?? 0) * (1 - t) + (x[a + 1] ?? x[a] ?? 0) * t
    }
    return out
  }

  private send(chunk: EncodedAudioChunk) {
    const peers = this.relayPeers()
    if (!peers.length) return
    const buf = new ArrayBuffer(1 + 2 + chunk.byteLength)
    const v = new DataView(buf)
    v.setUint8(0, BINARY_VOICE)
    v.setUint16(1, this.seq++ & 0xffff, true)
    chunk.copyTo(new Uint8Array(buf, 3))
    for (const m of peers) this.session.t.sendU(m.desc.peerId, buf)
  }

  private async receive(from: string, buf: ArrayBuffer) {
    if (!(await this.ready) || buf.byteLength < 4 || buf.byteLength > 1500) return
    let rx = this.rx.get(from)
    if (!rx) {
      const node = new AudioWorkletNode(this.ctx, 'ttv-voice-play', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1] })
      const dest = this.ctx.createMediaStreamDestination()
      node.connect(dest)
      const decoder = new AudioDecoder({
        output: (d) => {
          const pcm = new Float32Array(d.numberOfFrames)
          d.copyTo(pcm, { planeIndex: 0, format: 'f32-planar' })
          // close のあとは sampleRate が 0 になるので先に読む
          const rate = d.sampleRate || RATE
          d.close()
          node.port.postMessage(this.toDevice(pcm, rate))
        },
        error: (e) => console.warn('[voice-relay] 復号に失敗', e),
      })
      decoder.configure({ codec: 'opus', sampleRate: RATE, numberOfChannels: 1 })
      rx = { decoder, node, dest, lastSeq: -1 }
      this.rx.set(from, rx)
      // ほかの人の声と同じ扱いにする（頭の位置・音量・ミュート）
      this.voice.addRemote(from, dest.stream)
    }
    const v = new DataView(buf)
    const seq = v.getUint16(1, true)
    rx.lastSeq = seq
    if (rx.decoder.state !== 'configured') return
    rx.decoder.decode(new EncodedAudioChunk({ type: 'key', timestamp: seq * 20000, data: new Uint8Array(buf, 3) }))
  }

  /** 48kHz の音を端末の音の速さに合わせる */
  private toDevice(x: Float32Array, rate: number) {
    const sr = this.ctx.sampleRate
    if (sr === rate) return x
    const n = Math.round((x.length * sr) / rate)
    const out = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      const p = (i * rate) / sr
      const a = Math.floor(p)
      const t = p - a
      out[i] = (x[a] ?? 0) * (1 - t) + (x[a + 1] ?? x[a] ?? 0) * t
    }
    return out
  }

  private dropRx(peerId: string) {
    const rx = this.rx.get(peerId)
    if (!rx) return
    try {
      rx.decoder.close()
    } catch {
      // すでに閉じている
    }
    rx.node.disconnect()
    this.rx.delete(peerId)
  }

  dispose() {
    this.offs.forEach((f) => f())
    void this.setMic(null)
    for (const id of [...this.rx.keys()]) this.dropRx(id)
  }
}
