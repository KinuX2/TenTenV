// ワールドの中のメニューのページ（共通部品）。画面と VR で同じタブ・同じ項目を出す
import type { AccessLevel, AvatarInfo, FriendEntry, InstanceSummary, NotificationEntry, UserProfile, WorldInfo } from '@tentenv/protocol'
import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { formatTime, L } from '../../i18n'
import { DEFAULT_AVATAR, useApp } from '../../state/app'
import { BUNDLED_AVATARS } from '../../avatar/bundled'
import { useModeration } from '../../state/moderation'
import { refreshSocial, useNet } from '../../state/net'
import { useSettings } from '../../state/settings'
import type { WorldEngine } from '../../world/engine'
import { actions, EXPRESSIONS, SLEEP_POSES } from '../actions'
import { accessLabel, run, statusLabel, useAsync } from '../common'
import { goToWorld, instanceLink, joinInstance } from '../join'
import { useMenu } from '../menuBus'
import { uiBridge } from '../bridge'
import { useTools } from '../../features/tools'
import { bodyTracking } from '../../features/bodyTracking'
import { useAvatarExt } from '../../state/avatarExt'
import { SettingsItems } from './settingsItems'
import { pct, type MenuItem, type MenuTab } from './model'
import { usePortalPlacement } from '../../world/portalState'
import { placePortal } from '../../world/PlacedPortals'

export interface PageProps {
  engine: WorldEngine
  /** VR の板に出している */
  vr: boolean
  close: () => void
  /** VR を終える（VR のときだけ） */
  exitVR?: () => void
  render: (items: MenuItem[]) => ReactNode
}

/** ページ定義。下部バーとクイックリンクで共用する。 */
export const useMenuTabs = (engine: WorldEngine): MenuTab[] => {
  const dev = engine.ctx.dev
  const unread = useApp((s) => s.notifications.filter((n) => !n.read).length)
  const t = (id: string, icon: string, ja: string, en: string): MenuTab => ({ id, icon: { icon }, label: L(ja, en) })
  return [
    t('main', 'home', 'メイン', 'Main'),
    { id: 'expressions', icon: { face: 'happy' }, label: L('表情', 'Expressions') },
    t('poses', 'bed', 'ポーズ', 'Poses'),
    t('tools', 'sparkle', '道具', 'Tools'),
    t('friends', 'users', 'フレンド', 'Friends'),
    t('chat', 'chat', 'チャット', 'Chat'),
    t('avatars', 'avatar', 'アバター', 'Avatars'),
    ...(!dev ? [t('worlds', 'globe', 'ワールド', 'Worlds'), t('instance', 'door', 'インスタンス', 'Instance'), { ...t('notifications', 'bell', '通知', 'Alerts'), label: L('通知', 'Alerts') + (unread ? ` (${unread})` : '') }] : []),
    t('settings', 'settings', '設定', 'Settings'),
    t('debug', 'bug', 'デバッグ', 'Debug'),
  ]
}

const confirmThen = async (message: string, f: () => void) => {
  if (await uiBridge.confirm({ message })) f()
}

// ---------------------------------------------------------------- メイン

const MainItems: React.FC<PageProps> = ({ engine, vr, close, exitVR, render }) => {
  const muted = useMenu((m) => m.muted)
  const me = useApp((s) => s.me)
  const info = useApp((s) => s.info)
  const t = useTools()
  const openPage = (page: 'worlds' | 'avatars' | 'expressions' | 'poses' | 'instance' | 'notifications') => useMenu.getState().setPage(page)
  const calibrateTrackers = () => {
    if (!bodyTracking.available) {
      uiBridge.notify(L('腰・左右の足のトラッカーを接続してください', 'Connect the hip and both foot trackers'))
      return
    }
    bodyTracking.calibrate()
    close()
  }
  const items: MenuItem[] = [
    { t: 'section', title: L('クイックリンク', 'Quick Links') },
    { t: 'buttons', size: 'big', items: [
      ...(!engine.ctx.dev ? [{ label: L('ワールド', 'Worlds'), icon: { icon: 'globe' }, onClick: () => openPage('worlds') }] : []),
      { label: L('アバター', 'Avatars'), icon: { icon: 'avatar' }, onClick: () => openPage('avatars') },
      { label: L('表情', 'Expressions'), icon: { face: 'happy' }, onClick: () => openPage('expressions') },
      { label: L('ポーズ', 'Poses'), icon: { icon: 'bed' }, onClick: () => openPage('poses') },
    ] },
    { t: 'section', title: L('クイックアクション', 'Quick Actions') },
    {
      t: 'buttons',
      size: 'big',
      items: [
        { label: muted ? L('ミュート中', 'Muted') : L('マイク ON', 'Mic on'), icon: { icon: muted ? 'micOff' : 'mic' }, on: muted, onClick: actions.toggleMute },
        { label: L('リスポーン', 'Respawn'), icon: { icon: 'respawn' }, onClick: () => (actions.respawn(), close()) },
        { label: bodyTracking.calibrated ? L('フルトラ再調整', 'Recalibrate body') : L('フルトラ調整', 'Calibrate body'), icon: { icon: 'stand' }, on: bodyTracking.available && !bodyTracking.calibrated, onClick: calibrateTrackers },
        { label: L('鏡', 'Mirror'), icon: { icon: 'mirror' }, on: t.mirror, onClick: () => actions.tool({ mirror: !t.mirror }) },
        { label: L('フェイスミラー', 'Face mirror'), icon: { icon: 'selfie' }, on: t.faceMirror, onClick: () => actions.tool({ faceMirror: !t.faceMirror }) },
        ...(me?.homeWorldId || info?.defaultHomeWorldId ? [{ label: L('ホームワールド', 'Home world'), icon: { icon: 'home' }, onClick: actions.goHome }] : []),
        ...(vr && exitVR ? [{ label: L('VR を終える', 'Exit VR'), icon: { icon: 'vr' }, onClick: exitVR }] : []),
        { label: L('退出', 'Leave'), icon: { icon: 'leave' }, danger: true, onClick: () => void confirmThen(L('ワールドから出ますか？', 'Leave this world?'), actions.leave) },
      ],
    },
    {
      t: 'note',
      text: vr
        ? L('左スティック: 移動 · 右スティック: 向き · トリガー: 押す · グリップ: つかむ · 左手の Y: メニュー', 'Left stick: move · Right stick: turn · Trigger: press · Grip: grab · Left Y: menu')
        : L('操作: WASD 移動 · Space ジャンプ · C しゃがむ · Z 伏せる · Enter チャット · M ミュート · V 押して話す · H 三人称 · ` リスポーン', 'Controls: WASD move · Space jump · C crouch · Z prone · Enter chat · M mute · V push-to-talk · H 3rd person · ` respawn'),
    },
  ]
  return <>{render(items)}</>
}

