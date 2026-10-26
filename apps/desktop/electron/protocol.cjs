// app:// プロトコル: 同梱のクライアント（apps/client/dist）と自己テストのページを配る
//
//   app://tentenv/...   同梱のクライアント（見つからないパスは index.html へ。SPA のため）
//   app://selftest/...  自己テストのページ（--selftest のときだけ）。/vendor/three/ は three のビルド
//
// standard + secure として登録するので、ページは安全なコンテキスト（getUserMedia・WebGPU が使える）になり、
// オリジンは固定の "app://tentenv"（localStorage などの保存先が変わらない）。

'use strict'

const fs = require('node:fs')
const path = require('node:path')

const SCHEME = 'app'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.cjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.vrm': 'application/octet-stream',
  '.bin': 'application/octet-stream',
  '.task': 'application/octet-stream',
  '.tflite': 'application/octet-stream',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
}

/** root の中のファイルだけを返す（../ でフォルダの外へ出られないように） */
function resolveInside(root, urlPath) {
  let p
  try {
    p = decodeURIComponent(urlPath)
  } catch {
    return null
  }
  if (p.includes('\0')) return null
  const full = path.resolve(root, '.' + path.posix.normalize('/' + p.replace(/\\/g, '/')))
  const rel = path.relative(root, full)
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null
  return full
}

const isFile = (f) => {
  try {
    return fs.statSync(f).isFile()
  } catch {
    return false
  }
}

/**
 * @param {Record<string, {root: string, spa?: boolean, mounts?: Record<string,string>}>} hosts
 */
function createHandler(hosts) {
  return async (request) => {
    let u
    try {
      u = new URL(request.url)
    } catch {
      return new Response('bad request', { status: 400 })
    }
    const site = hosts[u.hostname]
    if (!site) return new Response('not found', { status: 404 })
    let root = site.root
    let p = u.pathname
    for (const [prefix, dir] of Object.entries(site.mounts ?? {})) {
      if (p.startsWith(prefix)) {
        root = dir
        p = p.slice(prefix.length - 1)
        break
      }
    }
    let file = resolveInside(root, p)
    if (file && !isFile(file) && isFile(path.join(file, 'index.html'))) file = path.join(file, 'index.html')
    if ((!file || !isFile(file)) && site.spa && !path.extname(p)) file = path.join(site.root, 'index.html')
    if (!file || !isFile(file)) return new Response('not found', { status: 404, headers: { 'content-type': 'text/plain' } })
    const body = await fs.promises.readFile(file)
    return new Response(body, {
      status: 200,
      headers: {
        'content-type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
        'cache-control': 'no-cache',
        'x-content-type-options': 'nosniff',
      },
    })
  }
}

/** app.whenReady() より前に呼ぶ */
function registerPrivileged(protocol) {
  protocol.registerSchemesAsPrivileged([
    { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true, codeCache: true } },
  ])
}

module.exports = { SCHEME, createHandler, registerPrivileged, resolveInside }
