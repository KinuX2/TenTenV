// /files/... の静的ファイル配信（Range 対応・パスの検査・キャッシュ指定）
import { createReadStream, mkdirSync, renameSync, statSync, writeFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { dirname, extname, join, resolve, sep } from 'node:path'
import type { App } from './app'
import { sendError } from './http'

const MIME: Record<string, string> = {
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.vtt': 'text/vtt; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.ktx2': 'image/ktx2',
  '.glb': 'model/gltf-binary',
  '.vrm': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream',
  '.wasm': 'application/wasm',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.webm': 'video/webm',
  '.m3u8': 'application/vnd.apple.mpegurl',
  '.ts': 'video/mp2t',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.zip': 'application/zip',
  '.ttvw': 'application/zip',
}

export const mimeOf = (path: string) => MIME[extname(path).toLowerCase()] ?? 'application/octet-stream'

const BRAND_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif', 'image/svg+xml'])

export const brandLogo = (path: string | null) => {
  if (!path) return null
  const type = mimeOf(path)
  if (!BRAND_IMAGE_TYPES.has(type)) return null
  try {
    const stat = statSync(path)
    return stat.isFile() && stat.size <= 2 * 1024 * 1024 ? { path, type, size: stat.size } : null
  } catch {
    return null
  }
}

export const serveBrandLogo = (path: string | null, req: IncomingMessage, res: ServerResponse) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return sendError(res, 405, 'method_not_allowed', 'このメソッドは使えません')
  const logo = brandLogo(path)
  if (!logo) return sendError(res, 404, 'not_found', 'ロゴが見つかりません')
  res.writeHead(200, {
    'content-type': logo.type,
    'content-length': logo.size,
    'cache-control': 'no-cache',
    'access-control-allow-origin': '*',
    'cross-origin-resource-policy': 'cross-origin',
    'content-security-policy': "default-src 'none'; sandbox",
    'x-content-type-options': 'nosniff',
  })
  if (req.method === 'HEAD') return res.end()
  createReadStream(logo.path).pipe(res)
}

/** 利用者が指定した Content-Type を配信用に整える。HTML など危険なものはバイナリ扱いにする */
export const safeContentType = (t: string | undefined): string => {
  const v = (t ?? '').split(';')[0].trim().toLowerCase()
  if (!/^[a-z]+\/[a-z0-9.+-]{1,100}$/.test(v)) return 'application/octet-stream'
  if (/html|xml|javascript|ecmascript|svg/.test(v)) return 'application/octet-stream'
  return v
}

const TOP = new Set(['avatars', 'worlds', 'instances', 'icons', 'thumbs'])

/** 一時ファイルに書いてから置き換える */
export const writeFileAtomic = (path: string, data: Uint8Array) => {
  mkdirSync(dirname(path), { recursive: true })
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(tmp, data)
  renameSync(tmp, path)
}