// ---------------------------------------------------------------- 表情

const ExpressionItems: React.FC<PageProps> = ({ render }) => {
  const ext = useAvatarExt((s) => s.ext)
  const active = useAvatarExt((s) => s.active)
  const items: MenuItem[] = []
  if (ext && (ext.outfits?.length || ext.actions?.length)) {
    items.push({ t: 'section', title: L('アバターのアクション', 'Avatar actions') })
    items.push({
      t: 'buttons',
      size: 'big',
      items: [
        ...(ext.outfits ?? []).map((o) => ({ key: `o:${o.id}`, label: o.label, icon: { icon: 'shirt' }, on: active.has(o.id), onClick: () => actions.avatarAction(o.id) })),
        ...(ext.actions ?? []).map((x) => ({ key: `a:${x.id}`, label: x.label, icon: x.kind === 'toggle' ? { icon: 'toggle' } : x.kind === 'emote' ? { icon: 'emote' } : { face: 'happy' }, on: x.kind === 'toggle' && active.has(x.id), onClick: () => actions.avatarAction(x.id) })),
      ],
    })
  }
  items.push(
    { t: 'section', title: L('表情', 'Expression') },
    { t: 'buttons', size: 'big', items: EXPRESSIONS.map((e) => ({ key: String(e.id), label: L(e.ja, e.en), icon: { face: e.id ?? 'auto' }, onClick: () => actions.setExpression(e.id) })) },
  )
  return <>{render(items)}</>
}

// ---------------------------------------------------------------- ポーズ

const PoseItems: React.FC<PageProps> = ({ render }) => {
  const autoSleep = useSettings((s) => s.s.autoSleep)
  return <>{render([
    { t: 'section', title: L('寝る・横になる', 'Lie down') },
    { t: 'buttons', size: 'big', items: SLEEP_POSES.map((p) => ({ key: String(p.id), label: L(p.ja, p.en), icon: { icon: p.id === 0 ? 'stand' : 'bed' }, onClick: () => actions.setSleep(p.id) })) },
    { t: 'toggle', label: L('寝転びの自動判定（VR）', 'Auto sleep pose (VR)'), value: autoSleep, onChange: (v) => useSettings.getState().set({ autoSleep: v }) },
  ])}</>
}

// ---------------------------------------------------------------- 道具

