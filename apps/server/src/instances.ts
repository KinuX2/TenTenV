// インスタンス（ワールドの部屋）の管理: 参加判定・定員と順番待ち・参加者の出入り・後片付け
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import type { AccessLevel, InstanceInfo, InstanceSummary, PeerDescriptor, ServerSignal, UserSummary } from '@tentenv/protocol'
import type { App } from './app'
import type { Sendable } from './hub'
import { issueTicket } from './keys'
import { newId } from './social'
import { getUser, iso, summaryById, userSummary, WORLD_SELECT, worldSummary, type WorldRow } from './views'

export const ACCESS_LEVELS: readonly AccessLevel[] = ['public', 'friends+', 'friends', 'invite+', 'invite']

/** 空になってから消すまでの時間 */
export const EMPTY_TTL = 5 * 60_000
export const PERSISTENT_TTL = 24 * 60 * 60_000
/** 招待の有効期間 */
export const INVITE_TTL = 12 * 60 * 60_000

export type Role = 'owner' | 'moderator' | 'member'

/** インスタンスに出入りする接続（ws.ts の Connection） */
export interface JoinConn extends Sendable {
  member: Member | null
  queued: QueueEntry | null
  readonly isOpen: boolean
}

export interface Member {
  peerId: string
  conn: JoinConn
  instance: Instance
  userId: string
  joinedAt: number
  hostScore: number
  role: Role
  ticket: string
}

export interface QueueEntry {
  conn: JoinConn
  instance: Instance
  hostScore: number
  at: number
}

export interface InstanceRow {
  id: string
  world_id: string
  owner_id: string
  name: string
  access: AccessLevel
  capacity: number
  persistent: number
  created_at: number
}

export class Instance {
  readonly members = new Map<string, Member>()
  queue: QueueEntry[] = []
  emptySince: number | null = Date.now()
  /** キックされた利用者（入り直しを断る） */
  readonly kicked = new Set<string>()

  constructor(
    readonly id: string,
    readonly worldId: string,
    public worldName: string,
    readonly ownerId: string,
    readonly name: string,
    readonly access: AccessLevel,
    readonly capacity: number,
    readonly persistent: boolean,
    readonly createdAt: number,
  ) {}

  get isFull() {
    return this.members.size >= this.capacity
  }

  hasUser(userId: string) {
    for (const m of this.members.values()) if (m.userId === userId) return true
    return false
  }

  broadcast(msg: ServerSignal, except?: Member) {
    for (const m of this.members.values()) if (m !== except) m.conn.send(msg)
  }
}

export type JoinResult = { ok: true } | { ok: false; code: string; message: string }

export class InstanceManager {
  private readonly map = new Map<string, Instance>()

  constructor(private readonly app: App) {}

  /** 再起動のあとも、DB にあるインスタンスを空の状態で戻す */
  load() {
    for (const r of this.app.db.all<InstanceRow>('SELECT * FROM instances')) {
      const w = this.app.db.get<{ name: string }>('SELECT name FROM worlds WHERE id = ?', r.world_id)
      if (!w) {
        this.deleteRows(r.id)
        continue
      }
      this.map.set(r.id, new Instance(r.id, r.world_id, w.name, r.owner_id, r.name, r.access, r.capacity, !!r.persistent, r.created_at))
    }
  }

  get(id: string) {
    return this.map.get(id)
  }

  all() {
    return [...this.map.values()]
  }

  create(p: { worldId: string; worldName: string; ownerId: string; name: string; access: AccessLevel; capacity: number; persistent: boolean }) {
    const id = newId(9)
    const now = Date.now()
    this.app.db.run(
      'INSERT INTO instances (id, world_id, owner_id, name, access, capacity, persistent, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      id,
      p.worldId,
      p.ownerId,
      p.name,
      p.access,
      p.capacity,
      p.persistent ? 1 : 0,
      now,
    )
    const inst = new Instance(id, p.worldId, p.worldName, p.ownerId, p.name, p.access, p.capacity, p.persistent, now)
    this.map.set(id, inst)
    return inst
  }

