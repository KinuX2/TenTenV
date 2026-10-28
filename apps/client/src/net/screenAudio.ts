// 画面共有の音
// 共有した画面の音（タブやシステムの音）を Opus（WebCodecs、ステレオ）にして、P2P の相手にはデータチャネル、
// 中継の相手には親サーバーの中継で送る。WebRTC の音声の枠を増やさないので、古いクライアントとも混ざれる
// 受け手は、共有している人（owner）からの音だけを復号し、MediaStream にしてワールド（画面の位置）で鳴らす
import { BINARY_SCREEN_AUDIO, SCREEN_AUDIO_PACKET_BYTES } from '@tentenv/protocol'
import type { InstanceSession } from './session'

const RATE = 48000
const FRAME = 960 // 20ms
const CHANNELS = 2
const BITRATE = 64000
const HEADER = 4

const WORKLET = `
class Cap extends AudioWorkletProcessor {
  constructor() { super(); this.buf = new Float32Array(${FRAME * CHANNELS}); this.n = 0 }
  process(inputs) {
    const input = inputs[0]
    const l = input && input[0]
    if (!l) return true
    const r = input[1] || l
    for (let i = 0; i < l.length; i++) {
      this.buf[this.n] = l[i]
      this.buf[${FRAME} + this.n] = r[i]
      if (++this.n === ${FRAME}) { this.port.postMessage({ pcm: this.buf.slice(0), t: currentTime }); this.n = 0 }
    }
    return true
  }
}
registerProcessor('ttv-screen-audio-capture', Cap)
class Play extends AudioWorkletProcessor {
  constructor() {
    super()
    this.q = []; this.cur = null; this.pos = 0; this.len = 0; this.started = false
    // 動画の音なので声より多め（100ms）にためてから鳴らす。遅れすぎたら古いものを捨てる
    this.port.onmessage = (e) => { this.q.push(e.data); if (this.q.length > 40) this.q.splice(0, this.q.length - 8) }
  }
  process(_, outputs) {
    const l = outputs[0][0], r = outputs[0][1] || l
    if (!this.started) { if (this.q.length < 5) { l.fill(0); r.fill(0); return true } this.started = true }
    for (let i = 0; i < l.length; i++) {
      if (!this.cur || this.pos >= this.len) {
        this.cur = this.q.shift() || null; this.pos = 0
        if (!this.cur) { l.fill(0, i); r.fill(0, i); this.started = false; return true }
        this.len = this.cur.length / 2
      }
      l[i] = this.cur[this.pos]
      r[i] = this.cur[this.len + this.pos]
      this.pos++
    }
    return true
  }
}
registerProcessor('ttv-screen-audio-play', Play)
`

export const screenAudioSupported = () => typeof AudioEncoder !== 'undefined' && typeof AudioDecoder !== 'undefined' && typeof AudioWorkletNode !== 'undefined'

/** パケットを作る: [5][チャンネル数][連番 u16][Opus] */
export const encodeScreenAudioPacket = (seq: number, channels: number, data: Uint8Array) => {
  if (HEADER + data.byteLength > SCREEN_AUDIO_PACKET_BYTES) return null
  const buf = new ArrayBuffer(HEADER + data.byteLength)
  const v = new DataView(buf)
  v.setUint8(0, BINARY_SCREEN_AUDIO)
  v.setUint8(1, channels)
  v.setUint16(2, seq & 0xffff, true)
  new Uint8Array(buf, HEADER).set(data)
  return buf
}

export const readScreenAudioPacket = (buf: ArrayBuffer) => {
  if (buf.byteLength <= HEADER || buf.byteLength > SCREEN_AUDIO_PACKET_BYTES) return null
  const v = new DataView(buf)
  const channels = v.getUint8(1)
  if (v.getUint8(0) !== BINARY_SCREEN_AUDIO || (channels !== 1 && channels !== 2)) return null
  return { channels, seq: v.getUint16(2, true), data: new Uint8Array(buf, HEADER) }
}

/** 左右に並べた（planar）音の速さを変える（簡単な直線補間） */
export const resamplePlanar = (x: Float32Array<ArrayBuffer>, channels: number, from: number, to: number): Float32Array<ArrayBuffer> => {
  if (from === to) return x
  const len = x.length / channels
  const n = Math.round((len * to) / from)
  const out = new Float32Array(n * channels)
  for (let c = 0; c < channels; c++) {
    const src = x.subarray(c * len, (c + 1) * len)
    for (let i = 0; i < n; i++) {
      const p = (i * from) / to
      const a = Math.floor(p)
      const t = p - a
      out[c * n + i] = (src[a] ?? 0) * (1 - t) + (src[a + 1] ?? src[a] ?? 0) * t
    }
  }
  return out
}

interface Rx {
  decoder: AudioDecoder
  node: AudioWorkletNode
  dest: MediaStreamAudioDestinationNode
}

export class ScreenAudio {
  private ready: Promise<boolean>
  private encoder: AudioEncoder | null = null
  private cap: AudioWorkletNode | null = null
  private src: MediaStreamAudioSourceNode | null = null
  private rx = new Map<string, Rx>()
  private seq = 0
  private ts = 0
  private offs: (() => void)[] = []
  private disposed = false

