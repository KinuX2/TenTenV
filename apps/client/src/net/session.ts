// インスタンスの中のやり取りをまとめる
// - 参加者の確認（親サーバーが署名したチケットを検証）
// - ホストの選定と移譲（全員が同じ規則で計算するので交渉しない）
// - 同期状態（ホストが順番を決めて全員へ配る。全員が複製を持つので、ホストが抜けても続く）
// - イベント・チャット・姿勢・時計
import {
  decodeObjects,
  decodePose,
  decodeTicketPayload,
  encodePose,
  isPeerMessage,
  LIMITS,
  PEER_PROTOCOL,
  RateLimiter,
  stateValueSize,
  type AvatarRef,
  type HandGesture,
  type ObjectPose,
  type PeerDescriptor,
  type PeerMessage,
  type PoseFrame,
  type TicketPayload,
  BINARY_OBJECTS,
  BINARY_POSE,
  BINARY_VOICE,
  binaryType,
  encodeObjects,
} from '@tentenv/protocol'
import { SharedClock } from './clock'
import { verifyTicket } from './ticket'
import { Emitter, type Transport } from './transport'

export interface Member {
  desc: PeerDescriptor
  ticket: TicketPayload | null
  verified: boolean
  avatar: AvatarRef | null
  /** 相手が接触を許している相手（'friends' なら、相手と自分がフレンドのときだけ） */
  allowContact: 'everyone' | 'friends' | 'nobody'
  hostScore: number
  /** 受け取った姿勢（共有時計の時刻つき） */
  frames: { t: number; f: PoseFrame }[]
  expr: { weights: Record<string, number>; gesture: [HandGesture, HandGesture] }
  typing: boolean
  lastSeen: number
  limits: { state: RateLimiter; events: RateLimiter; chat: RateLimiter; poses: RateLimiter; voice: RateLimiter }
}

export interface ChatEntry {
  id: string
  from: string
  name: string
  text: string
  at: number
  self: boolean
}

interface Entry {
  value: unknown
  rev: number
  by: string
}

const nonceGen = () => Math.floor(Math.random() * 1e9)

export interface SessionOptions {
  transport: Transport
  /** 親サーバーの公開鍵（開発用の通信なら null） */
  serverKey: string | null
  serverId: string | null
  instanceId: string
  /** 親サーバーとつながっている間の時計（なければホストの時計を使う） */
  serverClock: SharedClock | null
  avatar: AvatarRef
  allowContact: 'everyone' | 'friends' | 'nobody'
  hostScore: number
}

export class InstanceSession {
  readonly t: Transport
  readonly selfId: string
  readonly members = new Map<string, Member>()
  readonly clock: SharedClock
  private state = new Map<string, Entry>()
  private pending = new Map<string, { nonce: number; value: unknown }>()
  private stateEv = new Map<string, Emitter<[unknown, string]>>()
  private anyStateEv = new Emitter<[string, unknown, string]>()
  private eventEv = new Map<string, Emitter<[unknown, string]>>()
  readonly membersEv = new Emitter<[]>()
  readonly hostEv = new Emitter<[]>()
  readonly chatEv = new Emitter<[ChatEntry]>()
  readonly objectEv = new Emitter<[string, number, ObjectPose[]]>()
  readonly touchEv = new Emitter<[string, string, number]>()
  readonly avatarEv = new Emitter<[string]>()
  readonly exprEv = new Emitter<[string]>()
  readonly clockEv = new Emitter<[]>()
  readonly voiceEv = new Emitter<[string, ArrayBuffer]>()
  readonly chatLog: ChatEntry[] = []
  private host: string | null = null
  private epoch = 0
  private rev = 0
  private offs: (() => void)[] = []
  private hostClockTimer: ReturnType<typeof setInterval> | null = null
  private myAvatar: AvatarRef
  private myExpr: { weights: Record<string, number>; gesture: [HandGesture, HandGesture] } = { weights: {}, gesture: ['neutral', 'neutral'] }
  private allowContact: 'everyone' | 'friends' | 'nobody'
  private hostScore: number
  private seq = 0
  /** 自分の情報（チケットの中身） */
  readonly selfTicket: TicketPayload | null
  /** 同期状態を受け取ったか（ホストからの一覧が届くまで false） */
  synced = false

