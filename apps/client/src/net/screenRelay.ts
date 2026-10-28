// 画面共有の中継（P2P がつながらない相手）
// WebRTC の映像が届かない相手には、共有している画面を WebCodecs（H.264、だめなら VP8）で符号化し、断片に分けて親サーバーの中継（チャンネル v）で送る
// 受け手は断片を組み立てて復号し、キャンバスに描いて MediaStream にする（WebRTC の映像と同じように表示できる）
import { BINARY_SCREEN, SCREEN_FRAGMENT_BYTES, LIMITS } from '@tentenv/protocol'
import type { InstanceSession } from './session'

/** type u8, flags u8（bit0: キーフレーム、bit1: H.264）, frame u16, index u8, count u8, width u16, height u16, timestamp u32（ms） */
const HEADER = 14
const PAYLOAD = SCREEN_FRAGMENT_BYTES - HEADER
const KEY_INTERVAL_MS = 3000

/** 使える符号化方式（H.264 はハードウェアで速いことが多い。だめなら VP8） */
export type ScreenCodec = 'h264' | 'vp8'
const CODEC_STRING: Record<ScreenCodec, string> = { h264: 'avc1.42E01F', vp8: 'vp8' }

const pickCodec = async (width: number, height: number): Promise<ScreenCodec | null> => {
  for (const codec of ['h264', 'vp8'] as const) {
    try {
      const r = await VideoEncoder.isConfigSupported({ codec: CODEC_STRING[codec], width, height, bitrate: 1_000_000, framerate: 15, latencyMode: 'realtime', ...(codec === 'h264' ? { avc: { format: 'annexb' } } : {}) } as VideoEncoderConfig)
      if (r.supported) return codec
    } catch {
      // 次の方式を試す
    }
  }
  return null
}

export const screenRelaySupported = () => typeof VideoEncoder !== 'undefined' && typeof VideoDecoder !== 'undefined' && typeof VideoFrame !== 'undefined'

export interface ScreenFragment {
  key: boolean
  codec: ScreenCodec
  frame: number
  index: number
  count: number
  width: number
  height: number
  timestamp: number
  payload: Uint8Array
}

/** 符号化した 1 フレームを、中継で送れる大きさの断片に分ける */
export const fragmentScreenFrame = (data: Uint8Array, h: { key: boolean; codec?: ScreenCodec; frame: number; width: number; height: number; timestamp: number }): ArrayBuffer[] => {
  const count = Math.max(1, Math.ceil(data.byteLength / PAYLOAD))
  if (count > 255) return []
  const out: ArrayBuffer[] = []
  for (let i = 0; i < count; i++) {
    const part = data.subarray(i * PAYLOAD, Math.min(data.byteLength, (i + 1) * PAYLOAD))
    const buf = new ArrayBuffer(HEADER + part.byteLength)
    const v = new DataView(buf)
    v.setUint8(0, BINARY_SCREEN)
    v.setUint8(1, (h.key ? 1 : 0) | (h.codec === 'h264' ? 2 : 0))
    v.setUint16(2, h.frame & 0xffff, true)
    v.setUint8(4, i)
    v.setUint8(5, count)
    v.setUint16(6, h.width, true)
    v.setUint16(8, h.height, true)
    v.setUint32(10, h.timestamp >>> 0, true)
    new Uint8Array(buf, HEADER).set(part)
    out.push(buf)
  }
  return out
}

/** 断片を読む（壊れていれば null） */
export const readScreenFragment = (buf: ArrayBuffer): ScreenFragment | null => {
  if (buf.byteLength <= HEADER || buf.byteLength > SCREEN_FRAGMENT_BYTES) return null
  const v = new DataView(buf)
  if (v.getUint8(0) !== BINARY_SCREEN) return null
  const index = v.getUint8(4)
  const count = v.getUint8(5)
  const width = v.getUint16(6, true)
  const height = v.getUint16(8, true)
  if (count < 1 || index >= count || width < 2 || height < 2 || width > 4096 || height > 4096) return null
  return { key: (v.getUint8(1) & 1) === 1, codec: (v.getUint8(1) & 2) === 2 ? 'h264' : 'vp8', frame: v.getUint16(2, true), index, count, width, height, timestamp: v.getUint32(10, true), payload: new Uint8Array(buf, HEADER) }
}