  constructor(
    private session: InstanceSession,
    private ctx: AudioContext,
    private owner: () => string | null,
    private onStream: (peerId: string, stream: MediaStream | null) => void,
  ) {
    this.ready = screenAudioSupported()
      ? ctx.audioWorklet
          .addModule(URL.createObjectURL(new Blob([WORKLET], { type: 'text/javascript' })))
          .then(() => true)
          .catch(() => false)
      : Promise.resolve(false)
    this.offs.push(session.screenAudioEv.on((from, buf) => void this.receive(from, buf)))
  }

  /** 共有した画面の音を送り始める（null で止める） */
  async setTrack(track: MediaStreamTrack | null) {
    this.src?.disconnect()
    this.cap?.disconnect()
    if (this.encoder && this.encoder.state !== 'closed') this.encoder.close()
    this.src = null
    this.cap = null
    this.encoder = null
    if (!track || !(await this.ready) || this.disposed) return
    const encoder = new AudioEncoder({
      output: (chunk) => this.send(chunk),
      error: (e) => console.warn('[screen-audio] 符号化に失敗', e),
    })
    encoder.configure({ codec: 'opus', sampleRate: RATE, numberOfChannels: CHANNELS, bitrate: BITRATE })
    this.encoder = encoder
    this.src = this.ctx.createMediaStreamSource(new MediaStream([track]))
    this.cap = new AudioWorkletNode(this.ctx, 'ttv-screen-audio-capture', { numberOfInputs: 1, numberOfOutputs: 0, channelCount: CHANNELS, channelCountMode: 'explicit' })
    this.src.connect(this.cap)
    this.cap.port.onmessage = (e: MessageEvent<{ pcm: Float32Array<ArrayBuffer>; t: number }>) => {
      // 画面の処理が詰まってたまった古い音は捨てる
      if (this.ctx.currentTime - e.data.t > 0.25) return
      if (encoder.state !== 'configured' || !this.session.verifiedMembers().length) return
      const pcm = resamplePlanar(e.data.pcm, CHANNELS, this.ctx.sampleRate, RATE)
      const frames = pcm.length / CHANNELS
      const data = new AudioData({ format: 'f32-planar', sampleRate: RATE, numberOfFrames: frames, numberOfChannels: CHANNELS, timestamp: this.ts, data: pcm as Float32Array<ArrayBuffer> })
      this.ts += (frames / RATE) * 1e6
      // 符号化が追いつかないときは捨てる（遅れた音をまとめて送らない）
      if (encoder.encodeQueueSize < 8) encoder.encode(data)
      data.close()
    }
  }

  private send(chunk: EncodedAudioChunk) {
    const data = new Uint8Array(chunk.byteLength)
    chunk.copyTo(data)
    const buf = encodeScreenAudioPacket(this.seq++, CHANNELS, data)
    if (buf) this.session.t.sendU('*', buf)
  }

  private async receive(from: string, buf: ArrayBuffer) {
    const packet = readScreenAudioPacket(buf)
    if (!packet || from !== this.owner() || !(await this.ready)) return
    // 準備を待つ間に共有が終わった・相手が抜けたなら、受け手を作らない
    if (this.disposed || from !== this.owner()) return
    let rx = this.rx.get(from)
    if (!rx) {
      const node = new AudioWorkletNode(this.ctx, 'ttv-screen-audio-play', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [CHANNELS] })
      const dest = this.ctx.createMediaStreamDestination()
      dest.channelCount = CHANNELS
      node.connect(dest)
      const decoder = new AudioDecoder({
        output: (d) => {
          const channels = d.numberOfChannels
          const frames = d.numberOfFrames
          const rate = d.sampleRate || RATE
          const pcm = new Float32Array(frames * CHANNELS)
          for (let c = 0; c < CHANNELS; c++) d.copyTo(pcm.subarray(c * frames, (c + 1) * frames), { planeIndex: Math.min(c, channels - 1), format: 'f32-planar' })
          d.close()
          node.port.postMessage(resamplePlanar(pcm, CHANNELS, rate, this.ctx.sampleRate))
        },
        error: (e) => console.warn('[screen-audio] 復号に失敗', e),
      })
      decoder.configure({ codec: 'opus', sampleRate: RATE, numberOfChannels: packet.channels })
      rx = { decoder, node, dest }
      this.rx.set(from, rx)
      this.onStream(from, dest.stream)
    }
    if (rx.decoder.state !== 'configured') return
    rx.decoder.decode(new EncodedAudioChunk({ type: 'key', timestamp: packet.seq * 20000, data: packet.data }))
  }

  /** 受け手を片付ける（共有が終わった・相手が抜けた） */
  drop(peerId: string) {
    const rx = this.rx.get(peerId)
    if (!rx) return
    try {
      rx.decoder.close()
    } catch {
      // すでに閉じている
    }
    rx.node.disconnect()
    this.rx.delete(peerId)
    this.onStream(peerId, null)
  }

  /** 受けている相手 */
  receiving = () => [...this.rx.keys()]

  dispose() {
    this.disposed = true
    this.offs.forEach((f) => f())
    void this.setTrack(null)
    for (const id of [...this.rx.keys()]) this.drop(id)
  }
}
