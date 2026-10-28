// ルートで共通に使う小物
import { createHash } from 'node:crypto'
import type { App } from '../app'
import { requireUser } from '../auth'
import { tooMany, type Req } from '../http'
import type { UserRow } from '../views'

export const sha256hex = (data: Uint8Array) => createHash('sha256').update(data).digest('hex')

/** LIKE 用に % と _ をエスケープする（ESCAPE '\' と組み合わせる） */
export const likePattern = (q: string) => `%${q.replace(/[\\%_]/g, (c) => '\\' + c)}%`

export const limitIp = (app: App, kind: 'auth' | 'upload', req: Req) => {
  if (!app.limiters[kind].take(req.ip)) throw tooMany()
}

/** アップロードしてよい利用者か */
export const requireUploader = (app: App, req: Req): UserRow => {
  const u = requireUser(app, req)
  limitIp(app, 'upload', req)
  return u
}

export const queryFlag = (req: Req, key: string) => {
  const v = req.query.get(key)
  return v === '1' || v === 'true'
}

export const queryInt = (req: Req, key: string, def: number, min: number, max: number) => {
  const v = Number(req.query.get(key))
  if (!req.query.has(key) || !Number.isFinite(v)) return def
  return Math.max(min, Math.min(max, Math.floor(v)))
}

/** 単純な文字列 → 文字列のマップ（meta など）の検査 */
export const flatStringMap = (v: unknown, maxEntries: number, maxKey: number, maxValue: number): Record<string, string> | null => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const entries = Object.entries(v as Record<string, unknown>)
  if (entries.length > maxEntries) return null
  const out: Record<string, string> = {}
  for (const [k, val] of entries) {
    if (!k || k.length > maxKey || typeof val !== 'string' || val.length > maxValue) return null
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') return null
    out[k] = val
  }
  return out
}
