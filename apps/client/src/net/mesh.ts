// WebRTC のフルメッシュ。親サーバーは接続の仲介（シグナリング）と、P2P が張れない相手への中継だけをする
//
// - 後から入った側が、先にいた全員へ offer を出す（同時に出し合う衝突を避ける）
// - データチャネルは 2 本（id 0: 信頼性あり・順序あり / id 1: 信頼性なし・順序なし）を最初から決めておく
// - 音声のトランシーバーも最初から作っておき、マイクを入れたら replaceTrack するだけにする（再交渉しない）
// - 10 秒たっても P2P が開かなければ、その相手とは中継で話す
import { binToStr, PEER_MESSAGE_LIMIT, RateLimiter, strToBin, type IceServer, type PeerDescriptor, type PeerMessage, type SignalData } from '@tentenv/protocol'
import type { SignalClient } from './signaling'
import { Emitter, type LinkState, type Transport } from './transport'

interface Peer {
  desc: PeerDescriptor
  pc: RTCPeerConnection | null
  r: RTCDataChannel | null
  u: RTCDataChannel | null
  audio: RTCRtpSender | null
  state: LinkState
  /** P2P をあきらめて中継を使う */
  relay: boolean
  timer: ReturnType<typeof setTimeout> | null
  pendingIce: RTCIceCandidateInit[]
  makingOffer: boolean
  rtt: number | null
  lostAt: number | null
}

export interface MeshOptions {
  signal: SignalClient
  self: PeerDescriptor
  peers: PeerDescriptor[]
  iceServers: IceServer[]
  /** サーバーが中継を許しているか */
  relayAllowed: boolean
}

const P2P_TIMEOUT = 10000

export class MeshTransport implements Transport {
  readonly selfId: string
  readonly self: PeerDescriptor
  private peersMap = new Map<string, Peer>()
  private rEv = new Emitter<[string, unknown]>()
  private uEv = new Emitter<[string, ArrayBuffer]>()
  private peerEv = new Emitter<[{ kind: 'join' | 'leave' | 'link'; peerId: string }]>()
  private audioEv = new Emitter<[string, MediaStream]>()
  private serverEv = new Emitter<[boolean]>()
  private offs: (() => void)[] = []
  private track: MediaStreamTrack | null = null
  private closed = false
  /** 中継で送る信頼性なしのメッセージの数（毎秒 120 通まで） */
  private relayU = new RateLimiter(120, 1000)
  private statsTimer: ReturnType<typeof setInterval>

  constructor(private o: MeshOptions) {
    this.self = o.self
    this.selfId = o.self.peerId
    const s = o.signal
    this.offs.push(
      s.on('peer-joined', (m) => this.addPeer(m.peer, false)),
      s.on('peer-left', (m) => this.removePeer(m.peerId)),
      s.on('signal', (m) => void this.onSignal(m.from, m.data)),
      s.on('relay', (m) => this.onRelay(m.from, m.ch, m.data)),
      s.onOpenChange((up) => this.serverEv.emit(up)),
    )
    for (const p of o.peers) this.addPeer(p, true)
    this.statsTimer = setInterval(() => void this.measure(), 3000)
  }

  peers() {
    return [...this.peersMap.values()].filter((p) => !p.desc.hidden && p.state !== 'lost').map((p) => p.desc)
  }
  link(peerId: string): LinkState {
    return this.peersMap.get(peerId)?.state ?? 'lost'
  }
  rtt(peerId: string) {
    return this.peersMap.get(peerId)?.rtt ?? null
  }
  serverUp() {
    return this.o.signal.open
  }

  private usesP2P(desc: PeerDescriptor) {
    return !desc.hidden
  }

  private addPeer(desc: PeerDescriptor, initiator: boolean) {
    if (desc.peerId === this.selfId || this.closed) return
    const old = this.peersMap.get(desc.peerId)
    if (old) this.closePeer(old)
    const p: Peer = { desc, pc: null, r: null, u: null, audio: null, state: 'connecting', relay: false, timer: null, pendingIce: [], makingOffer: false, rtt: null, lostAt: null }
    this.peersMap.set(desc.peerId, p)
    if (desc.hidden) {
      // ブロック関係: 何もつながない
      p.state = 'lost'
      return
    }
    if (this.usesP2P(desc)) {
      this.createPc(p)
      if (initiator) void this.makeOffer(p)
      p.timer = setTimeout(() => {
        if (p.state === 'connecting') this.fallbackToRelay(p, 'timeout')
      }, P2P_TIMEOUT)
    } else this.fallbackToRelay(p, 'relay-only')
    this.peerEv.emit({ kind: 'join', peerId: desc.peerId })
  }

  private fallbackToRelay(p: Peer, why: string) {
    if (!this.o.relayAllowed) {
      console.warn(`[mesh] ${p.desc.peerId} と P2P で接続できず、中継も使えません (${why})`)
      return
    }
    p.relay = true
    p.state = 'relay'
    this.o.signal.send({ t: 'p2pfail', peerId: p.desc.peerId })
    this.peerEv.emit({ kind: 'link', peerId: p.desc.peerId })
  }