const ToolItems: React.FC<PageProps> = ({ render }) => {
  const t = useTools()
  const items: MenuItem[] = [
    { t: 'section', title: L('鏡', 'Mirrors') },
    {
      t: 'buttons',
      size: 'big',
      items: [
        { label: L('パーソナルミラー', 'Personal mirror'), icon: { icon: 'mirror' }, on: t.mirror, onClick: () => actions.tool({ mirror: !t.mirror }) },
        { label: L('フェイスミラー', 'Face mirror'), icon: { icon: 'selfie' }, on: t.faceMirror, onClick: () => actions.tool({ faceMirror: !t.faceMirror }) },
      ],
    },
  ]
  if (t.faceMirror) items.push(
    { t: 'section', title: L('フェイスミラー', 'Face mirror') },
    { t: 'range', label: L('不透明度', 'Opacity'), value: t.faceMirrorOpacity, min: 0.1, max: 1, step: 0.05, format: pct, onChange: (faceMirrorOpacity) => actions.tool({ faceMirrorOpacity }) },
    { t: 'section', title: L('PC・スマホでの表示', 'Desktop and mobile') },
    { t: 'dropdown', label: L('表示位置', 'Anchor'), value: t.faceMirrorDesktopAnchor, options: [
      { v: 'center', label: L('正面', 'Center') },
      { v: 'leftTop', label: L('左上', 'Top left') },
      { v: 'rightTop', label: L('右上', 'Top right') },
      { v: 'leftBottom', label: L('左下', 'Bottom left') },
      { v: 'rightBottom', label: L('右下', 'Bottom right') },
    ], onChange: (faceMirrorDesktopAnchor) => actions.tool({ faceMirrorDesktopAnchor: faceMirrorDesktopAnchor as typeof t.faceMirrorDesktopAnchor }) },
    { t: 'range', label: L('大きさ', 'Size'), value: t.faceMirrorSize, min: 0.08, max: 0.5, step: 0.01, format: pct, onChange: (faceMirrorSize) => actions.tool({ faceMirrorSize }) },
    { t: 'range', label: L('左右位置', 'Horizontal position'), value: t.faceMirrorDesktopX, min: -1, max: 1, step: 0.05, format: (v) => v.toFixed(2), onChange: (faceMirrorDesktopX) => actions.tool({ faceMirrorDesktopX }) },
    { t: 'range', label: L('上下位置', 'Vertical position'), value: t.faceMirrorDesktopY, min: -1, max: 1, step: 0.05, format: (v) => v.toFixed(2), onChange: (faceMirrorDesktopY) => actions.tool({ faceMirrorDesktopY }) },
    { t: 'section', title: L('VR での表示', 'VR') },
    { t: 'dropdown', label: L('表示位置', 'Anchor'), value: t.faceMirrorAnchor, options: [
      { v: 'center', label: L('正面', 'Center') },
      { v: 'leftTop', label: L('左上', 'Top left') },
      { v: 'rightTop', label: L('右上', 'Top right') },
      { v: 'leftBottom', label: L('左下', 'Bottom left') },
      { v: 'rightBottom', label: L('右下', 'Bottom right') },
    ], onChange: (faceMirrorAnchor) => actions.tool({ faceMirrorAnchor: faceMirrorAnchor as typeof t.faceMirrorAnchor }) },
    { t: 'range', label: L('大きさ', 'Size'), value: t.faceMirrorVrSize, min: 0.08, max: 0.5, step: 0.01, format: pct, onChange: (faceMirrorVrSize) => actions.tool({ faceMirrorVrSize }) },
    { t: 'range', label: L('左右位置', 'Horizontal position'), value: t.faceMirrorVrX, min: -1, max: 1, step: 0.05, format: (v) => v.toFixed(2), onChange: (faceMirrorVrX) => actions.tool({ faceMirrorVrX }) },
    { t: 'range', label: L('上下位置', 'Vertical position'), value: t.faceMirrorVrY, min: -1, max: 1, step: 0.05, format: (v) => v.toFixed(2), onChange: (faceMirrorVrY) => actions.tool({ faceMirrorVrY }) },
    { t: 'section', title: L('顔の撮影', 'Face framing') },
    { t: 'range', label: L('撮影範囲', 'Framing'), value: t.faceMirrorCaptureScale, min: 0.6, max: 1.8, step: 0.05, format: pct, onChange: (faceMirrorCaptureScale) => actions.tool({ faceMirrorCaptureScale }) },
    { t: 'range', label: L('撮影高さ', 'Vertical framing'), value: t.faceMirrorCaptureY, min: -0.2, max: 0.2, step: 0.01, format: (v) => `${Math.round(v * 100)}cm`, onChange: (faceMirrorCaptureY) => actions.tool({ faceMirrorCaptureY }) },
  )
  items.push({ t: 'note', text: L('パーソナルミラーは下の取っ手を押すと持てます（VR は取っ手の近くでグリップ）。もう一度押すと置きます。', 'Press the handle under the personal mirror to carry it (grip near it in VR). Press again to put it down.') })
  return <>{render(items)}</>
}

// ---------------------------------------------------------------- 参加者（プロフィール・通報も同じページの中で）

const REPORT_REASONS = [
  ['harassment', '嫌がらせ', 'Harassment'],
  ['spam', '迷惑行為・スパム', 'Spam'],
  ['inappropriate', '不適切な内容', 'Inappropriate'],
  ['cheating', '不正なクライアント', 'Cheating client'],
  ['copyright', '権利の侵害', 'Copyright'],
  ['other', 'そのほか', 'Other'],
] as const
type ReportReason = (typeof REPORT_REASONS)[number][0]

/** 通報の入力（参加者・プロフィールから） */
const ReportItems: React.FC<{ userId: string; name: string; back: () => void; render: (items: MenuItem[]) => ReactNode }> = ({ userId, name, back, render }) => {
  const api = useApp((s) => s.api)!
  const [reason, setReason] = useState<ReportReason>('harassment')
  const [detail, setDetail] = useState('')
  const send = async () => {
    const r = await run(() => api.report({ targetType: 'user', targetId: userId, reason, detail }), L('通報しました。親サーバーの運営者が確認します', 'Reported to the server operators'))
    if (r !== null) back()
  }
  return (
    <>
      {render([
        { t: 'buttons', size: 'small', items: [{ label: L('戻る', 'Back'), icon: { icon: 'arrowLeft' }, onClick: back }] },
        { t: 'section', title: L(`${name} さんを通報`, `Report ${name}`) },
        { t: 'choice', label: L('理由', 'Reason'), value: reason, options: REPORT_REASONS.map(([v, ja, en]) => ({ v, label: L(ja, en) })), onChange: (v) => setReason(v as ReportReason) },
        { t: 'input', label: L('くわしい内容（任意）', 'Details (optional)'), value: detail, placeholder: L('入力する', 'Type here'), onSubmit: setDetail },
        { t: 'buttons', size: 'small', items: [{ label: L('送る', 'Send'), primary: true, onClick: () => void send() }] },
      ])}
    </>
  )
}

