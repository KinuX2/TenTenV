// Google・X のログイン（OAuth 2.0 + PKCE）。Google・X の API は fetch を差し替えて代わりに答える
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
    if (url === 'https://oauth2.googleapis.com/token' || url === 'https://api.x.com/2/oauth2/token') {
      const code = new URLSearchParams(body).get('code') ?? ''
      if (!users.has(code)) return Response.json({ error: 'invalid_grant' }, { status: 400 })
      return Response.json({ access_token: `secret-access-${code}`, token_type: 'bearer' })
    }
    const code = (headers.authorization ?? '').replace(/^Bearer secret-access-/, '')
    const u = users.get(code)
    if (!u) return new Response('unauthorized', { status: 401 })
    if (url === 'https://openidconnect.googleapis.com/v1/userinfo') return Response.json({ sub: u.id, name: u.name, picture: `https://lh3.example/${u.id}.png` })
    if (url === 'https://api.x.com/2/users/me?user.fields=profile_image_url')
      return Response.json({ data: { id: u.id, name: u.name, username: 'xuser', profile_image_url: `https://pbs.twimg.com/profile_images/${u.id}_normal.jpg` } })
    return new Response('not found', { status: 404 })
  }) as typeof fetch
}

const callback = (srv: TestServer, provider: string, q: Record<string, string>) => fetch(`${srv.url}/api/auth/${provider}/callback?${new URLSearchParams(q)}`, { redirect: 'manual' })

describe('Google・X ログイン', () => {
  let srv: TestServer
  const users = new Map<string, { id: string; name: string }>()
  const seen: Seen[] = []
  before(async () => {
    srv = await startServer({
      publicUrl: 'https://vr.example.com',
      google: { clientId: 'g-client', clientSecret: 'g-secret' },
      x: { clientId: 'x-client', clientSecret: 'x-secret' },
    })
    stubProviders(srv, users, seen)
  })
  after(() => srv.close())

  test('使えるかどうかは /api/info に出し、秘密の値は出さない', async () => {
    const r = await api(srv, 'GET', '/api/info')
    assert.equal(r.data.auth.google, true)
    assert.equal(r.data.auth.x, true)
    assert.ok(!JSON.stringify(r.data).includes('secret'))
    // 設定していないサーバーでは使えない
    const plain = await startServer()
    try {
      const i = await api(plain, 'GET', '/api/info')
      assert.equal(i.data.auth.google, false)
      assert.equal(i.data.auth.x, false)
      assert.equal((await api(plain, 'POST', '/api/auth/google/start', { body: { callback: 'https://c/' } })).status, 403)
      assert.equal((await api(plain, 'POST', '/api/auth/x/start', { body: {} })).status, 403)
    } finally {
      await plain.close()
    }
    assert.equal((await api(srv, 'POST', '/api/auth/facebook/start', { body: {} })).status, 404)
  })

  test('Google: 許可の画面へ行き、戻ってきたらクライアントへ転送してログインする', async () => {
    const s = await api(srv, 'POST', '/api/auth/google/start', { body: { callback: 'https://client.example/cb?x=1' } })
    assert.equal(s.status, 200, JSON.stringify(s.data))
    const u = new URL(s.data.url)
    assert.equal(u.origin + u.pathname, 'https://accounts.google.com/o/oauth2/v2/auth')
    assert.equal(u.searchParams.get('client_id'), 'g-client')
    assert.equal(u.searchParams.get('redirect_uri'), 'https://vr.example.com/api/auth/google/callback')
    assert.equal(u.searchParams.get('scope'), 'openid profile')
    assert.equal(u.searchParams.get('state'), s.data.session)
    assert.equal(u.searchParams.get('code_challenge_method'), 'S256')
    assert.ok(!s.data.url.includes('g-secret'))
    // 戻ってくる前の finish は、戻り先のある流れでは失敗にする（待たない）
    const back = await callback(srv, 'google', { code: 'g1', state: s.data.session })
    assert.equal(back.status, 302)
    const loc = new URL(back.headers.get('location')!)
    assert.equal(loc.origin + loc.pathname, 'https://client.example/cb')
    assert.equal(loc.searchParams.get('x'), '1')
    assert.equal(loc.searchParams.get('session'), s.data.session)
    // 同じ state でもう一度は受け付けない
    assert.equal((await callback(srv, 'google', { code: 'g1', state: s.data.session })).status, 400)

    users.set('g1', { id: '1234567890', name: 'グーグル 太郎' })
    const f = await api(srv, 'POST', '/api/auth/google/finish', { body: { session: s.data.session } })
    assert.equal(f.status, 200, JSON.stringify(f.data))
    assert.equal(f.data.me.handle, 'google:1234567890')
    assert.equal(f.data.me.displayName, 'グーグル 太郎')
    assert.equal(f.data.me.iconUrl, 'https://lh3.example/1234567890.png')
    assert.equal((await api(srv, 'GET', '/api/me', { token: f.data.token })).data.id, f.data.me.id)
    // 秘密は本文で送り、PKCE の verifier は challenge と合う
    const tok = seen.find((x) => x.url === 'https://oauth2.googleapis.com/token')!
    const form = new URLSearchParams(tok.body)
    assert.equal(form.get('client_secret'), 'g-secret')
    assert.equal(form.get('redirect_uri'), 'https://vr.example.com/api/auth/google/callback')
    assert.equal(createHash('sha256').update(form.get('code_verifier')!).digest('base64url'), u.searchParams.get('code_challenge'))
    // session は 1 回だけ
    assert.equal((await api(srv, 'POST', '/api/auth/google/finish', { body: { session: s.data.session } })).status, 400)
    // 同じ人は同じ利用者
    const s2 = await api(srv, 'POST', '/api/auth/google/start', { body: { callback: 'https://client.example/cb' } })
    users.set('g2', { id: '1234567890', name: '別の名前' })
    await callback(srv, 'google', { code: 'g2', state: s2.data.session })
    const f2 = await api(srv, 'POST', '/api/auth/google/finish', { body: { session: s2.data.session } })
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
    // 別の方法の callback には使えない
    assert.equal((await callback(srv, 'google', { code: 'x1', state: s.data.session })).status, 400)

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
    const tok = seen.find((x) => x.url === 'https://api.x.com/2/oauth2/token')!
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
      assert.equal((await api(srv, 'POST', '/api/auth/google/start', { body: { callback: cb } })).status, 400, cb)
    assert.equal((await api(srv, 'POST', '/api/auth/google/start', { body: { callback: 'app://tentenv/' } })).status, 200)
    // Google・X が認可コードを受け付けない
    const bad = await api(srv, 'POST', '/api/auth/google/start', { body: {} })
    await callback(srv, 'google', { code: 'unknown-code', state: bad.data.session })
    assert.equal((await api(srv, 'POST', '/api/auth/google/finish', { body: { session: bad.data.session } })).status, 403)
  })
})

test('Google・X の秘密の値は環境変数でも渡せる', () => {
  const cfg = loadConfig({ TTV_CONFIG: 'nonexistent.json', TTV_GOOGLE_CLIENT_ID: ' gid ', TTV_GOOGLE_CLIENT_SECRET: 'gs', TTV_X_CLIENT_ID: 'xid', TTV_X_CLIENT_SECRET: 'xs' })
  assert.deepEqual(cfg.google, { clientId: 'gid', clientSecret: 'gs' })
  assert.deepEqual(cfg.x, { clientId: 'xid', clientSecret: 'xs' })
  assert.deepEqual(loadConfig({ TTV_CONFIG: 'nonexistent.json' }).x, { clientId: null, clientSecret: null })
})