  roleOf(inst: Instance, userId: string): Role {
    if (userId === inst.ownerId) return 'owner'
    const row = getUser(this.app, userId)
    return row && this.app.isAdmin(row) ? 'moderator' : 'member'
  }

  hasInvite(inst: Instance, userId: string, onlyFromOwner: boolean) {
    const now = Date.now()
    return onlyFromOwner
      ? !!this.app.db.get('SELECT 1 FROM instance_invites WHERE instance_id = ? AND user_id = ? AND invited_by = ? AND expires_at > ?', inst.id, userId, inst.ownerId, now)
      : !!this.app.db.get('SELECT 1 FROM instance_invites WHERE instance_id = ? AND user_id = ? AND expires_at > ?', inst.id, userId, now)
  }

  addInvite(inst: Instance, userId: string, invitedBy: string) {
    this.app.db.run(
      'INSERT INTO instance_invites (instance_id, user_id, invited_by, expires_at) VALUES (?, ?, ?, ?) ON CONFLICT(instance_id, user_id, invited_by) DO UPDATE SET expires_at = excluded.expires_at',
      inst.id,
      userId,
      invitedBy,
      Date.now() + INVITE_TTL,
    )
  }

  /** 公開範囲に照らして参加できるか。できなければ理由を返す（定員は見ない） */
  denyReason(inst: Instance, userId: string): string | null {
    const s = this.app.social
    if (inst.kicked.has(userId) && userId !== inst.ownerId) return 'このインスタンスからキックされています'
    if (userId !== inst.ownerId && s.isBlocked(inst.ownerId, userId)) return 'このインスタンスには参加できません'
    if (userId === inst.ownerId) return null
    if (this.roleOf(inst, userId) === 'moderator') return null
    switch (inst.access) {
      case 'public':
        return null
      case 'friends':
        return s.areFriends(inst.ownerId, userId) ? null : '作成者のフレンドだけが参加できます'
      case 'friends+': {
        // 中にいる人（と作成者）のフレンドなら参加できる
        if (s.areFriends(inst.ownerId, userId)) return null
        for (const m of inst.members.values()) if (s.areFriends(m.userId, userId)) return null
        return '中にいる人のフレンドだけが参加できます'
      }
      case 'invite':
        return this.hasInvite(inst, userId, true) ? null : '作成者から招待された人だけが参加できます'
      case 'invite+':
        return this.hasInvite(inst, userId, false) ? null : '招待された人だけが参加できます'
    }
  }

  /** WebSocket の join */
  join(conn: JoinConn, inst: Instance, opts: { hostScore: number; queue: boolean }): JoinResult {
    if (conn.member?.instance === inst) return { ok: false, code: 'already_joined', message: 'すでに参加しています' }
    const reason = this.denyReason(inst, conn.userId)
    if (reason) return { ok: false, code: 'denied', message: reason }
    if ((inst.isFull || inst.queue.length) && !opts.queue) return { ok: false, code: 'full', message: 'インスタンスが満員です' }
    // 1 つの接続が入れるインスタンスは 1 つだけ（前のところからは抜ける）
    this.leave(conn)
    if (inst.isFull || inst.queue.length) {
      const entry: QueueEntry = { conn, instance: inst, hostScore: opts.hostScore, at: Date.now() }
      inst.queue.push(entry)
      conn.queued = entry
      conn.send({ t: 'queued', instanceId: inst.id, position: inst.queue.length })
      return { ok: true }
    }
    this.admit(conn, inst, opts.hostScore)
    return { ok: true }
  }

  private descriptor(m: Member, viewer: Member): PeerDescriptor {
    const row = getUser(this.app, m.userId)
    const d: PeerDescriptor = {
      peerId: m.peerId,
      user: row ? userSummary(this.app, row) : summaryById(this.app, m.userId),
      joinedAt: m.joinedAt,
      hostScore: m.hostScore,
      ticket: m.ticket,
    }
    if (this.hidden(m, viewer)) d.hidden = true
    return d
  }

  /** どちらかがブロックしている組み合わせ。互いに見えず、信号も通さない */
  hidden(a: Member, b: Member) {
    return a.userId !== b.userId && this.app.social.blockedEither(a.userId, b.userId)
  }

