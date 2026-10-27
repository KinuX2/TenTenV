import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { unzipSync } from 'fflate'
import { api, buildVrm, buildWorldZip, guest, startServer, type TestServer } from './helpers'

/** Misskey の check API の代わり（テスト用） */
const stubMisskey = (srv: TestServer) => {
  srv.app.fetchImpl = (async (input: string | URL | Request) => {
    const url = String(input)
    const m = /^https:\/\/([^/]+)\/api\/miauth\/([^/]+)\/check$/.exec(url)
    if (!m) return new Response('not found', { status: 404 })
    const username = stubUsers.get(m[2]) ?? 'nobody'
    return Response.json({ ok: true, token: 'secret-token', user: { id: 'x', username, name: `${username} さん`, avatarUrl: `https://${m[1]}/avatar/${username}.png`, host: null } })
  }) as typeof fetch
}
const stubUsers = new Map<string, string>()

const misskeyLogin = async (srv: TestServer, username: string, host = 'misskey.example') => {
  const s = await api(srv, 'POST', '/api/auth/misskey/start', { body: { host, callback: 'https://client.example/cb' } })
  assert.equal(s.status, 200, JSON.stringify(s.data))
  stubUsers.set(s.data.session, username)
  const f = await api(srv, 'POST', '/api/auth/misskey/finish', { body: { session: s.data.session } })
  assert.equal(f.status, 200, JSON.stringify(f.data))
  return f.data as { token: string; me: { id: string; handle: string; isAdmin: boolean; isGuest: boolean } }
}

