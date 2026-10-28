// 小さなルーターと、リクエストの読み取り・応答のヘルパー
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'node:http'
import { RateLimiter, type ApiError } from '@tentenv/protocol'

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

export const badRequest = (message: string) => new HttpError(400, 'bad_request', message)
export const unauthorized = (message = 'ログインしてください') => new HttpError(401, 'unauthorized', message)
export const forbidden = (message = 'この操作はできません') => new HttpError(403, 'forbidden', message)
export const notFound = (message = '見つかりません') => new HttpError(404, 'not_found', message)
export const conflict = (message: string) => new HttpError(409, 'conflict', message)
export const tooLarge = (message = 'データが大きすぎます') => new HttpError(413, 'too_large', message)
export const tooMany = (message = '回数が多すぎます。しばらく待ってからやり直してください') => new HttpError(429, 'rate_limited', message)

/** JSON 以外を返したいとき・状態コードを変えたいとき */
export class Reply {
  constructor(
    readonly status: number,
    readonly body: unknown,
    readonly headers: Record<string, string> = {},
    /** 指定されたら JSON にせずそのまま送る */
    readonly raw?: Uint8Array,
  ) {}
}

export interface Req {
  method: string
  path: string
  query: URLSearchParams
  params: Record<string, string>
  headers: IncomingHttpHeaders
  ip: string
  raw: IncomingMessage
  res: ServerResponse
}

export type Handler = (req: Req) => unknown | Promise<unknown>

interface Route {
  method: string
  parts: string[]
  handler: Handler
}

export class Router {
  private routes: Route[] = []

  add(method: string, pattern: string, handler: Handler) {
    this.routes.push({ method, parts: pattern.split('/').filter(Boolean), handler })
    return this
  }
  get = (p: string, h: Handler) => this.add('GET', p, h)
  post = (p: string, h: Handler) => this.add('POST', p, h)
  put = (p: string, h: Handler) => this.add('PUT', p, h)
  patch = (p: string, h: Handler) => this.add('PATCH', p, h)
  delete = (p: string, h: Handler) => this.add('DELETE', p, h)

  /** 一致するルートを探す。パスは合うがメソッドが違えば 'method' を返す */
  match(method: string, path: string): { handler: Handler; params: Record<string, string> } | 'method' | null {
    const segs = path.split('/').filter(Boolean)
    let pathMatched = false
    for (const r of this.routes) {
      if (r.parts.length !== segs.length) continue
      const params: Record<string, string> = {}
      let ok = true
      for (let i = 0; i < segs.length; i++) {
        const p = r.parts[i]
        if (p.startsWith(':')) {
          let v: string
          try {
            v = decodeURIComponent(segs[i])
          } catch {
            ok = false
            break
          }
          params[p.slice(1)] = v
        } else if (p !== segs[i]) {
          ok = false
          break
        }
      }
      if (!ok) continue
      pathMatched = true
      if (r.method === method) return { handler: r.handler, params }
    }
    return pathMatched ? 'method' : null
  }
}

// ---------- 本文の読み取り ----------

const ABORTED = Symbol('aborted')
export const wasAborted = (req: IncomingMessage) => (req as unknown as Record<symbol, boolean>)[ABORTED] === true

/** 本文を読む。上限を超えたら読むのをやめて 413 にする（接続は応答後に切る） */
export const readBody = (req: IncomingMessage, max: number): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const len = Number(req.headers['content-length'])
    const abort = () => {
      ;(req as unknown as Record<symbol, boolean>)[ABORTED] = true
      req.removeAllListeners('data')
      // 応答を相手が受け取れるよう少しだけ読み捨て、それでも続くなら切断する
      let dropped = 0
      req.on('data', (c: Buffer) => {
        dropped += c.length
        if (dropped > 4 * 1024 * 1024) req.destroy()
      })
      req.resume()
      reject(tooLarge(`データが大きすぎます（上限 ${Math.floor(max / 1024 / 1024) || 1}MB）`))
    }
    if (Number.isFinite(len) && len > max) return abort()
    const chunks: Buffer[] = []
    let total = 0
    req.on('data', (c: Buffer) => {
      total += c.length
      if (total > max) return abort()
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks, total)))
    req.on('error', reject)
  })

export const readJson = async (req: IncomingMessage, max = 256 * 1024): Promise<Record<string, unknown>> => {
  const buf = await readBody(req, max)
  if (!buf.length) return {}
  let v: unknown
  try {
    v = JSON.parse(buf.toString('utf8'))
  } catch {
    throw badRequest('JSON を読めません')
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw badRequest('JSON オブジェクトを送ってください')
  return v as Record<string, unknown>
}

// ---------- 応答 ----------

export const sendJson = (res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) => {
  const text = JSON.stringify(body)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(text), ...headers })
  res.end(text)
}

