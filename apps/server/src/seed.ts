// 初めて起動したときに、標準のワールド（seed フォルダの .ttvw）を登録する
// 制作者は「TenTenV」というシステムのユーザーになる。同じ名前のワールドがあれば登録しない
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { App } from './app'
import { createUser } from './auth'
import type { UserRow } from './views'
import { cleanMeta, setTags, storePackage, worldDir } from './routes/worlds'
import { newId } from './social'
import { unpackWorld } from './sdk'

const SYSTEM_HANDLE = 'system:tentenv'

const systemUser = (app: App): UserRow => {
  const row = app.db.get<UserRow>('SELECT * FROM users WHERE handle = ?', SYSTEM_HANDLE)
  return row ?? createUser(app, { handle: SYSTEM_HANDLE, displayName: 'TenTenV', iconUrl: null, isGuest: false })
}

/** 標準のホームワールドの ID（seed の home.ttvw から作ったもの） */
export const defaultHomeWorldId = (app: App): string | null => {
  const sys = app.db.get<{ id: string }>('SELECT id FROM users WHERE handle = ?', SYSTEM_HANDLE)
  if (!sys) return null
  const w = app.db.get<{ id: string }>("SELECT id FROM worlds WHERE author_id = ? AND seed_file = 'home.ttvw'", sys.id)
  return w?.id ?? null
}

export const seedWorlds = (app: App) => {
  const dir = app.config.seedDir
  if (!dir || !existsSync(dir)) return
  // どの seed ファイルから作ったかを覚える列（古いデータベースにはないので足す）
  try {
    app.db.run('ALTER TABLE worlds ADD COLUMN seed_file TEXT')
  } catch {
    // すでにある
  }
  const files = readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.ttvw'))
  if (!files.length) return
  const sys = systemUser(app)
  for (const f of files) {
    if (app.db.get('SELECT 1 FROM worlds WHERE seed_file = ?', f)) continue
    let buf: Uint8Array
    try {
      buf = new Uint8Array(readFileSync(join(dir, f)))
      unpackWorld(buf, { maxBytes: app.config.limits.worldBytes })
    } catch (e) {
      console.warn(`[seed] ${f} を登録できません: ${(e as Error).message}`)
      continue
    }
    const id = newId()
    const { manifest, totalBytes } = storePackage(app, id, 1, buf)
    const meta = cleanMeta(manifest)
    const now = Date.now()
    try {
      app.db.tx(() => {
        app.db.run(
          'INSERT INTO worlds (id, author_id, name, description, tags, visibility, version, manifest, total_bytes, created_at, updated_at, seed_file) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)',
          id,
          sys.id,
          meta.name,
          meta.description,
          JSON.stringify(meta.tags),
          'public',
          JSON.stringify(manifest),
          totalBytes,
          now,
          now,
          f,
        )
        app.db.run('INSERT INTO world_versions (world_id, version, manifest, created_at) VALUES (?, 1, ?, ?)', id, JSON.stringify(manifest), now)
        setTags(app, id, meta.tags)
      })
      console.log(`[seed] 標準のワールド「${meta.name}」を登録しました（${f}）`)
    } catch (e) {
      rmSync(worldDir(app, id), { recursive: true, force: true })
      console.warn(`[seed] ${f} を登録できません: ${(e as Error).message}`)
    }
  }
}