/** プロフィール（フレンド申請・招待など） */
const ProfileItems: React.FC<{ engine: WorldEngine; userId: string; back: () => void; report: (name: string) => void; render: (items: MenuItem[]) => ReactNode }> = ({ engine, userId, back, report, render }) => {
  const api = useApp((s) => s.api)!
  const me = useApp((s) => s.me)!
  const u = useAsync<UserProfile>(() => api.user(userId), [api, userId])
  const p = u.data
  const act = async (f: () => Promise<unknown>, ok?: string) => {
    await run(f, ok)
    u.reload()
    void refreshSocial()
  }
  const items: MenuItem[] = [{ t: 'buttons', size: 'small', items: [{ label: L('戻る', 'Back'), icon: { icon: 'arrowLeft' }, onClick: back }] }]
  if (!p) items.push({ t: 'note', text: u.error ?? L('読み込み中…', 'Loading…') })
  else {
    items.push({ t: 'card', key: 'me', title: p.displayName, sub: `${p.handle} · ${p.statusText || statusLabel(p.status)}`, icon: { image: p.iconUrl ? (api.abs(p.iconUrl) ?? null) : null, fallback: 'user' } })
    if (p.bio) items.push({ t: 'note', text: p.bio })
    if (p.location) items.push({ t: 'card', key: 'loc', title: `${L('いる場所', 'Location')}: ${p.location.worldName}`, sub: accessLabel(p.location.access), buttons: [{ label: L('参加', 'Join'), primary: true, onClick: () => joinInstance(p.location!.instanceId) }] })
    if (userId !== me.id) {
      items.push({
        t: 'buttons',
        size: 'small',
        items: [
          p.friendState === 'friends'
            ? { label: L('フレンドを解除', 'Unfriend'), onClick: () => void act(() => api.removeFriend(p.id), L('フレンドを解除しました', 'Unfriended')) }
            : p.friendState === 'outgoing'
              ? { label: L('申請を取り消す', 'Cancel request'), onClick: () => void act(() => api.removeFriend(p.id)) }
              : { label: p.friendState === 'incoming' ? L('申請を承認', 'Accept request') : L('フレンド申請', 'Add friend'), primary: true, onClick: () => void act(() => api.addFriend(p.id), p.friendState === 'incoming' ? L('フレンドになりました', 'Accepted') : L('申請しました', 'Request sent')) },
          { label: L('今いる場所へ招待', 'Invite here'), onClick: () => void act(() => api.invite(p.id, engine.ctx.instance.id), L('招待しました', 'Invited')) },
          { label: L('お気に入り', 'Favorite'), icon: { icon: 'star' }, onClick: () => void act(() => api.favorite('user', p.id, true), L('お気に入りに入れました', 'Favorited')) },
          { label: L('ブロック', 'Block'), danger: true, onClick: () => void actions.block(p.id) },
          { label: L('通報', 'Report'), onClick: () => report(p.displayName) },
        ],
      })
    }
    if (p.mutualFriends?.length) items.push({ t: 'note', text: `${L('共通のフレンド', 'Mutual friends')}: ${p.mutualFriends.map((f) => f.displayName).join('、')}` })
  }
  return <>{render(items)}</>
}

const PeopleItems: React.FC<PageProps> = ({ engine, render }) => {
  useSyncExternalStore(
    (cb) => engine.session.membersEv.on(cb),
    () => engine.session.verifiedMembers().map((m) => m.desc.peerId).join(','),
    () => '',
  )
  const mod = useModeration()
  const api = useApp((s) => s.api)
  const [view, setView] = useState<{ kind: 'list' } | { kind: 'profile'; userId: string } | { kind: 'report'; userId: string; name: string; from: 'list' | 'profile' }>({ kind: 'list' })
  const s = engine.session
  if (view.kind === 'report') return <ReportItems userId={view.userId} name={view.name} back={() => setView(view.from === 'profile' ? { kind: 'profile', userId: view.userId } : { kind: 'list' })} render={render} />
  if (view.kind === 'profile') return <ProfileItems engine={engine} userId={view.userId} back={() => setView({ kind: 'list' })} report={(name) => setView({ kind: 'report', userId: view.userId, name, from: 'profile' })} render={render} />
  const isMod = s.role(s.selfId) !== 'member'
  const members = s.verifiedMembers()
  const iconOf = (u: { iconUrl?: string | null }) => ({ image: u.iconUrl ? (api?.abs(u.iconUrl) ?? null) : null, fallback: 'user' })
  const items: MenuItem[] = [
    { t: 'section', title: `${L('参加者', 'People')} (${members.length + 1})` },
    { t: 'card', key: 'self', title: s.t.self.user.displayName, sub: `${L('自分', 'you')}${s.isHost() ? ' · HOST' : ''}`, icon: iconOf(s.t.self.user) },
  ]
  for (const m of members) {
    const uid = m.desc.user.id
    const pid = m.desc.peerId
    const link = s.t.link(pid)
    const role = s.role(pid)
    items.push({
      t: 'card',
      key: pid,
      title: m.desc.user.displayName,
      sub: [
        s.hostId() === pid ? 'HOST' : null,
        role !== 'member' ? (role === 'owner' ? L('作成者', 'Owner') : L('モデレーター', 'Mod')) : null,
        link === 'p2p' ? `P2P${s.t.rtt(pid) ? ` ${Math.round(s.t.rtt(pid)!)}ms` : ''}` : link === 'relay' ? L('中継', 'Relay') : link === 'connecting' ? L('接続中…', 'Connecting…') : L('切断', 'Lost'),
      ]
        .filter(Boolean)
        .join(' · '),
      icon: iconOf(m.desc.user),
      buttons: [
        { label: L('プロフィール', 'Profile'), icon: { icon: 'profile' }, onClick: () => setView({ kind: 'profile', userId: uid }) },
        { label: mod.muted.has(uid) ? L('ミュート解除', 'Unmute') : L('ミュート', 'Mute'), icon: { icon: mod.muted.has(uid) ? 'speakerOff' : 'speaker' }, on: mod.muted.has(uid), onClick: () => actions.muteUser(uid) },
        { label: mod.hiddenAvatars.has(uid) ? L('アバターを表示', 'Show avatar') : L('アバターを隠す', 'Hide avatar'), onClick: () => actions.hideAvatar(uid, !mod.hiddenAvatars.has(uid)) },
        { label: mod.shownAvatars.has(uid) ? L('重さの制限に従う', 'Use limits') : L('重くても表示', 'Always show'), onClick: () => actions.showAvatar(uid, !mod.shownAvatars.has(uid)) },
        { label: L('ブロック', 'Block'), danger: true, onClick: () => void actions.block(uid) },
        { label: L('通報', 'Report'), onClick: () => setView({ kind: 'report', userId: uid, name: m.desc.user.displayName, from: 'list' }) },
        ...(isMod ? [{ label: L('退出させる', 'Kick'), danger: true, onClick: () => void confirmThen(L(`${m.desc.user.displayName} さんを退出させますか？`, `Kick ${m.desc.user.displayName}?`), () => actions.kick(pid)) }] : []),
      ],
      range: { label: L('音量', 'Volume'), value: mod.volumes[uid] ?? 1, min: 0, max: 2, step: 0.05, format: pct, onChange: (v) => actions.setUserVolume(uid, pid, v) },
    })
  }
  if (!members.length) items.push({ t: 'note', text: L('ほかに誰もいません', 'Nobody else is here') })
  return <>{render(items)}</>
}