  private admit(conn: JoinConn, inst: Instance, hostScore: number) {
    const row = getUser(this.app, conn.userId)
    const role = this.roleOf(inst, conn.userId)
    const peerId = newId(9)
    const member: Member = {
      peerId,
      conn,
      instance: inst,
      userId: conn.userId,
      joinedAt: Date.now(),
      hostScore,
      role,
      ticket: issueTicket(this.app.keys, { iid: inst.id, uid: conn.userId, pid: peerId, name: row?.display_name ?? '', role }),
    }
    const others = [...inst.members.values()]
    inst.members.set(peerId, member)
    inst.emptySince = null
    conn.member = member
    conn.send({
      t: 'joined',
      instance: this.info(inst, conn.userId),
      peerId,
      ticket: member.ticket,
      peers: others.map((o) => this.descriptor(o, member)),
    })
    for (const o of others) o.conn.send({ t: 'peer-joined', peer: this.descriptor(member, o) })
    // 訪問の記録と「最近会った人」
    const db = this.app.db
    db.run('UPDATE worlds SET visit_count = visit_count + 1 WHERE id = ?', inst.worldId)
    db.run('INSERT INTO world_visits (user_id, world_id, at) VALUES (?, ?, ?) ON CONFLICT(user_id, world_id) DO UPDATE SET at = excluded.at', conn.userId, inst.worldId, Date.now())
    for (const o of others) if (!this.hidden(o, member)) this.app.social.recordCoPresence(conn.userId, o.userId, inst.worldName)
    this.app.hub.pushFriendStatus(conn.userId)
  }

  /** 参加中・順番待ちのどちらからも抜ける */
  leave(conn: JoinConn) {
    const q = conn.queued
    if (q) {
      conn.queued = null
      q.instance.queue = q.instance.queue.filter((e) => e !== q)
      this.sendPositions(q.instance)
      this.touchEmpty(q.instance)
    }
    const m = conn.member
    if (!m) return
    conn.member = null
    const inst = m.instance
    inst.members.delete(m.peerId)
    inst.broadcast({ t: 'peer-left', peerId: m.peerId })
    this.touchEmpty(inst)
    this.promote(inst)
    this.app.hub.pushFriendStatus(conn.userId)
  }

  private touchEmpty(inst: Instance) {
    if (!inst.members.size && !inst.queue.length && inst.emptySince === null) inst.emptySince = Date.now()
  }

  /** 空きができたら順番待ちの先頭から入れる */
  promote(inst: Instance) {
    while (!inst.isFull && inst.queue.length) {
      const e = inst.queue.shift()!
      e.conn.queued = null
      if (!e.conn.isOpen) continue
      const reason = this.denyReason(inst, e.conn.userId)
      if (reason) {
        e.conn.send({ t: 'error', code: 'denied', message: reason })
        continue
      }
      this.admit(e.conn, inst, e.hostScore)
    }
    this.sendPositions(inst)
  }

  private sendPositions(inst: Instance) {
    inst.queue.forEach((e, i) => e.conn.send({ t: 'queued', instanceId: inst.id, position: i + 1 }))
  }

  /** 作成者・モデレーターによるキック */
  kick(by: Member, peerId: string, reason: string): JoinResult {
    if (by.role === 'member') return { ok: false, code: 'forbidden', message: 'キックできるのは作成者とモデレーターだけです' }
    const target = by.instance.members.get(peerId)
    if (!target || target === by) return { ok: false, code: 'not_found', message: '相手が見つかりません' }
    if (target.role === 'owner' || (target.role === 'moderator' && by.role !== 'owner')) return { ok: false, code: 'forbidden', message: 'この相手はキックできません' }
    by.instance.kicked.add(target.userId)
    target.conn.send({ t: 'kicked', reason: reason || 'キックされました' })
    this.leave(target.conn)
    return { ok: true }
  }