  constructor(private o: SessionOptions) {
    this.t = o.transport
    this.selfId = o.transport.selfId
    this.myAvatar = o.avatar
    this.allowContact = o.allowContact
    this.hostScore = o.hostScore
    this.selfTicket = o.transport.self.ticket ? decodeTicketPayload(o.transport.self.ticket) : null
    this.clock = o.serverClock && o.transport.serverUp() ? o.serverClock : new SharedClock()
    if (!o.serverClock) this.clock.reset('local')
    this.offs.push(
      this.t.onR((from, m) => this.onMessage(from, m)),
      this.t.onU((from, b) => this.onBinary(from, b)),
      this.t.onPeers((ev) => this.onPeerEvent(ev)),
      this.t.onServer(() => this.onServerChange()),
    )
    if (o.serverClock) this.offs.push(o.serverClock.subscribe(() => this.clockEv.emit()))
    for (const p of this.t.peers()) this.ensureMember(p)
    for (const p of this.t.peers()) if (this.t.link(p.peerId) !== 'connecting') this.sendHello(p.peerId)
    this.electHost()
    // ひとりで入ったなら、自分の状態がそのまま正しい
    if (this.t.peers().length === 0) this.synced = true
  }

  // ---------------- 参加者 ----------------

  private ensureMember(desc: PeerDescriptor) {
    let m = this.members.get(desc.peerId)
    if (!m) {
      m = {
        desc,
        ticket: decodeTicketPayload(desc.ticket),
        verified: false,
        avatar: null,
        allowContact: 'nobody',
        hostScore: desc.hostScore,
        frames: [],
        expr: { weights: {}, gesture: ['neutral', 'neutral'] },
        typing: false,
        lastSeen: Date.now(),
        limits: {
          state: new RateLimiter(LIMITS.stateSetsPerSecond * 2, 2000),
          events: new RateLimiter(LIMITS.eventsPerSecond * 2, 2000),
          chat: new RateLimiter(LIMITS.chatPerTenSeconds, 10000),
          poses: new RateLimiter(LIMITS.posesPerSecond * 2, 2000),
          // 中継の声（Opus 20ms = 50 個/秒）
          voice: new RateLimiter(140, 2000),
        },
      }
      this.members.set(desc.peerId, m)
    }
    return m
  }

  private onPeerEvent(ev: { kind: 'join' | 'leave' | 'link'; peerId: string }) {
    if (ev.kind === 'join') {
      const d = this.t.peers().find((p) => p.peerId === ev.peerId)
      if (d) this.ensureMember(d)
    } else if (ev.kind === 'link') {
      this.sendHello(ev.peerId)
    } else {
      this.members.delete(ev.peerId)
      // 抜けた人が持っていた操作中の物などは、同期状態の側で扱う（持ち主がいなければホストへ）
    }
    this.electHost()
    this.membersEv.emit()
  }

  private sendHello(to: string) {
    this.t.sendR(to, {
      t: 'hello',
      v: PEER_PROTOCOL,
      ticket: this.t.self.ticket,
      avatar: this.myAvatar,
      allowContact: this.allowContact,
      hostScore: this.hostScore,
      stateEpoch: this.epoch,
    })
    this.t.sendR(to, { t: 'expr', weights: this.myExpr.weights, gesture: this.myExpr.gesture })
  }

  private async onHello(m: Member, msg: Extract<PeerMessage, { t: 'hello' }>) {
    const was = m.verified
    if (this.o.serverKey) {
      const payload = await verifyTicket(msg.ticket, this.o.serverKey)
      // チケットはこの親サーバー・このインスタンス・この接続のものでなければならない
      if (!payload || payload.iid !== this.o.instanceId || payload.pid !== m.desc.peerId || (this.o.serverId && payload.sid !== this.o.serverId) || payload.exp < Date.now() - 60000) {
        console.warn('[session] チケットが不正なので無視します', m.desc.peerId)
        return
      }
      m.ticket = payload
    }
    m.verified = true
    m.avatar = sanitizeAvatar(msg.avatar)
    m.allowContact = msg.allowContact === true || msg.allowContact === 'everyone' ? 'everyone' : msg.allowContact === 'friends' ? 'friends' : 'nobody'
    m.hostScore = Math.max(0, Math.min(100, Number(msg.hostScore) || 0))
    if (!was) {
      // 初めて確認できた相手: 自分も名乗り直し、ホストなら同期状態を渡す
      this.sendHello(m.desc.peerId)
      if (this.isHost()) this.sendSnapshot(m.desc.peerId)
    }
    this.electHost()
    this.membersEv.emit()
    this.avatarEv.emit(m.desc.peerId)
  }

