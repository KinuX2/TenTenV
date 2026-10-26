// 開発用の通信: 同じブラウザのタブどうしを BroadcastChannel でつなぐ（親サーバーなしで多人数テスト [140]）
import type { PeerDescriptor, PeerMessage, UserSummary } from '@tentenv/protocol'
import { Emitter, type LinkState, type Transport } from './transport'

type Wire =
  | { k: 'hello'; from: PeerDescriptor; reply: boolean }
  | { k: 'bye'; from: string }
  | { k: 'beat'; from: string }
  | { k: 'r'; from: string; to: string; m: unknown }
  | { k: 'u'; from: string; to: string; b: ArrayBuffer }

export class LocalTransport implements Transport {
  readonly selfId: string
  readonly self: PeerDescriptor
  private ch: BroadcastChannel
  private known = new Map<string, { desc: PeerDescriptor; seen: number }>()
  private rEv = new Emitter<[string, unknown]>()
  private uEv = new Emitter<[string, ArrayBuffer]>()
  private peerEv = new Emitter<[{ kind: 'join' | 'leave' | 'link'; peerId: string }]>()
  private timer: ReturnType<typeof setInterval>

  constructor(room: string, user: UserSummary) {
    this.selfId = `local-${Math.random().toString(36).slice(2, 10)}`
    this.self = { peerId: this.selfId, user, joinedAt: Date.now(), hostScore: 1, ticket: '' }
    this.ch = new BroadcastChannel(`ttv-dev:${room}`)
    this.ch.onmessage = (e) => this.onWire(e.data as Wire)
    this.post({ k: 'hello', from: this.self, reply: false })
    this.timer = setInterval(() => {
      this.post({ k: 'beat', from: this.selfId })
      const now = Date.now()
      for (const [id, p] of this.known) if (now - p.seen > 4000) this.drop(id)
    }, 1000)
    window.addEventListener('pagehide', this.bye)
  }

  private bye = () => this.post({ k: 'bye', from: this.selfId })
  private post(w: Wire) {
    this.ch.postMessage(w)
  }
  private drop(id: string) {
    if (!this.known.delete(id)) return
    this.peerEv.emit({ kind: 'leave', peerId: id })
  }
  private onWire(w: Wire) {
    if (w.k === 'hello') {
      if (w.from.peerId === this.selfId) return
      const isNew = !this.known.has(w.from.peerId)
      this.known.set(w.from.peerId, { desc: w.from, seen: Date.now() })
      if (!w.reply) this.post({ k: 'hello', from: this.self, reply: true })
      if (isNew) {
        this.peerEv.emit({ kind: 'join', peerId: w.from.peerId })
        this.peerEv.emit({ kind: 'link', peerId: w.from.peerId })
      }
      return
    }
    if (w.k === 'bye') return this.drop(w.from)
    const p = this.known.get(w.from)
    if (!p) return
    p.seen = Date.now()
    if (w.k === 'beat') return
    if (w.to !== '*' && w.to !== this.selfId) return
    if (w.k === 'r') this.rEv.emit(w.from, w.m)
    else this.uEv.emit(w.from, w.b)
  }

  peers() {
    return [...this.known.values()].map((p) => p.desc)
  }
  link(peerId: string): LinkState {
    return this.known.has(peerId) ? 'p2p' : 'lost'
  }
  sendR(to: string, msg: PeerMessage) {
    this.post({ k: 'r', from: this.selfId, to, m: msg })
  }
  sendU(to: string, buf: ArrayBuffer) {
    this.post({ k: 'u', from: this.selfId, to, b: buf })
  }
  onR(cb: (from: string, msg: unknown) => void) {
    return this.rEv.on(cb)
  }
  onU(cb: (from: string, buf: ArrayBuffer) => void) {
    return this.uEv.on(cb)
  }
  onPeers(cb: (ev: { kind: 'join' | 'leave' | 'link'; peerId: string }) => void) {
    return this.peerEv.on(cb)
  }
  setAudioTrack() {
    // 開発用では音声を送らない
  }
  onRemoteAudio() {
    return () => {}
  }
  serverUp() {
    return false
  }
  onServer() {
    return () => {}
  }
  rtt() {
    return 0
  }
  close() {
    clearInterval(this.timer)
    window.removeEventListener('pagehide', this.bye)
    this.bye()
    this.ch.close()
  }
}
