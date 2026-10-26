// WebSocket（/ws）: 認証・時計合わせ・インスタンスへの参加・P2P の信号の受け渡し・中継
import type { WebSocket } from 'ws'
import { ByteBucket, LIMITS, PROTOCOL_VERSION, RateLimiter, type ClientSignal, type ServerSignal } from '@tentenv/protocol'
import type { App } from './app'
import { userFromToken } from './auth'
import type { JoinConn, Member, QueueEntry } from './instances'
import { issueTicket } from './keys'
import { parseClientSignal } from './wsmsg'

/** hello を待つ時間 */
const HELLO_TIMEOUT = 10_000
/** これ以上の違反（不正なメッセージ・回数超過）で切断する */
const MAX_STRIKES = 20

export class Connection implements JoinConn {
  userId = ''
  authed = false
  member: Member | null = null
  queued: QueueEntry | null = null
  alive = true
  private strikes = 0
  private strikeAt = 0
  private rateStrikeAt = 0
  /** 直近 1 秒に捨てた数（極端に送り続ける相手はすぐ切断する） */
  private dropped = { at: 0, n: 0 }
  private readonly limiter = new RateLimiter(LIMITS.signalPerSecond, 1000)
  private readonly relayBucket = new ByteBucket(LIMITS.relayBytesPerSecond)
  private lastRelayWarn = 0
  private helloTimer: NodeJS.Timeout

  constructor(
    private readonly app: App,
    private readonly ws: WebSocket,
    readonly ip: string,
  ) {
    this.done = new Promise<void>((r) => (this.markDone = r))
    this.helloTimer = setTimeout(() => !this.authed && this.close(4001, 'hello timeout'), HELLO_TIMEOUT)
    ws.on('message', (data, isBinary) => this.onRaw(data as Buffer, isBinary))
    ws.on('pong', () => (this.alive = true))
    ws.on('close', () => this.onClose())
    ws.on('error', () => this.ws.terminate())
  }

  get isOpen() {
    return this.ws.readyState === this.ws.OPEN
  }

  send(msg: ServerSignal) {
    if (this.isOpen) this.ws.send(JSON.stringify(msg))
  }

  close(code: number, reason: string) {
    // 異常な切断は理由を残す（運営者が原因を調べられるように）
    if (code === 1008 || code === 4003) console.warn(`[ws] 切断 ${code} ${reason}（${this.userId ?? "未認証"}）`)
    if (this.ws.readyState === this.ws.OPEN || this.ws.readyState === this.ws.CONNECTING) this.ws.close(code, reason)
  }

  /** 死活確認（App から定期的に呼ぶ） */
  heartbeat() {
    if (!this.alive) return this.ws.terminate()
    this.alive = false
    try {
      this.ws.ping()
    } catch {
      this.ws.terminate()
    }
  }

  private error(code: string, message: string) {
    this.send({ t: 'error', code, message })
  }

  /** 違反の回数は、しばらく何もなければ 0 に戻す（一時的な送りすぎで切断しないように） */
  private addStrike() {
    const now = Date.now()
    if (now - this.strikeAt > 10_000) this.strikes = 0
    this.strikeAt = now
    this.strikes++
  }

  private strike(code: string, message: string) {
    this.addStrike()
    if (this.strikes > MAX_STRIKES / 2) console.warn(`[ws] 不正なメッセージ ${code}: ${message}（${this.strikes} 回目）`)
    if (this.strikes > MAX_STRIKES) return this.close(1008, 'too many invalid messages')
    this.error(code, message)
  }

  private onRaw(data: Buffer, isBinary: boolean) {
    if (!this.limiter.take()) {
      // 送りすぎた分は捨てる。違反として数えるのは 1 秒に 1 回まで（一時的な詰まりで切断しないように）
      const now = Date.now()
      if (now - this.dropped.at > 1000) this.dropped = { at: now, n: 0 }
      if (++this.dropped.n > LIMITS.signalPerSecond * 2) return this.close(1008, 'flood')
      if (now - this.rateStrikeAt > 1000) {
        this.rateStrikeAt = now
        this.addStrike()
        if (this.strikes > MAX_STRIKES) this.close(1008, 'rate limit')
      }
      return
    }
    if (isBinary) return this.strike('bad_message', 'バイナリのメッセージは受け付けません')
    const parsed = parseClientSignal(data.toString('utf8'))
    if (!parsed.ok) return this.strike('bad_message', parsed.error)
    try {
      this.onMessage(parsed.msg)
    } catch (e) {
      console.error('[ws]', e)
      this.error('internal', 'サーバーでエラーが起きました')
    }
  }

