// フレンド・最近会った人・ブロック・お気に入り・通知・招待
import type { FriendEntry } from '@tentenv/protocol'
import type { App } from '../app'
import { requireUser } from '../auth'
import { badRequest, checkId, conflict, field, forbidden, hasControlChars, KeyedLimiter, notFound, readJson, tooMany, type Req } from '../http'
import type { FavoriteKind } from '../social'
import {
  AVATAR_SELECT,
  avatarInfo,
  getUser,
  iso,
  locationFor,
  notificationEntry,
  userSettings,
  userSummary,
  visibleStatus,
  WORLD_SELECT,
  worldSummary,
  type AvatarRow,
  type NotificationRow,
  type UserRow,
  type WorldRow,
} from '../views'

const KINDS: readonly FavoriteKind[] = ['user', 'world', 'avatar']
const MAX_FAVORITES = 500
const MAX_PENDING_REQUESTS = 200

export const socialRoutes = (app: App) => {
  const r = app.router
  const db = app.db
  /** 申請・招待などの送りすぎを防ぐ（利用者ごと） */
  const sendLimiter = new KeyedLimiter(30, 60_000)
  const limitSend = (userId: string) => {
    if (!sendLimiter.take(userId)) throw tooMany()
  }

  /** 相手の利用者（自分以外・存在する・BAN されていない） */
  const target = (req: Req, me: UserRow, key = 'userId'): UserRow => {
    const id = checkId(req.params[key] ?? '', '利用者')
    if (id === me.id) throw badRequest('自分自身は指定できません')
    const t = getUser(app, id)
    if (!t || t.banned) throw notFound('利用者が見つかりません')
    return t
  }

  // ---------- フレンド ----------

  r.get('/api/friends', (req) => {
    const me = requireUser(app, req)
    return db
      .all<UserRow & { since: number }>('SELECT u.*, f.since AS since FROM friends f JOIN users u ON u.id = f.friend_id WHERE f.user_id = ? ORDER BY u.display_name', me.id)
      .map((u): FriendEntry => ({ ...userSummary(app, u), location: locationFor(app, u, me.id), online: visibleStatus(app, u) !== 'offline', since: iso(u.since) }))
  })

  r.get('/api/friends/requests', (req) => {
    const me = requireUser(app, req)
    const incoming = db.all<UserRow>('SELECT u.* FROM friend_requests r JOIN users u ON u.id = r.from_id WHERE r.to_id = ? AND u.banned = 0 ORDER BY r.created_at DESC', me.id)
    const outgoing = db.all<UserRow>('SELECT u.* FROM friend_requests r JOIN users u ON u.id = r.to_id WHERE r.from_id = ? ORDER BY r.created_at DESC', me.id)
    return { incoming: incoming.map((u) => userSummary(app, u)), outgoing: outgoing.map((u) => userSummary(app, u)) }
  })

  r.post('/api/friends/:userId', (req) => {
    const me = requireUser(app, req)
    const t = target(req, me)
    const s = app.social
    if (s.blockedEither(me.id, t.id)) throw forbidden('この相手にはフレンド申請できません')
    const state = s.friendState(me.id, t.id)
    if (state === 'friends') return { state: 'friends' }
    if (state === 'incoming') {
      s.addFriendship(me.id, t.id)
      s.notify(t.id, 'friend_accepted', me.id, `${me.display_name} さんがフレンド申請を承認しました`)
      app.hub.pushFriendStatus(me.id)
      app.hub.pushFriendStatus(t.id)
      return { state: 'friends' }
    }
    if (state === 'outgoing') return { state: 'outgoing' }
    limitSend(me.id)
    const pending = db.get<{ n: number }>('SELECT COUNT(*) AS n FROM friend_requests WHERE from_id = ?', me.id)!.n
    if (pending >= MAX_PENDING_REQUESTS) throw conflict('承認待ちの申請が多すぎます')
    db.run('INSERT OR IGNORE INTO friend_requests (from_id, to_id, created_at) VALUES (?, ?, ?)', me.id, t.id, Date.now())
    s.notify(t.id, 'friend_request', me.id, `${me.display_name} さんからフレンド申請が届きました`)
    return { state: 'outgoing' }
  })

  r.delete('/api/friends/:userId', (req) => {
    const me = requireUser(app, req)
    const id = checkId(req.params.userId, '利用者')
    app.social.removeFriendship(me.id, id)
  })

  r.get('/api/recent', (req) => {
    const me = requireUser(app, req)
    return db
      .all<UserRow & { at: number; world_name: string }>('SELECT u.*, r.at AS at, r.world_name AS world_name FROM recent_players r JOIN users u ON u.id = r.other_id WHERE r.user_id = ? AND u.banned = 0 ORDER BY r.at DESC LIMIT 100', me.id)
      .map((u) => ({ user: userSummary(app, u), at: iso(u.at), worldName: u.world_name }))
  })

  // ---------- ブロック ----------

  r.get('/api/blocks', (req) => {
    const me = requireUser(app, req)
    return db.all<UserRow>('SELECT u.* FROM blocks b JOIN users u ON u.id = b.blocked_id WHERE b.blocker_id = ? ORDER BY b.created_at DESC', me.id).map((u) => userSummary(app, u))
  })

  r.post('/api/blocks/:userId', (req) => {
    const me = requireUser(app, req)
    const t = target(req, me)
    db.run('INSERT OR IGNORE INTO blocks (blocker_id, blocked_id, created_at) VALUES (?, ?, ?)', me.id, t.id, Date.now())
    app.social.removeFriendship(me.id, t.id)
    app.instances.onBlock(me.id, t.id)
  })

  r.delete('/api/blocks/:userId', (req) => {
    const me = requireUser(app, req)
    db.run('DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?', me.id, checkId(req.params.userId, '利用者'))
  })

  // ---------- お気に入り ----------

  const kindOf = (v: string | null | undefined): FavoriteKind => {
    if (!v || !KINDS.includes(v as FavoriteKind)) throw badRequest('kind は user / world / avatar のどれかにしてください')
    return v as FavoriteKind
  }

  r.get('/api/favorites', (req) => {
    const me = requireUser(app, req)
    const kind = kindOf(req.query.get('kind') ?? 'world')
    if (kind === 'user')
      return db.all<UserRow>("SELECT u.* FROM favorites f JOIN users u ON u.id = f.target_id WHERE f.user_id = ? AND f.kind = 'user' AND u.banned = 0 ORDER BY f.created_at DESC", me.id).map((u) => userSummary(app, u))
    if (kind === 'world')
      return db
        .all<WorldRow>(`${WORLD_SELECT} JOIN favorites fv ON fv.target_id = w.id AND fv.kind = 'world' WHERE fv.user_id = ? AND (w.visibility != 'private' OR w.author_id = ?) ORDER BY fv.created_at DESC`, me.id, me.id)
        .map((w) => worldSummary(app, w))
    return db
      .all<AvatarRow>(`${AVATAR_SELECT} JOIN favorites fv ON fv.target_id = a.id AND fv.kind = 'avatar' WHERE fv.user_id = ? AND (a.is_public = 1 OR a.owner_id = ?) ORDER BY fv.created_at DESC`, me.id, me.id)
      .map((a) => avatarInfo(app, a, me.id))
  })

  r.post('/api/favorites/:kind/:id', (req) => {
    const me = requireUser(app, req)
    const kind = kindOf(req.params.kind)
    const id = checkId(req.params.id)
    const exists =
      kind === 'user'
        ? !!db.get('SELECT 1 FROM users WHERE id = ? AND banned = 0', id)
        : kind === 'world'
          ? !!db.get("SELECT 1 FROM worlds WHERE id = ? AND (visibility != 'private' OR author_id = ?)", id, me.id)
          : !!db.get('SELECT 1 FROM avatars WHERE id = ? AND (is_public = 1 OR owner_id = ?)', id, me.id)
    if (!exists) throw notFound()
    const n = db.get<{ n: number }>('SELECT COUNT(*) AS n FROM favorites WHERE user_id = ? AND kind = ?', me.id, kind)!.n
    if (n >= MAX_FAVORITES) throw conflict(`お気に入りは ${MAX_FAVORITES} 件までです`)
    db.run('INSERT OR IGNORE INTO favorites (user_id, kind, target_id, created_at) VALUES (?, ?, ?, ?)', me.id, kind, id, Date.now())
  })

  r.delete('/api/favorites/:kind/:id', (req) => {
    const me = requireUser(app, req)
    db.run('DELETE FROM favorites WHERE user_id = ? AND kind = ? AND target_id = ?', me.id, kindOf(req.params.kind), req.params.id)
  })

  // ---------- 通知 ----------

  r.get('/api/notifications', (req) => {
    const me = requireUser(app, req)
    return db.all<NotificationRow>('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 100', me.id).map((n) => notificationEntry(app, n))
  })

  r.post('/api/notifications/read', async (req) => {
    const me = requireUser(app, req)
    const b = await readJson(req.raw, 32 * 1024)
    const ids = field.strList(b, 'ids', 200, 64)
    if (ids === undefined || b.ids === null) db.run('UPDATE notifications SET read = 1 WHERE user_id = ?', me.id)
    else db.tx(() => ids.forEach((id) => db.run('UPDATE notifications SET read = 1 WHERE user_id = ? AND id = ?', me.id, id)))
  })

  r.delete('/api/notifications/:id', (req) => {
    const me = requireUser(app, req)
    db.run('DELETE FROM notifications WHERE user_id = ? AND id = ?', me.id, req.params.id)
  })

  // ---------- 招待 ----------

  /** 相手が招待（・招待の依頼）を受け付けるか */
  const acceptsInvites = (from: UserRow, to: UserRow) => {
    if (app.social.blockedEither(from.id, to.id)) return false
    const s = userSettings(to).allowInvites
    return s === 'everyone' || (s === 'friends' && app.social.areFriends(from.id, to.id))
  }

  const message = (b: Record<string, unknown>) => {
    const m = field.str(b, 'message', 200) ?? ''
    if (hasControlChars(m)) throw badRequest('メッセージに使えない文字が含まれています')
    return m
  }

  r.post('/api/invites', async (req) => {
    const me = requireUser(app, req)
    const b = await readJson(req.raw, 8 * 1024)
    const userId = field.reqStr(b, 'userId', 64)
    const inst = app.instances.get(field.reqStr(b, 'instanceId', 64))
    if (!inst) throw notFound('インスタンスが見つかりません')
    const to = getUser(app, checkId(userId, '利用者'))
    if (!to || to.banned || to.id === me.id) throw notFound('利用者が見つかりません')
    const role = app.instances.roleOf(inst, me.id)
    const inside = inst.hasUser(me.id)
    if (inst.access === 'invite' && role === 'member') throw forbidden('このインスタンスに招待できるのは作成者だけです')
    if (role === 'member' && !inside) throw forbidden('参加しているインスタンスにだけ招待できます')
    if (!acceptsInvites(me, to)) throw forbidden('相手は招待を受け付けていません')
    limitSend(me.id)
    // invite では作成者（モデレーターは作成者の代わり）からの招待として記録する
    app.instances.addInvite(inst, to.id, inst.access === 'invite' && role === 'moderator' ? inst.ownerId : me.id)
    app.social.notify(to.id, 'invite', me.id, message(b) || `${me.display_name} さんから「${inst.worldName}」への招待が届きました`, { instanceId: inst.id, worldName: inst.worldName })
  })

  r.post('/api/invite-requests', async (req) => {
    const me = requireUser(app, req)
    const b = await readJson(req.raw, 8 * 1024)
    const to = getUser(app, checkId(field.reqStr(b, 'userId', 64), '利用者'))
    if (!to || to.banned || to.id === me.id) throw notFound('利用者が見つかりません')
    if (!acceptsInvites(me, to)) throw forbidden('相手は招待の依頼を受け付けていません')
    limitSend(me.id)
    const loc = locationFor(app, to, me.id)
    app.social.notify(to.id, 'request_invite', me.id, message(b) || `${me.display_name} さんが招待を希望しています`, { instanceId: loc?.instanceId ?? null, worldName: loc?.worldName ?? null })
  })

}
