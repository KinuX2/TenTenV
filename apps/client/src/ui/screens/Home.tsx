// ホーム画面（ワールドに入る前）
import { lazy, Suspense, useEffect, useState } from 'react'
import { L, useLang } from '../../i18n'
import { useApp } from '../../state/app'
import { useNet } from '../../state/net'
import { useSettings } from '../../state/settings'
import { SettingsPanel } from '../SettingsPanel'
import { UserIcon } from '../common'
import { CreatorTab } from './CreatorTab'
import { FriendsTab, UserModal } from './FriendsTab'
import { NotificationsTab, ProfileTab } from './ProfileTab'
import { WorldDetail, WorldsTab } from './WorldsTab'
import { goToWorld } from '../join'
import { Icon } from '../icons'
import { Brand, brandingOf, fallbackLogoOnError } from '../Brand'

const AvatarsTab = lazy(() => import('./AvatarsTab').then((m) => ({ default: m.AvatarsTab })))

type Tab = 'worlds' | 'friends' | 'avatars' | 'profile' | 'notifications' | 'create' | 'settings'

export const Home: React.FC = () => {
  useLang()
  const me = useApp((s) => s.me)!
  const screen = useApp((s) => s.screen)
  const info = useApp((s) => s.info)
  const api = useApp((s) => s.api)
  const brand = brandingOf(info, api?.base ?? null)
  const notes = useApp((s) => s.notifications)
  const online = useNet((s) => s.online)
  const friends = useNet((s) => s.friends)
  const autoEnterVR = useSettings((s) => s.s.autoEnterVR)
  const setSettings = useSettings((s) => s.set)
  const [tab, setTab] = useState<Tab>('worlds')
  const [user, setUser] = useState<string | null>(null)
  const [world, setWorld] = useState<string | null>(null)
  const [creatorVersion, setCreatorVersion] = useState(0)
  // スマホ: 左上のボタンで開くメニュー
  const [drawer, setDrawer] = useState(false)
  useEffect(() => {
    if (screen.kind !== 'home' || !screen.worldId) return
    setTab('worlds')
    setWorld(screen.worldId)
    useApp.getState().setScreen({ kind: 'home' })
  }, [screen])
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
    ['create', 'pen', '制作', 'Create'],
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
        <img src={brand.logo} alt={brand.name} style={brand.layout === 'wide' ? { width: 112, height: 42, objectFit: 'contain' } : { width: 28, height: 28 }} onError={(e) => fallbackLogoOnError(e.currentTarget)} />
      </header>
      {drawer && <div className="drawer-backdrop" onClick={() => setDrawer(false)} />}
      <aside className={`side${drawer ? ' open' : ''}`}>
        <Brand info={info} server={api?.base ?? null} className="brand server-box" logoSize={30} style={{ fontSize: 20, padding: brand.layout === 'wide' ? '4px 2px 12px' : '4px 10px 12px' }} />
        {nav.map(([id, icon, ja, en, badge]) => (
          <button key={id} className={`nav${tab === id ? ' on' : ''}`} onClick={() => go(id)}>
            <Icon name={icon} size={20} />
            <span>{L(ja, en)}</span>
            {!!badge && <span className="badge">{badge}</span>}
          </button>
        ))}
        <div className="spacer" style={{ flex: 1 }} />
        <label className="home-vr-toggle server-box">
          <span>{L('VRモード', 'VR mode')}</span>
          <input type="checkbox" role="switch" checked={autoEnterVR} onChange={(e) => setSettings({ autoEnterVR: e.target.checked })} />
          <span className="home-vr-track" aria-hidden="true" />
        </label>
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
              <span className="dot" style={{ background: online ? 'var(--ok)' : 'var(--bad)' }} /> {info?.name}
            </div>
          </div>
        </div>
      </aside>
      <main className="main">
        {tab === 'worlds' && <WorldsTab />}
        {tab === 'friends' && <FriendsTab openUser={setUser} />}
        {tab === 'avatars' && (
          <Suspense fallback={<div className="muted">{L('読み込み中…', 'Loading…')}</div>}>
            <AvatarsTab />
          </Suspense>
        )}
        {tab === 'notifications' && <NotificationsTab openUser={setUser} />}
        {tab === 'profile' && <ProfileTab />}
        {tab === 'create' && <CreatorTab key={creatorVersion} openWorld={setWorld} />}
        {tab === 'settings' && (
          <div className="col" style={{ maxWidth: 760 }}>
            <h1>{L('設定', 'Settings')}</h1>
            <SettingsPanel />
          </div>
        )}
      </main>
      {user && <UserModal userId={user} onClose={() => setUser(null)} />}
      {world && <WorldDetail worldId={world} onClose={() => (setWorld(null), setCreatorVersion((v) => v + 1))} />}
    </div>
  )
}
