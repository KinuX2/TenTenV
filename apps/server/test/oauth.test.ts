// X のログイン（OAuth 2.0 + PKCE）。X の API は fetch を差し替えて代わりに答える
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { after, before, describe, test } from 'node:test'
import { loadConfig } from '../src/config'
import { api, startServer, type TestServer } from './helpers'

interface Seen {
  url: string
  headers: Record<string, string>
  body: string
}

/** トークンの取得とプロフィールの読み取りに答える。code ごとに返す人を決める */
const stubProviders = (srv: TestServer, users: Map<string, { id: string; name: string }>, seen: Seen[]) => {
  srv.app.fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    const headers = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]))
    const body = typeof init?.body === 'string' ? init.body : ''
    seen.push({ url, headers, body })
    if (url === 'https://api.x.com/2/oauth2/token') {
      const code = new URLSearchParams(body).get('code') ?? ''
      if (!users.has(code)) return Response.json({ error: 'invalid_grant' }, { status: 400 })
      return Response.json({ access_token: `secret-access-${code}`, token_type: 'bearer' })
    }
    const code = (headers.authorization ?? '').replace(/^Bearer secret-access-/, '')
    const u = users.get(code)
    if (!u) return new Response('unauthorized', { status: 401 })
    if (url === 'https://api.x.com/2/users/me?user.fields=profile_image_url')
      return Response.json({ data: { id: u.id, name: u.name, username: 'xuser', profile_image_url: `https://pbs.twimg.com/profile_images/${u.id}_normal.jpg` } })
    return new Response('not found', { status: 404 })
  }) as typeof fetch
}

const callback = (srv: TestServer, provider: string, q: Record<string, string>) => fetch(`${srv.url}/api/auth/${provider}/callback?${new URLSearchParams(q)}`, { redirect: 'manual' })

