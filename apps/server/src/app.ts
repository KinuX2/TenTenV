// 親サーバー本体。設定・DB・鍵・HTTP・WebSocket をまとめる
import { mkdirSync } from 'node:fs'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { join } from 'node:path'
import { WebSocketServer } from 'ws'
import type { ServerConfig } from './config'
import { Db } from './db'
import { serveBrandLogo, serveClient, serveFile } from './files'
import { injectMeta, pageMeta } from './ogp'
import { seedWorlds } from './seed'
import { clientIp, corsHeaders, HttpError, KeyedLimiter, Reply, Router, sendError, sendJson, wasAborted, type Req } from './http'
import { Hub } from './hub'
import { InstanceManager } from './instances'
import { loadKeys, type ServerKeys } from './keys'
import { registerRoutes } from './routes'
import { Social } from './social'
import type { UserRow } from './views'
import { Connection } from './ws'
import { MAX_SDP } from './wsmsg'

export class App {
  readonly db: Db
  readonly keys: ServerKeys
  readonly filesDir: string
  readonly hub: Hub
  readonly social: Social
  readonly instances: InstanceManager
  readonly router = new Router()
  readonly connections = new Set<Connection>()
  readonly limiters: { auth: KeyedLimiter; upload: KeyedLimiter; storage: KeyedLimiter }
  publicUrl: string
  /** 終了処理が済んだか（これ以降は DB に触らない） */
  closed = false
  /** Misskey への問い合わせに使う fetch（テストで差し替える） */
  fetchImpl: typeof fetch = (...a) => fetch(...a)
  private server: Server | null = null
  private wss: WebSocketServer | null = null
  private timers: NodeJS.Timeout[] = []

  constructor(readonly config: ServerConfig) {
    mkdirSync(config.dataDir, { recursive: true })
    this.filesDir = join(config.dataDir, 'files')
    for (const d of ['avatars', 'worlds', 'instances', 'icons', 'thumbs']) mkdirSync(join(this.filesDir, d), { recursive: true })
    this.db = new Db(join(config.dataDir, 'db.sqlite'))
    this.keys = loadKeys(join(config.dataDir, 'keys'))
    this.publicUrl = config.publicUrl
    this.hub = new Hub(this)
    this.social = new Social(this)
    this.instances = new InstanceManager(this)
    this.instances.load()
    this.limiters = {
      auth: new KeyedLimiter(config.rateLimits.authPerMinute, 60_000),
      upload: new KeyedLimiter(config.rateLimits.uploadsPerMinute, 60_000),
      // ワールドの永続データの書き込み（利用者ごと、30 回 / 分）
      storage: new KeyedLimiter(30, 60_000),
    }
    registerRoutes(this)
    seedWorlds(this)
  }

  isAdmin(row: Pick<UserRow, 'id' | 'handle' | 'is_guest'>) {
    return !row.is_guest && (this.config.admins.includes(row.handle) || this.config.admins.includes(row.id))
  }

  /** 待ち受けを始める。port 0 なら空いている番号を使う */
  listen(port = this.config.port, host?: string): Promise<{ port: number; url: string }> {
    const server = createServer((req, res) => this.handle(req, res))
    server.requestTimeout = 30 * 60_000
    server.headersTimeout = 60_000
    const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_SDP + 64 * 1024 + 4096 })
    server.on('upgrade', (req, socket, head) => {
      const path = (req.url ?? '').split('?')[0]
      const origin = req.headers.origin
      const okOrigin = this.config.corsOrigins === '*' || !origin || this.config.corsOrigins.includes(origin)
      if (path !== '/ws' || !okOrigin) {
        socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n')
        return socket.destroy()
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        const c = new Connection(this, ws, clientIp(req, this.config.trustProxy))
        this.connections.add(c)
      })
    })
    this.server = server
    this.wss = wss
    this.timers.push(
      setInterval(() => {
        for (const c of this.connections) c.heartbeat()
      }, 30_000),
      setInterval(() => {
        this.instances.sweep()
        for (const l of Object.values(this.limiters)) l.sweep()
        this.db.run('DELETE FROM sessions WHERE expires_at < ?', Date.now())
      }, 30_000),
    )
    for (const t of this.timers) t.unref()
    return new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(port, host, () => {
        const addr = server.address()
        const p = typeof addr === 'object' && addr ? addr.port : port
        if (!this.publicUrl) this.publicUrl = `http://localhost:${p}`
        resolve({ port: p, url: `http://localhost:${p}` })
      })
    })
  }

  async close() {
    for (const t of this.timers) clearInterval(t)
    this.timers = []
    const conns = [...this.connections]
    for (const c of conns) c.close(1001, 'server shutdown')
    // 閉じ終わるのを少し待ち、残りは強制的に切る
    await Promise.race([Promise.all(conns.map((c) => c.done)), new Promise((r) => setTimeout(r, 1000))])
    this.closed = true
    for (const c of conns) c.terminate()
    this.wss?.close()
    await new Promise<void>((r) => {
      if (!this.server) return r()
      this.server.close(() => r())
      this.server.closeAllConnections()
    })
    this.db.close()
  }

  private async handle(req: IncomingMessage, res: ServerResponse) {
    const cors = corsHeaders(req.headers.origin, this.config.corsOrigins)
    for (const [k, v] of Object.entries(cors)) res.setHeader(k, v)
    let url: URL
    try {
      url = new URL(req.url ?? '/', 'http://localhost')
    } catch {
      return sendError(res, 400, 'bad_request', 'URL が正しくありません')
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      return res.end()
    }
    const path = url.pathname
    if (path === '/branding/logo') return serveBrandLogo(this.config.branding.logoFile, req, res)
    if (path.startsWith('/files/')) return serveFile(this, req, res, path)
    if (!path.startsWith('/api/') && path !== '/api') {
      // クライアントの画面（ビルドしたもの）を配信する
      if (this.config.clientDir && (req.method === 'GET' || req.method === 'HEAD')) return serveClient(this.config.clientDir, req, res, path, (html) => injectMeta(html, pageMeta(this, url), this.config.branding.siteName))
      if (path === '/') return sendJson(res, 200, { name: this.config.name, api: '/api/info' })
      return sendError(res, 404, 'not_found', '見つかりません')
    }
    if (path === '/api') return sendJson(res, 200, { name: this.config.name, api: '/api/info' })

    const m = this.router.match(req.method ?? 'GET', path)
    if (!m) return sendError(res, 404, 'not_found', 'この API はありません')
    if (m === 'method') return sendError(res, 405, 'method_not_allowed', 'このメソッドは使えません')
    const r: Req = {
      method: req.method ?? 'GET',
      path,
      query: url.searchParams,
      params: m.params,
      headers: req.headers,
      ip: clientIp(req, this.config.trustProxy),
      raw: req,
      res,
    }
    try {
      const out = await m.handler(r)
      if (res.headersSent) return
      if (out === undefined || out === null) {
        res.writeHead(204)
        res.end()
      } else if (out instanceof Reply) {
        if (out.raw) {
          res.writeHead(out.status, { 'content-length': out.raw.length, ...out.headers })
          res.end(out.raw)
        } else sendJson(res, out.status, out.body, out.headers)
      } else sendJson(res, 200, out)
    } catch (e) {
      if (e instanceof HttpError) {
        // 上限を超えたアップロードは、応答のあと接続を閉じる
        if (wasAborted(req)) res.setHeader('connection', 'close')
        sendError(res, e.status, e.code, e.message)
      } else {
        console.error('[http]', req.method, path, e)
        sendError(res, 500, 'internal', 'サーバーでエラーが起きました')
      }
    }
  }
}
