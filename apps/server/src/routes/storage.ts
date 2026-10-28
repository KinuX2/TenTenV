// ワールドの永続データ（キーと値）。全員で共有する shared と、利用者ごとの player がある
import type { App } from '../app'
import { requireUser } from '../auth'
import { badRequest, checkId, conflict, forbidden, notFound, readJson, tooMany, type Req } from '../http'
import type { UserRow } from '../views'

export const KV_KEY_RE = /^[A-Za-z0-9_.\-:]{1,128}$/
export const KV_LIMITS = {
  valueBytes: 100 * 1024,
  sharedKeys: 256,
  playerKeys: 64,
  worldBytes: 10 * 1024 * 1024,
}

/** shared は owner = ''、player は owner = 利用者 ID */
const SHARED = ''

interface KvRow {
  key: string
  value: string
  size: number
}

export const storageRoutes = (app: App) => {
  const r = app.router
  const db = app.db

  const world = (req: Req) => {
    const id = checkId(req.params.worldId, 'ワールド')
    const w = db.get<{ id: string; author_id: string }>('SELECT id, author_id FROM worlds WHERE id = ?', id)
    if (!w) throw notFound('ワールドが見つかりません')
    return w
  }

  const key = (req: Req) => {
    const k = req.params.key
    if (!KV_KEY_RE.test(k)) throw badRequest('キーは英数字と _ . - : で 128 文字以内にしてください')
    return k
  }

  /** 書き込める人: そのワールドのインスタンスにいる人か制作者 */
  const writer = (req: Req, w: { id: string; author_id: string }): UserRow => {
    const me = requireUser(app, req)
    const inside = app.instances.locationOf(me.id)?.worldId === w.id
    if (!inside && me.id !== w.author_id) throw forbidden('このワールドに入っているときだけ保存できます')
    if (!app.limiters.storage.take(me.id)) throw tooMany('保存の回数が多すぎます（1 分に 30 回まで）')
    return me
  }

  const list = (worldId: string, owner: string) =>
    db.all<KvRow>('SELECT key, value FROM kv WHERE world_id = ? AND owner = ? ORDER BY key', worldId, owner).map((row) => ({ key: row.key, value: JSON.parse(row.value) as unknown }))

  const getOne = (worldId: string, owner: string, k: string) => db.get<KvRow>('SELECT key, value, size FROM kv WHERE world_id = ? AND owner = ? AND key = ?', worldId, owner, k)

  /** 上限を確かめてから書く */
  const put = (worldId: string, owner: string, k: string, value: unknown) => {
    let text: string | undefined
    try {
      text = JSON.stringify(value)
    } catch {
      text = undefined
    }
    if (text === undefined) throw badRequest('value は JSON で表せる値にしてください')
    const size = Buffer.byteLength(text) + k.length
    if (size > KV_LIMITS.valueBytes) throw badRequest(`値が大きすぎます（${KV_LIMITS.valueBytes / 1024}KB まで）`)
    db.tx(() => {
      const old = getOne(worldId, owner, k)
      if (!old) {
        const n = db.get<{ n: number }>('SELECT COUNT(*) AS n FROM kv WHERE world_id = ? AND owner = ?', worldId, owner)!.n
        const max = owner === SHARED ? KV_LIMITS.sharedKeys : KV_LIMITS.playerKeys
        if (n >= max) throw conflict(`キーは ${max} 個までです`)
      }
      const total = db.get<{ t: number | null }>('SELECT SUM(size) AS t FROM kv WHERE world_id = ?', worldId)!.t ?? 0
      if (total - (old?.size ?? 0) + size > KV_LIMITS.worldBytes) throw conflict('このワールドの保存容量を超えます')
      db.run(
        'INSERT INTO kv (world_id, owner, key, value, size, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(world_id, owner, key) DO UPDATE SET value = excluded.value, size = excluded.size, updated_at = excluded.updated_at',
        worldId,
        owner,
        k,
        text,
        size,
        Date.now(),
      )
    })
  }

  const increment = (worldId: string, owner: string, k: string, delta: unknown) => {
    if (typeof delta !== 'number' || !Number.isFinite(delta) || Math.abs(delta) > 1e12) throw badRequest('delta は数値で指定してください')
    const old = getOne(worldId, owner, k)
    const cur = old ? (JSON.parse(old.value) as unknown) : 0
    if (typeof cur !== 'number') throw conflict('数値ではない値には足せません')
    const next = cur + delta
    if (!Number.isFinite(next)) throw badRequest('値が大きすぎます')
    put(worldId, owner, k, next)
    return { value: next }
  }

  /** player の対象（読むときは他人の分も見られる。書くのは自分の分だけ） */
  const readOwner = (req: Req, me: UserRow) => {
    const u = req.query.get('userId')
    return u ? checkId(u, '利用者') : me.id
  }

  // shared
  r.get('/api/storage/:worldId/shared', (req) => {
    requireUser(app, req)
    return list(world(req).id, SHARED)
  })
  r.get('/api/storage/:worldId/shared/:key', (req) => {
    requireUser(app, req)
    const row = getOne(world(req).id, SHARED, key(req))
    return { value: row ? (JSON.parse(row.value) as unknown) : null }
  })
  r.put('/api/storage/:worldId/shared/:key', async (req) => {
    const w = world(req)
    const k = key(req)
    writer(req, w)
    const b = await readJson(req.raw, KV_LIMITS.valueBytes * 2)
    if (!('value' in b)) throw badRequest('value を指定してください')
    put(w.id, SHARED, k, b.value)
  })
  r.post('/api/storage/:worldId/shared/:key/increment', async (req) => {
    const w = world(req)
    const k = key(req)
    writer(req, w)
    const b = await readJson(req.raw, 1024)
    return increment(w.id, SHARED, k, b.delta)
  })
  r.delete('/api/storage/:worldId/shared/:key', (req) => {
    const w = world(req)
    const k = key(req)
    writer(req, w)
    db.run('DELETE FROM kv WHERE world_id = ? AND owner = ? AND key = ?', w.id, SHARED, k)
  })

  // player
  r.get('/api/storage/:worldId/player', (req) => {
    const me = requireUser(app, req)
    return list(world(req).id, readOwner(req, me))
  })
  r.get('/api/storage/:worldId/player/:key', (req) => {
    const me = requireUser(app, req)
    const row = getOne(world(req).id, readOwner(req, me), key(req))
    return { value: row ? (JSON.parse(row.value) as unknown) : null }
  })
  r.put('/api/storage/:worldId/player/:key', async (req) => {
    const w = world(req)
    const k = key(req)
    const me = writer(req, w)
    const b = await readJson(req.raw, KV_LIMITS.valueBytes * 2)
    if (!('value' in b)) throw badRequest('value を指定してください')
    put(w.id, me.id, k, b.value)
  })
  r.post('/api/storage/:worldId/player/:key/increment', async (req) => {
    const w = world(req)
    const k = key(req)
    const me = writer(req, w)
    const b = await readJson(req.raw, 1024)
    return increment(w.id, me.id, k, b.delta)
  })
  r.delete('/api/storage/:worldId/player/:key', (req) => {
    const w = world(req)
    const k = key(req)
    const me = writer(req, w)
    db.run('DELETE FROM kv WHERE world_id = ? AND owner = ? AND key = ?', w.id, me.id, k)
  })
}
