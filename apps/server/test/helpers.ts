// テスト用: 一時フォルダでサーバーを起動し、REST と WebSocket を呼ぶ
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { zipSync } from 'fflate'
import WebSocket from 'ws'
import { PROTOCOL_VERSION, type ServerSignal } from '@tentenv/protocol'
import { App } from '../src/app'
import { defaultConfig, mergeConfig } from '../src/config'
import { buildManifest, sha256 } from '../src/sdk'

export interface TestServer {
  app: App
  url: string
  wsUrl: string
  close(): Promise<void>
}

export const startServer = async (over: Record<string, unknown> = {}): Promise<TestServer> => {
  const dir = mkdtempSync(join(tmpdir(), 'ttv-server-test-'))
  const cfg = mergeConfig(defaultConfig(join(dir, 'data')), { rateLimits: { authPerMinute: 1000, uploadsPerMinute: 1000 }, ...over })
  const app = new App(cfg)
  const { url } = await app.listen(0, '127.0.0.1')
  return {
    app,
    url,
    wsUrl: url.replace(/^http/, 'ws') + '/ws',
    async close() {
      await app.close()
      rmSync(dir, { recursive: true, force: true })
    },
  }
}

export interface Res<T = any> {
  status: number
  data: T
  headers: Headers
}

export const api = async <T = any>(srv: TestServer, method: string, path: string, opts: { token?: string; body?: unknown; raw?: Uint8Array; type?: string; headers?: Record<string, string> } = {}): Promise<Res<T>> => {
  const headers: Record<string, string> = { ...opts.headers }
  if (opts.token) headers.authorization = `Bearer ${opts.token}`
  let body: BodyInit | undefined
  if (opts.raw) {
    headers['content-type'] = opts.type ?? 'application/octet-stream'
    body = opts.raw as BodyInit
  } else if (opts.body !== undefined) {
    headers['content-type'] = 'application/json'
    body = JSON.stringify(opts.body)
  }
  const r = await fetch(srv.url + path, { method, headers, body })
  const text = await r.text()
  let data: any = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }
  return { status: r.status, data, headers: r.headers }
}

export const guest = async (srv: TestServer, displayName: string) => {
  const r = await api(srv, 'POST', '/api/auth/guest', { body: { displayName } })
  if (r.status !== 200) throw new Error(`guest login failed: ${r.status} ${JSON.stringify(r.data)}`)
  return r.data as { token: string; me: { id: string; displayName: string } }
}

/** 簡単なワールドパッケージ（.ttvw）を作る */
export const buildWorldZip = (opts: { name?: string; tags?: string[]; code?: string; description?: string; tamper?: boolean } = {}) => {
  const enc = new TextEncoder()
  const files: Record<string, Uint8Array> = {
    'world.js': enc.encode(opts.code ?? 'export default function World() { return null }\n'),
    'assets/thumb.png': new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]),
    'assets/sound.mp3': new Uint8Array(4096).map((_, i) => i % 251),
  }
  const hashes: Record<string, string> = {}
  for (const [k, v] of Object.entries(files)) hashes[k] = sha256(v)
  const manifest = buildManifest({ name: opts.name ?? 'テストワールド', description: opts.description ?? '説明', tags: opts.tags ?? ['test'], thumbnail: 'assets/thumb.png', maxCapacity: 16 }, hashes)
  if (opts.tamper) files['world.js'] = enc.encode('export default 1 // changed')
  return zipSync({ ...files, 'world.json': enc.encode(JSON.stringify(manifest)) })
}