/** 断片を組み立てる（1 人の送り手ぶん）。完成したフレームを返す */
export class ScreenFrameAssembler {
  private pending = new Map<number, { parts: (Uint8Array | null)[]; got: number; f: ScreenFragment }>()
  push(f: ScreenFragment) {
    let e = this.pending.get(f.frame)
    if (!e || e.parts.length !== f.count) {
      e = { parts: new Array(f.count).fill(null), got: 0, f }
      this.pending.set(f.frame, e)
    }
    if (!e.parts[f.index]) {
      e.parts[f.index] = f.payload.slice()
      e.got++
    }
    // 古い組み立て途中のものは捨てる（届かなかった断片を待ち続けない）
    for (const k of this.pending.keys()) if (((f.frame - k) & 0xffff) > 8 && ((f.frame - k) & 0xffff) < 0x8000) this.pending.delete(k)
    if (e.got < e.parts.length) return null
    this.pending.delete(f.frame)
    const size = e.parts.reduce((a, p) => a + p!.byteLength, 0)
    const data = new Uint8Array(size)
    let o = 0
    for (const p of e.parts) {
      data.set(p!, o)
      o += p!.byteLength
    }
    return { key: e.f.key, codec: e.f.codec, frame: e.f.frame, width: e.f.width, height: e.f.height, timestamp: e.f.timestamp, data }
  }
}

/** 中継で受けた相手 1 人ぶんの復号と表示 */
class Receiver {
  readonly canvas = document.createElement('canvas')
  readonly stream: MediaStream
  private ctx = this.canvas.getContext('2d')!
  private decoder: VideoDecoder
  private asm = new ScreenFrameAssembler()
  private size = ''
  private waitingKey = true
  private lastFrame = -1
  private shown = false

  constructor(private onFirstFrame: () => void) {
    this.canvas.width = 16
    this.canvas.height = 9
    this.stream = this.canvas.captureStream(30)
    this.decoder = new VideoDecoder({
      output: (frame) => {
        if (this.canvas.width !== frame.displayWidth || this.canvas.height !== frame.displayHeight) {
          this.canvas.width = frame.displayWidth
          this.canvas.height = frame.displayHeight
        }
        this.ctx.drawImage(frame, 0, 0)
        frame.close()
        if (!this.shown) {
          this.shown = true
          this.onFirstFrame()
        }
      },
      error: (e) => {
        console.warn('[screen-relay] 復号に失敗', e)
        this.waitingKey = true
        this.size = ''
      },
    })
  }

  push(buf: ArrayBuffer) {
    const f = readScreenFragment(buf)
    if (!f) return
    const done = this.asm.push(f)
    if (!done) return
    // フレームが抜けたら、次のキーフレームまで待つ（差分だけでは正しく描けない）
    if (this.lastFrame >= 0 && ((done.frame - this.lastFrame) & 0xffff) !== 1 && !done.key) this.waitingKey = true
    this.lastFrame = done.frame
    if (this.waitingKey && !done.key) return
    if (this.decoder.state === 'closed') return
    const size = `${done.codec}:${done.width}x${done.height}`
    if (done.key && (this.size !== size || this.decoder.state !== 'configured')) {
      this.decoder.configure({ codec: CODEC_STRING[done.codec], codedWidth: done.width, codedHeight: done.height, optimizeForLatency: true })
      this.size = size
    }
    if (this.decoder.state !== 'configured') return
    this.waitingKey = false
    // 復号が追いつかないときは差分を捨てて、次のキーフレームから描き直す
    if (this.decoder.decodeQueueSize > 4 && !done.key) {
      this.waitingKey = true
      return
    }
    try {
      this.decoder.decode(new EncodedVideoChunk({ type: done.key ? 'key' : 'delta', timestamp: done.timestamp * 1000, data: done.data }))
    } catch (e) {
      console.warn('[screen-relay] 復号に失敗', e)
      this.waitingKey = true
    }
  }

  dispose() {
    try {
      this.decoder.close()
    } catch {
      // すでに閉じている
    }
    this.stream.getTracks().forEach((t) => t.stop())
  }
}

/**
 * 画面共有の中継。共有している人は、中継でつながっている相手がいるあいだだけ符号化して送る
 * 受け手は共有している人（owner）からの断片だけを受け取り、映像（MediaStream）にして渡す
 */
export class ScreenRelay {
  private receivers = new Map<string, Receiver>()
  private offs: (() => void)[] = []
  private send: { video: HTMLVideoElement; fps: number; timer: ReturnType<typeof setInterval>; canvas: HTMLCanvasElement; codec: ScreenCodec | null | undefined; encoder: VideoEncoder | null; config: string; frame: number; lastKey: number; peers: string; t0: number } | null = null

  constructor(
    private session: InstanceSession,
    /** 共有している人の peerId（いなければ null） */
    private owner: () => string | null,
    private onStream: (peerId: string, stream: MediaStream | null) => void,
  ) {
    this.offs.push(session.screenEv.on((from, buf) => this.receive(from, buf)))
    this.offs.push(session.t.onPeers((ev) => ev.kind === 'leave' && this.drop(ev.peerId)))
  }

  /** 中継でつながっている相手 */
  private relayPeers() {
    return this.session.verifiedMembers().filter((m) => this.session.t.link(m.desc.peerId) === 'relay').map((m) => m.desc.peerId)
  }

  private receive(from: string, buf: ArrayBuffer) {
    if (!screenRelaySupported() || from !== this.owner()) return
    let rx = this.receivers.get(from)
    if (!rx) {
      const r = new Receiver(() => this.onStream(from, r.stream))
      rx = r
      this.receivers.set(from, rx)
    }
    rx.push(buf)
  }