  private createPc(p: Peer) {
    const pc = new RTCPeerConnection({ iceServers: this.o.iceServers as RTCIceServer[], iceTransportPolicy: 'all' })
    p.pc = pc
    const r = pc.createDataChannel('r', { negotiated: true, id: 0, ordered: true })
    const u = pc.createDataChannel('u', { negotiated: true, id: 1, ordered: false, maxRetransmits: 0 })
    r.binaryType = 'arraybuffer'
    u.binaryType = 'arraybuffer'
    p.r = r
    p.u = u
    r.onopen = () => {
      if (p.timer) clearTimeout(p.timer)
      p.relay = false
      p.state = 'p2p'
      p.lostAt = null
      this.peerEv.emit({ kind: 'link', peerId: p.desc.peerId })
    }
    r.onclose = () => this.onChannelClosed(p)
    r.onmessage = (e) => {
      if (typeof e.data !== 'string' || e.data.length > PEER_MESSAGE_LIMIT) return
      let m: unknown
      try {
        m = JSON.parse(e.data)
      } catch {
        return
      }
      this.rEv.emit(p.desc.peerId, m)
    }
    u.onmessage = (e) => {
      if (e.data instanceof ArrayBuffer && e.data.byteLength <= 2048) this.uEv.emit(p.desc.peerId, e.data)
    }
    const tr = pc.addTransceiver('audio', { direction: 'sendrecv' })
    p.audio = tr.sender
    if (this.track) void tr.sender.replaceTrack(this.track)
    pc.ontrack = (e) => {
      const stream = e.streams[0] ?? new MediaStream([e.track])
      this.audioEv.emit(p.desc.peerId, stream)
    }
    pc.onicecandidate = (e) => {
      if (e.candidate) this.o.signal.send({ t: 'signal', to: p.desc.peerId, data: { kind: 'ice', candidate: e.candidate.candidate, sdpMid: e.candidate.sdpMid, sdpMLineIndex: e.candidate.sdpMLineIndex } })
    }
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') {
        // 回線が変わったときなど: ICE をやり直す。親サーバーがなければ中継にも頼れない
        if (this.o.signal.open) {
          if (this.isInitiator(p)) void this.makeOffer(p, true)
          else this.o.signal.send({ t: 'signal', to: p.desc.peerId, data: { kind: 'restart' } })
        }
        if (p.state === 'p2p') this.onChannelClosed(p)
      }
    }
    pc.onnegotiationneeded = () => {
      if (this.isInitiator(p) && pc.signalingState === 'stable' && pc.remoteDescription) void this.makeOffer(p)
    }
  }

  /** 後から入った側（joinedAt が大きい・同じなら peerId が大きい）が offer を出す */
  private isInitiator(p: Peer) {
    if (this.self.joinedAt !== p.desc.joinedAt) return this.self.joinedAt > p.desc.joinedAt
    return this.selfId > p.desc.peerId
  }

  private async makeOffer(p: Peer, restart = false) {
    const pc = p.pc
    if (!pc || p.makingOffer) return
    try {
      p.makingOffer = true
      const offer = await pc.createOffer({ iceRestart: restart })
      await pc.setLocalDescription(offer)
      this.o.signal.send({ t: 'signal', to: p.desc.peerId, data: { kind: 'offer', sdp: pc.localDescription!.sdp } })
    } catch (e) {
      console.warn('[mesh] offer に失敗', e)
    } finally {
      p.makingOffer = false
    }
  }

  private async onSignal(from: string, d: SignalData) {
    const p = this.peersMap.get(from)
    if (!p || !p.pc) return
    const pc = p.pc
    try {
      if (d.kind === 'offer') {
        if (typeof d.sdp !== 'string' || d.sdp.length > 20000) return
        await pc.setRemoteDescription({ type: 'offer', sdp: d.sdp })
        for (const c of p.pendingIce.splice(0)) await pc.addIceCandidate(c).catch(() => {})
        const ans = await pc.createAnswer()
        await pc.setLocalDescription(ans)
        this.o.signal.send({ t: 'signal', to: from, data: { kind: 'answer', sdp: pc.localDescription!.sdp } })
      } else if (d.kind === 'answer') {
        if (pc.signalingState !== 'have-local-offer' || typeof d.sdp !== 'string') return
        await pc.setRemoteDescription({ type: 'answer', sdp: d.sdp })
        for (const c of p.pendingIce.splice(0)) await pc.addIceCandidate(c).catch(() => {})
      } else if (d.kind === 'ice') {
        if (typeof d.candidate !== 'string' || d.candidate.length > 1000) return
        const c: RTCIceCandidateInit = { candidate: d.candidate, sdpMid: d.sdpMid, sdpMLineIndex: d.sdpMLineIndex }
        if (pc.remoteDescription) await pc.addIceCandidate(c).catch(() => {})
        else if (p.pendingIce.length < 100) p.pendingIce.push(c)
      } else if (d.kind === 'restart') {
        if (this.isInitiator(p)) void this.makeOffer(p, true)
      }
    } catch (e) {
      console.warn('[mesh] シグナリングの処理に失敗', e)
    }
  }

  private onRelay(from: string, ch: 'r' | 'u', data: string) {
    const p = this.peersMap.get(from)
    if (!p || p.desc.hidden) return
    // 相手が中継で送ってきたら、こちらからも中継で届く
    if (p.state === 'connecting' && !p.pc?.connectionState.startsWith('conn')) {
      p.relay = true
      p.state = 'relay'
      this.peerEv.emit({ kind: 'link', peerId: from })
    }
    if (ch === 'r') {
      if (data.length > PEER_MESSAGE_LIMIT) return
      try {
        this.rEv.emit(from, JSON.parse(data))
      } catch {
        // 壊れたメッセージは捨てる
      }
    } else {
      const buf = strToBin(data)
      if (buf && buf.byteLength <= 2048) this.uEv.emit(from, buf)
    }
  }

  private onChannelClosed(p: Peer) {
    if (this.closed || !this.peersMap.has(p.desc.peerId)) return
    if (this.o.signal.open) {
      // まだ親サーバーがある: 退出なら peer-left が来る。来なければ中継へ
      if (p.state === 'p2p') this.fallbackToRelay(p, 'closed')
      return
    }
    // 親サーバーが止まっていて P2P も切れた: もう話せない
    p.state = 'lost'
    p.lostAt = Date.now()
    this.peerEv.emit({ kind: 'leave', peerId: p.desc.peerId })
  }

  private removePeer(peerId: string) {
    const p = this.peersMap.get(peerId)
    if (!p) return
    this.closePeer(p)
    this.peersMap.delete(peerId)
    this.peerEv.emit({ kind: 'leave', peerId })
  }

  private closePeer(p: Peer) {
    if (p.timer) clearTimeout(p.timer)
    try {
      p.r?.close()
      p.u?.close()
      p.pc?.close()
    } catch {
      // すでに閉じている
    }
    p.pc = null
  }

  sendR(to: string, msg: PeerMessage) {
    const s = JSON.stringify(msg)
    if (s.length > PEER_MESSAGE_LIMIT) {
      console.warn('[mesh] メッセージが大きすぎます', msg.t)
      return
    }
    if (to === '*') {
      let needRelay = false
      for (const p of this.peersMap.values()) {
        if (p.desc.hidden || p.state === 'lost') continue
        if (p.r?.readyState === 'open') p.r.send(s)
        else if (p.relay) needRelay = true
      }
      // P2P が開いていない相手には中継で送る
      if (needRelay) for (const p of this.peersMap.values()) if (p.relay && !p.desc.hidden) this.o.signal.send({ t: 'relay', to: p.desc.peerId, ch: 'r', data: s })
      return
    }
    const p = this.peersMap.get(to)
    if (!p || p.desc.hidden) return
    if (p.r?.readyState === 'open') p.r.send(s)
    else if (p.relay) this.o.signal.send({ t: 'relay', to, ch: 'r', data: s })
  }

  sendU(to: string, buf: ArrayBuffer) {
    const targets = to === '*' ? [...this.peersMap.values()] : [this.peersMap.get(to)].filter((x): x is Peer => !!x)
    let str: string | null = null
    for (const p of targets) {
      if (p.desc.hidden || p.state === 'lost') continue
      if (p.u?.readyState === 'open') {
        // 送信待ちがたまっているときは捨てる（古い姿勢は役に立たない）
        if (p.u.bufferedAmount < 16 * 1024) p.u.send(buf)
      } else if (p.relay) {
        if (!this.relayU.take()) continue
        str ??= binToStr(buf)
        this.o.signal.send({ t: 'relay', to: p.desc.peerId, ch: 'u', data: str })
      }
    }
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
  onRemoteAudio(cb: (peerId: string, stream: MediaStream) => void) {
    return this.audioEv.on(cb)
  }
  onServer(cb: (up: boolean) => void) {
    return this.serverEv.on(cb)
  }

  setAudioTrack(track: MediaStreamTrack | null) {
    this.track = track
    for (const p of this.peersMap.values()) if (p.audio) void p.audio.replaceTrack(track).catch(() => {})
  }

  private async measure() {
    for (const p of this.peersMap.values()) {
      if (!p.pc || p.state !== 'p2p') continue
      try {
        const stats = await p.pc.getStats()
        stats.forEach((s: { type: string; state?: string; nominated?: boolean; currentRoundTripTime?: number }) => {
          if (s.type === 'candidate-pair' && s.state === 'succeeded' && s.nominated && typeof s.currentRoundTripTime === 'number') p.rtt = s.currentRoundTripTime * 1000
        })
      } catch {
        // 計れなくてもよい
      }
    }
  }

  close() {
    this.closed = true
    clearInterval(this.statsTimer)
    this.offs.forEach((f) => f())
    for (const p of this.peersMap.values()) this.closePeer(p)
    this.peersMap.clear()
  }
}