  verifiedMembers() {
    return [...this.members.values()].filter((m) => m.verified)
  }

  role(peerId: string): 'owner' | 'moderator' | 'member' {
    if (peerId === this.selfId) return this.selfTicket?.role ?? 'member'
    return this.members.get(peerId)?.ticket?.role ?? 'member'
  }

  // ---------------- ホスト ----------------

  /** ホストの順番: 引き受けられる人（hostScore > 0）→ 先に入った人 → peerId */
  private electHost() {
    const cands: { id: string; score: number; joined: number }[] = [{ id: this.selfId, score: this.hostScore, joined: this.t.self.joinedAt }]
    for (const m of this.members.values()) if (m.verified && this.t.link(m.desc.peerId) !== 'lost') cands.push({ id: m.desc.peerId, score: m.hostScore, joined: m.desc.joinedAt })
    cands.sort((a, b) => (b.score > 0 ? 1 : 0) - (a.score > 0 ? 1 : 0) || a.joined - b.joined || (a.id < b.id ? -1 : 1))
    const next = cands[0]?.id ?? this.selfId
    if (next === this.host) return
    const prev = this.host
    this.host = next
    if (next === this.selfId && prev !== null) {
      // ホストを引き継いだ: 自分の複製を正として全員へ配り直す
      this.epoch++
      this.synced = true
      for (const [key, p] of this.pending) this.commit(key, p.value, this.selfId, p.nonce)
      this.pending.clear()
      this.sendSnapshot('*')
    } else if (next !== this.selfId) {
      // 新しいホストへ、確定していない変更を送り直す
      for (const [key, p] of this.pending) this.t.sendR(next, { t: 'set', key, value: p.value, nonce: p.nonce })
    }
    this.updateHostClock()
    this.hostEv.emit()
    this.membersEv.emit()
  }

  hostId() {
    return this.host
  }
  stateEpoch() {
    return this.epoch
  }
  /** 同期状態の一覧（デバッグ表示用） */
  entries() {
    return [...this.state.entries()].map(([key, e]) => ({ key, value: e.value, rev: e.rev, by: e.by, pending: this.pending.has(key) }))
  }
  isHost() {
    return this.host === this.selfId
  }

  // ---------------- 同期状態 ----------------

  has(key: string) {
    return this.pending.has(key) || this.state.has(key)
  }
  get(key: string) {
    const p = this.pending.get(key)
    if (p) return p.value
    return this.state.get(key)?.value
  }
  keys(prefix: string) {
    const out = new Set<string>()
    for (const k of this.state.keys()) if (k.startsWith(prefix)) out.add(k)
    for (const k of this.pending.keys()) if (k.startsWith(prefix)) out.add(k)
    return [...out].filter((k) => this.get(k) !== undefined && this.get(k) !== null)
  }

  set(key: string, value: unknown) {
    if (!LIMITS.stateKey.test(key)) throw new Error(`同期状態のキーが使えません: ${key}`)
    if (stateValueSize(value) > LIMITS.stateValueBytes) throw new Error(`同期状態の値が大きすぎます（${key}）`)
    const v = value === undefined ? null : JSON.parse(JSON.stringify(value))
    const nonce = nonceGen()
    if (this.isHost()) {
      const why = this.validate(key, v, this.selfId)
      if (why) {
        console.warn('[session]', why)
        return
      }
      this.commit(key, v, this.selfId, nonce)
      return
    }
    // ホストに頼み、確定するまでは自分の画面だけ先に変える
    this.pending.set(key, { nonce, value: v })
    this.notifyState(key, v, this.selfId)
    if (this.host) this.t.sendR(this.host, { t: 'set', key, value: v, nonce })
  }

  /** ホストだけが呼ぶ: 確定して全員へ配る */
  private commit(key: string, value: unknown, by: string, nonce?: number) {
    const rev = ++this.rev
    if (value === null && key.startsWith('sys:')) this.state.delete(key)
    else this.state.set(key, { value, rev, by })
    this.t.sendR('*', { t: 'state', key, value, rev, by, nonce })
    this.notifyState(key, value, by)
  }

