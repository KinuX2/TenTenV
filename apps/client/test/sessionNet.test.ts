// インスタンスの通信: 偽の通信路で、名乗りの検証・レート制限・ホスト交代まわりを確かめる
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { b64urlEncode, BINARY_VOICE, type PeerDescriptor, type PeerMessage, type TicketPayload } from '@tentenv/protocol'
import type { Transport, LinkState } from '../src/net/transport'

Object.defineProperty(globalThis, 'window', { configurable: true, value: new EventTarget() })
const { Emitter } = await import('../src/net/transport')
const { SharedClock } = await import('../src/net/clock')
const { InstanceSession } = await import('../src/net/session')
const { LocalTransport } = await import('../src/net/local')
const { SCREEN_SHARE_KEY } = await import('../src/world/screenShare')
const { makeAvatarMotionState } = await import('../src/avatar/worldMotion')

type Session = InstanceType<typeof InstanceSession>

const waitFor = async (ready: () => boolean, what = 'condition', timeout = 3000) => {
  const deadline = Date.now() + timeout
  while (!ready()) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`)
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** 手で配る（manual）か、すぐ配る（auto）偽の通信路 */
class FakeTransport implements Transport {
  readonly selfId: string
  auto = true
  up = false
  others = new Map<string, FakeTransport>()
  links = new Map<string, LinkState>()
  sent: { to: string; msg: unknown }[] = []
  rEv = new Emitter<[string, unknown]>()
  uEv = new Emitter<[string, ArrayBuffer]>()
  peerEv = new Emitter<[{ kind: 'join' | 'leave' | 'link'; peerId: string }]>()
  constructor(readonly self: PeerDescriptor) {
    this.selfId = self.peerId
  }
  peers() {
    return [...this.others.values()].map((o) => o.self)
  }
  link(peerId: string): LinkState {
    return this.others.has(peerId) ? (this.links.get(peerId) ?? 'p2p') : 'lost'
  }
  sendR(to: string, msg: PeerMessage) {
    const targets = to === '*' ? [...this.others.keys()] : [to]
    for (const id of targets) {
      const copy = JSON.parse(JSON.stringify(msg)) as unknown
      if (this.auto) queueMicrotask(() => this.others.get(id)?.rEv.emit(this.selfId, copy))
      else this.sent.push({ to: id, msg: copy })
    }
  }
  sendU() {}
  onR(cb: (from: string, msg: unknown) => void) {
    return this.rEv.on(cb)
  }
  onU(cb: (from: string, buf: ArrayBuffer) => void) {
    return this.uEv.on(cb)
  }
  onPeers(cb: (ev: { kind: 'join' | 'leave' | 'link'; peerId: string }) => void) {
    return this.peerEv.on(cb)
  }
  setAudioTrack() {}
  onRemoteAudio() {
    return () => {}
  }
  setVideoTrack() {}
  onRemoteVideo() {
    return () => {}
  }
  serverUp() {
    return this.up
  }
  onServer() {
    return () => {}
  }
  rtt() {
    return 0
  }
  close() {}
  /** 手で配る: to あての、まだ配っていないものを順に届ける */
  pump(to: FakeTransport) {
    const out = this.sent.filter((e) => e.to === to.selfId)
    this.sent = this.sent.filter((e) => e.to !== to.selfId)
    for (const e of out) to.rEv.emit(this.selfId, e.msg)
  }
}

const user = (id: string) => ({ id, displayName: id, iconUrl: null, status: 'online' as const, statusText: '' })
const avatar = { kind: 'builtin' as const, id: 'akane', color: '#6ea8ff', scale: 1 }
let joinOrder = Date.now()
const desc = (peerId: string, ticket = ''): PeerDescriptor => ({ peerId, user: user(peerId), joinedAt: joinOrder++, hostScore: 1, ticket })

/** 相手どうしを通信路の一覧に入れる（events: 上の層へ join/link を知らせる） */
const connect = (a: FakeTransport, b: FakeTransport, events = true) => {
  a.others.set(b.selfId, b)
  b.others.set(a.selfId, a)
  if (!events) return
  for (const [x, y] of [[a, b], [b, a]] as const) {
    x.peerEv.emit({ kind: 'join', peerId: y.selfId })
    x.peerEv.emit({ kind: 'link', peerId: y.selfId })
  }
}

const makeSession = (t: FakeTransport, o: { serverKey?: string; instanceId?: string; serverClock?: InstanceType<typeof SharedClock> } = {}) =>
  new InstanceSession({ transport: t, serverKey: o.serverKey ?? null, serverId: null, instanceId: o.instanceId ?? 'inst', serverClock: o.serverClock ?? null, avatar, allowContact: 'everyone', hostScore: 1 })

test('名乗りの検証中に届いたホストの同期状態の一覧を捨てずに、検証のあとで受け取る', async () => {
  const keys = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair
  const serverKey = b64urlEncode(new Uint8Array(await crypto.subtle.exportKey('spki', keys.publicKey)))
  const ticketFor = async (pid: string) => {
    const payload: TicketPayload = { v: 1, sid: 'srv', iid: 'inst', uid: pid, pid, name: pid, role: 'member', iat: Date.now(), exp: Date.now() + 600000 }
    const body = b64urlEncode(new TextEncoder().encode(JSON.stringify(payload)))
    const sig = new Uint8Array(await crypto.subtle.sign({ name: 'Ed25519' }, keys.privateKey, new TextEncoder().encode(body)))
    return `${body}.${b64urlEncode(sig)}`
  }
  const tH = new FakeTransport(desc('host', await ticketFor('host')))
  const tJ = new FakeTransport(desc('joiner', await ticketFor('joiner')))
  tH.auto = false
  tJ.auto = false
  const host = makeSession(tH, { serverKey })
  host.set('w:door', 'open')
  connect(tH, tJ, false)
  const joiner = makeSession(tJ, { serverKey })
  tH.peerEv.emit({ kind: 'join', peerId: 'joiner' })
  tH.peerEv.emit({ kind: 'link', peerId: 'joiner' })
  try {
    // ホストが先に検証を終えて一覧を送る。参加した側はホストの名乗りの検証を始めた直後に、一覧まで続けて受け取る
    tJ.pump(tH)
    await waitFor(() => tH.sent.some((e) => (e.msg as { t?: string }).t === 'snapshot'), 'host snapshot')
    tH.pump(tJ)
    assert.equal(joiner.synced, false)
    await waitFor(() => joiner.synced, 'joiner sync')
    assert.equal(joiner.get('w:door'), 'open')
    assert.equal(joiner.hostId(), 'host')
  } finally {
    host.close()
    joiner.close()
  }
})

test('止まっていたタブが戻ると、外した側でも名乗りを確かめ直し、ホストが割れない', async () => {
  const room = `local-session-reconnect-${Math.random()}`
  const tA = new LocalTransport(room, user('a'))
  await sleep(5)
  const tB = new LocalTransport(room, user('b'))
  const a = new InstanceSession({ transport: tA, serverKey: null, serverId: null, instanceId: room, serverClock: null, avatar, allowContact: 'everyone', hostScore: 1 })
  const b = new InstanceSession({ transport: tB, serverKey: null, serverId: null, instanceId: room, serverClock: null, avatar, allowContact: 'everyone', hostScore: 1 })
  try {
    await waitFor(() => !!a.members.get(tB.selfId)?.verified && !!b.members.get(tA.selfId)?.verified, 'first verification')
    assert.equal(a.hostId(), b.hostId())
    // B だけが A を外す（A のタブが止まって心拍が途切れたときと同じ）。A は B を覚えたまま
    ;(tB as unknown as { drop(id: string): void }).drop(tA.selfId)
    assert.equal(b.members.has(tA.selfId), false)
    await waitFor(() => !!b.members.get(tA.selfId)?.verified, 'verification after resume', 4000)
    assert.equal(a.hostId(), b.hostId())
  } finally {
    a.close()
    b.close()
  }
})

test('表情・入力中・アバター・触れた・名乗りのメッセージを相手ごとに制限する', async () => {
  const tA = new FakeTransport(desc('a'))
  const tB = new FakeTransport(desc('b'))
  const a = makeSession(tA)
  const b = makeSession(tB)
  connect(tA, tB)
  try {
    await waitFor(() => !!a.members.get('b')?.verified && !!b.members.get('a')?.verified, 'verification')
    await sleep(20)
    const counts = { expr: 0, avatar: 0, touch: 0, members: 0 }
    a.exprEv.on(() => counts.expr++)
    a.avatarEv.on(() => counts.avatar++)
    a.touchEv.on(() => counts.touch++)
    a.membersEv.on(() => counts.members++)
    for (let i = 0; i < 100; i++) tB.sendR('a', { t: 'expr', weights: { happy: (i % 10) / 10 }, gesture: ['neutral', 'neutral'] })
    for (let i = 0; i < 100; i++) tB.sendR('a', { t: 'touch', part: 'head', strength: 1 })
    // 同じ値の「入力中」は何度来ても 1 回だけ知らせる
    for (let i = 0; i < 50; i++) tB.sendR('a', { t: 'typing', on: true })
    for (let i = 0; i < 30; i++) tB.sendR('a', { t: 'avatar', avatar: { ...avatar, color: `#0000${(i + 16).toString(16)}` } })
    await sleep(20)
    // 名乗りのたびに表情も 1 回送っているので、残りは 28 回
    assert.equal(counts.expr, 28)
    assert.equal(counts.touch, 20)
    assert.equal(counts.members, 1)
    assert.equal(a.members.get('b')?.typing, true)
    assert.equal(counts.avatar, 10)
    // 制限を超えた分は、あとで最新のアバターをまとめて知らせる
    assert.equal((a.members.get('b')?.avatar as { color: string }).color, '#00002d')
    await waitFor(() => counts.avatar === 11, 'trailing avatar notice', 2000)
    // 名乗りは 10 秒に 10 回まで（毎回、署名の検証とアバターの知らせがある）
    counts.members = 0
    for (let i = 0; i < 30; i++) tB.sendR('a', { t: 'hello', v: 1, ticket: '', avatar, allowContact: 'everyone', hostScore: 1, stateEpoch: 0 } as PeerMessage)
    await sleep(20)
    // つながったときに 2 回名乗っているので、残りは 8 回
    assert.equal(counts.members, 8)
    // 送る側も、触れている間ずっとは送らない
    let touches = 0
    b.touchEv.on(() => touches++)
    for (let i = 0; i < 10; i++) a.sendTouch('b', 'head', 1)
    await sleep(20)
    assert.equal(touches, 1)
  } finally {
    a.close()
    b.close()
  }
})

