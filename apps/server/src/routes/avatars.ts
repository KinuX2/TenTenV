// アバター（VRM）のアップロード・一覧・更新・削除
import { randomBytes } from 'node:crypto'
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import type { App } from '../app'
import { optionalUser, requireUser } from '../auth'
import { writeFileAtomic } from '../files'
import { badRequest, checkId, conflict, field, forbidden, notFound, readBody, readJson } from '../http'
import { newId } from '../social'
import { AVATAR_SELECT, avatarInfo, type AvatarRow } from '../views'
import { imageType, inspectVrm, VrmError } from '../vrm'
import { likePattern, limitIp, queryFlag, requireUploader, sha256hex } from './util'
import { ensureUploadQuota } from './uploadQuota'

const MAX_AVATARS_PER_USER = 100
const THUMB_BYTES = 2 * 1024 * 1024
const EXT_BYTES = 32 * 1024

export const deleteAvatar = (app: App, row: AvatarRow) => {
  rmSync(join(app.filesDir, 'avatars', `${row.id}.vrm`), { force: true })
  if (row.thumbnail?.startsWith('/files/thumbs/')) rmSync(join(app.filesDir, 'thumbs', row.thumbnail.slice('/files/thumbs/'.length)), { force: true })
  app.db.run('DELETE FROM avatars WHERE id = ?', row.id)
  app.db.run("DELETE FROM favorites WHERE kind = 'avatar' AND target_id = ?", row.id)
  app.db.run('UPDATE users SET current_avatar_id = NULL WHERE current_avatar_id = ?', row.id)
}

/** アバター拡張定義の簡単な検査（形とサイズ） */
const checkExtensions = (v: unknown): string | null => {
  if (v === null) return null
  if (!v || typeof v !== 'object' || Array.isArray(v) || (v as { version?: unknown }).version !== 1) throw badRequest('extensions は version: 1 のオブジェクトにしてください')
  const x = v as Record<string, unknown>
  for (const k of ['outfits', 'actions']) if (x[k] !== undefined && !Array.isArray(x[k])) throw badRequest(`extensions.${k} は配列にしてください`)
  for (const k of ['gestures', 'gestureCombos']) if (x[k] !== undefined && (typeof x[k] !== 'object' || Array.isArray(x[k]) || x[k] === null)) throw badRequest(`extensions.${k} はオブジェクトにしてください`)
  const s = JSON.stringify(v)
  if (Buffer.byteLength(s) > EXT_BYTES) throw badRequest('extensions が大きすぎます')
  return s
}

