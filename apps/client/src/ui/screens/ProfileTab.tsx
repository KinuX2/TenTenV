// 自分のプロフィール（[67][68][69]）と通知（[80][197]）
import type { NotificationEntry, OnlineStatus } from '@tentenv/protocol'
import { useState } from 'react'
import { formatTime, L } from '../../i18n'
import { useApp } from '../../state/app'
import { refreshSocial } from '../../state/net'
import { Empty, run, statusLabel, STATUS_COLORS, UserIcon } from '../common'
import { joinInstance } from '../join'
import { Icon } from '../icons'

export const ProfileTab: React.FC = () => {
  const api = useApp((s) => s.api)!
  const me = useApp((s) => s.me)!
  const [name, setName] = useState(me.displayName)
  const [bio, setBio] = useState(me.bio)
  const [statusText, setStatusText] = useState(me.statusText)
  const [status, setStatus] = useState<OnlineStatus>(me.status === 'offline' ? 'online' : me.status)
  const [links, setLinks] = useState(me.links.join('\n'))
  const [color, setColor] = useState(me.decoration.color || '#e8ebf5')
  const [frame, setFrame] = useState(me.decoration.frame)
  const save = async () => {
    const r = await run(
      () =>
        api.updateMe({
          displayName: name.trim().slice(0, 32),
          bio: bio.slice(0, 1000),
          statusText: statusText.slice(0, 64),
          status,
          links: links.split('\n').map((l) => l.trim()).filter((l) => /^https?:\/\//.test(l)).slice(0, 5),
          decoration: { color, frame },
        }),
      L('保存しました', 'Saved'),
    )
    if (r) useApp.getState().setMe(r)
  }
  const icon = async (f: File | undefined) => {
    if (!f) return
    const r = await run(() => api.uploadIcon(f), L('アイコンを変えました', 'Icon updated'))
    if (r) useApp.getState().setMe(r)
  }
  return (
    <div className="col" style={{ maxWidth: 640 }}>
      <h1>{L('プロフィール', 'Profile')}</h1>
      <div className="row">
        <UserIcon user={me} size={72} />
        <label className="btn small">
          {L('アイコンを変える', 'Change icon')}
          <input type="file" accept="image/*" hidden onChange={(e) => void icon(e.target.files?.[0])} />
        </label>
        <div className="muted small">{me.handle}</div>
      </div>
      <label className="field">
        {L('表示名', 'Display name')}
        <input className="input" value={name} maxLength={32} onChange={(e) => setName(e.target.value)} />
      </label>
      <div className="field">
        <span className="muted small">{L('状態', 'Status')}</span>
        <div className="row">
          {(['online', 'joinme', 'askme', 'busy'] as OnlineStatus[]).map((s) => (
            <button key={s} className={`btn small${status === s ? ' active' : ''}`} onClick={() => setStatus(s)}>
              <span className="dot" style={{ background: STATUS_COLORS[s] }} /> {statusLabel(s)}
            </button>
          ))}
        </div>
      </div>
      <label className="field">
        {L('ひとこと', 'Status message')}
        <input className="input" value={statusText} maxLength={64} onChange={(e) => setStatusText(e.target.value)} />
      </label>
      <label className="field">
        {L('自己紹介', 'Bio')}
        <textarea className="input" rows={5} value={bio} maxLength={1000} onChange={(e) => setBio(e.target.value)} />
      </label>
      <label className="field">
        {L('リンク（1 行に 1 つ、5 つまで）', 'Links (one per line, up to 5)')}
        <textarea className="input" rows={3} value={links} onChange={(e) => setLinks(e.target.value)} placeholder="https://" />
      </label>
      <div className="field">
        <span className="muted small">{L('名前の装飾', 'Name decoration')}</span>
        <div className="row">
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
          {(['none', 'round', 'star', 'heart'] as const).map((f) => (
            <button key={f} className={`btn small${frame === f ? ' active' : ''}`} onClick={() => setFrame(f)}>
              {f === 'none' ? L('なし', 'None') : <Icon name={f === 'round' ? 'circle' : f} size={16} />}
            </button>
          ))}
          <span style={{ color, fontWeight: 800 }}>
            {frame === 'star' || frame === 'heart' ? <Icon name={frame} size={16} style={{ fill: 'currentColor', marginRight: 4, verticalAlign: '-2px' }} /> : null}
            {name}
          </span>
        </div>
      </div>
      <button className="btn primary" onClick={() => void save()}>
        {L('保存', 'Save')}
      </button>
    </div>
  )
}

export const NotificationsTab: React.FC<{ openUser: (id: string) => void }> = ({ openUser }) => {
  const api = useApp((s) => s.api)!
  const list = useApp((s) => s.notifications)
  const markRead = async () => {
    await run(() => api.readNotifications())
    void refreshSocial()
  }
  return (
    <div className="col">
      <div className="row">
        <h1 className="grow">{L('通知', 'Notifications')}</h1>
        <button className="btn small" onClick={() => void markRead()}>
          {L('すべて既読にする', 'Mark all read')}
        </button>
      </div>
      {list.length === 0 && <Empty>{L('通知はありません', 'No notifications')}</Empty>}
      <div className="list">
        {list.map((n) => (
          <NotificationRow key={n.id} n={n} openUser={openUser} />
        ))}
      </div>
    </div>
  )
}

const NotificationRow: React.FC<{ n: NotificationEntry; openUser: (id: string) => void }> = ({ n, openUser }) => {
  const api = useApp((s) => s.api)!
  const me = useApp((s) => s.me)!
  const text =
    n.kind === 'friend_request'
      ? L('フレンド申請が届きました', 'sent you a friend request')
      : n.kind === 'friend_accepted'
        ? L('フレンドになりました', 'accepted your friend request')
        : n.kind === 'invite'
          ? L(`「${n.worldName ?? ''}」へ招待されました`, `invited you to ${n.worldName ?? ''}`)
          : n.kind === 'request_invite'
            ? L('あなたのいる場所への参加を希望しています', 'asks to join you')
            : n.kind === 'invite_declined'
              ? L('招待を断りました', 'declined your invite')
              : n.message
  const del = async () => {
    await run(() => api.deleteNotification(n.id))
    void refreshSocial()
  }
  return (
    <div className="list-item" style={{ opacity: n.read ? 0.7 : 1 }}>
      {n.from && <UserIcon user={n.from} />}
      <div className="grow">
        <div>
          {n.from && (
            <b style={{ cursor: 'pointer' }} onClick={() => openUser(n.from!.id)}>
              {n.from.displayName}{' '}
            </b>
          )}
          {text}
        </div>
        {n.message && n.kind !== 'system' && <div className="small">「{n.message}」</div>}
        <div className="muted small">{formatTime(n.createdAt)}</div>
      </div>
      {n.kind === 'friend_request' && n.from && (
        <button className="btn small primary" onClick={() => void run(async () => (await api.addFriend(n.from!.id), await del()), L('フレンドになりました', 'Accepted'))}>
          {L('承認', 'Accept')}
        </button>
      )}
      {n.kind === 'invite' && n.instanceId && (
        <button className="btn small primary" onClick={() => joinInstance(n.instanceId!)}>
          {L('参加', 'Join')}
        </button>
      )}
      {n.kind === 'request_invite' && n.from && (
        <button
          className="btn small primary"
          onClick={() =>
            void run(async () => {
              const loc = (await api.user(me.id)).location
              if (!loc) throw new Error(L('今インスタンスにいません', 'You are not in an instance'))
              await api.invite(n.from!.id, loc.instanceId)
              await del()
            }, L('招待しました', 'Invited'))
          }
        >
          {L('招待する', 'Invite')}
        </button>
      )}
      <button className="btn ghost small" onClick={() => void del()}>
        <Icon name="close" size={16} />
      </button>
    </div>
  )
}
