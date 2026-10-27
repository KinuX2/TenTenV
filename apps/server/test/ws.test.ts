import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { PROTOCOL_VERSION } from '@tentenv/protocol'
import { verifyTicket } from '../src/ticket'
import { api, buildWorldZip, guest, sleep, startServer, WsClient, type TestServer } from './helpers'

describe('WebSocket（/ws）', () => {
  let srv: TestServer
  let worldId: string
  let owner: { token: string; me: { id: string } }
  before(async () => {
    srv = await startServer()
    owner = await guest(srv, '主催')
    worldId = (await api(srv, 'POST', '/api/worlds', { token: owner.token, raw: buildWorldZip({ name: '広場' }) })).data.id
  })
  after(() => srv.close())

  const instance = async (token: string, body: Record<string, unknown> = {}) => {
    const r = await api(srv, 'POST', '/api/instances', { token, body: { worldId, access: 'public', ...body } })
    assert.equal(r.status, 200, JSON.stringify(r.data))
    return r.data as { id: string }
  }

  test('hello と時計合わせ', async () => {
    const c = await WsClient.connect(srv)
    c.send({ t: 'ping', id: 1, c: 5 })
    const e = await c.next('error')
    assert.equal(e.code, 'not_authenticated')
    c.send({ t: 'hello', token: owner.token, protocol: PROTOCOL_VERSION })
    const w = await c.next('welcome')
    assert.equal(w.userId, owner.me.id)
    assert.ok(Math.abs(w.serverTime - Date.now()) < 5000)
    c.send({ t: 'ping', id: 7, c: 123.5 })
    const p = await c.next('pong')
    assert.equal(p.id, 7)
    assert.equal(p.c, 123.5)
    assert.ok(p.s > 0)
    c.close()

    const bad = await WsClient.connect(srv)
    bad.send({ t: 'hello', token: 'wrong-token', protocol: PROTOCOL_VERSION })
    assert.equal((await bad.next('error')).code, 'unauthorized')
    assert.equal((await bad.closed).code, 4001)

    const old = await WsClient.connect(srv)
    old.send({ t: 'hello', token: owner.token, protocol: 1 })
    assert.equal((await old.next('error')).code, 'protocol')
    assert.equal((await old.closed).code, 4000)
  })

  test('2 人の参加・peer-joined・チケット・信号の転送・中継・退出', async () => {
    const b = await guest(srv, '参加者B')
    const inst = await instance(owner.token)
    const info = (await api(srv, 'GET', '/api/info')).data
    const ca = await WsClient.connect(srv, owner.token)
    const cb = await WsClient.connect(srv, b.token)

    ca.send({ t: 'join', instanceId: inst.id, hostScore: 50 })
    const ja = await ca.next('joined')
    assert.equal(ja.instance.id, inst.id)
    assert.deepEqual(ja.peers, [])
    assert.equal('relayOnly' in ja, false)
    const ta = await verifyTicket(ja.ticket, info.publicKey, { serverId: info.serverId, instanceId: inst.id })
    assert.ok(ta)
    assert.equal(ta.uid, owner.me.id)
    assert.equal(ta.pid, ja.peerId)
    assert.equal(ta.role, 'owner')

    cb.send({ t: 'join', instanceId: inst.id, hostScore: 10 })
    const jb = await cb.next('joined')
    assert.equal(jb.peers.length, 1)
    assert.equal(jb.peers[0].peerId, ja.peerId)
    assert.equal(jb.peers[0].user.id, owner.me.id)
    assert.equal(jb.peers[0].hostScore, 50)
    assert.equal('relayOnly' in jb, false)
    assert.ok(await verifyTicket(jb.peers[0].ticket, info.publicKey))
    const tb = await verifyTicket(jb.ticket, info.publicKey)
    assert.equal(tb!.role, 'member')
    assert.equal(jb.instance.members.length, 2)

    const pj = await ca.next('peer-joined')
    assert.equal(pj.peer.peerId, jb.peerId)
    assert.equal(pj.peer.user.id, b.me.id)
    assert.equal('relayOnly' in pj.peer, false)
    assert.equal(pj.peer.hidden, undefined)

    // 現在地とオンライン数
    const wi = (await api(srv, 'GET', `/api/worlds/${worldId}`)).data
    assert.equal(wi.occupants, 2)

    // 信号の転送
    ca.send({ t: 'signal', to: jb.peerId, data: { kind: 'offer', sdp: 'v=0 test' } })
    const s = await cb.next('signal')
    assert.equal(s.from, ja.peerId)
    assert.deepEqual(s.data, { kind: 'offer', sdp: 'v=0 test' })
    cb.send({ t: 'signal', to: ja.peerId, data: { kind: 'ice', candidate: 'candidate:1 1 udp 1 1.2.3.4 5 typ host', sdpMid: '0', sdpMLineIndex: 0 } })
    assert.equal((await ca.next('signal')).data.kind, 'ice')
    ca.send({ t: 'signal', to: 'unknownpeer', data: { kind: 'restart' } })
    assert.equal((await ca.next('error')).code, 'peer_not_found')

    // 中継（1 人あて・全員あて）
    ca.send({ t: 'relay', to: jb.peerId, ch: 'r', data: 'eyJ0IjoiY2hhdCJ9' })
    const r1 = await cb.next('relay')
    assert.deepEqual(r1, { t: 'relay', from: ja.peerId, ch: 'r', data: 'eyJ0IjoiY2hhdCJ9' })
    cb.send({ t: 'relay', to: '*', ch: 'u', data: 'AQID' })
    assert.equal((await ca.next('relay')).data, 'AQID')
    ca.send({ t: 'p2pfail', peerId: jb.peerId })

    // 中継の送信量の制限
    const big = 'A'.repeat(60 * 1024)
    for (let i = 0; i < 5; i++) ca.send({ t: 'relay', to: jb.peerId, ch: 'u', data: big })
    assert.equal((await ca.next('error', (e) => e.code === 'relay_rate')).code, 'relay_rate')

    // チケットの更新
    ca.send({ t: 'renew' })
    const nt = await ca.next('ticket')
    assert.ok(await verifyTicket(nt.ticket, info.publicKey, { instanceId: inst.id }))

    // 最近会った人
    const recent = (await api(srv, 'GET', '/api/recent', { token: b.token })).data
    assert.equal(recent[0].user.id, owner.me.id)
    assert.equal(recent[0].worldName, '広場')

    // 退出
    cb.send({ t: 'leave' })
    assert.equal((await ca.next('peer-left')).peerId, jb.peerId)
    // 切断でも peer-left
    cb.send({ t: 'join', instanceId: inst.id, hostScore: 0 })
    const jb2 = await cb.next('joined')
    await ca.next('peer-joined')
    cb.close()
    assert.equal((await ca.next('peer-left')).peerId, jb2.peerId)
    ca.close()
  })

  test('1 接続 1 インスタンス', async () => {
    const i1 = await instance(owner.token)
    const i2 = await instance(owner.token)
    const watcher = await WsClient.connect(srv, (await guest(srv, '見張り')).token)
    const c = await WsClient.connect(srv, owner.token)
    watcher.send({ t: 'join', instanceId: i1.id, hostScore: 0 })
    await watcher.next('joined')
    c.send({ t: 'join', instanceId: i1.id, hostScore: 0 })
    const j1 = await c.next('joined')
    c.send({ t: 'join', instanceId: i1.id, hostScore: 0 })
    assert.equal((await c.next('error')).code, 'already_joined')
    c.send({ t: 'join', instanceId: i2.id, hostScore: 0 })
    await c.next('joined')
    // 前のインスタンスからは抜けている
    assert.equal((await watcher.next('peer-left')).peerId, j1.peerId)
    c.close()
    watcher.close()
  })

  test('不正なメッセージの拒否と切断', async () => {
    const c = await WsClient.connect(srv, owner.token)
    const cases: unknown[] = [
      'not json',
      '[1,2,3]',
      { t: 'unknown' },
      { t: 'ping', id: 'x', c: 1 },
      { t: 'join', instanceId: '../etc', hostScore: 1 },
      { t: 'join', instanceId: 'abc', hostScore: 'high' },
      { t: 'signal', to: 'p', data: { kind: 'offer', sdp: 'x'.repeat(70 * 1024) } },
      { t: 'signal', to: 'p', data: { kind: 'evil' } },
      { t: 'relay', to: 'p', ch: 'x', data: '' },
      { t: 'status', status: 'online', statusText: 'x'.repeat(200) },
      { t: 'kick', peerId: 'p', reason: 5 },
    ]
    for (const m of cases) {
      c.send(m)
      const e = await c.next('error')
      assert.equal(e.code, 'bad_message', JSON.stringify(m).slice(0, 80))
    }
    // バイナリも拒否
    c.ws.send(new Uint8Array([1, 2, 3]))
    assert.equal((await c.next('error')).code, 'bad_message')
    // 続けると切断される
    for (let i = 0; i < 30; i++) c.send({ t: 'nope' })
    assert.equal((await c.closed).code, 1008)
  })

  test('回数の上限を超えると切断される', async () => {
    const c = await WsClient.connect(srv, owner.token)
    // 一時的な詰まり（少しの超過）では切れないが、極端に送り続けると切れる
    for (let i = 0; i < 1000; i++) c.send({ t: 'ping', id: i, c: 0 })
    const { code } = await c.closed
    assert.equal(code, 1008)
  })

  test('定員と順番待ち', async () => {
    const inst = await instance(owner.token, { capacity: 1 })
    const b = await guest(srv, '待つ人')
    const c2 = await guest(srv, '次に待つ人')
    const ca = await WsClient.connect(srv, owner.token)
    const cb = await WsClient.connect(srv, b.token)
    const cc = await WsClient.connect(srv, c2.token)
    ca.send({ t: 'join', instanceId: inst.id, hostScore: 0 })
    await ca.next('joined')
    cb.send({ t: 'join', instanceId: inst.id, hostScore: 0 })
    assert.equal((await cb.next('error')).code, 'full')
    cb.send({ t: 'join', instanceId: inst.id, hostScore: 0, queue: true })
    const q = await cb.next('queued')
    assert.equal(q.position, 1)
    cc.send({ t: 'join', instanceId: inst.id, hostScore: 0, queue: true })
    assert.equal((await cc.next('queued')).position, 2)
    assert.equal((await api(srv, 'GET', `/api/instances/${inst.id}`, { token: b.token })).data.queue, 2)
    // 空きができたら先頭から入る
    ca.send({ t: 'leave' })
    const jb = await cb.next('joined')
    assert.equal(jb.instance.id, inst.id)
    assert.equal((await cc.next('queued', (m) => m.position === 1)).position, 1)
    // 順番待ちの人が切断すると次の人が繰り上がる
    cb.close()
    await cc.next('joined')
    ca.close()
    cc.close()
  })

  test('フレンド限定のインスタンスに知らない人は入れない', async () => {
    const inst = await instance(owner.token, { access: 'friends' })
    const stranger = await guest(srv, '通りすがり')
    const c = await WsClient.connect(srv, stranger.token)
    c.send({ t: 'join', instanceId: inst.id, hostScore: 0 })
    const e = await c.next('error')
    assert.equal(e.code, 'denied')
    assert.ok(e.message)
    c.send({ t: 'join', instanceId: 'doesnotexist', hostScore: 0 })
    assert.equal((await c.next('error')).code, 'not_found')
    c.close()
  })

  test('フレンド+ と 招待+（中にいる人が基準）', async () => {
    const inside = await guest(srv, '中の人')
    const friendOfInside = await guest(srv, '中の人の友達')
    await api(srv, 'POST', `/api/friends/${friendOfInside.me.id}`, { token: inside.token })
    await api(srv, 'POST', `/api/friends/${inside.me.id}`, { token: friendOfInside.token })
    const fp = await instance(owner.token, { access: 'friends+' })
    // 中の人もオーナーのフレンドにする
    await api(srv, 'POST', `/api/friends/${inside.me.id}`, { token: owner.token })
    await api(srv, 'POST', `/api/friends/${owner.me.id}`, { token: inside.token })
    assert.equal((await api(srv, 'GET', `/api/instances/${fp.id}`, { token: friendOfInside.token })).data.canJoin, false)
    const ci = await WsClient.connect(srv, inside.token)
    ci.send({ t: 'join', instanceId: fp.id, hostScore: 0 })
    await ci.next('joined')
    assert.equal((await api(srv, 'GET', `/api/instances/${fp.id}`, { token: friendOfInside.token })).data.canJoin, true)

    // 招待+: 中にいる人が招待できる
    const ip = await instance(owner.token, { access: 'invite+' })
    const invited = await guest(srv, '招待された人')
    assert.equal((await api(srv, 'POST', '/api/invites', { token: inside.token, body: { userId: invited.me.id, instanceId: ip.id } })).status, 403)
    ci.send({ t: 'join', instanceId: ip.id, hostScore: 0 })
    assert.equal((await ci.next('error')).code, 'denied')
    // 作成者が中の人を招待し、中の人がさらに招待する
    assert.equal((await api(srv, 'POST', '/api/invites', { token: owner.token, body: { userId: inside.me.id, instanceId: ip.id } })).status, 204)
    ci.send({ t: 'join', instanceId: ip.id, hostScore: 0 })
    await ci.next('joined')
    assert.equal((await api(srv, 'POST', '/api/invites', { token: inside.token, body: { userId: invited.me.id, instanceId: ip.id } })).status, 204)
    const cv = await WsClient.connect(srv, invited.token)
    cv.send({ t: 'join', instanceId: ip.id, hostScore: 0 })
    await cv.next('joined')
    ci.close()
    cv.close()
  })

  test('キック', async () => {
    const inst = await instance(owner.token)
    const b = await guest(srv, 'キックされる人')
    const ca = await WsClient.connect(srv, owner.token)
    const cb = await WsClient.connect(srv, b.token)
    ca.send({ t: 'join', instanceId: inst.id, hostScore: 0 })
    const ja = await ca.next('joined')
    cb.send({ t: 'join', instanceId: inst.id, hostScore: 0 })
    const jb = await cb.next('joined')
    // 一般の参加者はキックできない
    cb.send({ t: 'kick', peerId: ja.peerId, reason: 'x' })
    assert.equal((await cb.next('error')).code, 'forbidden')
    ca.send({ t: 'kick', peerId: jb.peerId, reason: '迷惑行為' })
    assert.equal((await cb.next('kicked')).reason, '迷惑行為')
    assert.equal((await ca.next('peer-left')).peerId, jb.peerId)
    // 入り直せない
    cb.send({ t: 'join', instanceId: inst.id, hostScore: 0 })
    assert.equal((await cb.next('error')).code, 'denied')
    ca.close()
    cb.close()
  })

  test('ブロックしている相手は hidden になり、信号も通らない', async () => {
    const inst = await instance(owner.token)
    const x = await guest(srv, 'X')
    const y = await guest(srv, 'Y')
    await api(srv, 'POST', `/api/blocks/${y.me.id}`, { token: x.token })
    const cx = await WsClient.connect(srv, x.token)
    const cy = await WsClient.connect(srv, y.token)
    cx.send({ t: 'join', instanceId: inst.id, hostScore: 0 })
    const jx = await cx.next('joined')
    cy.send({ t: 'join', instanceId: inst.id, hostScore: 0 })
    const jy = await cy.next('joined')
    assert.equal(jy.peers[0].hidden, true)
    assert.equal((await cx.next('peer-joined')).peer.hidden, true)
    // 互いの参加者一覧にも出ない
    assert.ok(!jy.instance.members.some((m) => m.id === x.me.id))
    cy.send({ t: 'signal', to: jx.peerId, data: { kind: 'restart' } })
    assert.equal((await cy.next('error')).code, 'peer_not_found')
    cy.send({ t: 'relay', to: '*', ch: 'r', data: 'AA' })
    assert.ok(await cx.none('relay'))
    cx.close()
    cy.close()
  })

  test('インスタンスの参加者は共有ファイルを上げられる', async () => {
    const inst = await instance(owner.token)
    const m = await guest(srv, 'メンバー')
    const c = await WsClient.connect(srv, m.token)
    assert.equal((await api(srv, 'POST', `/api/instances/${inst.id}/files?name=a.txt`, { token: m.token, raw: new Uint8Array([65]) })).status, 403)
    c.send({ t: 'join', instanceId: inst.id, hostScore: 0 })
    await c.next('joined')
    const up = await api(srv, 'POST', `/api/instances/${inst.id}/files?name=a.txt`, { token: m.token, raw: new Uint8Array([65]), type: 'text/plain' })
    assert.equal(up.status, 200)
    // 作成者は他人のファイルも消せる
    assert.equal((await api(srv, 'DELETE', `/api/instances/${inst.id}/files/${up.data.id}`, { token: owner.token })).status, 204)
    c.close()
  })

  test('フレンドの状態と通知が届く', async () => {
    const p = await guest(srv, 'P')
    const q = await guest(srv, 'Q')
    const cp = await WsClient.connect(srv, p.token)
    // 申請の通知
    await api(srv, 'POST', `/api/friends/${p.me.id}`, { token: q.token })
    const n = await cp.next('notify')
    assert.equal(n.notification.kind, 'friend_request')
    assert.equal(n.notification.from!.id, q.me.id)
    await api(srv, 'POST', `/api/friends/${q.me.id}`, { token: p.token })
    // Q がつなぐと P に friend-status
    const cq = await WsClient.connect(srv, q.token)
    const fs = await cp.next('friend-status', (m) => m.user.id === q.me.id && m.online)
    assert.equal(fs.location, null)
    cq.send({ t: 'status', status: 'busy', statusText: '作業中' })
    const fs2 = await cp.next('friend-status', (m) => m.user.status === 'busy')
    assert.equal(fs2.user.statusText, '作業中')
    // 現在地（フレンドには見える設定）
    const inst = await instance(q.token)
    cq.send({ t: 'join', instanceId: inst.id, hostScore: 0 })
    await cq.next('joined')
    const fs3 = await cp.next('friend-status', (m) => !!m.location)
    assert.equal(fs3.location!.instanceId, inst.id)
    const fl = (await api(srv, 'GET', '/api/friends', { token: p.token })).data
    assert.equal(fl[0].location.instanceId, inst.id)
    assert.equal(fl[0].online, true)
    cq.close()
    const off = await cp.next('friend-status', (m) => !m.online)
    assert.equal(off.user.status, 'offline')
    cp.close()
  })

  test('中継を無効にしたサーバー', async () => {
    const s2 = await startServer({ relay: false })
    try {
      const a = await guest(s2, 'a')
      const w = (await api(s2, 'POST', '/api/worlds', { token: a.token, raw: buildWorldZip() })).data
      const inst = (await api(s2, 'POST', '/api/instances', { token: a.token, body: { worldId: w.id, access: 'public' } })).data
      const info = (await api(s2, 'GET', '/api/info')).data
      assert.equal(info.relay, false)
      const c = await WsClient.connect(s2, a.token)
      c.send({ t: 'join', instanceId: inst.id, hostScore: 0 })
      assert.equal('relayOnly' in await c.next('joined'), false)
      c.send({ t: 'relay', to: '*', ch: 'r', data: 'AA' })
      assert.equal((await c.next('error')).code, 'relay_disabled')
      c.close()
      await sleep(50)
    } finally {
      await s2.close()
    }
  })
})