  /** ホストが変更を受け付けるかどうか。問題があれば理由 */
  private validate(key: string, value: unknown, by: string): string | null {
    if (!LIMITS.stateKey.test(key)) return 'キーが不正'
    if (stateValueSize(value) > LIMITS.stateValueBytes) return '値が大きすぎる'
    if (!this.state.has(key) && this.state.size >= LIMITS.stateKeys) return 'キーが多すぎる'
    const isMod = this.role(by) !== 'member'
    if (key.startsWith('w:')) return null
    // プラットフォームの状態: 誰が書けるかを決める
    const parts = key.split(':')
    const kind = parts[1]
    const owner = parts[2]
    if (kind === 'portal') {
      if (value === null) return owner === by || isMod || !this.isPresent(owner) ? null : '他人のポータルは消せません'
      if (owner !== by) return '他人のポータルは変更できません'
      const v = value as Record<string, unknown> | null
      if (!v || typeof v !== 'object' || v.owner !== by ||
        typeof v.worldId !== 'string' || !v.worldId || v.worldId.length > 120 ||
        typeof v.instanceId !== 'string' || !v.instanceId || v.instanceId.length > 120 ||
        typeof v.worldName !== 'string' || v.worldName.length > 120 ||
        typeof v.ownerName !== 'string' || v.ownerName.length > 80 ||
        typeof v.ownerUserId !== 'string' || v.ownerUserId.length > 120 ||
        typeof v.locked !== 'boolean' ||
        typeof v.access !== 'string' || v.access.length > 40 ||
        !Array.isArray(v.p) || v.p.length !== 3 || v.p.some((n) => typeof n !== 'number' || !Number.isFinite(n) || Math.abs(n) > 10000) ||
        typeof v.yaw !== 'number' || !Number.isFinite(v.yaw) ||
        typeof v.createdAt !== 'number' || !Number.isFinite(v.createdAt) ||
        typeof v.expiresAt !== 'number' || !Number.isFinite(v.expiresAt) ||
        v.expiresAt < Date.now() - 5000 || v.expiresAt > Date.now() + 40000) return 'ポータルの情報が不正'
      if (!this.state.has(key) && this.keys(`sys:portal:${owner}:`).length >= 3) return 'ポータルが多すぎます'
      return null
    }
    if (kind === 'pin') {
      if (owner === by) return null
      if (value === null && (isMod || !this.isPresent(owner))) return null
      return '他人の設置したものは変更できません'
    }
    if (kind === 'seat') {
      const cur = this.state.get(key)?.value as string | null | undefined
      if (value === by && (!cur || cur === by || !this.isPresent(cur))) return null
      if (value === null && (cur === by || !cur || !this.isPresent(cur) || isMod)) return null
      return 'その席にはほかの人が座っています'
    }
    if (kind === 'pick') {
      const v = value as { holder?: unknown; owner?: unknown } | null
      if (v === null) return null
      if (typeof v !== 'object' || (v.holder !== null && v.holder !== by) || v.owner !== by) return '持ち主の情報が不正'
      return null
    }
    if (kind === 'world') return isMod ? null : 'インスタンスの管理者だけが変えられます'
    return '使えないキー'
  }

  isPresent(peerId: string | null | undefined) {
    if (!peerId) return false
    return peerId === this.selfId || (this.members.get(peerId)?.verified ?? false)
  }

  private notifyState(key: string, value: unknown, by: string) {
    this.stateEv.get(key)?.emit(value, by)
    this.anyStateEv.emit(key, value, by)
  }

  subscribe(key: string, cb: (value: unknown, by: string) => void) {
    let e = this.stateEv.get(key)
    if (!e) {
      e = new Emitter()
      this.stateEv.set(key, e)
    }
    return e.on(cb)
  }
  subscribeAll(cb: (key: string, value: unknown, by: string) => void) {
    return this.anyStateEv.on(cb)
  }

  private sendSnapshot(to: string) {
    const entries: [string, unknown, number, string][] = []
    for (const [k, e] of this.state) entries.push([k, e.value, e.rev, e.by])
    // 1 通に入りきらないときは分けて送る
    let chunk: typeof entries = []
    let size = 0
    const flush = () => {
      this.t.sendR(to, { t: 'snapshot', epoch: this.epoch, host: this.selfId, entries: chunk })
      chunk = []
      size = 0
    }
    for (const e of entries) {
      const s = stateValueSize(e) + 16
      if (size + s > 48 * 1024 && chunk.length) flush()
      chunk.push(e)
      size += s
    }
    flush()
  }