  /** インスタンスを閉じる（参加者は追い出し、共有ファイルも消す） */
  remove(inst: Instance, reason = 'インスタンスが閉じられました') {
    for (const m of [...inst.members.values()]) {
      m.conn.send({ t: 'kicked', reason })
      m.conn.member = null
    }
    for (const e of inst.queue) {
      e.conn.queued = null
      e.conn.send({ t: 'error', code: 'closed', message: reason })
    }
    const users = new Set([...inst.members.values()].map((m) => m.userId))
    inst.members.clear()
    inst.queue = []
    this.map.delete(inst.id)
    this.deleteRows(inst.id)
    for (const u of users) this.app.hub.pushFriendStatus(u)
  }

  private deleteRows(id: string) {
    const db = this.app.db
    db.run('DELETE FROM instances WHERE id = ?', id)
    db.run('DELETE FROM instance_invites WHERE instance_id = ?', id)
    db.run('DELETE FROM instance_files WHERE instance_id = ?', id)
    rmSync(join(this.app.filesDir, 'instances', id), { recursive: true, force: true })
  }

  /** 空のまま時間が過ぎたインスタンスを消す。期限切れの招待も消す */
  sweep(now = Date.now()) {
    for (const inst of this.all()) {
      if (inst.members.size || inst.queue.length || inst.emptySince === null) continue
      if (now - inst.emptySince > (inst.persistent ? PERSISTENT_TTL : EMPTY_TTL)) this.remove(inst)
    }
    this.app.db.run('DELETE FROM instance_invites WHERE expires_at < ?', now)
  }

  /** 利用者が今いるインスタンス */
  locationOf(userId: string): Instance | null {
    for (const inst of this.map.values()) if (inst.hasUser(userId)) return inst
    return null
  }

  occupantsOfWorld(worldId: string) {
    let n = 0
    for (const inst of this.map.values()) if (inst.worldId === worldId) n += inst.members.size
    return n
  }

  /** viewer から見える参加者（ブロック関係の相手は出さない・同じ人は 1 回） */
  private visibleMembers(inst: Instance, viewerId: string | null): UserSummary[] {
    const seen = new Set<string>()
    const out: UserSummary[] = []
    for (const m of inst.members.values()) {
      if (seen.has(m.userId)) continue
      seen.add(m.userId)
      if (viewerId && m.userId !== viewerId && this.app.social.blockedEither(m.userId, viewerId)) continue
      out.push(summaryById(this.app, m.userId))
    }
    return out
  }

  summary(inst: Instance, viewerId: string | null): InstanceSummary {
    const w = this.app.db.get<WorldRow>(`${WORLD_SELECT} WHERE w.id = ?`, inst.worldId)
    const members = this.visibleMembers(inst, viewerId)
    return {
      id: inst.id,
      worldId: inst.worldId,
      worldName: inst.worldName,
      worldThumbnailUrl: w ? worldSummary(this.app, w).thumbnailUrl : null,
      name: inst.name,
      access: inst.access,
      owner: summaryById(this.app, inst.ownerId),
      occupants: inst.members.size,
      capacity: inst.capacity,
      friends: viewerId ? members.filter((u) => u.id !== viewerId && this.app.social.areFriends(viewerId, u.id)) : [],
      queue: inst.queue.length,
      persistent: inst.persistent,
      createdAt: iso(inst.createdAt),
    }
  }

  info(inst: Instance, viewerId: string | null): InstanceInfo {
    const reason = viewerId ? this.denyReason(inst, viewerId) : 'ログインしてください'
    return { ...this.summary(inst, viewerId), members: this.visibleMembers(inst, viewerId), canJoin: !reason, denyReason: reason }
  }

  /** ブロックしたとき、同じインスタンスにいる相手との接続を切らせる */
  onBlock(a: string, b: string) {
    for (const inst of this.map.values()) {
      const ma = [...inst.members.values()].filter((m) => m.userId === a)
      const mb = [...inst.members.values()].filter((m) => m.userId === b)
      for (const x of ma) for (const y of mb) {
        x.conn.send({ t: 'peer-left', peerId: y.peerId })
        y.conn.send({ t: 'peer-left', peerId: x.peerId })
      }
    }
  }
}