  /** 共有が終わった・相手が抜けたとき */
  drop(peerId: string) {
    const rx = this.receivers.get(peerId)
    if (!rx) return
    rx.dispose()
    this.receivers.delete(peerId)
    this.onStream(peerId, null)
  }

  /** 共有している人の映像（video 要素）を、中継の相手へ送り始める */
  startSending(video: HTMLVideoElement, fps: number) {
    this.stopSending()
    if (!screenRelaySupported()) return
    // 中継の映像は控えめに（帯域を声・姿勢と分けていても、親サーバーの回線を使うため）
    const rate = Math.max(1, Math.min(15, Math.round(fps)))
    const canvas = document.createElement('canvas')
    const send = { video, fps: rate, canvas, codec: undefined as ScreenCodec | null | undefined, encoder: null, config: '', frame: 0, lastKey: 0, peers: '', t0: performance.now(), timer: setInterval(() => this.tick(), 1000 / rate) }
    this.send = send
    void pickCodec(1280, 720).then((c) => {
      send.codec = c
      if (!c) console.warn('[screen-relay] この環境では映像を符号化できません')
    })
  }

  stopSending() {
    const s = this.send
    if (!s) return
    clearInterval(s.timer)
    try {
      s.encoder?.close()
    } catch {
      // すでに閉じている
    }
    this.send = null
  }

  private tick() {
    const s = this.send
    if (!s || !s.codec) return
    const codec = s.codec
    const peers = this.relayPeers()
    if (!peers.length) {
      s.peers = ''
      return
    }
    const v = s.video
    if (v.readyState < 2 || !v.videoWidth || !v.videoHeight) return
    // 送り先の数で、1 人あたりの帯域を分ける（中継の映像の上限の 7 割を使う）
    const perPeer = (LIMITS.relayVideoBytesPerSecond * 0.7 * 0.75) / peers.length // base64 の分（4/3）を引く
    const bitrate = Math.round(Math.max(120_000, Math.min(1_500_000, perPeer * 8)))
    const maxW = bitrate >= 800_000 ? 1280 : 960
    const scale = Math.min(1, maxW / v.videoWidth, (maxW * 9) / 16 / v.videoHeight)
    const width = Math.max(2, Math.round((v.videoWidth * scale) / 2) * 2)
    const height = Math.max(2, Math.round((v.videoHeight * scale) / 2) * 2)
    const config = `${width}x${height}@${Math.round(bitrate / 50_000)}`
    if (!s.encoder || s.encoder.state === 'closed' || s.config !== config) {
      try {
        s.encoder?.close()
      } catch {
        // すでに閉じている
      }
      const encoder: VideoEncoder = new VideoEncoder({
        output: (chunk) => this.output(chunk, codec, width, height),
        error: (e) => {
          console.warn('[screen-relay] 符号化に失敗', e)
          if (this.send) this.send.config = ''
        },
      })
      encoder.configure({ codec: CODEC_STRING[codec], width, height, bitrate, framerate: s.fps, latencyMode: 'realtime', hardwareAcceleration: 'no-preference', ...(codec === 'h264' ? { avc: { format: 'annexb' } } : {}) } as VideoEncoderConfig)
      s.encoder = encoder
      s.config = config
      s.lastKey = 0
    }
    if (s.encoder.encodeQueueSize > 2) return
    if (s.canvas.width !== width || s.canvas.height !== height) {
      s.canvas.width = width
      s.canvas.height = height
    }
    s.canvas.getContext('2d')!.drawImage(v, 0, 0, width, height)
    const now = performance.now()
    // 中継の相手が増えたとき・一定時間ごとにキーフレーム（途中から見始めた人も映るように）
    const peerKey = peers.slice().sort().join(',')
    const key = now - s.lastKey > KEY_INTERVAL_MS || peerKey !== s.peers
    if (key) s.lastKey = now
    s.peers = peerKey
    const frame = new VideoFrame(s.canvas, { timestamp: Math.round((now - s.t0) * 1000) })
    try {
      s.encoder.encode(frame, { keyFrame: key })
    } finally {
      frame.close()
    }
  }

  private output(chunk: EncodedVideoChunk, codec: ScreenCodec, width: number, height: number) {
    const s = this.send
    if (!s) return
    const data = new Uint8Array(chunk.byteLength)
    chunk.copyTo(data)
    const parts = fragmentScreenFrame(data, { key: chunk.type === 'key', codec, frame: s.frame++, width, height, timestamp: Math.round(chunk.timestamp / 1000) })
    for (const p of parts) this.session.t.sendU('*', p)
  }

  dispose() {
    this.stopSending()
    this.offs.forEach((f) => f())
    this.offs = []
    for (const id of [...this.receivers.keys()]) this.drop(id)
  }
}
