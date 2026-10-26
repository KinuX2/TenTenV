// 通報と、管理者による対応
import type { ReportInput } from '@tentenv/protocol'
import type { App } from '../app'
import { requireAdmin, requireUser } from '../auth'
import { badRequest, checkId, field, KeyedLimiter, notFound, readJson, tooMany } from '../http'
import { newId } from '../social'
import { iso, summaryById, type AvatarRow, type WorldRow } from '../views'
import { deleteAvatar } from './avatars'
import { deleteWorld } from './worlds'

const TARGETS: readonly ReportInput['targetType'][] = ['user', 'world', 'avatar']
const REASONS: readonly ReportInput['reason'][] = ['harassment', 'spam', 'inappropriate', 'cheating', 'copyright', 'other']
const ACTIONS = ['dismiss', 'ban', 'remove'] as const

interface ReportRow {
  id: string
  reporter_id: string
  target_type: ReportInput['targetType']
  target_id: string
  reason: ReportInput['reason']
  detail: string
  status: string
  action: string | null
  resolved_by: string | null
  created_at: number
  resolved_at: number | null
}

/** 利用者を利用停止にする（セッションを消し、接続も切る） */
export const banUser = (app: App, userId: string) => {
  app.db.run('UPDATE users SET banned = 1 WHERE id = ?', userId)
  app.db.run('DELETE FROM sessions WHERE user_id = ?', userId)
  app.hub.disconnectUser(userId, 'banned')
}

export const reportRoutes = (app: App) => {
  const r = app.router
  const db = app.db
  const limiter = new KeyedLimiter(10, 60_000)

  /** 通報の対象の持ち主（ワールドの制作者など） */
  const ownerOf = (type: ReportInput['targetType'], id: string): string | null => {
    if (type === 'user') return db.get<{ id: string }>('SELECT id FROM users WHERE id = ?', id)?.id ?? null
    if (type === 'world') return db.get<WorldRow>('SELECT author_id FROM worlds WHERE id = ?', id)?.author_id ?? null
    return db.get<AvatarRow>('SELECT owner_id FROM avatars WHERE id = ?', id)?.owner_id ?? null
  }

  r.post('/api/reports', async (req) => {
    const me = requireUser(app, req)
    if (!limiter.take(me.id)) throw tooMany()
    const b = await readJson(req.raw, 16 * 1024)
    const targetType = field.oneOf(b, 'targetType', TARGETS)
    const reason = field.oneOf(b, 'reason', REASONS)
    const targetId = field.reqStr(b, 'targetId', 64)
    const detail = field.str(b, 'detail', 2000) ?? ''
    if (!targetType || !reason) throw badRequest('targetType と reason を指定してください')
    if (!ownerOf(targetType, checkId(targetId))) throw notFound('通報の対象が見つかりません')
    db.run('INSERT INTO reports (id, reporter_id, target_type, target_id, reason, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', newId(), me.id, targetType, targetId, reason, detail, Date.now())
  })

  r.get('/api/admin/reports', (req) => {
    requireAdmin(app, req)
    const status = req.query.get('status') ?? 'open'
    const rows = status === 'all' ? db.all<ReportRow>('SELECT * FROM reports ORDER BY created_at DESC LIMIT 500') : db.all<ReportRow>('SELECT * FROM reports WHERE status = ? ORDER BY created_at DESC LIMIT 500', status)
    return rows.map((x) => ({
      id: x.id,
      reporter: summaryById(app, x.reporter_id),
      targetType: x.target_type,
      targetId: x.target_id,
      targetOwner: (() => {
        const o = ownerOf(x.target_type, x.target_id)
        return o ? summaryById(app, o) : null
      })(),
      reason: x.reason,
      detail: x.detail,
      status: x.status,
      action: x.action,
      createdAt: iso(x.created_at),
      resolvedAt: x.resolved_at ? iso(x.resolved_at) : null,
    }))
  })

  r.post('/api/admin/reports/:id/resolve', async (req) => {
    const admin = requireAdmin(app, req)
    const rep = db.get<ReportRow>('SELECT * FROM reports WHERE id = ?', checkId(req.params.id, '通報'))
    if (!rep) throw notFound('通報が見つかりません')
    const b = await readJson(req.raw, 4096)
    const action = field.oneOf(b, 'action', ACTIONS)
    if (!action) throw badRequest('action を指定してください')
    const owner = ownerOf(rep.target_type, rep.target_id)
    if (action === 'ban' && owner) {
      if (owner === admin.id) throw badRequest('自分自身は停止できません')
      banUser(app, owner)
    }
    if (action === 'remove') {
      if (rep.target_type === 'world') {
        if (db.get('SELECT 1 FROM worlds WHERE id = ?', rep.target_id)) deleteWorld(app, rep.target_id)
      } else if (rep.target_type === 'avatar') {
        const a = db.get<AvatarRow>('SELECT * FROM avatars WHERE id = ?', rep.target_id)
        if (a) deleteAvatar(app, a)
      } else if (owner && owner !== admin.id) banUser(app, owner)
    }
    // 同じ対象への未対応の通報もまとめて閉じる
    db.run(
      "UPDATE reports SET status = ?, action = ?, resolved_by = ?, resolved_at = ? WHERE (id = ? OR (target_type = ? AND target_id = ? AND status = 'open'))",
      action === 'dismiss' ? 'dismissed' : 'resolved',
      action,
      admin.id,
      Date.now(),
      rep.id,
      rep.target_type,
      rep.target_id,
    )
  })
}