export const sendError = (res: ServerResponse, status: number, code: string, message: string) => {
  const body: ApiError = { error: code, message }
  if (res.headersSent) return res.end()
  sendJson(res, status, body)
}

export const corsHeaders = (origin: string | undefined, allowed: '*' | string[]): Record<string, string> => {
  const h: Record<string, string> = {
    'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'access-control-allow-headers': 'authorization, content-type, range',
    'access-control-expose-headers': 'content-length, content-range, accept-ranges',
    'access-control-max-age': '600',
  }
  if (allowed === '*') h['access-control-allow-origin'] = '*'
  else if (origin && allowed.includes(origin)) {
    h['access-control-allow-origin'] = origin
    h.vary = 'Origin'
  }
  return h
}

export const clientIp = (req: IncomingMessage, trustProxy: boolean) => {
  if (trustProxy) {
    // 左側は利用者が自由に書けるので、信用するプロキシが最後に足した右端を使う
    const f = req.headers['x-forwarded-for']
    const last = (Array.isArray(f) ? f.join(',') : f)?.split(',').pop()?.trim()
    if (last) return last
  }
  return req.socket.remoteAddress ?? 'unknown'
}

/** IP（やユーザー）ごとの回数制限 */
export class KeyedLimiter {
  private map = new Map<string, { lim: RateLimiter; last: number }>()
  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}
  take(key: string) {
    const now = Date.now()
    let e = this.map.get(key)
    if (!e) {
      e = { lim: new RateLimiter(this.max, this.windowMs), last: now }
      this.map.set(key, e)
    }
    e.last = now
    if (this.map.size > 10000) this.sweep(now)
    return e.lim.take(now)
  }
  sweep(now = Date.now()) {
    for (const [k, e] of this.map) if (now - e.last > this.windowMs) this.map.delete(k)
  }
}

// ---------- 入力の検査 ----------

export const field = {
  str(o: Record<string, unknown>, key: string, max: number, opts: { min?: number; trim?: boolean } = {}): string | undefined {
    const v = o[key]
    if (v === undefined) return undefined
    if (typeof v !== 'string') throw badRequest(`${key} は文字列で指定してください`)
    const s = opts.trim === false ? v : v.trim()
    if (s.length > max) throw badRequest(`${key} は ${max} 文字以内にしてください`)
    if (s.length < (opts.min ?? 0)) throw badRequest(`${key} が短すぎます`)
    return s
  },
  reqStr(o: Record<string, unknown>, key: string, max: number, min = 1): string {
    const s = field.str(o, key, max, { min })
    if (s === undefined) throw badRequest(`${key} を指定してください`)
    return s
  },
  bool(o: Record<string, unknown>, key: string): boolean | undefined {
    const v = o[key]
    if (v === undefined) return undefined
    if (typeof v !== 'boolean') throw badRequest(`${key} は true / false で指定してください`)
    return v
  },
  int(o: Record<string, unknown>, key: string, min: number, max: number): number | undefined {
    const v = o[key]
    if (v === undefined || v === null) return undefined
    if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) throw badRequest(`${key} は ${min}〜${max} の整数で指定してください`)
    return v
  },
  oneOf<T extends string>(o: Record<string, unknown>, key: string, values: readonly T[]): T | undefined {
    const v = o[key]
    if (v === undefined) return undefined
    if (typeof v !== 'string' || !values.includes(v as T)) throw badRequest(`${key} は ${values.join(' / ')} のどれかにしてください`)
    return v as T
  },
  strList(o: Record<string, unknown>, key: string, maxItems: number, maxLen: number): string[] | undefined {
    const v = o[key]
    if (v === undefined) return undefined
    if (!Array.isArray(v) || v.length > maxItems || v.some((x) => typeof x !== 'string' || x.length > maxLen)) throw badRequest(`${key} は ${maxItems} 個以内・各 ${maxLen} 文字以内の文字列の配列にしてください`)
    return (v as string[]).map((x) => x.trim()).filter(Boolean)
  },
}

/** 制御文字・行区切り・文字の向きを変える記号（なりすましに使われる）を含むか */
const BAD_CODE_POINTS = new Set([0x7f, 0x200e, 0x200f, 0x2028, 0x2029, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069])
export const hasControlChars = (s: string) => {
  for (const ch of s) {
    const c = ch.codePointAt(0)!
    if (c < 0x20 || BAD_CODE_POINTS.has(c)) return true
  }
  return false
}
export const ID_RE = /^[A-Za-z0-9_-]{1,64}$/
export const checkId = (id: string, what = 'ID') => {
  if (!ID_RE.test(id)) throw notFound(`${what}が見つかりません`)
  return id
}
