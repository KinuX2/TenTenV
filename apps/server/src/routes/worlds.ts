// ワールド（.ttvw パッケージ）のアップロード・更新・検索・書き出し
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { zipSync, type Zippable } from 'fflate'
import type { WorldManifest, WorldVisibility } from '@tentenv/protocol'
import type { App } from '../app'
import { optionalUser, requireUser } from '../auth'
import { badRequest, checkId, conflict, field, forbidden, notFound, readBody, readJson, Reply, type Req } from '../http'
import { MANIFEST_FILE, unpackWorld } from '../sdk'
import { newId } from '../social'
import { WORLD_SELECT, worldInfo, worldSummary, type UserRow, type WorldRow } from '../views'
import { likePattern, queryInt, requireUploader } from './util'
import { ensureUploadQuota, uploadQuota } from './uploadQuota'

const VISIBILITY: readonly WorldVisibility[] = ['public', 'unlisted', 'private']
const SORTS = ['popular', 'new', 'recommended', 'favorites'] as const
const MAX_WORLDS_PER_USER = 100
/** 残しておく古い版の数 */
const KEEP_VERSIONS = 10

export const worldDir = (app: App, id: string, version?: number) => join(app.filesDir, 'worlds', id, ...(version === undefined ? [] : [String(version)]))

const canSee = (app: App, w: WorldRow, me: UserRow | null) => w.visibility !== 'private' || (me && (me.id === w.author_id || app.isAdmin(me)))

export const getWorld = (app: App, id: string) => app.db.get<WorldRow>(`${WORLD_SELECT} WHERE w.id = ?`, id)

/** マニフェストの中身を DB 用に整える（checkManifest が見ない項目） */
export const cleanMeta = (m: WorldManifest) => {
  const name = String(m.name).trim().slice(0, 80)
  const description = typeof m.description === 'string' ? m.description.slice(0, 2000) : ''
  const tags = Array.isArray(m.tags) ? [...new Set(m.tags.filter((t): t is string => typeof t === 'string').map((t) => t.trim().toLowerCase().slice(0, 24)).filter(Boolean))].slice(0, 10) : []
  return { name, description, tags }
}

/** パッケージを検査して保存する。新しい版の番号を返す */
export const storePackage = (app: App, id: string, version: number, buf: Uint8Array, checkSize?: (totalBytes: number) => void) => {
  let unpacked
  try {
    unpacked = unpackWorld(buf, { maxBytes: app.config.limits.worldBytes })
  } catch (e) {
    throw badRequest(e instanceof Error ? e.message : 'パッケージを読めません')
  }
  const { manifest, files, totalBytes } = unpacked
  checkSize?.(totalBytes)
  if (manifest.thumbnail !== null && (typeof manifest.thumbnail !== 'string' || !files.has(manifest.thumbnail) || !/\.(png|jpe?g|webp|gif|avif)$/i.test(manifest.thumbnail))) {
    throw badRequest('サムネイルの指定が正しくありません')
  }
  const target = worldDir(app, id, version)
  const tmp = `${target}.tmp-${process.pid}-${Date.now()}`
  rmSync(tmp, { recursive: true, force: true })
  const root = resolve(tmp)
  for (const [name, data] of files) {
    const p = resolve(join(root, ...name.split('/')))
    if (!p.startsWith(root + sep)) throw badRequest(`使えないファイル名です: ${name}`)
    mkdirSync(dirname(p), { recursive: true })
    writeFileSync(p, data)
  }
  mkdirSync(root, { recursive: true })
  writeFileSync(join(root, MANIFEST_FILE), JSON.stringify(manifest))
  rmSync(target, { recursive: true, force: true })
  renameSync(tmp, target)
  return { manifest, totalBytes }
}

/** 古い版のファイルを消す */
const pruneVersions = (app: App, id: string, current: number) => {
  const dir = worldDir(app, id)
  if (!existsSync(dir)) return
  for (const name of readdirSync(dir)) {
    const v = Number(name)
    if (Number.isInteger(v) && v <= current - KEEP_VERSIONS) {
      rmSync(join(dir, name), { recursive: true, force: true })
      app.db.run('DELETE FROM world_versions WHERE world_id = ? AND version = ?', id, v)
    }
  }
}

