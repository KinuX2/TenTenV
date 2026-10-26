import type { WorldManifest } from '@tentenv/protocol'
import { SDK_VERSION } from '@tentenv/protocol'
import { RELAXABLE_RULES } from './scan'

export const WORLD_ENTRY = 'world.js'
export const MANIFEST_FILE = 'world.json'
export const MAX_FILES = 2000
/** パッケージ内のパスとして使える名前（.. や絶対パスを拒否する） */
export const PATH_RE = /^(?![\\/])(?!.*\.\.)(?!.*\/\/)[A-Za-z0-9_\-. ()+@,\/぀-ヿ一-鿿]{1,200}$/

/** 制作者が書く設定（ttv-world.json） */
export interface WorldProjectConfig {
  name: string
  description?: string
  tags?: string[]
  thumbnail?: string
  recommendedCapacity?: number
  maxCapacity?: number
  physics?: WorldManifest['physics']
  camera?: WorldManifest['camera']
  render?: WorldManifest['render']
  spawn?: WorldManifest['spawn']
  permissions?: Partial<WorldManifest['permissions']>
  credits?: WorldManifest['credits']
  /** パッケージに含めないファイル（末尾一致・* を使える簡易パターン） */
  ignore?: string[]
}

const clampInt = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(Number(n) || lo)))

export const buildManifest = (cfg: WorldProjectConfig, files: Record<string, string>): WorldManifest => ({
  format: 'tentenv-world',
  formatVersion: 1,
  name: cfg.name.slice(0, 80),
  description: (cfg.description ?? '').slice(0, 2000),
  tags: (cfg.tags ?? []).slice(0, 10).map((t) => t.slice(0, 24)),
  sdkVersion: SDK_VERSION,
  entry: WORLD_ENTRY,
  thumbnail: cfg.thumbnail && files[cfg.thumbnail] ? cfg.thumbnail : null,
  recommendedCapacity: clampInt(cfg.recommendedCapacity ?? 12, 1, 80),
  maxCapacity: clampInt(cfg.maxCapacity ?? 16, 1, 80),
  physics: cfg.physics,
  camera: cfg.camera,
  render: cfg.render,
  spawn: cfg.spawn,
  permissions: {
    allowedDomains: (cfg.permissions?.allowedDomains ?? []).filter((d) => /^(\*\.)?[a-z0-9.-]+\.[a-z]{2,}$/i.test(d)).slice(0, 32),
    relaxedRules: (cfg.permissions?.relaxedRules ?? []).filter((r) => RELAXABLE_RULES.includes(r)),
  },
  files,
  credits: cfg.credits?.slice(0, 200),
})

/** マニフェストの形を確かめる（サーバーとクライアントで使う）。問題があれば理由を返す */
export const checkManifest = (m: unknown): string | null => {
  if (!m || typeof m !== 'object') return 'world.json がありません'
  const x = m as WorldManifest
  if (x.format !== 'tentenv-world' || x.formatVersion !== 1) return 'world.json の形式が違います'
  if (typeof x.name !== 'string' || !x.name.trim()) return 'ワールド名がありません'
  if (x.entry !== WORLD_ENTRY) return `entry は ${WORLD_ENTRY} にしてください`
  if (!x.files || typeof x.files !== 'object') return 'ファイル一覧がありません'
  const names = Object.keys(x.files)
  if (names.length > MAX_FILES) return 'ファイルが多すぎます'
  for (const n of names) {
    if (!PATH_RE.test(n)) return `ファイル名が使えません: ${n}`
    if (!/^[0-9a-f]{64}$/.test(x.files[n])) return `ハッシュが不正です: ${n}`
  }
  if (!x.files[WORLD_ENTRY]) return `${WORLD_ENTRY} がありません`
  if (!x.permissions || !Array.isArray(x.permissions.allowedDomains) || !Array.isArray(x.permissions.relaxedRules)) return 'permissions がありません'
  return null
}

/** URL が許可ドメインのどれかに当たるか（https のみ。*.example.com はサブドメインも含む） */
export const domainAllowed = (url: string, domains: string[]) => {
  let host: string
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:') return false
    host = u.hostname.toLowerCase()
  } catch {
    return false
  }
  return domains.some((d) => {
    const dd = d.toLowerCase()
    return dd.startsWith('*.') ? host === dd.slice(2) || host.endsWith(dd.slice(1)) : host === dd
  })
}
