// Misskey の MiAuth によるログイン。パスワードは受け取らず、要求する権限は read:account だけ。
// 受け取ったアクセストークンはプロフィールを読んだらすぐ捨てる（保存しない）
import { randomUUID } from 'node:crypto'
import type { App } from './app'
import { createUser } from './auth'
import { badRequest, forbidden, HttpError } from './http'
import { getUser, type UserRow } from './views'

/** ホスト名（ポート付き可）。IP アドレスや localhost は受け付けない */
const HOST_RE = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}(:\d{1,5})?$/
const SESSION_TTL = 15 * 60_000

export const normalizeHost = (host: unknown): string => {
  if (typeof host !== 'string') throw badRequest('Misskey のサーバーを指定してください')
  const h = host.trim().toLowerCase().replace(/^https:\/\//, '').replace(/\/+$/, '')
  if (!HOST_RE.test(h)) throw badRequest('Misskey のサーバー名の形式が正しくありません（例: misskey.io）')
  return h
}

export const checkHostAllowed = (app: App, host: string) => {
  const m = app.config.misskey
  if (!m.enabled) throw forbidden('このサーバーでは Misskey ログインを使えません')
  if (m.allowedHosts && !m.allowedHosts.includes(host)) throw forbidden(`このサーバーでは ${host} のアカウントでログインできません`)
}

export const startMiAuth = (app: App, hostIn: unknown, callback: unknown) => {
  const host = normalizeHost(hostIn)
  checkHostAllowed(app, host)
  if (typeof callback !== 'string' || callback.length > 1000) throw badRequest('callback を指定してください')
  let cb: URL
  try {
    cb = new URL(callback)
  } catch {
    throw badRequest('callback の URL が正しくありません')
  }
  if (cb.protocol !== 'https:' && cb.protocol !== 'http:') throw badRequest('callback は http(s) の URL にしてください')
  const session = randomUUID()
  const now = Date.now()
  app.db.run('DELETE FROM miauth_sessions WHERE created_at < ?', now - SESSION_TTL)
  app.db.run('INSERT INTO miauth_sessions (session, host, created_at) VALUES (?, ?, ?)', session, host, now)
  const q = new URLSearchParams({ name: 'TenTenV', callback: cb.toString(), permission: 'read:account' })
  return { url: `https://${host}/miauth/${session}?${q}`, session }
}

interface MiAuthCheck {
  ok?: boolean
  token?: string
  user?: { id?: string; username?: string; name?: string | null; avatarUrl?: string | null; host?: string | null }
}

export const finishMiAuth = async (app: App, sessionIn: unknown, fetchImpl: typeof fetch = fetch): Promise<UserRow> => {
  if (typeof sessionIn !== 'string' || !/^[0-9a-f-]{36}$/i.test(sessionIn)) throw badRequest('session が正しくありません')
  const row = app.db.get<{ host: string; created_at: number }>('SELECT host, created_at FROM miauth_sessions WHERE session = ?', sessionIn)
  // 同じ session は 1 回しか使わせない
  app.db.run('DELETE FROM miauth_sessions WHERE session = ?', sessionIn)
  if (!row || Date.now() - row.created_at > SESSION_TTL) throw badRequest('ログインの有効期限が切れました。もう一度やり直してください')
  checkHostAllowed(app, row.host)
  let data: MiAuthCheck
  try {
    const res = await fetchImpl(`https://${row.host}/api/miauth/${sessionIn}/check`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(10_000),
      redirect: 'error',
    })
    if (!res.ok) throw new Error(String(res.status))
    const text = await res.text()
    if (text.length > 1_000_000) throw new Error('too large')
    data = JSON.parse(text) as MiAuthCheck
  } catch {
    throw new HttpError(502, 'misskey_error', `${row.host} に接続できませんでした`)
  }
  // トークンはここで捨てる（プロフィールは check の応答に含まれている）
  delete data.token
  const u = data.user
  if (!data.ok || !u || typeof u.username !== 'string' || !/^[A-Za-z0-9_]{1,128}$/.test(u.username)) throw forbidden('Misskey での許可が確認できませんでした')
  const handle = `@${u.username}@${row.host}`
  const name = (typeof u.name === 'string' && u.name.trim() ? u.name.trim() : u.username).slice(0, 32)
  const icon = typeof u.avatarUrl === 'string' && /^https:\/\//.test(u.avatarUrl) && u.avatarUrl.length <= 1000 ? u.avatarUrl : null
  const existing = app.db.get<UserRow>('SELECT * FROM users WHERE handle = ?', handle)
  if (existing) {
    // 自分でアイコンを上げていなければ Misskey のアイコンに合わせる
    if (!existing.icon_url?.startsWith('/files/')) app.db.run('UPDATE users SET icon_url = ? WHERE id = ?', icon, existing.id)
    return getUser(app, existing.id)!
  }
  return createUser(app, { handle, displayName: name, iconUrl: icon, isGuest: false })
}
