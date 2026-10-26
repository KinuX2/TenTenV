// オンラインの利用者（WebSocket 接続）の一覧と、利用者あての送信
import type { ServerSignal } from '@tentenv/protocol'
import type { App } from './app'
import { getUser, locationFor, userSummary } from './views'

/** 送信先として使う接続の最小限の形（ws.ts の Connection が満たす） */
export interface Sendable {
  readonly userId: string
  send(msg: ServerSignal): void
  close(code: number, reason: string): void
}

export class Hub {
  private byUser = new Map<string, Set<Sendable>>()

  constructor(private readonly app: App) {}

  add(c: Sendable) {
    let set = this.byUser.get(c.userId)
    const first = !set
    if (!set) this.byUser.set(c.userId, (set = new Set()))
    set.add(c)
    if (first) this.pushFriendStatus(c.userId)
  }

  remove(c: Sendable) {
    const set = this.byUser.get(c.userId)
    if (!set) return
    set.delete(c)
    if (!set.size) {
      this.byUser.delete(c.userId)
      this.pushFriendStatus(c.userId)
    }
  }

  isOnline(userId: string) {
    return this.byUser.has(userId)
  }

  connectionsOf(userId: string): Sendable[] {
    return [...(this.byUser.get(userId) ?? [])]
  }

  sendToUser(userId: string, msg: ServerSignal) {
    for (const c of this.byUser.get(userId) ?? []) c.send(msg)
  }

  /** 利用者の接続をすべて切る（BAN など） */
  disconnectUser(userId: string, reason: string) {
    for (const c of this.connectionsOf(userId)) c.close(4003, reason)
  }

  /** オンラインのフレンドに、状態と現在地（相手から見える範囲）を知らせる */
  pushFriendStatus(userId: string) {
    const row = getUser(this.app, userId)
    if (!row) return
    const user = userSummary(this.app, row)
    const online = user.status !== 'offline'
    for (const fid of this.app.social.friendIds(userId)) {
      if (!this.byUser.has(fid)) continue
      const loc = online ? locationFor(this.app, row, fid) : null
      this.sendToUser(fid, {
        t: 'friend-status',
        user,
        online,
        location: loc ? { instanceId: loc.instanceId, worldName: loc.worldName, access: loc.access } : null,
      })
    }
  }

  get onlineCount() {
    return this.byUser.size
  }
}