  private onMessage(m: ClientSignal) {
    if (!this.authed) {
      if (m.t !== 'hello') return this.strike('not_authenticated', '先に hello を送ってください')
      return this.onHello(m.token, m.protocol)
    }
    const app = this.app
    switch (m.t) {
      case 'hello':
        return this.strike('bad_message', 'すでに認証されています')
      case 'ping':
        return this.send({ t: 'pong', id: m.id, c: m.c, s: Date.now() })
      case 'join': {
        const inst = app.instances.get(m.instanceId)
        if (!inst) return this.error('not_found', 'インスタンスが見つかりません')
        const r = app.instances.join(this, inst, { hostScore: m.hostScore, queue: !!m.queue, relayOnly: !!m.relayOnly })
        if (!r.ok) this.error(r.code, r.message)
        return
      }
      case 'leave':
        return app.instances.leave(this)
      case 'signal': {
        const me = this.member
        if (!me) return this.error('not_joined', 'インスタンスに参加していません')
        const to = me.instance.members.get(m.to)
        if (!to || to === me || app.instances.hidden(me, to)) return this.error('peer_not_found', '相手が見つかりません')
        return to.conn.send({ t: 'signal', from: me.peerId, data: m.data })
      }
      case 'relay':
        return this.onRelay(m.to, m.ch, m.data)
      case 'status': {
        const fields = m.statusText === undefined ? [m.status] : [m.status, m.statusText.trim()]
        if (m.statusText === undefined) app.db.run('UPDATE users SET status = ? WHERE id = ?', fields[0], this.userId)
        else app.db.run('UPDATE users SET status = ?, status_text = ? WHERE id = ?', fields[0], fields[1], this.userId)
        return app.hub.pushFriendStatus(this.userId)
      }
      case 'p2pfail':
        // 中継は relay の設定があれば誰に対しても使えるので、ここでは記録だけ
        if (process.env.TTV_DEBUG) console.log(`[ws] p2p 失敗 ${this.member?.peerId ?? '-'} → ${m.peerId}`)
        return
      case 'kick': {
        const me = this.member
        if (!me) return this.error('not_joined', 'インスタンスに参加していません')
        const r = app.instances.kick(me, m.peerId, m.reason.trim())
        if (!r.ok) this.error(r.code, r.message)
        return
      }
      case 'renew': {
        const me = this.member
        if (!me) return this.error('not_joined', 'インスタンスに参加していません')
        me.ticket = issueTicket(app.keys, { iid: me.instance.id, uid: me.userId, pid: me.peerId, name: this.displayName(), role: me.role })
        return this.send({ t: 'ticket', ticket: me.ticket })
      }
    }
  }

  private displayName() {
    return this.app.db.get<{ display_name: string }>('SELECT display_name FROM users WHERE id = ?', this.userId)?.display_name ?? ''
  }

  private onHello(token: string, protocol: number) {
    if (protocol !== PROTOCOL_VERSION) {
      this.error('protocol', `プロトコルのバージョンが違います（サーバー: ${PROTOCOL_VERSION}）`)
      return this.close(4000, 'protocol mismatch')
    }
    const user = userFromToken(this.app, token)
    if (!user) {
      this.error('unauthorized', 'ログインし直してください')
      return this.close(4001, 'unauthorized')
    }
    if (user.banned) {
      this.error('banned', 'このアカウントは利用停止されています')
      return this.close(4003, 'banned')
    }
    clearTimeout(this.helloTimer)
    this.authed = true
    this.userId = user.id
    this.app.hub.add(this)
    this.send({ t: 'welcome', userId: user.id, serverTime: Date.now() })
  }

  private onRelay(to: string, ch: 'r' | 'u', data: string) {
    const app = this.app
    if (!app.config.relay) return this.error('relay_disabled', 'このサーバーでは中継を使えません')
    const me = this.member
    if (!me) return this.error('not_joined', 'インスタンスに参加していません')
    const targets: Member[] = []
    if (to === '*') {
      for (const o of me.instance.members.values()) if (o !== me && !app.instances.hidden(me, o)) targets.push(o)
    } else {
      const o = me.instance.members.get(to)
      if (!o || o === me || app.instances.hidden(me, o)) return this.error('peer_not_found', '相手が見つかりません')
      targets.push(o)
    }
    if (!targets.length) return
    // 送る先の数だけ数える（全員あては人数分の帯域を使うため）
    if (!this.relayBucket.take(data.length * targets.length)) {
      const now = Date.now()
      if (now - this.lastRelayWarn > 1000) {
        this.lastRelayWarn = now
        this.error('relay_rate', '中継の送信量が多すぎます')
      }
      return
    }
    const msg: ServerSignal = { t: 'relay', from: me.peerId, ch, data }
    for (const o of targets) o.conn.send(msg)
  }

  /** 接続が閉じたら解決する */
  readonly done: Promise<void>
  private markDone: () => void = () => {}

  /** 強制的に切る（終了時） */
  terminate() {
    this.ws.terminate()
  }

  private onClose() {
    clearTimeout(this.helloTimer)
    this.markDone()
    if (this.app.closed) return
    this.app.connections.delete(this)
    this.app.instances.leave(this)
    if (this.authed) this.app.hub.remove(this)
  }
}