// ---------------------------------------------------------------- フレンド

const FriendsItems: React.FC<PageProps> = ({ engine, vr, close, exitVR, render }) => {
  const [mode, setMode] = useState<'friends' | 'people'>('friends')
  const tabs: MenuItem = { t: 'tabs', value: mode, options: [{ v: 'friends', label: L('フレンド', 'Friends') }, { v: 'people', label: L('参加者', 'People') }], onChange: (v) => setMode(v as 'friends' | 'people') }
  const friends = useNet((s) => s.friends)
  const api = useApp((s) => s.api)
  const [selected, setSelected] = useState<string | null>(null)
  const [reporting, setReporting] = useState<string | null>(null)
  useEffect(() => { void refreshSocial() }, [])
  if (mode === 'people') return <PeopleItems engine={engine} vr={vr} close={close} exitVR={exitVR} render={(items) => render([tabs, ...items])} />
  if (selected && reporting) return <ReportItems userId={selected} name={reporting} back={() => setReporting(null)} render={render} />
  if (selected) return <ProfileItems engine={engine} userId={selected} back={() => setSelected(null)} report={setReporting} render={render} />
  const sorted = [...friends].sort((a, b) => Number(b.online) - Number(a.online) || a.displayName.localeCompare(b.displayName))
  const items: MenuItem[] = [
    tabs,
    { t: 'section', title: `${L('フレンド', 'Friends')} (${friends.length})` },
    { t: 'buttons', size: 'small', items: [{ label: L('更新', 'Refresh'), icon: { icon: 'respawn' }, onClick: () => void refreshSocial() }] },
  ]
  for (const friend of sorted) {
    const location = friend.location
    items.push({
      t: 'card', key: friend.id, title: friend.displayName,
      sub: location ? `${location.worldName} · ${accessLabel(location.access)}` : friend.online ? friend.statusText || statusLabel(friend.status) : L('オフライン', 'Offline'),
      icon: { image: friend.iconUrl ? (api?.abs(friend.iconUrl) ?? null) : null, fallback: 'user' },
      buttons: [
        { label: L('プロフィール', 'Profile'), icon: { icon: 'profile' }, onClick: () => setSelected(friend.id) },
        ...(location ? [{ label: L('参加', 'Join'), primary: true, onClick: () => joinInstance(location.instanceId) }] : []),
      ],
    })
  }
  if (!friends.length) items.push({ t: 'note', text: L('フレンドはいません', 'No friends yet') })
  return <>{render(items)}</>
}

// ---------------------------------------------------------------- アバター

