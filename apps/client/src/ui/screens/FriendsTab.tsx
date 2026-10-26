// フレンド（[70]〜[80]）と、ほかの人のプロフィール（[67]〜[69]）
import type { FriendEntry, UserProfile, UserSummary } from '@tentenv/protocol'
import { useState } from 'react'
import { formatTime, L } from '../../i18n'
import { useApp } from '../../state/app'
import { refreshSocial, useNet } from '../../state/net'
import { accessLabel, Empty, Modal, run, STATUS_COLORS, statusLabel, useAsync, UserIcon, WorldTile } from '../common'
import { joinInstance } from '../join'
import { activeEngine } from '../../state/activeEngine'
import { Icon } from '../icons'

export const FriendsTab: React.FC<{ openUser: (id: string) => void }> = ({ openUser }) => {
  const api = useApp((s) => s.api)!
  const friends = useNet((s) => s.friends)
  const req = useAsync(() => api.friendRequests(), [api, friends.length])
  const recent = useAsync(() => api.recent(), [api])
  const [q, setQ] = useState('')
  const [found, setFound] = useState<UserSummary[] | null>(null)
  const online = friends.filter((f) => f.online).sort((a, b) => (b.location ? 1 : 0) - (a.location ? 1 : 0))
  const offline = friends.filter((f) => !f.online)
  const search = async () => {
    const r = await run(() => api.users(q.trim()))
    if (r) setFound(r)
  }
  return (
    <div className="col">
      <h1>{L('フレンド', 'Friends')}</h1>
      <div className="row">
        <input className="input grow" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void search()} placeholder={L('ユーザーを探す（名前・@ハンドル）', 'Find users (name or @handle)')} />
        <button className="btn" onClick={() => void search()}>
          {L('検索', 'Search')}
        </button>
      </div>
      {found && (
        <div className="list">
          {found.length === 0 && <div className="muted">{L('見つかりません', 'No results')}</div>}
          {found.map((u) => (
            <UserRow key={u.id} u={u} onClick={() => openUser(u.id)} />
          ))}
        </div>
      )}
      {req.data && req.data.incoming.length > 0 && (
        <div className="col">
          <div className="section-title">{L('届いた申請', 'Requests')}</div>
          {req.data.incoming.map((u) => (
            <div key={u.id} className="list-item">
              <UserIcon user={u} />
              <div className="grow click" style={{ cursor: 'pointer' }} onClick={() => openUser(u.id)}>
                {u.displayName}
              </div>
              <button className="btn small primary" onClick={() => void run(async () => (await api.addFriend(u.id), await refreshSocial(), req.reload()), L('フレンドになりました', 'Accepted'))}>
                {L('承認', 'Accept')}
              </button>
              <button className="btn small" onClick={() => void run(async () => (await api.removeFriend(u.id), req.reload()))}>
                {L('断る', 'Decline')}
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="section-title">
        {L('オンライン', 'Online')} ({online.length})
      </div>
      {online.length === 0 && <Empty>{L('オンラインのフレンドはいません', 'No friends online')}</Empty>}
      <div className="list">
        {online.map((f) => (
          <FriendRow key={f.id} f={f} onClick={() => openUser(f.id)} />
        ))}
      </div>
      {offline.length > 0 && (
        <>
          <div className="section-title">
            {L('オフライン', 'Offline')} ({offline.length})
          </div>
          <div className="list">
            {offline.map((f) => (
              <FriendRow key={f.id} f={f} onClick={() => openUser(f.id)} />
            ))}
          </div>
        </>
      )}
      {req.data && req.data.outgoing.length > 0 && (
        <>
          <div className="section-title">{L('申請中', 'Pending')}</div>
          <div className="list">
            {req.data.outgoing.map((u) => (
              <div key={u.id} className="list-item">
                <UserIcon user={u} />
                <span className="grow">{u.displayName}</span>
                <button className="btn small" onClick={() => void run(async () => (await api.removeFriend(u.id), req.reload()))}>
                  {L('取り消す', 'Cancel')}
                </button>
              </div>
            ))}
          </div>
        </>
      )}
      <div className="section-title">{L('最近一緒に遊んだ人', 'Recently met')}</div>
      <div className="list">
        {recent.data?.length === 0 && <div className="muted">{L('まだいません', 'Nobody yet')}</div>}
        {recent.data?.slice(0, 30).map((r) => (
          <div key={r.user.id} className="list-item click" onClick={() => openUser(r.user.id)}>
            <UserIcon user={r.user} />
            <div className="grow">
              <div>{r.user.displayName}</div>
              <div className="muted small">
                {r.worldName} · {formatTime(r.at)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

const UserRow: React.FC<{ u: UserSummary; onClick: () => void }> = ({ u, onClick }) => (
  <div className="list-item click" onClick={onClick}>
    <UserIcon user={u} />
    <div className="grow">
      <div>{u.displayName}</div>
      <div className="muted small">{u.statusText || statusLabel(u.status)}</div>
    </div>
  </div>
)

const FriendRow: React.FC<{ f: FriendEntry; onClick: () => void }> = ({ f, onClick }) => (
  <div className="list-item click" onClick={onClick}>
    <UserIcon user={f} />
    <span className="dot" style={{ background: f.online ? (STATUS_COLORS[f.status] ?? STATUS_COLORS.online) : STATUS_COLORS.offline }} />
    <div className="grow">
      <div>{f.displayName}</div>
      <div className="muted small">
        {f.location ? `${f.location.worldName} · ${accessLabel(f.location.access)}` : f.online ? f.statusText || statusLabel(f.status) : L('オフライン', 'Offline')}
      </div>
    </div>
    {f.location && (
      <button
        className="btn small primary"
        onClick={(e) => {
          e.stopPropagation()
          joinInstance(f.location!.instanceId)
        }}
      >
        {L('参加', 'Join')}
      </button>
    )}
  </div>
)

export const UserModal: React.FC<{ userId: string; onClose: () => void }> = ({ userId, onClose }) => {
  const api = useApp((s) => s.api)!
  const me = useApp((s) => s.me)!
  const u = useAsync<UserProfile>(() => api.user(userId), [api, userId])
  const p = u.data
  const isMe = userId === me.id
  const engine = activeEngine()
  const [reporting, setReporting] = useState(false)
  const act = async (f: () => Promise<unknown>, ok?: string) => {
    await run(f, ok)
    u.reload()
    void refreshSocial()
  }
  return (
    <Modal title={p?.displayName ?? '…'} onClose={onClose} wide>
      {u.error && <div className="err">{u.error}</div>}
      {p && (
        <>
          <div className="row">
            <UserIcon user={p} size={72} />
            <div className="grow col" style={{ gap: 4 }}>
              <div style={{ fontWeight: 800, fontSize: 20, color: p.decoration.color || undefined }}>
                {p.decoration.frame === 'star' || p.decoration.frame === 'heart' ? <Icon name={p.decoration.frame} size={18} style={{ fill: 'currentColor', marginRight: 6, verticalAlign: '-3px' }} /> : null}
                {p.displayName}
              </div>
              <div className="muted small">{p.handle}</div>
              <div className="row small">
                <span className="dot" style={{ background: STATUS_COLORS[p.status] ?? STATUS_COLORS.offline }} />
                {p.statusText || statusLabel(p.status)}
              </div>
            </div>
          </div>
          {p.bio && <div style={{ whiteSpace: 'pre-wrap' }}>{p.bio}</div>}
          {p.links.length > 0 && (
            <div className="row">
              {p.links.map((l) => (
                <a key={l} href={l} target="_blank" rel="noreferrer noopener" className="small">
                  <Icon name="link" size={14} style={{ verticalAlign: '-2px' }} /> {l.replace(/^https?:\/\//, '')}
                </a>
              ))}
            </div>
          )}
          {p.location && (
            <div className="list-item">
              <div className="grow">
                {L('いる場所', 'Location')}: {p.location.worldName} · {accessLabel(p.location.access)}
              </div>
              <button className="btn small primary" onClick={() => (joinInstance(p.location!.instanceId), onClose())}>
                {L('参加', 'Join')}
              </button>
            </div>
          )}
          {!isMe && (
            <div className="row">
              {p.friendState === 'friends' ? (
                <button className="btn small" onClick={() => void act(() => api.removeFriend(p.id), L('フレンドを解除しました', 'Unfriended'))}>
                  {L('フレンドを解除', 'Unfriend')}
                </button>
              ) : p.friendState === 'outgoing' ? (
                <button className="btn small" onClick={() => void act(() => api.removeFriend(p.id))}>
                  {L('申請を取り消す', 'Cancel request')}
                </button>
              ) : (
                <button className="btn small primary" onClick={() => void act(() => api.addFriend(p.id), p.friendState === 'incoming' ? L('フレンドになりました', 'Accepted') : L('申請しました', 'Request sent'))}>
                  {p.friendState === 'incoming' ? L('申請を承認', 'Accept request') : L('フレンド申請', 'Add friend')}
                </button>
              )}
              {engine && (
                <button className="btn small" onClick={() => void act(() => api.invite(p.id, engine.ctx.instance.id), L('招待しました', 'Invited'))}>
                  {L('今いる場所へ招待', 'Invite here')}
                </button>
              )}
              {p.location && (
                <button className="btn small" onClick={() => void act(() => api.requestInvite(p.id), L('参加を申請しました', 'Requested'))}>
                  {L('参加を申請', 'Request invite')}
                </button>
              )}
              <button className="btn small" onClick={() => void act(() => api.favorite('user', p.id, true), L('お気に入りに入れました', 'Favorited'))}>
                <Icon name="star" size={15} /> {L('お気に入り', 'Favorite')}
              </button>
              <button className="btn small danger" onClick={() => void act(async () => {
                await api.block(p.id)
              }, L('ブロックしました', 'Blocked'))}>
                {L('ブロック', 'Block')}
              </button>
              <button className="btn small" onClick={() => setReporting(true)}>
                {L('通報', 'Report')}
              </button>
            </div>
          )}
          {p.mutualFriends && p.mutualFriends.length > 0 && (
            <div className="col">
              <div className="section-title">{L('共通のフレンド', 'Mutual friends')}</div>
              <div className="row">
                {p.mutualFriends.map((f) => (
                  <span key={f.id} className="tag">
                    {f.displayName}
                  </span>
                ))}
              </div>
            </div>
          )}
          {p.worlds && p.worlds.length > 0 && (
            <div className="col">
              <div className="section-title">{L('公開している作品', 'Worlds')}</div>
              <div className="grid">
                {p.worlds.map((w) => (
                  <WorldTile key={w.id} w={w} onClick={() => {}} />
                ))}
              </div>
            </div>
          )}
          {reporting && <ReportModal targetType="user" targetId={p.id} onClose={() => setReporting(false)} />}
        </>
      )}
    </Modal>
  )
}

export const ReportModal: React.FC<{ targetType: 'user' | 'world' | 'avatar'; targetId: string; onClose: () => void }> = ({ targetType, targetId, onClose }) => {
  const api = useApp((s) => s.api)!
  const [reason, setReason] = useState<'harassment' | 'spam' | 'inappropriate' | 'cheating' | 'copyright' | 'other'>('harassment')
  const [detail, setDetail] = useState('')
  const reasons = [
    ['harassment', L('嫌がらせ', 'Harassment')],
    ['spam', L('迷惑行為・スパム', 'Spam')],
    ['inappropriate', L('不適切な内容', 'Inappropriate')],
    ['cheating', L('不正なクライアント', 'Cheating client')],
    ['copyright', L('権利の侵害', 'Copyright')],
    ['other', L('そのほか', 'Other')],
  ] as const
  const send = async () => {
    const r = await run(() => api.report({ targetType, targetId, reason, detail }), L('通報しました。親サーバーの運営者が確認します', 'Reported to the server operators'))
    if (r !== null) onClose()
  }
  return (
    <Modal title={L('通報', 'Report')} onClose={onClose} footer={<button className="btn primary" onClick={() => void send()}>{L('送る', 'Send')}</button>}>
      <div className="row">
        {reasons.map(([v, label]) => (
          <button key={v} className={`btn small${reason === v ? ' active' : ''}`} onClick={() => setReason(v)}>
            {label}
          </button>
        ))}
      </div>
      <textarea className="input" rows={4} value={detail} maxLength={1000} onChange={(e) => setDetail(e.target.value)} placeholder={L('くわしい内容（任意）', 'Details (optional)')} />
    </Modal>
  )
}
