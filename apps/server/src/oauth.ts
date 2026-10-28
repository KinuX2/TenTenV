// Google・X の OAuth 2.0（認可コード + PKCE）によるログイン。パスワードは受け取らず、
// 要求するのはプロフィールを読む権限だけ。アクセストークンはプロフィールを読んだらすぐ捨てる（保存しない）
//
// 1. start: Google・X の許可の画面の URL を返す。戻り先は親サーバーの /api/auth/:provider/callback
// 2. callback: 許可の画面から戻ってきた認可コードを預かり、クライアントの画面（callback）へ戻す。
//    callback を指定しなかったとき（デスクトップ版は既定のブラウザーで開く）は「アプリに戻ってください」と出す
// 3. finish: 認可コードをトークンに替えてプロフィールを読み、ログインさせる。まだ戻っていなければ待つように返す
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import type { App } from './app'
import { createUser } from './auth'
import type { OAuthClient } from './config'
import { badRequest, forbidden, HttpError, notFound, Reply } from './http'
import { checkCallback } from './misskey'
import { getUser, type UserRow } from './views'

export type OAuthProviderName = 'google' | 'x'

interface Profile {
  /** 変わらない ID（ハンドルに使う） */
  id: string
  name: string
  icon: string | null
}

interface Provider {
  label: string
  authorizeUrl: string
  tokenUrl: string
  scope: string
  /** 許可の画面の URL に足すもの */
  extra?: Record<string, string>
  /** トークンの取得でクライアントの秘密を Basic 認証で送るか（X）、本文に入れるか（Google） */
  basicAuth: boolean
  profile: (token: string, get: (url: string, token: string) => Promise<unknown>) => Promise<Profile | null>
}

const str = (v: unknown, max: number) => (typeof v === 'string' && v.length <= max ? v : null)
const httpsUrl = (v: unknown) => {
  const s = str(v, 1000)
  return s && /^https:\/\//.test(s) ? s : null
}

export const PROVIDERS: Record<OAuthProviderName, Provider> = {
  google: {
    label: 'Google',
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scope: 'openid profile',
    extra: { prompt: 'select_account' },
    basicAuth: false,
    profile: async (token, get) => {
      const u = (await get('https://openidconnect.googleapis.com/v1/userinfo', token)) as { sub?: unknown; name?: unknown; picture?: unknown }
      const id = str(u?.sub, 255)
      if (!id || !/^[0-9A-Za-z_-]+$/.test(id)) return null
      return { id, name: str(u.name, 500)?.trim() || 'Google user', icon: httpsUrl(u.picture) }
    },
  },
  x: {
    label: 'X',
    authorizeUrl: 'https://x.com/i/oauth2/authorize',
    tokenUrl: 'https://api.x.com/2/oauth2/token',
    // users.read だけでは /2/users/me を読めないので tweet.read も要る（投稿はできない権限）
    scope: 'users.read tweet.read',
    basicAuth: true,
    profile: async (token, get) => {
      const r = (await get('https://api.x.com/2/users/me?user.fields=profile_image_url', token)) as { data?: { id?: unknown; name?: unknown; username?: unknown; profile_image_url?: unknown } }
      const u = r?.data
      const id = str(u?.id, 64)
      if (!u || !id || !/^\d+$/.test(id)) return null
      // 既定のアイコンは 48px なので大きいものにする
      const icon = httpsUrl(u.profile_image_url)?.replace(/_normal(\.\w+)$/, '_400x400$1') ?? null
      return { id, name: str(u.name, 500)?.trim() || str(u.username, 64) || 'X user', icon }
    },
  },
}

const SESSION_TTL = 15 * 60_000
const SESSION_RE = /^[0-9a-f-]{36}$/i

const clientOf = (app: App, p: OAuthProviderName): OAuthClient => app.config[p]
export const oauthEnabled = (app: App, p: OAuthProviderName) => {
  const c = clientOf(app, p)
  return !!(c.clientId && c.clientSecret)
}

export const providerOf = (name: string): OAuthProviderName => {
  if (name !== 'google' && name !== 'x') throw notFound('このログイン方法はありません')
  return name
}

const redirectUri = (app: App, p: OAuthProviderName) => `${app.publicUrl}/api/auth/${p}/callback`
const challengeOf = (verifier: string) => createHash('sha256').update(verifier).digest('base64url')

interface SessionRow {
  provider: string
  verifier: string
  callback: string | null
  code: string | null
  created_at: number
}

export const startOAuth = (app: App, p: OAuthProviderName, callback: unknown) => {
  const prov = PROVIDERS[p]
  if (!oauthEnabled(app, p)) throw forbidden(`このサーバーでは ${prov.label} ログインを使えません`)
  // callback なし: 既定のブラウザーで許可してもらい、クライアントは finish を繰り返して待つ
  const cb = callback === undefined || callback === null ? null : checkCallback(callback).toString()
  const session = randomUUID()
  const verifier = randomBytes(32).toString('base64url')
  const now = Date.now()
  app.db.run('DELETE FROM oauth_sessions WHERE created_at < ?', now - SESSION_TTL)
  app.db.run('INSERT INTO oauth_sessions (session, provider, verifier, callback, code, created_at) VALUES (?, ?, ?, ?, NULL, ?)', session, p, verifier, cb, now)
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: clientOf(app, p).clientId!,
    redirect_uri: redirectUri(app, p),
    scope: prov.scope,
    state: session,
    code_challenge: challengeOf(verifier),
    code_challenge_method: 'S256',
    ...prov.extra,
  })
  return { url: `${prov.authorizeUrl}?${q}`, session }
}