test('アバターの動きの開始時刻は、ホストの端末の時計ではなく共有時計で確かめる', () => {
  const clock = new SharedClock()
  // 親サーバーの時計が、この端末より 10 分進んでいる
  const c = performance.now()
  clock.addSample(c, Date.now() + 600_000, c)
  const t = new FakeTransport(desc('solo'))
  t.up = true
  const s = makeSession(t, { serverClock: clock })
  try {
    assert.equal(s.isHost(), true)
    const key = `sys:avatarMotion:${s.selfId}`
    s.set(key, makeAvatarMotionState('pose', [{ at: 0, bones: { leftUpperArm: [0.5, 0, 0] } }], s.clock.now()))
    assert.ok(s.get(key))
  } finally {
    s.close()
  }
})

test('ホストがまだ確かめていない共有中の人の画面共有を、ほかの人が奪えない', async () => {
  const tH = new FakeTransport(desc('h'))
  const tS = new FakeTransport(desc('s'))
  const tX = new FakeTransport(desc('x'))
  const sessions = [makeSession(tH), makeSession(tS), makeSession(tX)]
  const [h, s, x] = sessions as [Session, Session, Session]
  connect(tH, tS)
  connect(tH, tX)
  connect(tS, tX)
  const owner = (who: Session) => (who.get(SCREEN_SHARE_KEY) as { owner?: string } | null | undefined)?.owner
  try {
    await waitFor(() => sessions.every((p) => p.verifiedMembers().length === 2), 'verification')
    assert.equal(h.hostId(), 'h')
    s.set(SCREEN_SHARE_KEY, { owner: 's', startedAt: Date.now() })
    await waitFor(() => owner(h) === 's' && owner(x) === 's', 'claim')
    // ホスト交代の直後と同じ: ホストは S をまだ確かめていないが、S は接続の一覧にいる
    h.members.get('s')!.verified = false
    x.set(SCREEN_SHARE_KEY, { owner: 'x', startedAt: Date.now() })
    await sleep(20)
    assert.equal(owner(h), 's')
    assert.equal(owner(x), 's')
    x.set(SCREEN_SHARE_KEY, null)
    await sleep(20)
    assert.equal(owner(h), 's')
    assert.equal(owner(x), 's')
    // 接続が切れた人の共有は、ほかの人が引き継げる
    tH.links.set('s', 'lost')
    x.set(SCREEN_SHARE_KEY, { owner: 'x', startedAt: Date.now() })
    await waitFor(() => owner(h) === 'x', 'takeover after loss')
  } finally {
    for (const p of sessions) p.close()
  }
})

