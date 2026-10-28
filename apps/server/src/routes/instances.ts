// インスタンスの作成・一覧・削除と、インスタンス共有ファイル
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import type { InstanceInfo, SharedFileInfo } from '@tentenv/protocol'
import type { App } from '../app'
import { requireUser } from '../auth'
import { safeContentType, writeFileAtomic } from '../files'
import { badRequest, checkId, conflict, field, forbidden, hasControlChars, notFound, readBody, readJson, type Req } from '../http'
import { ACCESS_LEVELS, type Instance } from '../instances'
import { newId } from '../social'
import { iso, parseJson, type UserRow, type WorldRow } from '../views'
import { flatStringMap, queryFlag, requireUploader } from './util'
import { getWorld } from './worlds'

const MAX_INSTANCES_PER_USER = 10
const MAX_FILES_PER_INSTANCE = 200
/** インスタンスあたりの共有ファイルの合計 */
const MAX_INSTANCE_TOTAL = 1024 * 1024 * 1024

interface FileRow {
  id: string
  instance_id: string
  file_name: string
  content_type: string
  file_size: number
  description: string | null
  meta: string
  locked: number
  uploaded_by: string
  created_at: number
}

const fileInfo = (app: App, f: FileRow): SharedFileInfo => ({
  id: f.id,
  fileName: f.file_name,
  contentType: f.content_type,
  fileSize: f.file_size,
  url: `${app.publicUrl}/files/instances/${f.instance_id}/${f.id}`,
  description: f.description,
  meta: parseJson<Record<string, string>>(f.meta, {}),
  locked: !!f.locked,
  uploadedBy: f.uploaded_by,
  createdAt: iso(f.created_at),
})

const cleanFileName = (v: string) => {
  const s = v.replace(/^.*[\\/]/, '').trim().normalize('NFC').slice(0, 128)
  if (!s || s === '.' || s === '..' || hasControlChars(s)) throw badRequest('ファイル名が正しくありません')
  return s
}

const parseMeta = (v: unknown) => {
  const m = flatStringMap(v, 20, 64, 1024)
  if (!m) throw badRequest('meta は 20 項目以内の「文字列 → 文字列」のオブジェクトにしてください')
  return m
}