export const serveFile = (app: App, req: IncomingMessage, res: ServerResponse, pathname: string) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return sendError(res, 405, 'method_not_allowed', 'このメソッドは使えません')
  const segs: string[] = []
  for (const raw of pathname.split('/').slice(2)) {
    let s: string
    try {
      s = decodeURIComponent(raw)
    } catch {
      return sendError(res, 400, 'bad_request', 'パスが正しくありません')
    }
    if (!s || s === '.' || s === '..' || /[\\\0:]/.test(s)) return sendError(res, 404, 'not_found', '見つかりません')
    segs.push(s)
  }
  if (segs.length < 2 || !TOP.has(segs[0])) return sendError(res, 404, 'not_found', '見つかりません')
  const root = resolve(app.filesDir)
  const file = resolve(join(root, ...segs))
  if (!file.startsWith(root + sep)) return sendError(res, 404, 'not_found', '見つかりません')
  let st
  try {
    st = statSync(file)
  } catch {
    return sendError(res, 404, 'not_found', '見つかりません')
  }
  if (!st.isFile()) return sendError(res, 404, 'not_found', '見つかりません')

  let type = mimeOf(file)
  let cache = 'public, max-age=31536000, immutable'
  const headers: Record<string, string> = {}
  if (segs[0] === 'instances') {
    // インスタンス共有ファイル: 保存時の種類で返し、ダウンロード名を付ける
    const row = app.db.get<{ content_type: string; file_name: string }>('SELECT content_type, file_name FROM instance_files WHERE id = ? AND instance_id = ?', segs[2] ?? '', segs[1])
    if (!row || segs.length !== 3) return sendError(res, 404, 'not_found', '見つかりません')
    type = safeContentType(row.content_type)
    cache = 'public, max-age=3600'
    headers['content-disposition'] = `inline; filename*=UTF-8''${encodeURIComponent(row.file_name)}`
  } else if (segs[0] === 'avatars' && segs.length !== 2) {
    return sendError(res, 404, 'not_found', '見つかりません')
  }

  Object.assign(headers, {
    'content-type': type,
    'access-control-allow-origin': '*',
    'access-control-expose-headers': 'content-length, content-range, accept-ranges',
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'none'; sandbox",
    'cross-origin-resource-policy': 'cross-origin',
    'cache-control': cache,
    'accept-ranges': 'bytes',
    'last-modified': st.mtime.toUTCString(),
    etag: `"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`,
  })
  if (req.headers['if-none-match'] === headers.etag) {
    res.writeHead(304, headers)
    return res.end()
  }

  const size = st.size
  let start = 0
  let end = size - 1
  let status = 200
  const range = req.headers.range
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim())
    if (!m || (!m[1] && !m[2])) {
      res.writeHead(416, { ...headers, 'content-range': `bytes */${size}` })
      return res.end()
    }
    if (m[1]) {
      start = Number(m[1])
      end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1
    } else {
      // 末尾から N バイト
      start = Math.max(0, size - Number(m[2]))
    }
    if (start > end || start >= size) {
      res.writeHead(416, { ...headers, 'content-range': `bytes */${size}` })
      return res.end()
    }
    status = 206
    headers['content-range'] = `bytes ${start}-${end}/${size}`
  }
  headers['content-length'] = String(size ? end - start + 1 : 0)
  res.writeHead(status, headers)
  if (req.method === 'HEAD' || size === 0) return res.end()
  const stream = createReadStream(file, { start, end })
  stream.on('error', () => res.destroy())
  stream.pipe(res)
}

/** クライアントの画面（ビルドしたもの）。ファイルがなければ index.html を返す（画面の切り替えはクライアントがする） */
export const serveClient = (root: string, req: IncomingMessage, res: ServerResponse, path: string) => {
  let rel: string
  try {
    rel = decodeURIComponent(path).replace(/^\/+/, '')
  } catch {
    return sendError(res, 400, 'bad_request', 'パスが正しくありません')
  }
  const base = resolve(root)
  let file = resolve(base, rel || 'index.html')
  if (file !== base && !file.startsWith(base + sep)) return sendError(res, 404, 'not_found', '見つかりません')
  let st: ReturnType<typeof statSync> | null = null
  try {
    st = statSync(file)
    if (st.isDirectory()) {
      file = join(file, 'index.html')
      st = statSync(file)
    }
  } catch {
    st = null
  }
  if (!st) {
    // 拡張子のあるファイルが見つからないときは 404、それ以外は画面（index.html）
    if (extname(rel)) return sendError(res, 404, 'not_found', '見つかりません')
    file = join(base, 'index.html')
    try {
      st = statSync(file)
    } catch {
      return sendError(res, 404, 'not_found', '見つかりません')
    }
  }
  const hashed = rel.startsWith('assets/')
  res.writeHead(200, {
    'content-type': mimeOf(file).replace('application/octet-stream', extname(file) === '.html' ? 'text/html; charset=utf-8' : 'application/octet-stream'),
    'content-length': st.size,
    'cache-control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
    'x-content-type-options': 'nosniff',
  })
  if (req.method === 'HEAD') return res.end()
  createReadStream(file).pipe(res)
}