const AvatarItems: React.FC<PageProps> = ({ render }) => {
  const api = useApp((s) => s.api)
  const current = useApp((s) => s.avatar)
  const mine = useAsync<AvatarInfo[]>(async () => (api ? [...(await api.avatars({ mine: true })), ...(await api.avatars({ favorites: true }))] : []), [api])
  const seen = new Set<string>()
  const list = (mine.data ?? []).filter((a) => (seen.has(a.id) ? false : (seen.add(a.id), true)))
  const tiles: Extract<MenuItem, { t: 'tiles' }>['items'] = [
    ...BUNDLED_AVATARS.map((b) => ({ key: b.id, label: b.name, icon: { image: b.thumbnailUrl, fallback: 'avatar' }, on: current.kind === 'builtin' && current.id === b.id, onClick: () => actions.setAvatar({ ...DEFAULT_AVATAR, id: b.id }) })),
    ...list.map((a) => ({
      key: a.id,
      label: a.name,
      icon: { image: a.thumbnailUrl ? (api?.abs(a.thumbnailUrl) ?? null) : null, fallback: 'avatar' },
      on: current.kind === 'vrm' && current.id === a.id,
      onClick: () => api && actions.setAvatar({ kind: 'vrm', id: a.id, url: api.abs(a.fileUrl)!, sha256: a.sha256, scale: 1 }),
    })),
  ]
  tiles.sort((a, b) => a.label.localeCompare(b.label, 'ja', { numeric: true, sensitivity: 'base' }) || a.key.localeCompare(b.key))
  const items: MenuItem[] = [
    { t: 'section', title: L('アバター一覧', 'Avatars') },
    { t: 'tiles', items: tiles },
  ]
  if (mine.loading) items.push({ t: 'note', text: L('自分のアバターを読み込み中…', 'Loading your avatars…') })
  items.push({ t: 'note', text: L('アップロードや詳しい設定はホームの「アバター」から', 'Upload and details are on the home screen') })
  return <>{render(items)}</>
}

// ---------------------------------------------------------------- ワールド

const WorldDetailItems: React.FC<PageProps & { worldId: string; back: () => void }> = ({ engine, worldId, back, close, render }) => {
  const api = useApp((s) => s.api)!
  const me = useApp((s) => s.me)!
  const world = useAsync<WorldInfo>(() => api.world(worldId), [api, worldId])
  const instances = useAsync<InstanceSummary[]>(() => api.instances({ worldId }), [api, worldId])
  const [access, setAccess] = useState<AccessLevel>('public')
  const [locked, setLocked] = useState(false)
  const [busy, setBusy] = useState(false)
  const beginPortal = (instanceId: string, worldName: string, level: AccessLevel) => {
    const target = { worldId, instanceId, worldName, access: accessLabel(level), locked: locked && (level === 'friends' || level === 'friends+') }
    if (useSettings.getState().s.portalMode === 'front') {
      const { position, yaw } = engine.player
      placePortal(engine, target, [position.x - Math.sin(yaw) * 2.7, position.y, position.z - Math.cos(yaw) * 2.7], yaw)
      useApp.getState().toast(L('ポータルを設置しました', 'Portal placed'))
    } else usePortalPlacement.getState().begin(target)
    close()
  }
  const create = async (portal: boolean) => {
    if (busy) return
    setBusy(true)
    try {
      const instance = await run(() => api.createInstance({ worldId, access }))
      if (!instance) return
      if (portal) beginPortal(instance.id, instance.worldName, instance.access)
      else joinInstance(instance.id)
    } finally {
      setBusy(false)
    }
  }
  const w = world.data
  const toggleFavorite = async () => {
    if (!w) return
    const result = await run(() => api.favorite('world', w.id, !w.favorite))
    if (result !== null) world.reload()
  }
  const setHome = async () => {
    if (!w) return
    const updated = await run(() => api.updateMe({ homeWorldId: w.id }), L('ホームに設定しました', 'Set as home'))
    if (updated) useApp.getState().setMe(updated)
  }
  const items: MenuItem[] = [
    { t: 'buttons', size: 'small', items: [{ label: L('ワールド一覧', 'Worlds'), icon: { icon: 'arrowLeft' }, onClick: back }] },
  ]
  if (world.error) items.push({ t: 'note', text: world.error })
  if (world.loading || !w) {
    items.push({ t: 'note', text: L('読み込み中…', 'Loading…') })
    return <>{render(items)}</>
  }
  items.push(
    { t: 'section', title: w.name },
    { t: 'card', key: w.id, title: w.name, sub: `${w.author.displayName} · ${w.occupants}${L('人', ' online')} · ${w.favoriteCount}${L('件のお気に入り', ' favorites')}`, icon: { image: w.thumbnailUrl ? api.abs(w.thumbnailUrl) : null, fallback: 'globe' }, buttons: [
      { label: w.favorite ? L('お気に入り済み', 'Favorited') : L('お気に入り', 'Favorite'), icon: { icon: 'heart' }, on: w.favorite, onClick: () => void toggleFavorite() },
      ...(me.homeWorldId === w.id ? [] : [{ label: L('ホームにする', 'Set as home'), icon: { icon: 'home' }, onClick: () => void setHome() }]),
    ] },
    { t: 'note', text: w.description || L('説明はありません', 'No description') },
    { t: 'section', title: L('新しいインスタンス', 'New Instance') },
    { t: 'choice', label: L('公開範囲', 'Access'), value: access, options: (['public', 'friends+', 'friends', 'invite+', 'invite'] as AccessLevel[]).map((v) => ({ v, label: accessLabel(v) })), onChange: (value) => setAccess(value as AccessLevel) },
    { t: 'toggle', label: L('フレンドだけにポータルを表示', 'Lock Portal to Friends'), hint: L('フレンド系インスタンスでのみ有効', 'For Friends and Friends+ instances'), value: locked, onChange: setLocked },
    { t: 'buttons', size: 'small', items: [
      { label: busy ? L('作成中…', 'Creating…') : L('作って入る', 'Create & Go'), icon: { icon: 'arrowRight' }, primary: true, onClick: () => void create(false) },
      { label: busy ? L('作成中…', 'Creating…') : L('作ってポータルを置く', 'Create & Drop Portal'), icon: { icon: 'door' }, onClick: () => void create(true) },
    ] },
    { t: 'section', title: L('入れるインスタンス', 'Available Instances') },
  )
  if (instances.error) items.push({ t: 'note', text: instances.error })
  if (instances.loading) items.push({ t: 'note', text: L('インスタンスを読み込み中…', 'Loading instances…') })
  if (!instances.loading && !instances.data?.length) items.push({ t: 'note', text: L('まだインスタンスがありません', 'No instances yet') })
  for (const instance of instances.data ?? []) items.push({
    t: 'card', key: instance.id, title: `${instance.name} · ${instance.occupants}/${instance.capacity}`,
    sub: `${accessLabel(instance.access)} · ${instance.owner.displayName}`,
    icon: { icon: 'door' },
    buttons: [
      { label: L('入る', 'Go'), primary: true, onClick: () => joinInstance(instance.id) },
      { label: L('ポータルを置く', 'Drop Portal'), icon: { icon: 'door' }, onClick: () => beginPortal(instance.id, w.name, instance.access) },
    ],
  })
  return <>{render(items)}</>
}