export const avatarRoutes = (app: App) => {
  const r = app.router
  const db = app.db

  const own = (req: Parameters<typeof requireUser>[1]) => {
    const me = requireUser(app, req)
    const row = db.get<AvatarRow>(`${AVATAR_SELECT} WHERE a.id = ?`, checkId(req.params.id, 'アバター'))
    if (!row) throw notFound('アバターが見つかりません')
    if (row.owner_id !== me.id && !app.isAdmin(me)) throw forbidden('自分のアバターだけを変更できます')
    return { me, row }
  }

  r.get('/api/avatars', (req) => {
    const me = requireUser(app, req)
    const q = (req.query.get('q') ?? '').trim().slice(0, 64)
    const where: string[] = []
    const params: string[] = []
    let join = ''
    if (queryFlag(req, 'mine')) {
      where.push('a.owner_id = ?')
      params.push(me.id)
    } else if (queryFlag(req, 'favorites')) {
      join = "JOIN favorites fv ON fv.target_id = a.id AND fv.kind = 'avatar' AND fv.user_id = ?"
      params.push(me.id)
      where.push('(a.is_public = 1 OR a.owner_id = ?)')
      params.push(me.id)
    } else where.push('a.is_public = 1')
    if (q) {
      where.push("(a.name LIKE ? ESCAPE '\\' OR a.description LIKE ? ESCAPE '\\')")
      params.push(likePattern(q), likePattern(q))
    }
    const sql = `SELECT a.* FROM (${AVATAR_SELECT}) a ${join} WHERE ${where.join(' AND ')} ORDER BY a.updated_at DESC LIMIT 200`
    return db.all<AvatarRow>(sql, ...params).map((a) => avatarInfo(app, a, me.id))
  })

  r.get('/api/avatars/:id', (req) => {
    const me = optionalUser(app, req)
    const row = db.get<AvatarRow>(`${AVATAR_SELECT} WHERE a.id = ?`, checkId(req.params.id, 'アバター'))
    if (!row) throw notFound('アバターが見つかりません')
    return avatarInfo(app, row, me?.id ?? null)
  })

  r.post('/api/avatars', async (req) => {
    const me = requireUploader(app, req)
    const n = db.get<{ n: number }>('SELECT COUNT(*) AS n FROM avatars WHERE owner_id = ?', me.id)!.n
    if (n >= MAX_AVATARS_PER_USER) throw conflict(`アバターは 1 人 ${MAX_AVATARS_PER_USER} 体までです`)
    const buf = await readBody(req.raw, app.config.limits.avatarBytes)
    ensureUploadQuota(app, me.id, buf.length)
    let info
    try {
      info = inspectVrm(buf)
    } catch (e) {
      if (e instanceof VrmError) throw badRequest(e.message)
      throw e
    }
    const id = newId()
    const now = Date.now()
    const name = (req.query.get('name') ?? '').trim().slice(0, 80) || info.license?.title || 'アバター'
    writeFileAtomic(join(app.filesDir, 'avatars', `${id}.vrm`), buf)
    db.run(
      'INSERT INTO avatars (id, owner_id, name, sha256, file_size, is_public, allow_cloning, license, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      id,
      me.id,
      name,
      sha256hex(buf),
      buf.length,
      queryFlag(req, 'isPublic') ? 1 : 0,
      queryFlag(req, 'allowCloning') ? 1 : 0,
      info.license ? JSON.stringify(info.license) : null,
      now,
      now,
    )
    return avatarInfo(app, db.get<AvatarRow>(`${AVATAR_SELECT} WHERE a.id = ?`, id)!, me.id)
  })

  r.patch('/api/avatars/:id', async (req) => {
    const { me, row } = own(req)
    const b = await readJson(req.raw, 64 * 1024)
    const sets: string[] = []
    const vals: (string | number | null)[] = []
    const set = (c: string, v: string | number | null) => (sets.push(`${c} = ?`), vals.push(v))
    const name = field.str(b, 'name', 80, { min: 1 })
    if (name !== undefined) set('name', name)
    const desc = field.str(b, 'description', 1000)
    if (desc !== undefined) set('description', desc)
    const pub = field.bool(b, 'isPublic')
    if (pub !== undefined) set('is_public', pub ? 1 : 0)
    const clone = field.bool(b, 'allowCloning')
    if (clone !== undefined) set('allow_cloning', clone ? 1 : 0)
    const tags = field.strList(b, 'tags', 10, 24)
    if (tags !== undefined) set('tags', JSON.stringify([...new Set(tags)]))
    if (b.extensions !== undefined) set('extensions', checkExtensions(b.extensions))
    if (sets.length) {
      set('updated_at', Date.now())
      db.run(`UPDATE avatars SET ${sets.join(', ')} WHERE id = ?`, ...vals, row.id)
    }
    return avatarInfo(app, db.get<AvatarRow>(`${AVATAR_SELECT} WHERE a.id = ?`, row.id)!, me.id)
  })

  r.post('/api/avatars/:id/thumbnail', async (req) => {
    const { me, row } = own(req)
    limitIp(app, 'upload', req)
    const buf = await readBody(req.raw, THUMB_BYTES)
    const t = imageType(buf)
    if (!t) throw badRequest('画像は PNG / JPEG / WebP / GIF にしてください')
    const name = `${row.id}-${randomBytes(6).toString('base64url')}.${t.ext}`
    writeFileAtomic(join(app.filesDir, 'thumbs', name), buf)
    if (row.thumbnail?.startsWith('/files/thumbs/')) rmSync(join(app.filesDir, 'thumbs', row.thumbnail.slice('/files/thumbs/'.length)), { force: true })
    db.run('UPDATE avatars SET thumbnail = ?, updated_at = ? WHERE id = ?', `/files/thumbs/${name}`, Date.now(), row.id)
    return avatarInfo(app, db.get<AvatarRow>(`${AVATAR_SELECT} WHERE a.id = ?`, row.id)!, me.id)
  })

  r.delete('/api/avatars/:id', (req) => {
    const { row } = own(req)
    deleteAvatar(app, row)
  })
}
