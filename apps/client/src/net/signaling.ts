// 親サーバーとの WebSocket。ログインしている間ずっとつなぎ、切れたらつなぎ直す
import { PROTOCOL_VERSION, type ClientSignal, type ServerSignal } from '@tentenv/protocol'
import { SharedClock } from './clock'

type Handler<T extends ServerSignal['t']> = (m: Extract<ServerSignal, { t: T }>) => void

export class SignalClient {
  private ws: WebSocket | null = null
  private handlers = new Map<string, Set<(m: ServerSignal) => void>>()
  private stateListeners = new Set<(open: boolean) => void>()
  private closed = false
  private retry = 0
  private pingTimer: ReturnType<typeof setInterval> | null = null
  private pingId = 0
  private pings = new Map<number, number>()
  readonly clock = new SharedClock()
  open = false
  userId: string | null = null

  constructor(
    private readonly baseUrl: string,
    private readonly token: () => string | null,
  ) {
    this.connect()
  }

  private url() {
    const u = new URL(this.baseUrl)
    u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:'
    // The server only upgrades the origin-root `/ws` endpoint. Do not append to
    // a configured API path (for example `/api/ws`), which is rejected with 404.
    u.pathname = '/ws'
    u.search = ''
    u.hash = ''
    return u.toString()
  }

  private connect() {
    if (this.closed) return
    let ws: WebSocket
    try {
      ws = new WebSocket(this.url())
    } catch {
      this.scheduleReconnect()
      return
    }
    this.ws = ws
    ws.onopen = () => {
      this.retry = 0
      ws.send(JSON.stringify({ t: 'hello', token: this.token() ?? '', protocol: PROTOCOL_VERSION } satisfies ClientSignal))
    }
    ws.onmessage = (e) => {
      let m: ServerSignal
      try {
        m = JSON.parse(String(e.data))
      } catch {
        return
      }
      if (m.t === 'welcome') {
        this.userId = m.userId
        this.setOpen(true)
        this.startPings()
      }
      if (m.t === 'pong') {
        const c = this.pings.get(m.id)
        if (c !== undefined) {
          this.pings.delete(m.id)
          this.clock.addSample(c, m.s)
        }
      }
      this.handlers.get(m.t)?.forEach((h) => h(m))
      this.handlers.get('*')?.forEach((h) => h(m))
    }
    ws.onclose = () => {
      this.stopPings()
      this.setOpen(false)
      this.scheduleReconnect()
    }
    ws.onerror = () => ws.close()
  }

  private scheduleReconnect() {
    if (this.closed) return
    const delay = Math.min(15000, 500 * 2 ** this.retry++) * (0.75 + Math.random() * 0.5)
    setTimeout(() => this.connect(), delay)
  }

  private startPings() {
    this.stopPings()
    let n = 0
    const tick = () => {
      // 最初は細かく測り、そのあとはゆっくり
      n++
      this.ping()
      if (n === 6 && this.pingTimer) {
        clearInterval(this.pingTimer)
        this.pingTimer = setInterval(() => this.ping(), 10000)
      }
    }
    this.ping()
    this.pingTimer = setInterval(tick, 400)
  }
  private stopPings() {
    if (this.pingTimer) clearInterval(this.pingTimer)
    this.pingTimer = null
  }
  private ping() {
    const id = ++this.pingId
    const c = performance.now()
    this.pings.set(id, c)
    if (this.pings.size > 20) this.pings.delete(this.pings.keys().next().value!)
    this.send({ t: 'ping', id, c })
  }

  private setOpen(open: boolean) {
    if (this.open === open) return
    this.open = open
    this.stateListeners.forEach((f) => f(open))
  }

  send(m: ClientSignal) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(m))
      return true
    }
    return false
  }

  on<T extends ServerSignal['t']>(t: T, h: Handler<T>) {
    const set = this.handlers.get(t) ?? new Set()
    set.add(h as (m: ServerSignal) => void)
    this.handlers.set(t, set)
    return () => {
      set.delete(h as (m: ServerSignal) => void)
    }
  }
  onAny(h: (m: ServerSignal) => void) {
    const set = this.handlers.get('*') ?? new Set()
    set.add(h)
    this.handlers.set('*', set)
    return () => {
      set.delete(h)
    }
  }
  onOpenChange(f: (open: boolean) => void) {
    this.stateListeners.add(f)
    return () => {
      this.stateListeners.delete(f)
    }
  }

  close() {
    this.closed = true
    this.stopPings()
    this.ws?.close()
    this.ws = null
  }
}
