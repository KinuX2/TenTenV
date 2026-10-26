// フレンド・ブロック・お気に入り・通知・最近会った人
import { randomBytes } from 'node:crypto'
import type { NotificationKind } from '@tentenv/protocol'
import type { App } from './app'
import { notificationEntry, type NotificationRow } from './views'

export const newId = (bytes = 12) => randomBytes(bytes).toString('base64url')

export type FavoriteKind = 'user' | 'world' | 'avatar'

export class Social {
  constructor(private readonly app: App) {}

  private get db() {
    return this.app.db
  }

  areFriends(a: string, b: string) {
    return !!this.db.get('SELECT 1 FROM friends WHERE user_id = ? AND friend_id = ?', a, b)
  }

  friendIds(userId: string): string[] {
    return this.db.all<{ friend_id: string }>('SELECT friend_id FROM friends WHERE user_id = ?', userId).map((r) => r.friend_id)
  }

  friendState(viewer: string, target: string): 'none' | 'outgoing' | 'incoming' | 'friends' {
    if (this.areFriends(viewer, target)) return 'friends'
    if (this.db.get('SELECT 1 FROM friend_requests WHERE from_id = ? AND to_id = ?', viewer, target)) return 'outgoing'
    if (this.db.get('SELECT 1 FROM friend_requests WHERE from_id = ? AND to_id = ?', target, viewer)) return 'incoming'
    return 'none'
  }

  /** blocker が blocked をブロックしているか */
  isBlocked(blocker: string, blocked: string) {
    return !!this.db.get('SELECT 1 FROM blocks WHERE blocker_id = ? AND blocked_id = ?', blocker, blocked)
  }

  /** どちらかがどちらかをブロックしているか */
  blockedEither(a: string, b: string) {
    return !!this.db.get('SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)', a, b, b, a)
  }

  addFriendship(a: string, b: string) {
    const now = Date.now()
    this.db.tx(() => {
      this.db.run('INSERT OR IGNORE INTO friends (user_id, friend_id, since) VALUES (?, ?, ?)', a, b, now)
      this.db.run('INSERT OR IGNORE INTO friends (user_id, friend_id, since) VALUES (?, ?, ?)', b, a, now)
      this.db.run('DELETE FROM friend_requests WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)', a, b, b, a)
    })
  }

  removeFriendship(a: string, b: string) {
    this.db.tx(() => {
      this.db.run('DELETE FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)', a, b, b, a)
      this.db.run('DELETE FROM friend_requests WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)', a, b, b, a)
    })
  }

  isFavorite(userId: string, kind: FavoriteKind, targetId: string) {
    return !!this.db.get('SELECT 1 FROM favorites WHERE user_id = ? AND kind = ? AND target_id = ?', userId, kind, targetId)
  }

  /** 通知を作り、オンラインなら WebSocket で知らせる */
  notify(userId: string, kind: NotificationKind, fromId: string | null, message: string, extra: { instanceId?: string | null; worldName?: string | null } = {}) {
    const row: NotificationRow = {
      id: newId(),
      user_id: userId,
      kind,
      from_id: fromId,
      message: message.slice(0, 500),
      instance_id: extra.instanceId ?? null,
      world_name: extra.worldName ?? null,
      read: 0,
      created_at: Date.now(),
    }
    this.db.run(
      'INSERT INTO notifications (id, user_id, kind, from_id, message, instance_id, world_name, read, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)',
      row.id,
      row.user_id,
      row.kind,
      row.from_id,
      row.message,
      row.instance_id,
      row.world_name,
      row.created_at,
    )
    // 古い通知は 200 件を超えたら消す
    this.db.run('DELETE FROM notifications WHERE user_id = ? AND id NOT IN (SELECT id FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 200)', userId, userId)
    this.app.hub.sendToUser(userId, { t: 'notify', notification: notificationEntry(this.app, row) })
    return row
  }

  /** 同じインスタンスにいたことを記録する（双方向） */
  recordCoPresence(a: string, b: string, worldName: string) {
    if (a === b) return
    const now = Date.now()
    const sql = 'INSERT INTO recent_players (user_id, other_id, at, world_name) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, other_id) DO UPDATE SET at = excluded.at, world_name = excluded.world_name'
    this.db.run(sql, a, b, now, worldName)
    this.db.run(sql, b, a, now, worldName)
  }
}