/** フォルダの中のファイルの合計バイト数 */
const dirBytes = (dir: string): number => {
  let n = 0
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    n += e.isDirectory() ? dirBytes(p) : e.isFile() ? statSync(p).size : 0
  }
  return n
}

/** 古い版は、制作者のアップロード容量の残りに収まる分だけ残す（新しい版を優先し、収まらないものは消す） */
export const trimOldVersions = (app: App, authorId: string) => {
  const { usedBytes, limitBytes } = uploadQuota(app, authorId)
  let room = limitBytes - usedBytes
  const old = app.db.all<{ id: string; version: number }>(
    'SELECT v.world_id AS id, v.version AS version FROM world_versions v JOIN worlds w ON w.id = v.world_id WHERE w.author_id = ? AND v.version < w.version ORDER BY v.created_at DESC, v.version DESC',
    authorId,
  )
  for (const o of old) {
    const dir = worldDir(app, o.id, o.version)
    const bytes = existsSync(dir) ? dirBytes(dir) : 0
    if (bytes <= room) {
      room -= bytes
      continue
    }
    rmSync(dir, { recursive: true, force: true })
    app.db.run('DELETE FROM world_versions WHERE world_id = ? AND version = ?', o.id, o.version)
  }
}

export const setTags = (app: App, id: string, tags: string[]) => {
  app.db.run('DELETE FROM world_tags WHERE world_id = ?', id)
  for (const t of tags) app.db.run('INSERT OR IGNORE INTO world_tags (world_id, tag) VALUES (?, ?)', id, t)
}

export const deleteWorld = (app: App, id: string) => {
  for (const inst of app.instances.all()) if (inst.worldId === id) app.instances.remove(inst, 'ワールドが削除されました')
  app.db.tx(() => {
    app.db.run('DELETE FROM worlds WHERE id = ?', id)
    app.db.run("DELETE FROM favorites WHERE kind = 'world' AND target_id = ?", id)
    app.db.run('DELETE FROM kv WHERE world_id = ?', id)
    app.db.run('UPDATE users SET home_world_id = NULL WHERE home_world_id = ?', id)
  })
  rmSync(worldDir(app, id), { recursive: true, force: true })
}

/** 保存してある版から .ttvw を作り直す */
const exportZip = (app: App, id: string, version: number): Uint8Array => {
  const dir = worldDir(app, id, version)
  const raw = readFileSync(join(dir, MANIFEST_FILE), 'utf8')
  const manifest = JSON.parse(raw) as WorldManifest
  const input: Zippable = {}
  for (const name of Object.keys(manifest.files)) {
    input[name] = [new Uint8Array(readFileSync(join(dir, ...name.split('/')))), { level: /\.(mp3|ogg|m4a|png|jpe?g|webp|ktx2|mp4|webm|zip)$/i.test(name) ? 0 : 6 }]
  }
  input[MANIFEST_FILE] = new TextEncoder().encode(JSON.stringify(manifest, null, 2))
  return zipSync(input)
}