  private onSnapshot(from: string, msg: Extract<PeerMessage, { t: 'snapshot' }>) {
    if (from !== this.host) return
    if (!Array.isArray(msg.entries)) return
    this.epoch = Math.max(this.epoch, Number(msg.epoch) || 0)
    for (const e of msg.entries) {
      if (!Array.isArray(e) || typeof e[0] !== 'string' || !LIMITS.stateKey.test(e[0])) continue
      const [key, value, rev, by] = e
      const cur = this.state.get(key)
      this.state.set(key, { value, rev: Number(rev) || 0, by: String(by) })
      this.rev = Math.max(this.rev, Number(rev) || 0)
      if (!cur || JSON.stringify(cur.value) !== JSON.stringify(value)) if (!this.pending.has(key)) this.notifyState(key, value, String(by))
    }
    this.synced = true
    this.membersEv.emit()
  }

  // ---------------- イベント ----------------

  emit(name: string, payload: unknown, target: 'all' | 'others' | 'host' | string = 'all') {
    if (!LIMITS.eventName.test(name)) throw new Error(`イベント名が使えません: ${name}`)
    if (stateValueSize(payload) > LIMITS.eventPayloadBytes) throw new Error('イベントの中身が大きすぎます')
    const msg: PeerMessage = { t: 'event', name, payload, target }
    if (target === 'all' || target === 'others') this.t.sendR('*', msg)
    else if (target === 'host') {
      if (this.isHost()) this.deliverEvent(name, payload, this.selfId)
      else if (this.host) this.t.sendR(this.host, msg)
      return
    } else if (target !== this.selfId) this.t.sendR(target, msg)
    if (target === 'all' || target === this.selfId) this.deliverEvent(name, payload, this.selfId)
  }
  on(name: string, cb: (payload: unknown, from: string) => void) {
    let e = this.eventEv.get(name)
    if (!e) {
      e = new Emitter()
      this.eventEv.set(name, e)
    }
    return e.on(cb)
  }
  /** 最近のイベント（デバッグ表示用） */
  readonly eventLog: { name: string; from: string; at: number; payload: unknown }[] = []
  private deliverEvent(name: string, payload: unknown, from: string) {
    this.eventLog.push({ name, from, at: Date.now(), payload })
    if (this.eventLog.length > 100) this.eventLog.shift()
    this.eventEv.get(name)?.emit(payload, from)
  }

  // ---------------- チャット・表情・アバター ----------------

  sendChat(text: string) {
    const t = text.trim().slice(0, LIMITS.chatLength)
    if (!t) return
    const id = `${this.selfId}-${Date.now()}`
    this.t.sendR('*', { t: 'chat', id, text: t })
    this.pushChat({ id, from: this.selfId, name: this.t.self.user.displayName, text: t, at: Date.now(), self: true })
  }
  private pushChat(c: ChatEntry) {
    this.chatLog.push(c)
    if (this.chatLog.length > 200) this.chatLog.shift()
    this.chatEv.emit(c)
  }
  setTyping(on: boolean) {
    this.t.sendR('*', { t: 'typing', on })
  }
  /** 参加チケットを更新したら、全員に名乗り直す（期限切れで拒否されないように） */
  updateTicket(ticket: string) {
    ;(this.t.self as { ticket: string }).ticket = ticket
    for (const m of this.members.values()) if (m.verified) this.sendHello(m.desc.peerId)
  }
  setAvatar(a: AvatarRef) {
    this.myAvatar = a
    this.t.sendR('*', { t: 'avatar', avatar: a })
  }
  setExpression(weights: Record<string, number>, gesture: [HandGesture, HandGesture]) {
    const changed = JSON.stringify(weights) !== JSON.stringify(this.myExpr.weights) || gesture[0] !== this.myExpr.gesture[0] || gesture[1] !== this.myExpr.gesture[1]
    if (!changed) return
    this.myExpr = { weights, gesture }
    this.t.sendR('*', { t: 'expr', weights, gesture })
  }
  sendTouch(peerId: string, part: string, strength: number) {
    this.t.sendR(peerId, { t: 'touch', part, strength })
  }

  // ---------------- 姿勢 ----------------

