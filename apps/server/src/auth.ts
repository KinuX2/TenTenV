// セッション（Bearer トークン）とログイン済みの利用者の取り出し
import { createHash, randomBytes } from 'node:crypto'
import { LIMITS } from '@tentenv/protocol'
import type { App } from './app'
import { badRequest, forbidden, hasControlChars, unauthorized, type Req } from './http'
import { newId } from './social'
import { getUser, type UserRow } from './views'

export const SESSION_TTL = 30 * 24 * 60 * 60_000
/** 期限の延長は 1 日に 1 回まで（書き込みを減らす） */
const RENEW_AFTER = 24 * 60 * 60_000

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

export const createSession = (app: App, userId: string) => {
  const token = randomBytes(32).toString('base64url')
  const now = Date.now()
  app.db.run('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)', hashToken(token), userId, now, now + SESSION_TTL)
  return token
}

/** トークンから利用者を探す。期限が近ければ延ばす */
export const userFromToken = (app: App, token: string | null | undefined): UserRow | null => {
  if (!token || token.length > 128 || !/^[A-Za-z0-9_-]+$/.test(token)) return null
  const h = hashToken(token)
  const s = app.db.get<{ user_id: string; expires_at: number }>('SELECT user_id, expires_at FROM sessions WHERE token_hash = ?', h)
  const now = Date.now()
  if (!s) return null
  if (s.expires_at < now) {
    app.db.run('DELETE FROM sessions WHERE token_hash = ?', h)
    return null
  }
  const user = getUser(app, s.user_id)
  if (!user || user.is_guest) {
    app.db.run('DELETE FROM sessions WHERE token_hash = ?', h)
    return null
  }
  if (s.expires_at - now < SESSION_TTL - RENEW_AFTER) app.db.run('UPDATE sessions SET expires_at = ? WHERE token_hash = ?', now + SESSION_TTL, h)
  if (now - user.last_seen > 60_000) app.db.run('UPDATE users SET last_seen = ? WHERE id = ?', now, user.id)
  return user
}

export const bearer = (req: Req) => {
  const h = req.headers.authorization
  if (!h || !h.startsWith('Bearer ')) return null
  return h.slice(7).trim()
}

const cache = new WeakMap<Req, UserRow | null>()

/** ログインしていれば利用者、していなければ null */
export const optionalUser = (app: App, req: Req): UserRow | null => {
  if (cache.has(req)) return cache.get(req)!
  const u = userFromToken(app, bearer(req))
  if (u?.banned) throw forbidden('このアカウントは利用停止されています')
  cache.set(req, u)
  return u
}

export const requireUser = (app: App, req: Req): UserRow => {
  const u = optionalUser(app, req)
  if (!u) throw unauthorized()
  return u
}

export const requireAdmin = (app: App, req: Req): UserRow => {
  const u = requireUser(app, req)
  if (!app.isAdmin(u)) throw forbidden('管理者だけが使えます')
  return u
}

export const deleteSession = (app: App, token: string) => app.db.run('DELETE FROM sessions WHERE token_hash = ?', hashToken(token))

/** 表示名の検査（前後の空白は除く） */
export const checkDisplayName = (v: unknown): string => {
  if (typeof v !== 'string') throw badRequest('表示名を入力してください')
  const s = v.trim().normalize('NFC')
  if (!s) throw badRequest('表示名を入力してください')
  if ([...s].length > LIMITS.displayName) throw badRequest(`表示名は ${LIMITS.displayName} 文字以内にしてください`)
  if (hasControlChars(s)) throw badRequest('表示名に使えない文字が含まれています')
  return s
}

export const createUser = (app: App, p: { handle: string; displayName: string; iconUrl: string | null; isGuest: boolean }): UserRow => {
  const id = newId()
  const now = Date.now()
  app.db.run(
    'INSERT INTO users (id, handle, display_name, icon_url, is_guest, created_at, last_seen) VALUES (?, ?, ?, ?, ?, ?, ?)',
    id,
    p.handle,
    p.displayName,
    p.iconUrl,
    p.isGuest ? 1 : 0,
    now,
    now,
  )
  return getUser(app, id)!
}
