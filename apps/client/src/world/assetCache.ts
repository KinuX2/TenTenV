// 読み込んだファイルの手元の保存（6.4）。SHA-256 で中身を確かめ、合わないものは使わない
import { L } from '../i18n'
const CACHE = 'ttv-assets-v1'

export const sha256Hex = async (buf: ArrayBuffer) => {
  const d = await crypto.subtle.digest('SHA-256', buf)
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

const inflight = new Map<string, Promise<ArrayBuffer>>()

/**
 * URL のファイルを取ってくる。sha256 を渡すと中身を確かめ、手元に保存して次回から使う
 * onProgress は 0〜1
 */
export const fetchVerified = (url: string, sha256?: string, onProgress?: (r: number) => void): Promise<ArrayBuffer> => {
  const key = `${sha256 ?? ''}:${url}`
  const running = inflight.get(key)
  if (running) return running
  const p = (async () => {
    const cacheKey = sha256 ? `https://cache.local/${sha256}` : null
    let cache: Cache | null = null
    try {
      cache = typeof caches !== 'undefined' ? await caches.open(CACHE) : null
    } catch {
      cache = null
    }
    if (cache && cacheKey) {
      const hit = await cache.match(cacheKey).catch(() => undefined)
      if (hit) {
        const buf = await hit.arrayBuffer()
        if ((await sha256Hex(buf)) === sha256) {
          onProgress?.(1)
          return buf
        }
        await cache.delete(cacheKey).catch(() => {})
      }
    }
    const res = await fetch(url, { mode: 'cors' })
    if (!res.ok) throw new Error(L(`ファイルを取得できません（${res.status}）`, `Could not fetch the file (${res.status})`))
    const total = Number(res.headers.get('content-length')) || 0
    let buf: ArrayBuffer
    if (res.body && onProgress && total) {
      const reader = res.body.getReader()
      const chunks: Uint8Array[] = []
      let got = 0
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
        got += value.length
        onProgress(Math.min(1, got / total))
      }
      const out = new Uint8Array(got)
      let o = 0
      for (const c of chunks) {
        out.set(c, o)
        o += c.length
      }
      buf = out.buffer
    } else buf = await res.arrayBuffer()
    if (sha256) {
      const h = await sha256Hex(buf)
      if (h !== sha256) throw new Error(L('ファイルの中身が一致しません（改ざん・破損のおそれ）', 'The file contents do not match (possibly tampered or corrupted)'))
      if (cache && cacheKey) await cache.put(cacheKey, new Response(buf.slice(0))).catch(() => {})
    }
    onProgress?.(1)
    return buf
  })()
  inflight.set(key, p)
  p.finally(() => inflight.delete(key)).catch(() => {})
  return p
}

export const clearAssetCache = async () => {
  try {
    await caches.delete(CACHE)
  } catch {
    // 消せなくても困らない
  }
}

export const assetCacheSize = async () => {
  try {
    const est = await navigator.storage.estimate()
    return est.usage ?? 0
  } catch {
    return 0
  }
}