const WorldItems: React.FC<PageProps> = (props) => {
  const { render } = props
  const api = useApp((s) => s.api)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const list = useAsync(async () => (api ? api.worlds({ q: query || undefined, sort: 'popular' }) : []), [api, query])
  if (selected) return <WorldDetailItems key={selected} {...props} worldId={selected} back={() => setSelected(null)} />
  const items: MenuItem[] = [
    { t: 'input', label: L('ワールドを探す', 'Search worlds'), value: query, placeholder: L('名前・タグ', 'Name or tag'), onSubmit: setQuery },
    {
      t: 'tiles',
      items: (list.data ?? []).map((w) => ({
        key: w.id,
        label: w.name,
        sub: `${w.author?.displayName ?? ''}${w.occupants ? ` · ${w.occupants}${L('人', ' online')}` : ''}`,
        icon: { image: w.thumbnailUrl ? (api?.abs(w.thumbnailUrl) ?? null) : null, fallback: 'globe' },
        onClick: () => setSelected(w.id),
      })),
    },
  ]
  if (list.loading) items.push({ t: 'note', text: L('読み込み中…', 'Loading…') })
  return <>{render(items)}</>
}

// ---------------------------------------------------------------- インスタンス

const InstanceItems: React.FC<PageProps> = ({ engine, render }) => {
  const api = useApp((s) => s.api)!
  const friends = useNet((s) => s.friends)
  const inst = engine.ctx.instance as { id: string; access?: string; capacity?: number; owner?: { displayName: string } }
  const here = new Set(engine.session.verifiedMembers().map((m) => m.desc.user.id))
  const invitable = friends.filter((f: FriendEntry) => f.online && !here.has(f.id))
  const s = engine.session
  const items: MenuItem[] = [
    { t: 'section', title: L('このインスタンス', 'This instance') },
    {
      t: 'note',
      text: [
        `${L('ワールド', 'World')}: ${engine.ctx.world.name}`,
        inst.access ? `${L('公開範囲', 'Access')}: ${accessLabel(inst.access)} · ${L('定員', 'Capacity')} ${inst.capacity}` : null,
        inst.owner ? `${L('作成者', 'Owner')}: ${inst.owner.displayName}` : null,
        `${L('通信', 'Network')}: ${s.t.serverUp() ? L('親サーバーに接続中', 'Server connected') : L('親サーバーと切れています（P2P で継続中）', 'Server offline (continuing over P2P)')} · ${L('ホスト', 'Host')}: ${s.isHost() ? L('自分', 'me') : (s.members.get(s.hostId() ?? '')?.desc.user.displayName ?? '—')}`,
      ]
        .filter(Boolean)
        .join('\n'),
    },
    { t: 'buttons', size: 'small', items: [{ label: L('招待リンクをコピー', 'Copy invite link'), icon: { icon: 'link' }, onClick: () => void navigator.clipboard?.writeText(instanceLink(inst.id)).then(() => useApp.getState().toast(L('リンクをコピーしました', 'Link copied'))) }] },
    { t: 'section', title: L('フレンドを招待', 'Invite friends') },
  ]
  if (!invitable.length) items.push({ t: 'note', text: L('招待できるオンラインのフレンドはいません', 'No online friends to invite') })
  for (const f of invitable)
    items.push({ t: 'card', key: f.id, title: f.displayName, icon: { image: f.iconUrl ? (api.abs(f.iconUrl) ?? null) : null, fallback: 'user' }, buttons: [{ label: L('招待', 'Invite'), primary: true, onClick: () => void run(() => api.invite(f.id, inst.id), L('招待しました', 'Invited')) }] })
  return <>{render(items)}</>
}

// ---------------------------------------------------------------- 通知

const notificationText = (n: NotificationEntry) =>
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
            : (n.message ?? '')