const page = (status: number, title: string, text: string) => {
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
  const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>body{font-family:system-ui,sans-serif;background:#0d0f17;color:#e8eaf2;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px;text-align:center}</style></head><body><div><h1 style="font-size:1.3rem">${esc(title)}</h1><p>${esc(text)}</p></div></body></html>`
  return new Reply(status, null, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' }, Buffer.from(html))
}

/** 許可の画面から戻ってきたところ（GET /api/auth/:provider/callback?code=&state=） */
export const oauthCallback = (app: App, p: OAuthProviderName, query: URLSearchParams) => {
  const session = query.get('state') ?? ''
  const row = SESSION_RE.test(session) ? app.db.get<SessionRow>('SELECT * FROM oauth_sessions WHERE session = ? AND provider = ?', session, p) : undefined
  if (!row || Date.now() - row.created_at > SESSION_TTL || row.code) return page(400, 'ログインできませんでした', 'ログインの有効期限が切れました。TenTenV に戻って、もう一度やり直してください。')
  const code = query.get('code')
  if (!code || code.length > 2048 || query.get('error')) {
    // 許可されなかった（取り消した）
    app.db.run('DELETE FROM oauth_sessions WHERE session = ?', session)
  } else app.db.run('UPDATE oauth_sessions SET code = ? WHERE session = ?', code, session)
  if (row.callback) {
    const back = new URL(row.callback)
    back.searchParams.set('session', session)
    return new Reply(302, null, { location: back.toString(), 'cache-control': 'no-store' }, new Uint8Array())
  }
  return code && !query.get('error')
    ? page(200, 'ログインを受け付けました', 'TenTenV に戻ってください。このページは閉じてかまいません。')
    : page(200, 'ログインを取り消しました', 'TenTenV に戻ってください。このページは閉じてかまいません。')
}

/** ログインの仕上げ。まだ許可の画面から戻っていなければ null（クライアントは少し待ってやり直す） */
export const finishOAuth = async (app: App, p: OAuthProviderName, sessionIn: unknown, fetchImpl: typeof fetch = fetch): Promise<UserRow | null> => {
  if (typeof sessionIn !== 'string' || !SESSION_RE.test(sessionIn)) throw badRequest('session が正しくありません')
  const row = app.db.get<SessionRow>('SELECT * FROM oauth_sessions WHERE session = ? AND provider = ?', sessionIn, p)
  const expired = !row || Date.now() - row.created_at > SESSION_TTL
  if (!expired && !row.code && !row.callback) return null
  // 同じ session は 1 回しか使わせない
  app.db.run('DELETE FROM oauth_sessions WHERE session = ?', sessionIn)
  if (expired || !row.code) throw badRequest('ログインが取り消されたか、有効期限が切れました。もう一度やり直してください')
  const prov = PROVIDERS[p]
  const client = clientOf(app, p)
  if (!client.clientId || !client.clientSecret) throw forbidden(`このサーバーでは ${prov.label} ログインを使えません`)
  const fail = () => new HttpError(502, 'oauth_error', `${prov.label} に接続できませんでした`)
  const readJson = async (res: Response) => {
    const text = await res.text()
    if (text.length > 1_000_000) throw new Error('too large')
    return JSON.parse(text) as unknown
  }

  let token: string
  try {
    const form = new URLSearchParams({ grant_type: 'authorization_code', code: row.code, redirect_uri: redirectUri(app, p), code_verifier: row.verifier, client_id: client.clientId })
    const headers: Record<string, string> = { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }
    if (prov.basicAuth) headers.authorization = `Basic ${Buffer.from(`${encodeURIComponent(client.clientId)}:${encodeURIComponent(client.clientSecret)}`).toString('base64')}`
    else form.set('client_secret', client.clientSecret)
    const res = await fetchImpl(prov.tokenUrl, { method: 'POST', headers, body: form.toString(), signal: AbortSignal.timeout(10_000), redirect: 'error' })
    if (res.status === 400 || res.status === 401) throw forbidden(`${prov.label} での許可が確認できませんでした`)
    if (!res.ok) throw new Error(String(res.status))
    const t = str(((await readJson(res)) as { access_token?: unknown })?.access_token, 4096)
    if (!t) throw new Error('no token')
    token = t
  } catch (e) {
    throw e instanceof HttpError ? e : fail()
  }

  let profile: Profile | null
  try {
    profile = await prov.profile(token, async (url, bearer) => {
      const res = await fetchImpl(url, { headers: { authorization: `Bearer ${bearer}`, accept: 'application/json' }, signal: AbortSignal.timeout(10_000), redirect: 'error' })
      if (!res.ok) throw new Error(String(res.status))
      return readJson(res)
    })
  } catch {
    throw fail()
  }
  // トークンは保存しない（ここで使い終わり）
  if (!profile) throw forbidden(`${prov.label} での許可が確認できませんでした`)
  const handle = `${p}:${profile.id}`
  const existing = app.db.get<UserRow>('SELECT * FROM users WHERE handle = ?', handle)
  if (existing) {
    // 自分でアイコンを上げていなければ、Google・X のアイコンに合わせる
    if (!existing.icon_url?.startsWith('/files/')) app.db.run('UPDATE users SET icon_url = ? WHERE id = ?', profile.icon, existing.id)
    return getUser(app, existing.id)!
  }
  return createUser(app, { handle, displayName: [...profile.name.replace(/[ --]/g, '')].slice(0, 32).join('').trim() || prov.label, iconUrl: profile.icon, isGuest: false })
}