  sendPose(f: Omit<PoseFrame, 'seq' | 'time'>) {
    const frame: PoseFrame = { ...f, seq: this.seq++ & 0xffff, time: Math.floor(this.clock.now()) >>> 0 }
    this.t.sendU('*', encodePose(frame))
  }
  sendObjects(list: ObjectPose[]) {
    if (!list.length) return
    this.t.sendU('*', encodeObjects(Math.floor(this.clock.now()) >>> 0, list))
  }
  /** 32 ビットに切った時刻を、今の共有時計の近くの値に戻す */
  private unwrapTime(t32: number) {
    const now = Math.floor(this.clock.now())
    const low = now >>> 0
    let diff = low - t32
    if (diff > 0x7fffffff) diff -= 0x100000000
    if (diff < -0x7fffffff) diff += 0x100000000
    return now - diff
  }

  private onBinary(from: string, buf: ArrayBuffer) {
    const m = this.members.get(from)
    if (!m || !m.verified) return
    const type = binaryType(buf)
    if (type === BINARY_POSE) {
      if (!m.limits.poses.take()) return
      const f = decodePose(buf)
      if (!f) return
      m.lastSeen = Date.now()
      const t = this.unwrapTime(f.time)
      // 古い順に並べて、2 秒より前のものは捨てる
      const frames = m.frames
      if (frames.length && t <= frames[frames.length - 1].t) {
        if (frames.length && frames[frames.length - 1].t - t > 3000) frames.length = 0
        else return
      }
      frames.push({ t, f })
      while (frames.length > 2 && frames[0].t < t - 2000) frames.shift()
    } else if (type === BINARY_VOICE) {
      if (m.limits.voice.take()) this.voiceEv.emit(from, buf)
    } else if (type === BINARY_OBJECTS) {
      const d = decodeObjects(buf)
      if (d) this.objectEv.emit(from, this.unwrapTime(d.time), d.list)
    }
  }

  // ---------------- 受信 ----------------

  private onMessage(from: string, raw: unknown) {
    if (!isPeerMessage(raw)) return
    const msg = raw as PeerMessage
    const m = this.members.get(from)
    if (!m) return
    m.lastSeen = Date.now()
    if (msg.t === 'hello') {
      void this.onHello(m, msg)
      return
    }
    // 名乗る前のメッセージは受け付けない
    if (!m.verified) return
    switch (msg.t) {
      case 'avatar':
        m.avatar = sanitizeAvatar(msg.avatar)
        this.avatarEv.emit(from)
        break
      case 'expr': {
        if (!msg.weights || typeof msg.weights !== 'object' || !Array.isArray(msg.gesture)) return
        const w: Record<string, number> = {}
        for (const [k, v] of Object.entries(msg.weights).slice(0, 64)) if (typeof v === 'number' && Number.isFinite(v) && k.length < 64) w[k] = Math.max(0, Math.min(1, v))
        m.expr = { weights: w, gesture: [String(msg.gesture[0]) as HandGesture, String(msg.gesture[1]) as HandGesture] }
        this.exprEv.emit(from)
        break
      }
      case 'chat':
        if (typeof msg.text !== 'string' || !m.limits.chat.take()) return
        m.typing = false
        this.pushChat({ id: String(msg.id).slice(0, 64), from, name: m.desc.user.displayName, text: msg.text.slice(0, LIMITS.chatLength), at: Date.now(), self: false })
        break
      case 'typing':
        m.typing = !!msg.on
        this.membersEv.emit()
        break
      case 'set': {
        if (!this.isHost() || typeof msg.key !== 'string') return
        if (!m.limits.state.take()) {
          this.t.sendR(from, { t: 'reject', key: msg.key, nonce: msg.nonce, reason: '更新が多すぎます' })
          return
        }
        const why = this.validate(msg.key, msg.value, from)
        if (why) {
          this.t.sendR(from, { t: 'reject', key: msg.key, nonce: msg.nonce, reason: why })
          return
        }
        this.commit(msg.key, msg.value, from, msg.nonce)
        break
      }
      case 'state': {
        if (from !== this.host || typeof msg.key !== 'string' || !LIMITS.stateKey.test(msg.key)) return
        if (msg.value === null && msg.key.startsWith('sys:')) this.state.delete(msg.key)
        else this.state.set(msg.key, { value: msg.value, rev: Number(msg.rev) || 0, by: String(msg.by) })
        this.rev = Math.max(this.rev, Number(msg.rev) || 0)
        const p = this.pending.get(msg.key)
        if (p && p.nonce === msg.nonce && msg.by === this.selfId) {
          this.pending.delete(msg.key)
          return
        }
        // 自分の変更を待っている間に他人の変更が来たら、自分の画面はそのまま（あとで自分の分が届く）
        if (!p) this.notifyState(msg.key, msg.value, String(msg.by))
        break
      }
      case 'reject': {
        if (from !== this.host) return
        const p = this.pending.get(msg.key)
        if (p && p.nonce === msg.nonce) {
          this.pending.delete(msg.key)
          console.warn(`[session] 同期状態の変更が断られました（${msg.key}）: ${msg.reason}`)
          this.notifyState(msg.key, this.state.get(msg.key)?.value, this.state.get(msg.key)?.by ?? '')
        }
        break
      }
      case 'snapshot':
        this.onSnapshot(from, msg)
        break
      case 'event': {
        if (typeof msg.name !== 'string' || !LIMITS.eventName.test(msg.name) || !m.limits.events.take()) return
        if (stateValueSize(msg.payload) > LIMITS.eventPayloadBytes) return
        const forMe = msg.target === 'all' || msg.target === 'others' || msg.target === this.selfId || (msg.target === 'host' && this.isHost())
        if (forMe) this.deliverEvent(msg.name, msg.payload, from)
        break
      }
      case 'tping':
        if (this.isHost()) this.t.sendR(from, { t: 'tpong', c: Number(msg.c) || 0, h: this.clock.now() })
        break
      case 'tpong':
        if (from === this.host && this.clock.source === 'host') this.clock.addSample(Number(msg.c), Number(msg.h))
        break
      case 'touch':
        if (typeof msg.part === 'string') this.touchEv.emit(from, msg.part.slice(0, 32), Math.max(0, Math.min(1, Number(msg.strength) || 0)))
        break
      case 'bye':
        break
    }
  }

