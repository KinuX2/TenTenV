// ワールドパッケージ（.ttvw = zip）の作成と検証。Node.js（CLI・親サーバー）で使う
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { unzipSync, zipSync, type Zippable } from 'fflate'
import type { WorldManifest } from '@tentenv/protocol'
import { buildManifest, checkManifest, MANIFEST_FILE, PATH_RE, WORLD_ENTRY, type WorldProjectConfig } from './manifest'
import { scanCode, type ScanFinding } from './scan'

export const sha256 = (data: Uint8Array | string) => createHash('sha256').update(data).digest('hex')

const SCANNED = /\.(m?js|cjs)$/i
const DEFAULT_IGNORE = ['.DS_Store', 'Thumbs.db', '*.map', '.gitkeep', 'index.html', MANIFEST_FILE]

const matchIgnore = (path: string, patterns: string[]) =>
  patterns.some((p) => {
    const re = new RegExp('(^|/)' + p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\u0000/g, '.*') + '$')
    return re.test(path)
  })

const walk = (dir: string, root = dir, out: string[] = []) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, root, out)
    else out.push(relative(root, p).split(sep).join('/'))
  }
  return out
}

export interface PackResult {
  manifest: WorldManifest
  zip: Uint8Array
  findings: ScanFinding[]
  totalBytes: number
}

/** ビルド結果のフォルダからパッケージを作る */
export const packWorld = (distDir: string, cfg: WorldProjectConfig): PackResult => {
  const ignore = [...DEFAULT_IGNORE, ...(cfg.ignore ?? [])]
  const paths = walk(distDir).filter((p) => !matchIgnore(p, ignore))
  if (!paths.includes(WORLD_ENTRY)) throw new Error(`${distDir} に ${WORLD_ENTRY} がありません。先にビルドしてください`)
  const files: Record<string, string> = {}
  const zipInput: Zippable = {}
  const findings: ScanFinding[] = []
  let total = 0
  for (const p of paths) {
    if (!PATH_RE.test(p)) throw new Error(`使えないファイル名です: ${p}`)
    const data = new Uint8Array(readFileSync(join(distDir, p)))
    total += data.length
    files[p] = sha256(data)
    // 音声・画像などは圧縮しても小さくならないので、そのまま入れる
    zipInput[p] = [data, { level: /\.(mp3|ogg|m4a|png|jpe?g|webp|ktx2|mp4|webm|zip)$/i.test(p) ? 0 : 6 }]
    if (SCANNED.test(p)) findings.push(...scanCode(p, new TextDecoder().decode(data), cfg.permissions?.relaxedRules ?? []))
  }
  const manifest = buildManifest(cfg, files)
  zipInput[MANIFEST_FILE] = new TextEncoder().encode(JSON.stringify(manifest, null, 2))
  return { manifest, zip: zipSync(zipInput), findings, totalBytes: total }
}

export interface UnpackResult {
  manifest: WorldManifest
  files: Map<string, Uint8Array>
  totalBytes: number
}

/**
 * パッケージを開いて検証する（親サーバーの受け付け時）。
 * ファイル名・ハッシュ・コードの検査に問題があれば例外を投げる
 */
export const unpackWorld = (zip: Uint8Array, opts: { maxBytes: number }): UnpackResult => {
  let entries: Record<string, Uint8Array>
  let total = 0
  try {
    entries = unzipSync(zip, {
      filter: (f) => {
        total += f.originalSize
        if (total > opts.maxBytes) throw new Error('パッケージが大きすぎます')
        return !f.name.endsWith('/')
      },
    })
  } catch (e) {
    throw new Error(e instanceof Error && e.message.includes('大きすぎ') ? e.message : 'zip として開けません')
  }
  const raw = entries[MANIFEST_FILE]
  if (!raw) throw new Error(`${MANIFEST_FILE} がありません`)
  let manifest: WorldManifest
  try {
    manifest = JSON.parse(new TextDecoder().decode(raw))
  } catch {
    throw new Error(`${MANIFEST_FILE} を読めません`)
  }
  const bad = checkManifest(manifest)
  if (bad) throw new Error(bad)
  const files = new Map<string, Uint8Array>()
  for (const [name, hash] of Object.entries(manifest.files)) {
    const data = entries[name]
    if (!data) throw new Error(`ファイルがありません: ${name}`)
    if (sha256(data) !== hash) throw new Error(`ハッシュが一致しません: ${name}`)
    files.set(name, data)
  }
  for (const name of Object.keys(entries)) if (name !== MANIFEST_FILE && !manifest.files[name]) throw new Error(`一覧にないファイルがあります: ${name}`)
  const findings: ScanFinding[] = []
  for (const [name, data] of files) if (SCANNED.test(name)) findings.push(...scanCode(name, new TextDecoder().decode(data), manifest.permissions.relaxedRules))
  if (findings.length) {
    const f = findings[0]
    throw new Error(`コードの検査で拒否されました: ${f.description}（${f.file}:${f.line}、ルール ${f.rule}）。必要なら ttv-world.json の permissions.relaxedRules で許可してください`)
  }
  return { manifest, files, totalBytes: total }
}