export const worldRoutes = (app: App) => {
  const r = app.router
  const db = app.db

  const ownWorld = (req: Req) => {
    const me = requireUser(app, req)
    const w = getWorld(app, checkId(req.params.id, 'ワールド'))
    if (!w || !canSee(app, w, me)) throw notFound('ワールドが見つかりません')
    if (w.author_id !== me.id && !app.isAdmin(me)) throw forbidden('制作者だけが変更できます')
    return { me, w }
  }

  r.get('/api/worlds', (req) => {
    const me = optionalUser(app, req)
    const q = (req.query.get('q') ?? '').trim().slice(0, 64)
    const tag = (req.query.get('tag') ?? '').trim().toLowerCase().slice(0, 24)
    const author = (req.query.get('author') ?? '').trim().slice(0, 64)
    const sortQ = req.query.get('sort') ?? 'new'
    const sort = (SORTS as readonly string[]).includes(sortQ) ? (sortQ as (typeof SORTS)[number]) : 'new'
    const limit = queryInt(req, 'limit', 50, 1, 100)
    const offset = queryInt(req, 'offset', 0, 0, 10000)
    const where: string[] = []
    const params: (string | number)[] = []
    if (author) {
      where.push('w.author_id = ?')
      params.push(author)
      if (author !== me?.id) where.push("w.visibility = 'public'")
    } else where.push("w.visibility = 'public'")
    if (q) {
      where.push("(w.name LIKE ? ESCAPE '\\' OR w.description LIKE ? ESCAPE '\\')")
      params.push(likePattern(q), likePattern(q))
    }
    if (tag) {
      where.push('EXISTS (SELECT 1 FROM world_tags t WHERE t.world_id = w.id AND t.tag = ?)')
      params.push(tag)
    }
    const base = `SELECT * FROM (${WORLD_SELECT}) w WHERE ${where.join(' AND ')}`
    if (sort === 'recommended') {
      // 今いる人数とお気に入り数で並べる（人数はメモリ上にしかないので、候補を取ってから並べ替える）
      const rows = db.all<WorldRow>(`${base} ORDER BY w.updated_at DESC LIMIT 1000`, ...params)
      return rows
        .map((w) => worldSummary(app, w))
        .sort((a, b) => b.occupants * 2 + b.favoriteCount - (a.occupants * 2 + a.favoriteCount) || b.updatedAt.localeCompare(a.updatedAt))
        .slice(offset, offset + limit)
    }
    const order = sort === 'popular' ? 'w.visit_count DESC' : sort === 'favorites' ? 'w.fav_count DESC' : 'w.created_at DESC'
    return db.all<WorldRow>(`${base} ORDER BY ${order}, w.updated_at DESC LIMIT ? OFFSET ?`, ...params, limit, offset).map((w) => worldSummary(app, w))
  })

  r.get('/api/worlds/tags', () =>
    db.all<{ tag: string; count: number }>("SELECT t.tag AS tag, COUNT(*) AS count FROM world_tags t JOIN worlds w ON w.id = t.world_id WHERE w.visibility = 'public' GROUP BY t.tag ORDER BY count DESC, t.tag LIMIT 100"),
  )

  r.get('/api/worlds/history', (req) => {
    const me = requireUser(app, req)
    return db
      .all<WorldRow>(`${WORLD_SELECT} JOIN world_visits v ON v.world_id = w.id WHERE v.user_id = ? AND (w.visibility != 'private' OR w.author_id = ?) ORDER BY v.at DESC LIMIT 50`, me.id, me.id)
      .map((w) => worldSummary(app, w))
  })

  r.get('/api/worlds/:id', (req) => {
    const me = optionalUser(app, req)
    const w = getWorld(app, checkId(req.params.id, 'ワールド'))
    if (!w || !canSee(app, w, me)) throw notFound('ワールドが見つかりません')
    return worldInfo(app, w, me?.id ?? null)
  })

  r.post('/api/worlds', async (req) => {
    const me = requireUploader(app, req)
    const n = db.get<{ n: number }>('SELECT COUNT(*) AS n FROM worlds WHERE author_id = ?', me.id)!.n
    if (n >= MAX_WORLDS_PER_USER) throw conflict(`ワールドは 1 人 ${MAX_WORLDS_PER_USER} 個までです`)
    const buf = await readBody(req.raw, app.config.limits.worldBytes)
    // 受信中に別のアップロードが終わっているかもしれないので数え直す（ここから保存までは同期で進む）
    const n2 = db.get<{ n: number }>('SELECT COUNT(*) AS n FROM worlds WHERE author_id = ?', me.id)!.n
    if (n2 >= MAX_WORLDS_PER_USER) throw conflict(`ワールドは 1 人 ${MAX_WORLDS_PER_USER} 個までです`)
    const id = newId()
    const { manifest, totalBytes } = storePackage(app, id, 1, buf, (bytes) => ensureUploadQuota(app, me.id, bytes))
    const meta = cleanMeta(manifest)
    const now = Date.now()
    try {
      db.tx(() => {
        db.run(
          'INSERT INTO worlds (id, author_id, name, description, tags, visibility, version, manifest, total_bytes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)',
          id,
          me.id,
          meta.name,
          meta.description,
          JSON.stringify(meta.tags),
          'public',
          JSON.stringify(manifest),
          totalBytes,
          now,
          now,
        )
        db.run('INSERT INTO world_versions (world_id, version, manifest, created_at) VALUES (?, 1, ?, ?)', id, JSON.stringify(manifest), now)
        setTags(app, id, meta.tags)
      })
    } catch (e) {
      rmSync(worldDir(app, id), { recursive: true, force: true })
      throw e
    }
    trimOldVersions(app, me.id)
    return worldInfo(app, getWorld(app, id)!, me.id)
  })

  r.put('/api/worlds/:id', async (req) => {
    const { me, w: before } = ownWorld(req)
    requireUploader(app, req)
    const buf = await readBody(req.raw, app.config.limits.worldBytes)
    // 受信中に削除・更新されているかもしれないので読み直す（ここから保存までは同期で進む）
    const w = getWorld(app, before.id)
    if (!w) throw notFound('ワールドが見つかりません')
    const version = w.version + 1
    // 容量は管理者が更新したときも制作者のものとして数える
    const { manifest, totalBytes } = storePackage(app, w.id, version, buf, (bytes) => ensureUploadQuota(app, w.author_id, bytes, w.total_bytes))
    const meta = cleanMeta(manifest)
    const now = Date.now()
    db.tx(() => {
      db.run('UPDATE worlds SET name = ?, description = ?, tags = ?, version = ?, manifest = ?, total_bytes = ?, updated_at = ? WHERE id = ?', meta.name, meta.description, JSON.stringify(meta.tags), version, JSON.stringify(manifest), totalBytes, now, w.id)
      db.run('INSERT OR REPLACE INTO world_versions (world_id, version, manifest, created_at) VALUES (?, ?, ?, ?)', w.id, version, JSON.stringify(manifest), now)
      setTags(app, w.id, meta.tags)
    })
    pruneVersions(app, w.id, version)
    trimOldVersions(app, w.author_id)
    for (const inst of app.instances.all()) if (inst.worldId === w.id) inst.worldName = meta.name
    return worldInfo(app, getWorld(app, w.id)!, me.id)
  })

  r.patch('/api/worlds/:id', async (req) => {
    const { me, w } = ownWorld(req)
    const b = await readJson(req.raw, 32 * 1024)
    const name = field.str(b, 'name', 80, { min: 1 })
    const description = field.str(b, 'description', 2000)
    const tags = field.strList(b, 'tags', 10, 24)
    const visibility = field.oneOf(b, 'visibility', VISIBILITY)
    const cleanTags = tags && [...new Set(tags.map((t) => t.toLowerCase()))]
    db.tx(() => {
      if (name !== undefined) db.run('UPDATE worlds SET name = ? WHERE id = ?', name, w.id)
      if (description !== undefined) db.run('UPDATE worlds SET description = ? WHERE id = ?', description, w.id)
      if (visibility !== undefined) db.run('UPDATE worlds SET visibility = ? WHERE id = ?', visibility, w.id)
      if (cleanTags) {
        db.run('UPDATE worlds SET tags = ? WHERE id = ?', JSON.stringify(cleanTags), w.id)
        setTags(app, w.id, cleanTags)
      }
      db.run('UPDATE worlds SET updated_at = ? WHERE id = ?', Date.now(), w.id)
    })
    if (name !== undefined) for (const inst of app.instances.all()) if (inst.worldId === w.id) inst.worldName = name
    return worldInfo(app, getWorld(app, w.id)!, me.id)
  })

  r.delete('/api/worlds/:id', (req) => {
    const { w } = ownWorld(req)
    deleteWorld(app, w.id)
  })

  r.get('/api/worlds/:id/export', (req) => {
    const { w } = ownWorld(req)
    const v = req.query.has('version') ? queryInt(req, 'version', w.version, 1, w.version) : w.version
    if (!existsSync(join(worldDir(app, w.id, v), MANIFEST_FILE))) throw notFound('この版は残っていません')
    const zip = exportZip(app, w.id, v)
    return new Reply(200, null, { 'content-type': 'application/zip', 'content-disposition': `attachment; filename="${w.id}-v${v}.ttvw"` }, zip)
  })

}