  // ---------------- 時計 ----------------

  private onServerChange() {
    this.updateHostClock()
  }
  /** 親サーバーが使えないときは、ホストの時計に合わせる */
  private updateHostClock() {
    const serverUp = this.t.serverUp() && !!this.o.serverClock
    if (this.hostClockTimer) clearInterval(this.hostClockTimer)
    this.hostClockTimer = null
    if (serverUp) return
    if (this.isHost() || !this.host) return
    if (this.clock === this.o.serverClock) {
      // 親サーバーの時計の推定値を引き継いだまま、ホストに合わせ直す
      this.clock.reset('host')
    }
    const host = this.host
    const ping = () => this.t.sendR(host, { t: 'tping', c: performance.now() })
    ping()
    this.hostClockTimer = setInterval(ping, 2000)
  }

  /** 姿勢が来なくなった人（P2P が切れて親サーバーもない）を見つけて外す */
  sweep() {
    const now = Date.now()
    for (const [id, m] of this.members) {
      if (this.t.link(id) === 'lost' && now - m.lastSeen > 15000) {
        this.members.delete(id)
        this.electHost()
        this.membersEv.emit()
      }
    }
  }

  close() {
    try {
      this.t.sendR('*', { t: 'bye' })
    } catch {
      // 閉じる途中
    }
    if (this.hostClockTimer) clearInterval(this.hostClockTimer)
    this.offs.forEach((f) => f())
    this.t.close()
  }
}

const sanitizeAvatar = (a: unknown): AvatarRef | null => {
  if (!a || typeof a !== 'object') return null
  const x = a as AvatarRef
  const scale = Math.max(LIMITS.avatarScale.min, Math.min(LIMITS.avatarScale.max, Number(x.scale) || 1))
  const outfits = Array.isArray(x.outfits) ? x.outfits.filter((s) => typeof s === 'string').slice(0, 32) : undefined
  if (x.kind === 'builtin') return { kind: 'builtin', id: String(x.id).slice(0, 32), color: /^#[0-9a-f]{6}$/i.test(x.color) ? x.color : '#6ea8ff', scale, outfits }
  if (x.kind === 'vrm' && typeof x.url === 'string' && /^https?:\/\//.test(x.url) && /^[0-9a-f]{64}$/.test(x.sha256)) return { kind: 'vrm', id: String(x.id).slice(0, 64), url: x.url, sha256: x.sha256, scale, outfits }
  return null
}