test('中継の声: 準備を待つ間に抜けた相手や、閉じたあとの受け手を作らない', async () => {
  const g = globalThis as Record<string, unknown>
  let decoders = 0
  class FakeNode {
    port = { postMessage() {}, onmessage: null }
    connect() {}
    disconnect() {}
  }
  class FakeDecoder {
    state = 'unconfigured'
    constructor() {
      decoders++
    }
    configure() {
      this.state = 'configured'
    }
    decode() {}
    close() {
      this.state = 'closed'
    }
  }
  g.AudioEncoder = class {}
  g.AudioDecoder = FakeDecoder
  g.AudioWorkletNode = FakeNode
  g.EncodedAudioChunk = class {}
  const { VoiceRelay } = await import('../src/net/voiceRelay')
  let ready: () => void = () => {}
  const ctx = {
    sampleRate: 48000,
    audioWorklet: { addModule: () => new Promise<void>((resolve) => (ready = resolve)) },
    createMediaStreamDestination: () => ({ stream: {} }),
  }
  const added: string[] = []
  const voice = { listener: { context: ctx }, addRemote: (id: string) => added.push(id), transmitting: () => false }
  const members = new Map<string, { verified: boolean }>([['gone', { verified: true }], ['here', { verified: true }]])
  const peerEv = new Emitter<[{ kind: 'join' | 'leave' | 'link'; peerId: string }]>()
  const session = {
    voiceEv: new Emitter<[string, ArrayBuffer]>(),
    members,
    verifiedMembers: () => [],
    t: { onPeers: (cb: (ev: { kind: 'join' | 'leave' | 'link'; peerId: string }) => void) => peerEv.on(cb), link: () => 'relay', sendU() {} },
  }
  const relay = new VoiceRelay(session as never, voice as never)
  const packet = () => {
    const buf = new ArrayBuffer(16)
    new DataView(buf).setUint8(0, BINARY_VOICE)
    return buf
  }
  session.voiceEv.emit('gone', packet())
  members.delete('gone')
  peerEv.emit({ kind: 'leave', peerId: 'gone' })
  ready()
  await sleep(10)
  assert.deepEqual(added, [])
  session.voiceEv.emit('here', packet())
  await sleep(10)
  assert.deepEqual(added, ['here'])
  members.set('late', { verified: true })
  session.voiceEv.emit('late', packet())
  relay.dispose()
  await sleep(10)
  assert.deepEqual(added, ['here'])
  assert.equal(decoders, 1)
})
