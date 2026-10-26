// ホーム画面（ワールドに入る前）
import { lazy, Suspense, useState } from 'react'
import { L, useLang } from '../../i18n'
import { useApp } from '../../state/app'
import { useNet } from '../../state/net'
import { SettingsPanel } from '../SettingsPanel'
import { UserIcon } from '../common'
import { CreatorTab } from './CreatorTab'
import { FriendsTab, UserModal } from './FriendsTab'
import { NotificationsTab, ProfileTab } from './ProfileTab'
import { WorldDetail, WorldsTab } from './WorldsTab'
import { goToWorld } from '../join'
import { Icon } from '../icons'

const AvatarsTab = lazy(() => import('./AvatarsTab').then((m) => ({ default: m.AvatarsTab })))

type Tab = 'worlds' | 'friends' | 'avatars' | 'profile' | 'notifications' | 'create' | 'settings'

export const Home: React.FC = () => {
  useLang()
  const me = useApp((s) => s.me)!
  const info = useApp((s) => s.info)
  const notes = useApp((s) => s.notifications)
  const online = useNet((s) => s.online)
  const friends = useNet((s) => s.friends)
  const [tab, setTab] = useState<Tab>('worlds')
  const [user, setUser] = useState<string | null>(null)
  const [world, setWorld] = useState<string | null>(null)
  // スマホ: 左上のボタンで開くメニュー
  const [drawer, setDrawer] = useState(false)
  const go = (t: Tab) => {
    setTab(t)
    setDrawer(false)
  }
  const unread = notes.filter((n) => !n.read).length
  const onlineFriends = friends.filter((f) => f.online).length
  const nav: [Tab, string, string, string, number?][] = [
    ['worlds', 'globe', 'ワールド', 'Worlds'],
    ['friends', 'users', 'フレンド', 'Friends', onlineFriends],
    ['avatars', 'avatar', 'アバター', 'Avatars'],
    ['notifications', 'bell', '通知', 'Alerts', unread],
    ['profile', 'profile', 'プロフィール', 'Profile'],
    ['create', 'tool', '制作', 'Create'],
    ['settings', 'settings', '設定', 'Settings'],
  ]
  return (
    <div className="home">
      <header className="mobile-top">
        <button className="btn ghost icon-btn" onClick={() => setDrawer(true)} aria-label={L('メニュー', 'Menu')}>
          <Icon name="menu" size={24} />
          {(unread > 0 || onlineFriends > 0) && <span className="menu-dot" />}
        </button>
        <div className="mobile-title">{L(...(nav.find((n) => n[0] === tab)!.slice(2, 4) as [string, string]))}</div>
        <img src="/icon.svg" alt="TenTenV" style={{ width: 28, height: 28 }} />
      </header>
      {drawer && <div className="drawer-backdrop" onClick={() => setDrawer(false)} />}
      <aside className={`side${drawer ? ' open' : ''}`}>
        <div className="brand server-box" style={{ fontSize: 20, padding: '4px 10px 12px' }}>
          <img src="/icon.svg" alt="" style={{ width: 30, height: 30 }} />
          TenTenV
        </div>
        {nav.map(([id, icon, ja, en, badge]) => (
          <button key={id} className={`nav${tab === id ? ' on' : ''}`} onClick={() => go(id)}>
            <Icon name={icon} size={20} />
            <span>{L(ja, en)}</span>
            {!!badge && <span className="badge">{badge}</span>}
          </button>
        ))}
        <div className="spacer" style={{ flex: 1 }} />
        {(me.homeWorldId ?? info?.defaultHomeWorldId) && (
          <button className="btn primary server-box" onClick={() => void goToWorld((me.homeWorldId ?? info?.defaultHomeWorldId)!)}>
            <Icon name="home" size={18} /> {L('ホームへ', 'Go home')}
          </button>
        )}
        <div className="list-item server-box" style={{ marginTop: 8 }}>
          <UserIcon user={me} size={30} />
          <div className="grow" style={{ minWidth: 0 }}>
            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{me.displayName}</div>
            <div className="muted small" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              <span className="dot" style={{ background: online ? '#4ade80' : '#f87171' }} /> {info?.name}
            </div>
          </div>
        </div>
      </aside>
      <main className="main">
        {tab === 'worlds' && <WorldsTab openUser={setUser} />}
        {tab === 'friends' && <FriendsTab openUser={setUser} />}
        {tab === 'avatars' && (
          <Suspense fallback={<div className="muted">{L('読み込み中…', 'Loading…')}</div>}>
            <AvatarsTab />
          </Suspense>
        )}
        {tab === 'notifications' && <NotificationsTab openUser={setUser} />}
        {tab === 'profile' && <ProfileTab />}
        {tab === 'create' && <CreatorTab openWorld={setWorld} />}
        {tab === 'settings' && (
          <div className="col" style={{ maxWidth: 760 }}>
            <h1>{L('設定', 'Settings')}</h1>
            <SettingsPanel />
          </div>
        )}
      </main>
      {user && <UserModal userId={user} onClose={() => setUser(null)} />}
      {world && <WorldDetail worldId={world} onClose={() => setWorld(null)} openUser={setUser} />}
    </div>
  )
}