/** VRM 1.0 / 0.x の最小の glTF バイナリ */
export const buildVrm = (version: '0' | '1' = '1', extra = 0) => {
  const json =
    version === '1'
      ? {
          asset: { version: '2.0' },
          extensionsUsed: ['VRMC_vrm'],
          extensions: { VRMC_vrm: { specVersion: '1.0', meta: { name: 'テストちゃん', authors: ['作者'], licenseUrl: 'https://vrm.dev/licenses/1.0/', avatarPermission: 'onlyAuthor', commercialUsage: 'personalNonProfit', allowRedistribution: false, modification: 'prohibited', allowExcessivelyViolentUsage: false, creditNotation: 'required' } } },
        }
      : { asset: { version: '2.0' }, extensions: { VRM: { meta: { title: 'Old', author: 'someone', version: '1', allowedUserName: 'Everyone', violentUssageName: 'Disallow', sexualUssageName: 'Disallow', commercialUssageName: 'Allow', licenseName: 'CC_BY_ND' } } } }
  let text = JSON.stringify(json)
  while (text.length % 4) text += ' '
  const jsonBytes = new TextEncoder().encode(text)
  const bin = new Uint8Array(extra)
  const total = 12 + 8 + jsonBytes.length + (extra ? 8 + extra : 0)
  const out = new Uint8Array(total)
  const v = new DataView(out.buffer)
  v.setUint32(0, 0x46546c67, true)
  v.setUint32(4, 2, true)
  v.setUint32(8, total, true)
  v.setUint32(12, jsonBytes.length, true)
  v.setUint32(16, 0x4e4f534a, true)
  out.set(jsonBytes, 20)
  if (extra) {
    const o = 20 + jsonBytes.length
    v.setUint32(o, extra, true)
    v.setUint32(o + 4, 0x004e4942, true)
    out.set(bin, o + 8)
  }
  return out
}

/** 受信したメッセージを溜めておき、条件に合うものを待てる WebSocket クライアント */
export class WsClient {
  readonly ws: WebSocket
  readonly received: ServerSignal[] = []
  private waiters: { pred: (m: ServerSignal) => boolean; resolve: (m: ServerSignal) => void }[] = []
  closed: Promise<{ code: number; reason: string }>

  constructor(url: string) {
    this.ws = new WebSocket(url)
    this.ws.on('message', (d) => {
      const m = JSON.parse(String(d)) as ServerSignal
      const i = this.waiters.findIndex((w) => w.pred(m))
      if (i >= 0) this.waiters.splice(i, 1)[0].resolve(m)
      else this.received.push(m)
    })
    this.closed = new Promise((r) => this.ws.on('close', (code, reason) => r({ code, reason: String(reason) })))
  }

  static async connect(srv: TestServer, token?: string) {
    const c = new WsClient(srv.wsUrl)
    await new Promise<void>((res, rej) => {
      c.ws.once('open', () => res())
      c.ws.once('error', rej)
    })
    if (token) {
      c.send({ t: 'hello', token, protocol: PROTOCOL_VERSION })
      await c.next('welcome')
    }
    return c
  }

  send(m: unknown) {
    this.ws.send(typeof m === 'string' ? m : JSON.stringify(m))
  }

  /** 種類（と条件）に合うメッセージを待つ。すでに届いていればそれを返す */
  next<K extends ServerSignal['t']>(t: K, pred: (m: Extract<ServerSignal, { t: K }>) => boolean = () => true, timeout = 3000): Promise<Extract<ServerSignal, { t: K }>> {
    const match = (m: ServerSignal) => m.t === t && pred(m as Extract<ServerSignal, { t: K }>)
    const i = this.received.findIndex(match)
    if (i >= 0) return Promise.resolve(this.received.splice(i, 1)[0] as Extract<ServerSignal, { t: K }>)
    return new Promise((resolve, reject) => {
      const w = { pred: match, resolve: resolve as (m: ServerSignal) => void }
      this.waiters.push(w)
      setTimeout(() => {
        const j = this.waiters.indexOf(w)
        if (j >= 0) {
          this.waiters.splice(j, 1)
          reject(new Error(`timeout waiting for ${t}; got ${JSON.stringify(this.received.map((m) => m.t))}`))
        }
      }, timeout)
    })
  }

  /** しばらく待って、条件に合うものが届かないことを確かめる */
  async none(t: ServerSignal['t'], ms = 300) {
    await new Promise((r) => setTimeout(r, ms))
    return !this.received.some((m) => m.t === t)
  }

  close() {
    this.ws.close()
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