export const instanceRoutes = (app: App) => {
  const r = app.router
  const db = app.db
  const mgr = app.instances

  const getInst = (req: Req) => {
    const inst = mgr.get(checkId(req.params.id, 'インスタンス'))
    if (!inst) throw notFound('インスタンスが見つかりません')
    return inst
  }

  /** 参加できない人には中の様子を見せない */
  const infoFor = (inst: Instance, me: UserRow): InstanceInfo => {
    const info = mgr.info(inst, me.id)
    if (!info.canJoin && inst.access !== 'public' && !inst.hasUser(me.id)) {
      info.members = []
      info.friends = []
    }
    return info
  }

  const isManager = (inst: Instance, me: UserRow) => me.id === inst.ownerId || app.isAdmin(me)

  r.get('/api/instances', (req) => {
    const me = requireUser(app, req)
    const worldId = req.query.get('worldId')
    const onlyFriends = queryFlag(req, 'friends')
    const out = []
    for (const inst of mgr.all()) {
      if (worldId && inst.worldId !== worldId) continue
      // 公開されているもの・自分が入れるもの・自分がいるものだけ
      if (inst.access !== 'public' && mgr.denyReason(inst, me.id) && !inst.hasUser(me.id)) continue
      if (app.social.blockedEither(inst.ownerId, me.id)) continue
      const s = mgr.summary(inst, me.id)
      if (onlyFriends && !s.friends.length) continue
      out.push(s)
    }
    return out.sort((a, b) => b.friends.length - a.friends.length || b.occupants - a.occupants).slice(0, 200)
  })

  r.post('/api/instances', async (req) => {
    const me = requireUser(app, req)
    const b = await readJson(req.raw, 8 * 1024)
    const worldId = field.reqStr(b, 'worldId', 64)
    const w: WorldRow | undefined = getWorld(app, worldId)
    if (!w || (w.visibility === 'private' && w.author_id !== me.id)) throw notFound('ワールドが見つかりません')
    const access = field.oneOf(b, 'access', ACCESS_LEVELS)
    if (!access) throw badRequest('access を指定してください')
    const max = app.config.limits.maxInstanceCapacity
    const manifest = parseJson<{ maxCapacity?: number }>(w.manifest, {})
    const capacity = field.int(b, 'capacity', 1, max) ?? Math.min(max, Math.max(1, manifest.maxCapacity ?? 16))
    const persistent = field.bool(b, 'persistent') ?? false
    let name = field.str(b, 'name', 64) ?? ''
    if (hasControlChars(name)) throw badRequest('名前に使えない文字が含まれています')
    if (!name) name = `${me.display_name} のインスタンス`
    const mine = mgr.all().filter((i) => i.ownerId === me.id).length
    if (mine >= MAX_INSTANCES_PER_USER) throw conflict(`インスタンスは 1 人 ${MAX_INSTANCES_PER_USER} 個までです。使っていないものを閉じてください`)
    const inst = mgr.create({ worldId: w.id, worldName: w.name, ownerId: me.id, name, access, capacity, persistent })
    return infoFor(inst, me)
  })

  r.get('/api/instances/:id', (req) => {
    const me = requireUser(app, req)
    return infoFor(getInst(req), me)
  })

  r.delete('/api/instances/:id', (req) => {
    const me = requireUser(app, req)
    const inst = getInst(req)
    if (!isManager(inst, me)) throw forbidden('作成者と管理者だけが閉じられます')
    mgr.remove(inst)
  })

  // ---------- 共有ファイル ----------

  const getFile = (inst: Instance, id: string) => {
    const f = db.get<FileRow>('SELECT * FROM instance_files WHERE id = ? AND instance_id = ?', checkId(id, 'ファイル'), inst.id)
    if (!f) throw notFound('ファイルが見つかりません')
    return f
  }

  r.get('/api/instances/:id/files', (req) => {
    const me = requireUser(app, req)
    const inst = getInst(req)
    if (!inst.hasUser(me.id) && mgr.denyReason(inst, me.id)) throw forbidden('このインスタンスのファイルは見られません')
    return db.all<FileRow>('SELECT * FROM instance_files WHERE instance_id = ? ORDER BY created_at', inst.id).map((f) => fileInfo(app, f))
  })

  r.post('/api/instances/:id/files', async (req) => {
    const me = requireUploader(app, req)
    const inst = getInst(req)
    if (!inst.hasUser(me.id) && me.id !== inst.ownerId) throw forbidden('参加しているインスタンスにだけアップロードできます')
    const fileName = cleanFileName(req.query.get('name') ?? '')
    const description = (req.query.get('description') ?? '').trim().slice(0, 500) || null
    let meta: Record<string, string> = {}
    const metaQ = req.query.get('meta')
    if (metaQ) {
      if (metaQ.length > 32 * 1024) throw badRequest('meta が大きすぎます')
      let v: unknown
      try {
        v = JSON.parse(metaQ)
      } catch {
        throw badRequest('meta は JSON で指定してください')
      }
      meta = parseMeta(v)
    }
    const stat = db.get<{ n: number; total: number | null }>('SELECT COUNT(*) AS n, SUM(file_size) AS total FROM instance_files WHERE instance_id = ?', inst.id)!
    if (stat.n >= MAX_FILES_PER_INSTANCE) throw conflict(`共有ファイルは ${MAX_FILES_PER_INSTANCE} 個までです`)
    const buf = await readBody(req.raw, app.config.limits.instanceFileBytes)
    if ((stat.total ?? 0) + buf.length > MAX_INSTANCE_TOTAL) throw conflict('このインスタンスの共有ファイルの容量を超えます')
    if (!mgr.get(inst.id)) throw notFound('インスタンスが見つかりません')
    const id = newId()
    const now = Date.now()
    writeFileAtomic(join(app.filesDir, 'instances', inst.id, id), buf)
    db.run(
      'INSERT INTO instance_files (id, instance_id, file_name, content_type, file_size, description, meta, locked, uploaded_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)',
      id,
      inst.id,
      fileName,
      safeContentType(req.headers['content-type']),
      buf.length,
      description,
      JSON.stringify(meta),
      me.id,
      now,
    )
    return fileInfo(app, getFile(inst, id))
  })

  r.patch('/api/instances/:id/files/:fileId', async (req) => {
    const me = requireUser(app, req)
    const inst = getInst(req)
    const f = getFile(inst, req.params.fileId)
    if (f.uploaded_by !== me.id && !isManager(inst, me)) throw forbidden('アップロードした人と作成者だけが変更できます')
    const b = await readJson(req.raw, 64 * 1024)
    const locked = field.bool(b, 'locked')
    const others = b.fileName !== undefined || b.description !== undefined || b.meta !== undefined
    // ロック中は、ロックを外す指定がない限り変更できない
    if (f.locked && locked !== false && others) throw conflict('ロックされているファイルは変更できません')
    const fileName = b.fileName !== undefined ? cleanFileName(field.reqStr(b, 'fileName', 256)) : f.file_name
    const description = b.description === null ? null : b.description !== undefined ? (field.str(b, 'description', 500) ?? null) : f.description
    const meta = b.meta === null ? '{}' : b.meta !== undefined ? JSON.stringify(parseMeta(b.meta)) : f.meta
    db.run('UPDATE instance_files SET file_name = ?, description = ?, meta = ?, locked = ? WHERE id = ?', fileName, description, meta, locked === undefined ? f.locked : locked ? 1 : 0, f.id)
    return fileInfo(app, getFile(inst, f.id))
  })

  r.delete('/api/instances/:id/files/:fileId', (req) => {
    const me = requireUser(app, req)
    const inst = getInst(req)
    const f = getFile(inst, req.params.fileId)
    if (f.uploaded_by !== me.id && !isManager(inst, me)) throw forbidden('アップロードした人と作成者だけが削除できます')
    if (f.locked) throw conflict('ロックされているファイルは削除できません')
    db.run('DELETE FROM instance_files WHERE id = ?', f.id)
    rmSync(join(app.filesDir, 'instances', inst.id, f.id), { force: true })
  })
}
