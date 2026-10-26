// 自分のプロフィール（/api/me）と利用者の検索・プロフィール
import { randomBytes } from 'node:crypto'
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { LIMITS, type UserSettings } from '@tentenv/protocol'
import type { App } from '../app'
import { checkDisplayName, optionalUser, requireUser } from '../auth'
import { writeFileAtomic } from '../files'
import { badRequest, checkId, field, hasControlChars, notFound, readBody, readJson } from '../http'
import { imageType } from '../vrm'
import { getUser, meInfo, userProfile, userSettings, userSummary, WORLD_SELECT, worldSummary, type AvatarRow, type UserRow, type WorldRow } from '../views'
import { STATUSES } from '../wsmsg'
import { likePattern, limitIp } from './util'

const ICON_BYTES = 4 * 1024 * 1024
const FRAMES = ['none', 'round', 'star', 'heart'] as const
const VIS = ['everyone', 'friends', 'nobody'] as const

const checkUrl = (u: string, what: string) => {
  if (u.length > 1000 || hasControlChars(u)) throw badRequest(`${what} が長すぎます`)
  let x: URL
  try {
    x = new URL(u)
  } catch {
    throw badRequest(`${what} の URL が正しくありません`)
  }
  if (x.protocol !== 'https:' && x.protocol !== 'http:') throw badRequest(`${what} は http(s) の URL にしてください`)
  return x.toString()
}

/** 自分が上げたアイコンのファイルを消す */
export const removeOwnIcon = (app: App, row: UserRow) => {
  if (row.icon_url?.startsWith('/files/icons/')) rmSync(join(app.filesDir, 'icons', row.icon_url.slice('/files/icons/'.length)), { force: true })
}