const NotificationItems: React.FC<PageProps> = ({ engine, render }) => {
  const api = useApp((s) => s.api)!
  const list = useApp((s) => s.notifications)
  const del = async (id: string) => {
    await run(() => api.deleteNotification(id))
    void refreshSocial()
  }
  const items: MenuItem[] = [
    {
      t: 'buttons',
      size: 'small',
      items: [
        {
          label: L('すべて既読にする', 'Mark all read'),
          onClick: () =>
            void run(() => api.readNotifications()).then(() => {
              void refreshSocial()
            }),
        },
      ],
    },
  ]
  if (!list.length) items.push({ t: 'note', text: L('通知はありません', 'No notifications') })
  for (const n of list) {
    const buttons = []
    if (n.kind === 'friend_request' && n.from) buttons.push({ label: L('承認', 'Accept'), primary: true, onClick: () => void run(async () => (await api.addFriend(n.from!.id), await del(n.id)), L('フレンドになりました', 'Accepted')) })
    if (n.kind === 'invite' && n.instanceId) buttons.push({ label: L('参加', 'Join'), primary: true, onClick: () => joinInstance(n.instanceId!) })
    if (n.kind === 'request_invite' && n.from) buttons.push({ label: L('招待する', 'Invite'), primary: true, onClick: () => void run(async () => (await api.invite(n.from!.id, engine.ctx.instance.id), await del(n.id)), L('招待しました', 'Invited')) })
    buttons.push({ label: L('消す', 'Dismiss'), icon: { icon: 'close' }, onClick: () => void del(n.id) })
    items.push({
      t: 'card',
      key: n.id,
      title: `${n.from ? n.from.displayName + ' ' : ''}${notificationText(n)}`,
      sub: `${n.message && n.kind !== 'system' ? `「${n.message}」 · ` : ''}${formatTime(n.createdAt)}`,
      icon: n.from ? { image: n.from.iconUrl ? (api.abs(n.from.iconUrl) ?? null) : null, fallback: 'user' } : { icon: 'bell' },
      dim: n.read,
      buttons,
    })
  }
  return <>{render(items)}</>
}

// ---------------------------------------------------------------- 設定・デバッグ

const SettingsPage: React.FC<PageProps> = ({ render }) => <SettingsItems render={(items) => render([
  items[0],
  { t: 'buttons', size: 'small', items: [{ label: L('デバッグ', 'Debug'), icon: { icon: 'bug' }, onClick: () => useMenu.getState().setPage('debug') }] },
  ...items.slice(1),
])} />

/** 制作者向けのデバッグ表示（[151]）: 同期状態・イベント・接続・時計 */
const DebugItems: React.FC<PageProps> = ({ engine, render }) => {
  const [, tick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 1000)
    return () => clearInterval(t)
  }, [])
  const s = engine.session
  const name = (id: string) => (id === s.selfId ? L('自分', 'me') : (s.members.get(id)?.desc.user.displayName ?? id))
  const short = (v: unknown) => {
    const t = JSON.stringify(v)
    return t && t.length > 100 ? t.slice(0, 100) + '…' : t
  }
  const items: MenuItem[] = [
    { t: 'buttons', size: 'small', items: [{ label: L('設定に戻る', 'Back to Settings'), icon: { icon: 'arrowLeft' }, onClick: () => useMenu.getState().setPage('settings') }] },
    { t: 'section', title: L('接続', 'Network') },
    {
      t: 'note',
      mono: true,
      text: [
        `host: ${s.hostId() ? name(s.hostId()!) : '—'} · epoch ${s.stateEpoch()} · synced ${String(s.synced)} · server ${String(s.t.serverUp())}`,
        `clock: ${s.clock.source} ±${Number.isFinite(s.clock.uncertainty) ? Math.round(s.clock.uncertainty) : '∞'}ms · jumps ${s.clock.jumps}`,
        ...s.verifiedMembers().map((m) => `${m.desc.user.displayName}: ${s.t.link(m.desc.peerId)} ${s.t.rtt(m.desc.peerId) ? `${Math.round(s.t.rtt(m.desc.peerId)!)}ms` : ''} · frames ${m.frames.length} · score ${m.hostScore}`),
      ].join('\n'),
    },
    { t: 'section', title: `${L('同期状態', 'Synced state')} (${s.entries().length})` },
    { t: 'note', mono: true, text: s.entries().slice(0, 30).map((e) => `${e.key} = ${short(e.value)}  r${e.rev} · ${name(e.by)}${e.pending ? ' · pending' : ''}`).join('\n') || '—' },
    { t: 'section', title: L('最近のイベント', 'Recent events') },
    { t: 'note', mono: true, text: [...s.eventLog].reverse().slice(0, 20).map((e) => `${new Date(e.at).toLocaleTimeString()} ${e.name} ← ${name(e.from)} ${short(e.payload)}`).join('\n') || '—' },
    { t: 'section', title: L('ワールド', 'World') },
    {
      t: 'note',
      mono: true,
      text: `clickables ${engine.interactables.size} · pickups ${engine.pickups.size} · seats ${engine.seats.size} · spawns ${engine.spawns.length}\ndomains: ${engine.ctx.world.manifest.permissions.allowedDomains.join(', ') || '—'}\nsdk ${engine.ctx.world.manifest.sdkVersion} · files ${Object.keys(engine.ctx.world.manifest.files).length}`,
    },
  ]
  return <>{render(items)}</>
}

export const MENU_PAGES: Record<string, React.FC<PageProps>> = {
  main: MainItems,
  expressions: ExpressionItems,
  poses: PoseItems,
  tools: ToolItems,
  friends: FriendsItems,
  avatars: AvatarItems,
  worlds: WorldItems,
  instance: InstanceItems,
  notifications: NotificationItems,
  settings: SettingsPage,
  debug: DebugItems,
}