describe('REST API', () => {
  let srv: TestServer
  before(async () => {
    srv = await startServer({ admins: ['@admin@misskey.example'], misskey: { enabled: true, allowedHosts: ['misskey.example'] } })
    stubMisskey(srv)
  })
  after(() => srv.close())

  test('サーバー情報', async () => {
    const r = await api(srv, 'GET', '/api/info')
    assert.equal(r.status, 200)
    assert.equal(r.data.protocol, 2)
    assert.equal(r.data.serverId.length, 22)
    assert.equal(r.data.auth.guest, true)
    assert.deepEqual(r.data.auth.misskeyHosts, ['misskey.example'])
    assert.equal(r.headers.get('access-control-allow-origin'), '*')
  })

  test('ゲストログインとプロフィールの更新', async () => {
    const bad = await api(srv, 'POST', '/api/auth/guest', { body: { displayName: '' } })
    assert.equal(bad.status, 400)
    assert.equal(bad.data.error, 'bad_request')
    assert.equal((await api(srv, 'POST', '/api/auth/guest', { body: { displayName: 'x'.repeat(40) } })).status, 400)
    assert.equal((await api(srv, 'GET', '/api/me')).status, 401)

    const g = await guest(srv, 'ゲスト太郎')
    assert.equal(g.me.displayName, 'ゲスト太郎')
    const me = await api(srv, 'GET', '/api/me', { token: g.token })
    assert.equal(me.status, 200)
    assert.equal(me.data.isGuest, true)
    assert.match(me.data.handle, /^guest:/)

    const p = await api(srv, 'PATCH', '/api/me', {
      token: g.token,
      body: { bio: 'よろしく', statusText: 'ひま', status: 'joinme', links: ['https://example.com/'], decoration: { color: '#ff0000', frame: 'star' }, settings: { allowInvites: 'friends' } },
    })
    assert.equal(p.status, 200, JSON.stringify(p.data))
    assert.equal(p.data.bio, 'よろしく')
    assert.equal(p.data.statusText, 'ひま')
    assert.equal(p.data.status, 'joinme')
    assert.deepEqual(p.data.decoration, { color: '#ff0000', frame: 'star' })
    assert.equal(p.data.settings.allowInvites, 'friends')
    assert.equal(p.data.settings.locationVisibility, 'friends')
    assert.equal((await api(srv, 'PATCH', '/api/me', { token: g.token, body: { decoration: { color: 'red' } } })).status, 400)
    assert.equal((await api(srv, 'PATCH', '/api/me', { token: g.token, body: { links: ['javascript:alert(1)'] } })).status, 400)
    assert.equal((await api(srv, 'PATCH', '/api/me', { token: g.token, body: { status: 'invisible' } })).status, 400)

    // 検索
    const s = await api(srv, 'GET', `/api/users?q=${encodeURIComponent('太郎')}`, { token: g.token })
    assert.ok(s.data.some((u: { id: string }) => u.id === g.me.id))
    // LIKE の記号はそのまま文字として扱う
    const s2 = await api(srv, 'GET', `/api/users?q=${encodeURIComponent('%')}`, { token: g.token })
    assert.equal(s2.data.length, 0)

    // ログアウトするとトークンは使えない
    assert.equal((await api(srv, 'POST', '/api/auth/logout', { token: g.token })).status, 204)
    assert.equal((await api(srv, 'GET', '/api/me', { token: g.token })).status, 401)
  })

  test('Misskey ログイン（MiAuth）', async () => {
    const s = await api(srv, 'POST', '/api/auth/misskey/start', { body: { host: 'misskey.example', callback: 'https://client.example/cb' } })
    assert.equal(s.status, 200)
    const u = new URL(s.data.url)
    assert.equal(u.origin, 'https://misskey.example')
    assert.equal(u.pathname, `/miauth/${s.data.session}`)
    assert.equal(u.searchParams.get('permission'), 'read:account')
    assert.equal(u.searchParams.get('name'), 'TenTenV')
    assert.equal(u.searchParams.get('callback'), 'https://client.example/cb')
    assert.equal((await api(srv, 'POST', '/api/auth/misskey/start', { body: { host: 'other.example', callback: 'https://c/' } })).status, 403)
    assert.equal((await api(srv, 'POST', '/api/auth/misskey/start', { body: { host: '127.0.0.1/../x', callback: 'https://c/' } })).status, 400)

    const a = await misskeyLogin(srv, 'alice')
    assert.equal(a.me.handle, '@alice@misskey.example')
    assert.equal(a.me.isGuest, false)
    // 同じ人がもう一度ログインすると同じ利用者になる
    const a2 = await misskeyLogin(srv, 'alice')
    assert.equal(a2.me.id, a.me.id)
    // session は 1 回しか使えない
    const again = await api(srv, 'POST', '/api/auth/misskey/finish', { body: { session: s.data.session } })
    assert.equal(again.status, 200) // 未使用の session（上で start しただけ）
    assert.equal((await api(srv, 'POST', '/api/auth/misskey/finish', { body: { session: s.data.session } })).status, 400)
    // トークンは保存していない
    const rows = srv.app.db.all<Record<string, unknown>>('SELECT * FROM users')
    assert.ok(!JSON.stringify(rows).includes('secret-token'))
  })

  test('フレンド申請と承認・通知・ブロック', async () => {
    const a = await guest(srv, 'あかり')
    const b = await guest(srv, 'ぼたん')
    const req1 = await api(srv, 'POST', `/api/friends/${b.me.id}`, { token: a.token })
    assert.deepEqual(req1.data, { state: 'outgoing' })
    const inc = await api(srv, 'GET', '/api/friends/requests', { token: b.token })
    assert.equal(inc.data.incoming[0].id, a.me.id)
    const n1 = await api(srv, 'GET', '/api/notifications', { token: b.token })
    assert.equal(n1.data[0].kind, 'friend_request')
    assert.equal(n1.data[0].from.id, a.me.id)
    assert.equal(n1.data[0].read, false)

    const acc = await api(srv, 'POST', `/api/friends/${a.me.id}`, { token: b.token })
    assert.deepEqual(acc.data, { state: 'friends' })
    const n2 = await api(srv, 'GET', '/api/notifications', { token: a.token })
    assert.equal(n2.data[0].kind, 'friend_accepted')
    const fa = await api(srv, 'GET', '/api/friends', { token: a.token })
    assert.equal(fa.data.length, 1)
    assert.equal(fa.data[0].id, b.me.id)
    assert.equal(fa.data[0].online, false)
    const prof = await api(srv, 'GET', `/api/users/${b.me.id}`, { token: a.token })
    assert.equal(prof.data.friendState, 'friends')
    assert.equal(prof.data.isFriend, true)

    await api(srv, 'POST', '/api/notifications/read', { token: a.token, body: {} })
    assert.equal((await api(srv, 'GET', '/api/notifications', { token: a.token })).data[0].read, true)
    const nid = n2.data[0].id
    assert.equal((await api(srv, 'DELETE', `/api/notifications/${nid}`, { token: a.token })).status, 204)

    // 自分自身・存在しない相手
    assert.equal((await api(srv, 'POST', `/api/friends/${a.me.id}`, { token: a.token })).status, 400)
    assert.equal((await api(srv, 'POST', '/api/friends/nobody', { token: a.token })).status, 404)

    // ブロックするとフレンドは解除され、申請もできない
    assert.equal((await api(srv, 'POST', `/api/blocks/${b.me.id}`, { token: a.token })).status, 204)
    assert.equal((await api(srv, 'GET', '/api/friends', { token: a.token })).data.length, 0)
    assert.equal((await api(srv, 'GET', '/api/blocks', { token: a.token })).data[0].id, b.me.id)
    assert.equal((await api(srv, 'POST', `/api/friends/${a.me.id}`, { token: b.token })).status, 403)
    await api(srv, 'DELETE', `/api/blocks/${b.me.id}`, { token: a.token })
    assert.equal((await api(srv, 'GET', '/api/blocks', { token: a.token })).data.length, 0)
  })

  test('ワールドのアップロード・配信・更新・書き出し・検索', async () => {
    const a = await guest(srv, '制作者')
    const other = await guest(srv, '見る人')
    const up = await api(srv, 'POST', '/api/worlds', { token: a.token, raw: buildWorldZip({ name: '星空の部屋', tags: ['Night', 'chill'], description: 'きれいな星' }), type: 'application/zip' })
    assert.equal(up.status, 200, JSON.stringify(up.data))
    const w = up.data
    assert.equal(w.version, 1)
    assert.equal(w.name, '星空の部屋')
    assert.deepEqual(w.tags, ['night', 'chill'])
    assert.equal(w.baseUrl, `${srv.url}/files/worlds/${w.id}/1/`)
    assert.equal(w.thumbnailUrl, `${w.baseUrl}assets/thumb.png`)
    assert.equal(w.manifest.entry, 'world.js')

    const js = await fetch(w.baseUrl + 'world.js')
    assert.equal(js.status, 200)
    assert.match(js.headers.get('content-type')!, /javascript/)
    assert.match(js.headers.get('cache-control')!, /immutable/)
    assert.equal(js.headers.get('access-control-allow-origin'), '*')
    assert.match(await js.text(), /World/)
    const manifest = await fetch(w.baseUrl + 'world.json')
    assert.equal(manifest.status, 200)

    // Range（音声のシーク用）
    const part = await fetch(w.baseUrl + 'assets/sound.mp3', { headers: { range: 'bytes=10-19' } })
    assert.equal(part.status, 206)
    assert.equal(part.headers.get('content-range'), 'bytes 10-19/4096')
    assert.equal(part.headers.get('content-type'), 'audio/mpeg')
    const bytes = new Uint8Array(await part.arrayBuffer())
    assert.deepEqual([...bytes], [10, 11, 12, 13, 14, 15, 16, 17, 18, 19])
    assert.equal((await fetch(w.baseUrl + 'assets/sound.mp3', { headers: { range: 'bytes=9999-' } })).status, 416)

    // パスの検査
    for (const p of ['/files/worlds/..%2f..%2fdb.sqlite', '/files/../db.sqlite', '/files/keys/ed25519.pem', `/files/worlds/${w.id}/1/..%5c..%5c..%5ckeys%5ced25519.pem`]) {
      const r = await fetch(srv.url + p)
      assert.ok(r.status === 404 || r.status === 400, `${p} → ${r.status}`)
    }

    // 改ざん・危険なコードは拒否
    const bad = await api(srv, 'POST', '/api/worlds', { token: a.token, raw: buildWorldZip({ tamper: true }) })
    assert.equal(bad.status, 400)
    assert.match(bad.data.message, /ハッシュ/)
    const evil = await api(srv, 'POST', '/api/worlds', { token: a.token, raw: buildWorldZip({ code: 'export default () => eval("1")' }) })
    assert.equal(evil.status, 400)
    assert.match(evil.data.message, /検査/)
    assert.equal((await api(srv, 'POST', '/api/worlds', { token: a.token, raw: new Uint8Array([1, 2, 3]) })).status, 400)

    // 更新すると版が上がり、前の版も残る
    const up2 = await api(srv, 'PUT', `/api/worlds/${w.id}`, { token: a.token, raw: buildWorldZip({ name: '星空の部屋 v2', tags: ['night'] }) })
    assert.equal(up2.status, 200, JSON.stringify(up2.data))
    assert.equal(up2.data.version, 2)
    assert.equal(up2.data.baseUrl, `${srv.url}/files/worlds/${w.id}/2/`)
    assert.equal((await fetch(w.baseUrl + 'world.js')).status, 200)
    assert.equal((await api(srv, 'PUT', `/api/worlds/${w.id}`, { token: other.token, raw: buildWorldZip() })).status, 403)

    // 書き出し（制作者のみ）
    const ex = await fetch(`${srv.url}/api/worlds/${w.id}/export`, { headers: { authorization: `Bearer ${a.token}` } })
    assert.equal(ex.status, 200)
    const files = unzipSync(new Uint8Array(await ex.arrayBuffer()))
    assert.ok(files['world.json'] && files['world.js'] && files['assets/thumb.png'])
    assert.equal(JSON.parse(new TextDecoder().decode(files['world.json'])).name, '星空の部屋 v2')
    assert.equal((await api(srv, 'GET', `/api/worlds/${w.id}/export`, { token: other.token })).status, 403)

    // PATCH と検索
    const second = await api(srv, 'POST', '/api/worlds', { token: a.token, raw: buildWorldZip({ name: 'ダンスホール', tags: ['music'] }) })
    const hidden = await api(srv, 'POST', '/api/worlds', { token: a.token, raw: buildWorldZip({ name: '秘密の星', tags: ['night'] }) })
    await api(srv, 'PATCH', `/api/worlds/${hidden.data.id}`, { token: a.token, body: { visibility: 'private' } })
    const patched = await api(srv, 'PATCH', `/api/worlds/${second.data.id}`, { token: a.token, body: { description: '踊れる', tags: ['music', 'dance'] } })
    assert.deepEqual(patched.data.tags, ['music', 'dance'])

    const q = await api(srv, 'GET', `/api/worlds?q=${encodeURIComponent('星')}`, { token: other.token })
    assert.deepEqual(q.data.map((x: { id: string }) => x.id), [w.id])
    const byTag = await api(srv, 'GET', '/api/worlds?tag=dance')
    assert.deepEqual(byTag.data.map((x: { id: string }) => x.id), [second.data.id])
    const newest = await api(srv, 'GET', '/api/worlds?sort=new')
    assert.equal(newest.data[0].id, second.data.id)
    assert.ok(!newest.data.some((x: { id: string }) => x.id === hidden.data.id))
    await api(srv, 'POST', `/api/favorites/world/${w.id}`, { token: other.token })
    const fav = await api(srv, 'GET', '/api/worlds?sort=favorites')
    assert.equal(fav.data[0].id, w.id)
    assert.equal(fav.data[0].favoriteCount, 1)
    assert.equal((await api(srv, 'GET', '/api/worlds?sort=recommended')).data[0].id, w.id)
    const favs = await api(srv, 'GET', '/api/favorites?kind=world', { token: other.token })
    assert.equal(favs.data[0].id, w.id)
    const tags = await api(srv, 'GET', '/api/worlds/tags')
    assert.ok(tags.data.find((t: { tag: string; count: number }) => t.tag === 'night' && t.count === 1))
    // 非公開は他人から見えず、自分からは見える
    assert.equal((await api(srv, 'GET', `/api/worlds/${hidden.data.id}`, { token: other.token })).status, 404)
    assert.equal((await api(srv, 'GET', `/api/worlds/${hidden.data.id}`, { token: a.token })).status, 200)
    assert.equal((await api(srv, 'GET', `/api/worlds?author=${a.me.id}`, { token: a.token })).data.length, 3)
    assert.equal((await api(srv, 'GET', `/api/worlds?author=${a.me.id}`, { token: other.token })).data.length, 2)
    // 削除
    assert.equal((await api(srv, 'DELETE', `/api/worlds/${hidden.data.id}`, { token: other.token })).status, 404)
    assert.equal((await api(srv, 'DELETE', `/api/worlds/${hidden.data.id}`, { token: a.token })).status, 204)
  })

  test('アバターのアップロードと利用条件の読み取り', async () => {
    const a = await guest(srv, 'アバター主')
    const up = await api(srv, 'POST', '/api/avatars?name=%E3%81%A6%E3%81%99%E3%81%A8&isPublic=1&allowCloning=0', { token: a.token, raw: buildVrm('1', 100), type: 'model/gltf-binary' })
    assert.equal(up.status, 200, JSON.stringify(up.data))
    assert.equal(up.data.name, 'てすと')
    assert.equal(up.data.isPublic, true)
    assert.equal(up.data.license.title, 'テストちゃん')
    assert.deepEqual(up.data.license.authors, ['作者'])
    assert.equal(up.data.license.avatarPermission, 'onlyAuthor')
    assert.equal(up.data.license.allowRedistribution, false)
    assert.match(up.data.sha256, /^[0-9a-f]{64}$/)
    const file = await fetch(up.data.fileUrl)
    assert.equal(file.status, 200)
    assert.equal(Number(file.headers.get('content-length')), up.data.fileSize)

    const v0 = await api(srv, 'POST', '/api/avatars', { token: a.token, raw: buildVrm('0') })
    assert.equal(v0.status, 200)
    assert.equal(v0.data.name, 'Old')
    assert.equal(v0.data.license.avatarPermission, 'everyone')
    assert.equal(v0.data.license.commercialUsage, 'personalProfit')
    assert.equal(v0.data.license.modification, 'prohibited')
    assert.equal(v0.data.license.creditNotation, 'required')

    assert.equal((await api(srv, 'POST', '/api/avatars', { token: a.token, raw: new TextEncoder().encode('not a model at all') })).status, 400)
    const plain = buildVrm('1')
    // VRM 拡張のない glTF
    const json = JSON.stringify({ asset: { version: '2.0' } }) + '  '
    const glb = new Uint8Array(20 + json.length)
    const dv = new DataView(glb.buffer)
    dv.setUint32(0, 0x46546c67, true), dv.setUint32(4, 2, true), dv.setUint32(8, glb.length, true), dv.setUint32(12, json.length, true), dv.setUint32(16, 0x4e4f534a, true)
    glb.set(new TextEncoder().encode(json), 20)
    const nv = await api(srv, 'POST', '/api/avatars', { token: a.token, raw: glb })
    assert.equal(nv.status, 400)
    assert.match(nv.data.message, /VRM/)
    assert.ok(plain.length > 0)

    const list = await api(srv, 'GET', '/api/avatars?mine=1', { token: a.token })
    assert.equal(list.data.length, 2)
    const pub = await api(srv, 'GET', '/api/avatars', { token: a.token })
    assert.equal(pub.data.length, 1)
    const patch = await api(srv, 'PATCH', `/api/avatars/${v0.data.id}`, { token: a.token, body: { name: '改名', tags: ['cute'], extensions: { version: 1, outfits: [] } } })
    assert.equal(patch.data.name, '改名')
    assert.deepEqual(patch.data.extensions, { version: 1, outfits: [] })
    const me = await api(srv, 'PATCH', '/api/me', { token: a.token, body: { currentAvatarId: v0.data.id } })
    assert.equal(me.data.currentAvatarId, v0.data.id)
    // 他人の、複製が許されていないアバターは使えない
    const b = await guest(srv, '他人')
    assert.equal((await api(srv, 'PATCH', '/api/me', { token: b.token, body: { currentAvatarId: up.data.id } })).status, 400)
    assert.equal((await api(srv, 'DELETE', `/api/avatars/${up.data.id}`, { token: b.token })).status, 403)
    assert.equal((await api(srv, 'DELETE', `/api/avatars/${up.data.id}`, { token: a.token })).status, 204)
    assert.equal((await fetch(up.data.fileUrl)).status, 404)
  })

  test('アップロードの上限', async () => {
    const small = await startServer({ limits: { avatarBytes: 1024 } })
    try {
      const g = await guest(small, 'x')
      const r = await api(small, 'POST', '/api/avatars', { token: g.token, raw: buildVrm('1', 4096) })
      assert.equal(r.status, 413)
      assert.equal(r.data.error, 'too_large')
    } finally {
      await small.close()
    }
  })

  test('インスタンスの公開範囲（フレンド限定・招待）', async () => {
    const owner = await guest(srv, 'オーナー')
    const friend = await guest(srv, 'フレンド')
    const stranger = await guest(srv, '知らない人')
    await api(srv, 'POST', `/api/friends/${friend.me.id}`, { token: owner.token })
    await api(srv, 'POST', `/api/friends/${owner.me.id}`, { token: friend.token })
    const w = (await api(srv, 'POST', '/api/worlds', { token: owner.token, raw: buildWorldZip({ name: '部屋' }) })).data

    const fr = await api(srv, 'POST', '/api/instances', { token: owner.token, body: { worldId: w.id, access: 'friends', capacity: 8 } })
    assert.equal(fr.status, 200, JSON.stringify(fr.data))
    assert.equal(fr.data.capacity, 8)
    assert.equal(fr.data.canJoin, true)
    const asStranger = await api(srv, 'GET', `/api/instances/${fr.data.id}`, { token: stranger.token })
    assert.equal(asStranger.data.canJoin, false)
    assert.ok(asStranger.data.denyReason)
    assert.equal((await api(srv, 'GET', `/api/instances/${fr.data.id}`, { token: friend.token })).data.canJoin, true)
    // 一覧にも出ない
    const list = await api(srv, 'GET', `/api/instances?worldId=${w.id}`, { token: stranger.token })
    assert.ok(!list.data.some((i: { id: string }) => i.id === fr.data.id))

    const inv = await api(srv, 'POST', '/api/instances', { token: owner.token, body: { worldId: w.id, access: 'invite', name: '内緒の会' } })
    assert.equal(inv.data.name, '内緒の会')
    assert.equal((await api(srv, 'GET', `/api/instances/${inv.data.id}`, { token: friend.token })).data.canJoin, false)
    // 作成者以外は招待できない
    assert.equal((await api(srv, 'POST', '/api/invites', { token: friend.token, body: { userId: stranger.me.id, instanceId: inv.data.id } })).status, 403)
    const sent = await api(srv, 'POST', '/api/invites', { token: owner.token, body: { userId: stranger.me.id, instanceId: inv.data.id, message: 'おいで' } })
    assert.equal(sent.status, 204, JSON.stringify(sent.data))
    const note = (await api(srv, 'GET', '/api/notifications', { token: stranger.token })).data[0]
    assert.equal(note.kind, 'invite')
    assert.equal(note.instanceId, inv.data.id)
    assert.equal(note.message, 'おいで')
    assert.equal((await api(srv, 'GET', `/api/instances/${inv.data.id}`, { token: stranger.token })).data.canJoin, true)

    // 招待を受け付けない設定
    await api(srv, 'PATCH', '/api/me', { token: friend.token, body: { settings: { allowInvites: 'nobody' } } })
    assert.equal((await api(srv, 'POST', '/api/invites', { token: owner.token, body: { userId: friend.me.id, instanceId: inv.data.id } })).status, 403)
    assert.equal((await api(srv, 'POST', '/api/invite-requests', { token: stranger.token, body: { userId: friend.me.id } })).status, 403)
    const rq = await api(srv, 'POST', '/api/invite-requests', { token: stranger.token, body: { userId: owner.me.id } })
    assert.equal(rq.status, 204)
    assert.equal((await api(srv, 'GET', '/api/notifications', { token: owner.token })).data[0].kind, 'request_invite')

    // 作成者がブロックした相手は公開インスタンスにも入れない
    const pub = await api(srv, 'POST', '/api/instances', { token: owner.token, body: { worldId: w.id, access: 'public' } })
    assert.equal((await api(srv, 'GET', `/api/instances/${pub.data.id}`, { token: stranger.token })).data.canJoin, true)
    await api(srv, 'POST', `/api/blocks/${stranger.me.id}`, { token: owner.token })
    assert.equal((await api(srv, 'GET', `/api/instances/${pub.data.id}`, { token: stranger.token })).data.canJoin, false)

    // 入力の検査と削除
    assert.equal((await api(srv, 'POST', '/api/instances', { token: owner.token, body: { worldId: w.id, access: 'secret' } })).status, 400)
    assert.equal((await api(srv, 'POST', '/api/instances', { token: owner.token, body: { worldId: w.id, access: 'public', capacity: 1000 } })).status, 400)
    assert.equal((await api(srv, 'DELETE', `/api/instances/${pub.data.id}`, { token: friend.token })).status, 403)
    assert.equal((await api(srv, 'DELETE', `/api/instances/${pub.data.id}`, { token: owner.token })).status, 204)
    assert.equal((await api(srv, 'GET', `/api/instances/${pub.data.id}`, { token: owner.token })).status, 404)
  })

  test('インスタンス共有ファイル（一覧・ロック・削除）', async () => {
    const owner = await guest(srv, 'ファイル主')
    const other = await guest(srv, 'ほかの人')
    const w = (await api(srv, 'POST', '/api/worlds', { token: owner.token, raw: buildWorldZip() })).data
    const inst = (await api(srv, 'POST', '/api/instances', { token: owner.token, body: { worldId: w.id, access: 'public' } })).data
    const meta = encodeURIComponent(JSON.stringify({ kind: 'photo', page: '1' }))
    const up = await api(srv, 'POST', `/api/instances/${inst.id}/files?name=${encodeURIComponent('写真.png')}&meta=${meta}&description=${encodeURIComponent('集合写真')}`, {
      token: owner.token,
      raw: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]),
      type: 'image/png',
    })
    assert.equal(up.status, 200, JSON.stringify(up.data))
    assert.equal(up.data.fileName, '写真.png')
    assert.equal(up.data.contentType, 'image/png')
    assert.deepEqual(up.data.meta, { kind: 'photo', page: '1' })
    assert.equal(up.data.uploadedBy, owner.me.id)
    const dl = await fetch(up.data.url)
    assert.equal(dl.status, 200)
    assert.equal(dl.headers.get('content-type'), 'image/png')
    assert.equal((await dl.arrayBuffer()).byteLength, 7)

    // HTML は危険なのでバイナリとして配信する
    const html = await api(srv, 'POST', `/api/instances/${inst.id}/files?name=a.html`, { token: owner.token, raw: new TextEncoder().encode('<script>alert(1)</script>'), type: 'text/html' })
    assert.equal(html.data.contentType, 'application/octet-stream')

    // 参加していない人はアップロードできない
    assert.equal((await api(srv, 'POST', `/api/instances/${inst.id}/files?name=x.txt`, { token: other.token, raw: new Uint8Array([1]) })).status, 403)
    // meta の上限
    const many = Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`k${i}`, 'v']))
    assert.equal((await api(srv, 'POST', `/api/instances/${inst.id}/files?name=x.txt&meta=${encodeURIComponent(JSON.stringify(many))}`, { token: owner.token, raw: new Uint8Array([1]) })).status, 400)
    assert.equal((await api(srv, 'POST', `/api/instances/${inst.id}/files?name=x.txt&meta=${encodeURIComponent(JSON.stringify({ a: 1 }))}`, { token: owner.token, raw: new Uint8Array([1]) })).status, 400)

    const list = await api(srv, 'GET', `/api/instances/${inst.id}/files`, { token: other.token })
    assert.equal(list.data.length, 2)

    // ロック
    const lock = await api(srv, 'PATCH', `/api/instances/${inst.id}/files/${up.data.id}`, { token: owner.token, body: { locked: true } })
    assert.equal(lock.data.locked, true)
    assert.equal((await api(srv, 'PATCH', `/api/instances/${inst.id}/files/${up.data.id}`, { token: owner.token, body: { description: '変更' } })).status, 409)
    assert.equal((await api(srv, 'DELETE', `/api/instances/${inst.id}/files/${up.data.id}`, { token: owner.token })).status, 409)
    assert.equal((await api(srv, 'DELETE', `/api/instances/${inst.id}/files/${html.data.id}`, { token: other.token })).status, 403)
    const unlock = await api(srv, 'PATCH', `/api/instances/${inst.id}/files/${up.data.id}`, { token: owner.token, body: { locked: false, fileName: '写真2.png', meta: { kind: 'photo' } } })
    assert.equal(unlock.data.locked, false)
    assert.equal(unlock.data.fileName, '写真2.png')
    assert.deepEqual(unlock.data.meta, { kind: 'photo' })
    assert.equal((await api(srv, 'DELETE', `/api/instances/${inst.id}/files/${up.data.id}`, { token: owner.token })).status, 204)
    assert.equal((await fetch(up.data.url)).status, 404)
    assert.equal((await api(srv, 'GET', `/api/instances/${inst.id}/files`, { token: owner.token })).data.length, 1)
  })

  test('ワールドの永続データ（上限・権限）', async () => {
    const author = await misskeyLogin(srv, 'kvauthor')
    const g = await guest(srv, 'ゲスト')
    const w = (await api(srv, 'POST', '/api/worlds', { token: author.token, raw: buildWorldZip() })).data
    const base = `/api/storage/${w.id}`
    assert.equal((await api(srv, 'PUT', `${base}/shared/score`, { token: author.token, body: { value: { best: 10, by: '誰か' } } })).status, 204)
    assert.deepEqual((await api(srv, 'GET', `${base}/shared/score`, { token: g.token })).data, { value: { best: 10, by: '誰か' } })
    assert.deepEqual((await api(srv, 'GET', `${base}/shared/none`, { token: g.token })).data, { value: null })
    assert.deepEqual((await api(srv, 'POST', `${base}/shared/count/increment`, { token: author.token, body: { delta: 5 } })).data, { value: 5 })
    assert.deepEqual((await api(srv, 'POST', `${base}/shared/count/increment`, { token: author.token, body: { delta: -2 } })).data, { value: 3 })
    assert.equal((await api(srv, 'POST', `${base}/shared/score/increment`, { token: author.token, body: { delta: 1 } })).status, 409)
    const all = await api(srv, 'GET', `${base}/shared`, { token: g.token })
    assert.deepEqual(all.data.map((x: { key: string }) => x.key), ['count', 'score'])

    // ゲストは書けない
    assert.equal((await api(srv, 'PUT', `${base}/shared/x`, { token: g.token, body: { value: 1 } })).status, 403)
    // ワールドにいない人も書けない
    const outsider = await misskeyLogin(srv, 'outsider')
    assert.equal((await api(srv, 'PUT', `${base}/shared/x`, { token: outsider.token, body: { value: 1 } })).status, 403)

    // キーの形と値の大きさ
    assert.equal((await api(srv, 'PUT', `${base}/shared/${encodeURIComponent('bad key!')}`, { token: author.token, body: { value: 1 } })).status, 400)
    assert.equal((await api(srv, 'PUT', `${base}/shared/big`, { token: author.token, body: { value: 'x'.repeat(101 * 1024) } })).status, 400)

    // player は自分の分
    assert.equal((await api(srv, 'PUT', `${base}/player/level`, { token: author.token, body: { value: 3 } })).status, 204)
    assert.deepEqual((await api(srv, 'GET', `${base}/player`, { token: author.token })).data, [{ key: 'level', value: 3 }])
    assert.deepEqual((await api(srv, 'GET', `${base}/player/level?userId=${author.me.id}`, { token: g.token })).data, { value: 3 })

    // キーの数の上限（DB に直接入れて上限の手前まで埋める）
    const db = srv.app.db
    for (let i = 0; i < 254; i++) db.run('INSERT INTO kv (world_id, owner, key, value, size, updated_at) VALUES (?, ?, ?, ?, ?, ?)', w.id, '', `fill${i}`, '1', 6, Date.now())
    assert.equal(db.get<{ n: number }>("SELECT COUNT(*) AS n FROM kv WHERE world_id = ? AND owner = ''", w.id)!.n, 256)
    const over = await api(srv, 'PUT', `${base}/shared/onemore`, { token: author.token, body: { value: 1 } })
    assert.equal(over.status, 409)
    // 既存のキーの上書きはできる
    assert.equal((await api(srv, 'PUT', `${base}/shared/fill0`, { token: author.token, body: { value: 2 } })).status, 204)
    for (let i = 0; i < 63; i++) db.run('INSERT INTO kv (world_id, owner, key, value, size, updated_at) VALUES (?, ?, ?, ?, ?, ?)', w.id, author.me.id, `p${i}`, '1', 3, Date.now())
    assert.equal((await api(srv, 'PUT', `${base}/player/onemore`, { token: author.token, body: { value: 1 } })).status, 409)

    // ワールド全体の容量（10MB）
    db.run('DELETE FROM kv WHERE world_id = ?', w.id)
    db.run('INSERT INTO kv (world_id, owner, key, value, size, updated_at) VALUES (?, ?, ?, ?, ?, ?)', w.id, 'someone', 'huge', '1', 10 * 1024 * 1024 - 10, Date.now())
    const full = await api(srv, 'PUT', `${base}/shared/small`, { token: author.token, body: { value: 'abcdefghij' } })
    assert.equal(full.status, 409)
    assert.match(full.data.message, /容量/)

    // 書き込み回数（1 分に 30 回）
    db.run('DELETE FROM kv WHERE world_id = ?', w.id)
    const rl = await misskeyLogin(srv, 'ratelimit')
    const w2 = (await api(srv, 'POST', '/api/worlds', { token: rl.token, raw: buildWorldZip() })).data
    let last = 0
    for (let i = 0; i < 31; i++) last = (await api(srv, 'PUT', `/api/storage/${w2.id}/shared/k${i}`, { token: rl.token, body: { value: i } })).status
    assert.equal(last, 429)
  })

  test('通報と管理者の対応', async () => {
    const admin = await misskeyLogin(srv, 'admin')
    assert.equal(admin.me.isAdmin, true)
    const bad = await guest(srv, '荒らし')
    const reporter = await guest(srv, '通報者')
    assert.equal((await api(srv, 'POST', '/api/reports', { token: reporter.token, body: { targetType: 'user', targetId: bad.me.id, reason: 'spam', detail: '宣伝ばかり' } })).status, 204)
    assert.equal((await api(srv, 'POST', '/api/reports', { token: reporter.token, body: { targetType: 'user', targetId: 'nobody', reason: 'spam', detail: '' } })).status, 404)
    assert.equal((await api(srv, 'POST', '/api/reports', { token: reporter.token, body: { targetType: 'user', targetId: bad.me.id, reason: 'mean' } })).status, 400)
    assert.equal((await api(srv, 'GET', '/api/admin/reports', { token: reporter.token })).status, 403)
    const list = await api(srv, 'GET', '/api/admin/reports', { token: admin.token })
    assert.equal(list.status, 200)
    const rep = list.data.find((r: { targetId: string }) => r.targetId === bad.me.id)
    assert.equal(rep.reason, 'spam')
    assert.equal((await api(srv, 'POST', `/api/admin/reports/${rep.id}/resolve`, { token: admin.token, body: { action: 'ban' } })).status, 204)
    // 停止された人のトークンは使えない
    assert.equal((await api(srv, 'GET', '/api/me', { token: bad.token })).status, 401)
    assert.equal((await api(srv, 'GET', `/api/users/${bad.me.id}`, { token: reporter.token })).status, 404)
  })

  test('空のインスタンスの後片付け（persistent は 24 時間残る）', async () => {
    const a = await misskeyLogin(srv, 'sweeper')
    const w = (await api(srv, 'POST', '/api/worlds', { token: a.token, raw: buildWorldZip() })).data
    const tmp = (await api(srv, 'POST', '/api/instances', { token: a.token, body: { worldId: w.id, access: 'public' } })).data
    const keep = (await api(srv, 'POST', '/api/instances', { token: a.token, body: { worldId: w.id, access: 'public', persistent: true } })).data
    assert.equal(keep.persistent, true)
    const mgr = srv.app.instances
    mgr.sweep(Date.now() + 4 * 60_000)
    assert.ok(mgr.get(tmp.id))
    mgr.sweep(Date.now() + 6 * 60_000)
    assert.equal(mgr.get(tmp.id), undefined)
    assert.ok(mgr.get(keep.id))
    mgr.sweep(Date.now() + 25 * 60 * 60_000)
    assert.equal(mgr.get(keep.id), undefined)
    // ゲストは persistent を作れない
    const g = await guest(srv, 'ゲスト')
    assert.equal((await api(srv, 'POST', '/api/instances', { token: g.token, body: { worldId: w.id, access: 'public', persistent: true } })).status, 403)
  })

  test('ログインの回数制限（IP ごと）', async () => {
    const s = await startServer({ rateLimits: { authPerMinute: 3 } })
    try {
      const codes = []
      for (let i = 0; i < 5; i++) codes.push((await api(s, 'POST', '/api/auth/guest', { body: { displayName: `n${i}` } })).status)
      assert.deepEqual(codes, [200, 200, 200, 429, 429])
    } finally {
      await s.close()
    }
  })

  test('知らない API・メソッド・壊れた JSON', async () => {
    const g = await guest(srv, 'てすと')
    assert.equal((await api(srv, 'GET', '/api/nothing')).status, 404)
    assert.equal((await api(srv, 'DELETE', '/api/info')).status, 405)
    const r = await fetch(srv.url + '/api/me', { method: 'PATCH', headers: { authorization: `Bearer ${g.token}`, 'content-type': 'application/json' }, body: '{oops' })
    assert.equal(r.status, 400)
    const body = await r.json()
    assert.equal(body.error, 'bad_request')
    assert.ok(body.message)
    const pre = await fetch(srv.url + '/api/me', { method: 'OPTIONS', headers: { origin: 'https://client.example', 'access-control-request-method': 'PATCH' } })
    assert.equal(pre.status, 204)
    assert.match(pre.headers.get('access-control-allow-headers')!, /authorization/)
  })
})
