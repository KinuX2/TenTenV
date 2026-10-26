// サーバー設定の読み込み。server.config.json（データフォルダの隣）と環境変数から作る
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { IceServer } from '@tentenv/protocol'

export interface ServerConfig {
  port: number
  /** 外から見たこのサーバーの URL（末尾 / なし）。ファイルの URL に使う */
  publicUrl: string
  dataDir: string
  name: string
  description: string
  termsUrl: string | null
  allowGuest: boolean
  /** ゲストにアバター・ワールドのアップロードを許すか */
  allowGuestUploads: boolean
  misskey: { enabled: boolean; allowedHosts: string[] | null }
  limits: { avatarBytes: number; worldBytes: number; instanceFileBytes: number; maxInstanceCapacity: number }
  relay: boolean
  iceServers: IceServer[]
  /** 管理者のハンドル（@name@host）またはユーザー ID */
  admins: string[]
  corsOrigins: '*' | string[]
  /** リバースプロキシの X-Forwarded-For を信用するか */
  trustProxy: boolean
  /** IP ごとのレート制限（回数 / 分） */
  rateLimits: { authPerMinute: number; uploadsPerMinute: number }
  /** 初回起動時に登録する標準ワールド（.ttvw）のフォルダ */
  seedDir: string | null
  /** 配信するクライアント（ビルドしたもの）のフォルダ。あれば / でクライアントの画面を出す */
  clientDir: string | null
}

const MB = 1024 * 1024
const here = dirname(fileURLToPath(import.meta.url))
export const DEFAULT_DATA_DIR = resolve(here, '..', 'data')

export const defaultConfig = (dataDir = DEFAULT_DATA_DIR): ServerConfig => ({
  port: 8787,
  publicUrl: '',
  dataDir,
  name: 'TenTenV Server',
  description: '',
  termsUrl: null,
  allowGuest: true,
  allowGuestUploads: true,
  misskey: { enabled: true, allowedHosts: null },
  limits: { avatarBytes: 100 * MB, worldBytes: 300 * MB, instanceFileBytes: 50 * MB, maxInstanceCapacity: 40 },
  relay: true,
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
  admins: [],
  corsOrigins: '*',
  trustProxy: false,
  rateLimits: { authPerMinute: 30, uploadsPerMinute: 20 },
  seedDir: resolve(here, '..', 'seed'),
  clientDir: existsSync(resolve(here, '..', '..', 'client', 'dist', 'index.html')) ? resolve(here, '..', '..', 'client', 'dist') : null,
})

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** 既定値に部分的な設定を重ねる（型の違う値は無視する） */
export const mergeConfig = (base: ServerConfig, over: Record<string, unknown>): ServerConfig => {
  const out: ServerConfig = structuredClone(base)
  const str = (k: 'name' | 'description' | 'publicUrl') => typeof over[k] === 'string' && (out[k] = over[k] as string)
  str('name')
  str('description')
  str('publicUrl')
  if (typeof over.port === 'number') out.port = over.port
  if (typeof over.dataDir === 'string') out.dataDir = resolve(over.dataDir)
  if (typeof over.termsUrl === 'string' || over.termsUrl === null) out.termsUrl = (over.termsUrl as string | null) || null
  for (const k of ['allowGuest', 'allowGuestUploads', 'relay', 'trustProxy'] as const) if (typeof over[k] === 'boolean') out[k] = over[k] as boolean
  if (isObj(over.misskey)) {
    if (typeof over.misskey.enabled === 'boolean') out.misskey.enabled = over.misskey.enabled
    const h = over.misskey.allowedHosts
    if (h === null) out.misskey.allowedHosts = null
    else if (Array.isArray(h)) out.misskey.allowedHosts = h.filter((x): x is string => typeof x === 'string').map((x) => x.toLowerCase())
  }
  if (isObj(over.limits)) for (const k of Object.keys(out.limits) as (keyof ServerConfig['limits'])[]) if (typeof over.limits[k] === 'number') out.limits[k] = over.limits[k] as number
  if (isObj(over.rateLimits)) for (const k of Object.keys(out.rateLimits) as (keyof ServerConfig['rateLimits'])[]) if (typeof over.rateLimits[k] === 'number') out.rateLimits[k] = over.rateLimits[k] as number
  if (Array.isArray(over.iceServers)) out.iceServers = over.iceServers.filter((s): s is IceServer => isObj(s) && (typeof s.urls === 'string' || Array.isArray(s.urls)))
  if (Array.isArray(over.admins)) out.admins = over.admins.filter((x): x is string => typeof x === 'string')
  for (const k of ['seedDir', 'clientDir'] as const) if (typeof over[k] === 'string') out[k] = resolve(over[k] as string)
  else if (over[k] === null) out[k] = null
  if (over.corsOrigins === '*') out.corsOrigins = '*'
  else if (Array.isArray(over.corsOrigins)) out.corsOrigins = over.corsOrigins.filter((x): x is string => typeof x === 'string')
  return out
}

/** 設定ファイルと環境変数（TTV_PORT, TTV_DATA, TTV_PUBLIC_URL, TTV_CONFIG）から設定を作る */
export const loadConfig = (env = process.env): ServerConfig => {
  const dataDir = env.TTV_DATA ? resolve(env.TTV_DATA) : DEFAULT_DATA_DIR
  const file = env.TTV_CONFIG ? resolve(env.TTV_CONFIG) : join(dirname(dataDir), 'server.config.json')
  let cfg = defaultConfig(dataDir)
  if (existsSync(file)) {
    let raw: unknown
    try {
      raw = JSON.parse(readFileSync(file, 'utf8'))
    } catch (e) {
      throw new Error(`${file} を読めません: ${(e as Error).message}`)
    }
    if (isObj(raw)) cfg = mergeConfig(cfg, raw)
  }
  if (env.TTV_PORT) cfg.port = Number(env.TTV_PORT) || cfg.port
  if (env.TTV_DATA) cfg.dataDir = dataDir
  if (env.TTV_PUBLIC_URL) cfg.publicUrl = env.TTV_PUBLIC_URL
  cfg.publicUrl = cfg.publicUrl.replace(/\/+$/, '')
  return cfg
}