export const userRoutes = (app: App) => {
  const r = app.router
  const db = app.db

  r.get('/api/me', (req) => meInfo(app, requireUser(app, req)))

  r.patch('/api/me', async (req) => {
    const me = requireUser(app, req)
    const b = await readJson(req.raw, 32 * 1024)
    const sets: string[] = []
    const vals: (string | null)[] = []
    const set = (col: string, v: string | null) => {
      sets.push(`${col} = ?`)
      vals.push(v)
    }
    if (b.displayName !== undefined) set('display_name', checkDisplayName(b.displayName))
    const bio = field.str(b, 'bio', LIMITS.bio)
    if (bio !== undefined) set('bio', bio)
    const links = field.strList(b, 'links', LIMITS.links, 300)
    if (links !== undefined) set('links', JSON.stringify(links.map((l) => checkUrl(l, 'リンク'))))
    const statusText = field.str(b, 'statusText', LIMITS.statusText)
    if (statusText !== undefined) {
      if (hasControlChars(statusText)) throw badRequest('ひとことに使えない文字が含まれています')
      set('status_text', statusText)
    }
    const status = field.oneOf(b, 'status', STATUSES)
    if (status !== undefined) set('status', status)
    if (b.decoration !== undefined) {
      const d = b.decoration as Record<string, unknown>
      if (!d || typeof d !== 'object') throw badRequest('decoration が正しくありません')
      const color = field.str(d, 'color', 7) ?? '#ffffff'
      if (!/^#[0-9a-fA-F]{6}$/.test(color)) throw badRequest('色は #rrggbb で指定してください')
      const frame = field.oneOf(d, 'frame', FRAMES) ?? 'none'
      set('decoration', JSON.stringify({ color, frame }))
    }
    if (b.settings !== undefined) {
      const s = b.settings as Record<string, unknown>
      if (!s || typeof s !== 'object') throw badRequest('settings が正しくありません')
      const cur: UserSettings = userSettings(me)
      const next: UserSettings = {
        locationVisibility: field.oneOf(s, 'locationVisibility', VIS) ?? cur.locationVisibility,
        allowContact: field.oneOf(s, 'allowContact', VIS) ?? cur.allowContact,
        allowInvites: field.oneOf(s, 'allowInvites', VIS) ?? cur.allowInvites,
      }
      set('settings', JSON.stringify(next))
    }
    if (b.homeWorldId !== undefined) {
      if (b.homeWorldId === null) set('home_world_id', null)
      else {
        if (typeof b.homeWorldId !== 'string') throw badRequest('homeWorldId が正しくありません')
        const w = db.get<{ author_id: string; visibility: string }>('SELECT author_id, visibility FROM worlds WHERE id = ?', b.homeWorldId)
        if (!w || (w.visibility === 'private' && w.author_id !== me.id)) throw badRequest('ワールドが見つかりません')
        set('home_world_id', b.homeWorldId)
      }
    }
    if (b.currentAvatarId !== undefined) {
      if (b.currentAvatarId === null) set('current_avatar_id', null)
      else {
        if (typeof b.currentAvatarId !== 'string') throw badRequest('currentAvatarId が正しくありません')
        const a = db.get<AvatarRow>('SELECT * FROM avatars WHERE id = ?', b.currentAvatarId)
        if (!a || (a.owner_id !== me.id && !(a.is_public && a.allow_cloning))) throw badRequest('このアバターは使えません')
        set('current_avatar_id', a.id)
      }
    }
    if (b.iconUrl !== undefined) {
      if (b.iconUrl === null) set('icon_url', null)
      else {
        if (typeof b.iconUrl !== 'string') throw badRequest('iconUrl が正しくありません')
        // 自分のサーバーのアイコンは相対パスで持つ
        const own = b.iconUrl.startsWith(app.publicUrl + '/files/icons/') ? b.iconUrl.slice(app.publicUrl.length) : b.iconUrl
        if (own.startsWith('/files/icons/')) {
          if (!/^\/files\/icons\/[A-Za-z0-9_-]+\.(png|jpg|webp|gif)$/.test(own) || !own.startsWith(`/files/icons/${me.id}-`)) throw badRequest('アイコンが正しくありません')
          set('icon_url', own)
        } else {
          const u = checkUrl(own, 'アイコン')
          if (!u.startsWith('https://')) throw badRequest('アイコンは https の URL にしてください')
          set('icon_url', u)
        }
      }
    }
    if (sets.length) db.run(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, ...vals, me.id)
    const row = getUser(app, me.id)!
    if (b.status !== undefined || b.displayName !== undefined || b.statusText !== undefined) app.hub.pushFriendStatus(me.id)
    return meInfo(app, row)
  })

  r.post('/api/me/icon', async (req) => {
    const me = requireUser(app, req)
    limitIp(app, 'upload', req)
    const buf = await readBody(req.raw, ICON_BYTES)
    const t = imageType(buf)
    if (!t) throw badRequest('画像は PNG / JPEG / WebP / GIF にしてください')
    const name = `${me.id}-${randomBytes(6).toString('base64url')}.${t.ext}`
    writeFileAtomic(join(app.filesDir, 'icons', name), buf)
    removeOwnIcon(app, me)
    db.run('UPDATE users SET icon_url = ? WHERE id = ?', `/files/icons/${name}`, me.id)
    return meInfo(app, getUser(app, me.id)!)
  })

  r.get('/api/users', (req) => {
    requireUser(app, req)
    const q = (req.query.get('q') ?? '').trim().slice(0, 64)
    if (!q) return []
    return db
      .all<UserRow>("SELECT * FROM users WHERE banned = 0 AND (display_name LIKE ? ESCAPE '\\' OR handle LIKE ? ESCAPE '\\') ORDER BY last_seen DESC LIMIT 50", likePattern(q), likePattern(q))
      .map((u) => userSummary(app, u))
  })

  r.get('/api/users/:id', (req) => {
    const viewer = optionalUser(app, req)
    const row = getUser(app, checkId(req.params.id, '利用者'))
    if (!row || row.banned) throw notFound('利用者が見つかりません')
    return userProfile(app, row, viewer?.id ?? null)
  })

  r.get('/api/users/:id/worlds', (req) => {
    const viewer = optionalUser(app, req)
    const id = checkId(req.params.id, '利用者')
    const all = viewer?.id === id
    return db
      .all<WorldRow>(`${WORLD_SELECT} WHERE w.author_id = ? ${all ? '' : "AND w.visibility = 'public'"} ORDER BY w.updated_at DESC LIMIT 200`, id)
      .map((w) => worldSummary(app, w))
  })
}