describe('X ログイン', () => {
  let srv: TestServer
  const users = new Map<string, { id: string; name: string }>()
  const seen: Seen[] = []
  before(async () => {
    srv = await startServer({
      publicUrl: 'https://vr.example.com',
      x: { clientId: 'x-client', clientSecret: 'x-secret' },
    })
    stubProviders(srv, users, seen)
  })
  after(() => srv.close())

  test('使えるかどうかは /api/info に出し、秘密の値は出さない', async () => {
    const r = await api(srv, 'GET', '/api/info')
    assert.equal(r.data.auth.google, undefined)
    assert.equal(r.data.auth.x, true)
    assert.ok(!JSON.stringify(r.data).includes('secret'))
    // 設定していないサーバーでは使えない
    const plain = await startServer()
    try {
      const i = await api(plain, 'GET', '/api/info')
      assert.equal(i.data.auth.x, false)
      assert.equal((await api(plain, 'POST', '/api/auth/x/start', { body: {} })).status, 403)
    } finally {
      await plain.close()
    }
    // Google ログインはない
    assert.equal((await api(srv, 'POST', '/api/auth/google/start', { body: {} })).status, 404)
    assert.equal((await api(srv, 'POST', '/api/auth/facebook/start', { body: {} })).status, 404)
  })

  test('X: 許可の画面へ行き、戻ってきたらクライアントへ転送してログインする', async () => {
    const s = await api(srv, 'POST', '/api/auth/x/start', { body: { callback: 'https://client.example/cb?x=1' } })
    assert.equal(s.status, 200, JSON.stringify(s.data))
    const u = new URL(s.data.url)
    assert.equal(u.origin + u.pathname, 'https://x.com/i/oauth2/authorize')
    assert.equal(u.searchParams.get('client_id'), 'x-client')
    assert.equal(u.searchParams.get('redirect_uri'), 'https://vr.example.com/api/auth/x/callback')
    assert.equal(u.searchParams.get('state'), s.data.session)
    assert.equal(u.searchParams.get('code_challenge_method'), 'S256')
    assert.ok(!s.data.url.includes('x-secret'))
    // 戻ってくる前の finish は、戻り先のある流れでは失敗にする（待たない）
    const back = await callback(srv, 'x', { code: 'r1', state: s.data.session })
    assert.equal(back.status, 302)
    const loc = new URL(back.headers.get('location')!)
    assert.equal(loc.origin + loc.pathname, 'https://client.example/cb')
    assert.equal(loc.searchParams.get('x'), '1')
    assert.equal(loc.searchParams.get('session'), s.data.session)
    // 同じ state でもう一度は受け付けない
    assert.equal((await callback(srv, 'x', { code: 'r1', state: s.data.session })).status, 400)

    users.set('r1', { id: '1234567890', name: 'エックス 太郎' })
    const f = await api(srv, 'POST', '/api/auth/x/finish', { body: { session: s.data.session } })
    assert.equal(f.status, 200, JSON.stringify(f.data))
    assert.equal(f.data.me.handle, 'x:1234567890')
    assert.equal(f.data.me.displayName, 'エックス 太郎')
    assert.equal(f.data.me.iconUrl, 'https://pbs.twimg.com/profile_images/1234567890_400x400.jpg')
    assert.equal((await api(srv, 'GET', '/api/me', { token: f.data.token })).data.id, f.data.me.id)
    // PKCE の verifier は challenge と合う
    const tok = seen.find((x) => x.url === 'https://api.x.com/2/oauth2/token')!
    const form = new URLSearchParams(tok.body)
    assert.equal(form.get('redirect_uri'), 'https://vr.example.com/api/auth/x/callback')
    assert.equal(createHash('sha256').update(form.get('code_verifier')!).digest('base64url'), u.searchParams.get('code_challenge'))
    // session は 1 回だけ
    assert.equal((await api(srv, 'POST', '/api/auth/x/finish', { body: { session: s.data.session } })).status, 400)
    // 同じ人は同じ利用者
    const s2 = await api(srv, 'POST', '/api/auth/x/start', { body: { callback: 'https://client.example/cb' } })
    users.set('r2', { id: '1234567890', name: '別の名前' })
    await callback(srv, 'x', { code: 'r2', state: s2.data.session })
    const f2 = await api(srv, 'POST', '/api/auth/x/finish', { body: { session: s2.data.session } })
    assert.equal(f2.data.me.id, f.data.me.id)
    // トークンは保存していない
    assert.ok(!JSON.stringify(srv.app.db.all('SELECT * FROM users')).includes('secret-access'))
    assert.ok(!JSON.stringify(srv.app.db.all('SELECT * FROM sessions')).includes('secret-access'))
  })

  test('X: 戻り先なし（デスクトップ版）は、許可されるまで finish が待つように返す', async () => {
    const s = await api(srv, 'POST', '/api/auth/x/start', { body: {} })
    assert.equal(s.status, 200)
    const u = new URL(s.data.url)
    assert.equal(u.origin + u.pathname, 'https://x.com/i/oauth2/authorize')
    assert.equal(u.searchParams.get('scope'), 'users.read tweet.read')
    assert.equal(u.searchParams.get('redirect_uri'), 'https://vr.example.com/api/auth/x/callback')
    const wait = await api(srv, 'POST', '/api/auth/x/finish', { body: { session: s.data.session } })
    assert.equal(wait.status, 202)
    assert.deepEqual(wait.data, { pending: true })

    const back = await callback(srv, 'x', { code: 'x1', state: s.data.session })
    assert.equal(back.status, 200)
    assert.match(back.headers.get('content-type')!, /text\/html/)
    assert.match(await back.text(), /TenTenV に戻ってください/)
    users.set('x1', { id: '987654321', name: 'エックス' })
    const f = await api(srv, 'POST', '/api/auth/x/finish', { body: { session: s.data.session } })
    assert.equal(f.status, 200, JSON.stringify(f.data))
    assert.equal(f.data.me.handle, 'x:987654321')
    assert.equal(f.data.me.iconUrl, 'https://pbs.twimg.com/profile_images/987654321_400x400.jpg')
    // X は秘密を Basic 認証で送る
    const tok = seen.filter((x) => x.url === 'https://api.x.com/2/oauth2/token').at(-1)!
    assert.equal(tok.headers.authorization, `Basic ${Buffer.from('x-client:x-secret').toString('base64')}`)
    assert.equal(new URLSearchParams(tok.body).get('client_secret'), null)
  })

  test('取り消し・おかしな値・失敗', async () => {
    // 許可の画面で取り消した
    const s = await api(srv, 'POST', '/api/auth/x/start', { body: {} })
    const back = await callback(srv, 'x', { error: 'access_denied', state: s.data.session })
    assert.equal(back.status, 200)
    assert.match(await back.text(), /取り消しました/)
    assert.equal((await api(srv, 'POST', '/api/auth/x/finish', { body: { session: s.data.session } })).status, 400)
    // 知らない state
    assert.equal((await callback(srv, 'x', { code: 'c', state: '00000000-0000-0000-0000-000000000000' })).status, 400)
    assert.equal((await callback(srv, 'x', { code: 'c', state: '<script>' })).status, 400)
    assert.equal((await api(srv, 'POST', '/api/auth/x/finish', { body: { session: 'nope' } })).status, 400)
    // 戻り先の検査は Misskey と同じ
    for (const cb of ['javascript:alert(1)', 'app://evil/', 'file:///C:/x'])
      assert.equal((await api(srv, 'POST', '/api/auth/x/start', { body: { callback: cb } })).status, 400, cb)
    assert.equal((await api(srv, 'POST', '/api/auth/x/start', { body: { callback: 'app://tentenv/' } })).status, 200)
    // X が認可コードを受け付けない
    const bad = await api(srv, 'POST', '/api/auth/x/start', { body: {} })
    await callback(srv, 'x', { code: 'unknown-code', state: bad.data.session })
    assert.equal((await api(srv, 'POST', '/api/auth/x/finish', { body: { session: bad.data.session } })).status, 403)
  })
})

test('X の秘密の値は環境変数でも渡せる', () => {
  const cfg = loadConfig({ TTV_CONFIG: 'nonexistent.json', TTV_X_CLIENT_ID: ' xid ', TTV_X_CLIENT_SECRET: 'xs' })
  assert.deepEqual(cfg.x, { clientId: 'xid', clientSecret: 'xs' })
  assert.deepEqual(loadConfig({ TTV_CONFIG: 'nonexistent.json' }).x, { clientId: null, clientSecret: null })
})
