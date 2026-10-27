// 設定の項目（[198][199][200][203]・18.1）。ホームの設定画面、ワールドの中のメニュー（画面・VR）で共通
import type { UserSettings } from '@tentenv/protocol'
import { useEffect, useState, type ReactNode } from 'react'
import { assetCacheSize, clearAssetCache } from '../../world/assetCache'
import { L, setLang, useLang } from '../../i18n'
import { listDevices } from '../../net/devices'
import { useApp } from '../../state/app'
import { stopSignal, useNet } from '../../state/net'
import { useSettings, type DeviceSettings } from '../../state/settings'
import { activeEngine } from '../../state/activeEngine'
import { OSC_BRIDGE_URL, oscState } from '../../features/oscFace'
import { bodyTracking } from '../../features/bodyTracking'
import { actions } from '../actions'
import { run } from '../common'
import { pct, type MenuItem, type Option } from './model'

export type SettingsSection = 'graphics' | 'audio' | 'movement' | 'avatar' | 'privacy' | 'account' | 'about'

const SECTIONS: [SettingsSection, string, string][] = [
  ['graphics', '画質', 'Graphics'],
  ['audio', '音声', 'Audio'],
  ['movement', '移動・VR', 'Movement & VR'],
  ['avatar', 'アバター・トラッキング', 'Avatar & tracking'],
  ['privacy', 'プライバシー・通信', 'Privacy & network'],
  ['account', 'アカウント・サーバー', 'Account & server'],
  ['about', 'そのほか', 'Other'],
]

const useS = () => {
  const s = useSettings((x) => x.s)
  const set = useSettings((x) => x.set)
  return [s, set] as const
}

/** 数秒ごとに描き直す（状態の表示用） */
const useTick = (ms: number) => {
  const [, tick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), ms)
    return () => clearInterval(t)
  }, [ms])
}

const opt = <T extends string>(v: T, ja: string, en: string): Option<T> => ({ v, label: L(ja, en) })

const useGraphics = (): MenuItem[] => {
  const [s, set] = useS()
  return [
    { t: 'choice', label: L('画質', 'Quality'), value: s.quality, options: [opt('low', '低', 'Low'), opt('medium', '中', 'Medium'), opt('high', '高', 'High'), opt('ultra', '最高', 'Ultra')], onChange: (v) => set({ quality: v as DeviceSettings['quality'] }) },
    { t: 'range', label: L('描画の解像度', 'Render scale'), value: s.renderScale, min: 0.5, max: 1.5, step: 0.05, format: pct, onChange: (renderScale) => set({ renderScale }) },
    { t: 'range', label: L('描画距離', 'Draw distance'), value: s.drawDistance, min: 50, max: 2000, step: 10, format: (v) => `${v}m`, onChange: (drawDistance) => set({ drawDistance }) },
    { t: 'range', label: L('視野角（PC）', 'Field of view'), value: s.fov, min: 50, max: 110, step: 1, format: (v) => `${v}°`, onChange: (fov) => set({ fov }) },
    { t: 'toggle', label: L('影', 'Shadows'), value: s.shadows, onChange: (shadows) => set({ shadows }) },
    { t: 'range', label: L('アバターを表示する人数', 'Max avatars shown'), value: s.maxAvatars, min: 1, max: 80, step: 1, onChange: (maxAvatars) => set({ maxAvatars }) },
    { t: 'range', label: L('アバターを表示する距離', 'Avatar distance'), value: s.avatarCullDistance, min: 5, max: 200, step: 5, format: (v) => `${v}m`, onChange: (avatarCullDistance) => set({ avatarCullDistance }) },
    { t: 'toggle', label: L('名前を表示', 'Show nameplates'), value: s.showNameplates, onChange: (showNameplates) => set({ showNameplates }) },
    { t: 'toggle', label: L('吹き出しを表示', 'Show chat bubbles'), value: s.showChatBubbles, onChange: (showChatBubbles) => set({ showChatBubbles }) },
    { t: 'toggle', label: L('性能の表示（FPS・描画回数など）', 'Show performance stats'), value: s.showFps, onChange: (showFps) => set({ showFps }) },
  ]
}

const useAudio = (): MenuItem[] => {
  const [s, set] = useS()
  const [dev, setDev] = useState<MediaDeviceInfo[]>([])
  useEffect(() => {
    const refresh = () => void listDevices().then((d) => setDev(d.inputs))
    refresh()
    navigator.mediaDevices?.addEventListener?.('devicechange', refresh)
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', refresh)
  }, [])
  const apply = (p: Partial<DeviceSettings>) => {
    set(p)
    const e = activeEngine()
    e?.voice.applyAllGains()
    if (e && ('micDeviceId' in p || 'noiseSuppression' in p || 'echoCancellation' in p || 'autoGain' in p)) void e.voice.startMic()
  }
  return [
    { t: 'dropdown', label: L('マイク', 'Microphone'), value: s.micDeviceId, options: [{ v: '', label: L('既定', 'Default') }, ...dev.map((d) => ({ v: d.deviceId, label: d.label || d.deviceId.slice(0, 8) }))], onChange: (micDeviceId) => apply({ micDeviceId }) },
    { t: 'range', label: L('マイクの音量', 'Mic gain'), value: s.micGain, min: 0, max: 3, step: 0.05, format: pct, onChange: (micGain) => apply({ micGain }) },
    { t: 'toggle', label: L('Push-to-Talk（押している間だけ話す）', 'Push-to-talk'), hint: L('PC: V キーを押している間（VR・スマホではミュートの切り替えを使ってください）', 'PC: hold V (in VR and on mobile use mute instead)'), value: s.pushToTalk, onChange: (pushToTalk) => apply({ pushToTalk }) },
    { t: 'toggle', label: L('入ったときはミュート', 'Start muted'), value: s.startMuted, onChange: (startMuted) => set({ startMuted }) },
    { t: 'toggle', label: L('ノイズ抑制', 'Noise suppression'), value: s.noiseSuppression, onChange: (noiseSuppression) => apply({ noiseSuppression }) },
    { t: 'toggle', label: L('エコー除去', 'Echo cancellation'), value: s.echoCancellation, onChange: (echoCancellation) => apply({ echoCancellation }) },
    { t: 'toggle', label: L('音量の自動調整', 'Auto gain'), value: s.autoGain, onChange: (autoGain) => apply({ autoGain }) },
    { t: 'range', label: L('全体の音量', 'Master'), value: s.masterVolume, min: 0, max: 1.5, step: 0.05, format: pct, onChange: (masterVolume) => apply({ masterVolume }) },
    { t: 'range', label: L('声の音量', 'Voices'), value: s.voiceVolume, min: 0, max: 2, step: 0.05, format: pct, onChange: (voiceVolume) => apply({ voiceVolume }) },
    { t: 'range', label: L('声が届く距離', 'Voice range'), value: s.voiceRange, min: 5, max: 100, step: 1, format: (v) => `${v}m`, onChange: (voiceRange) => apply({ voiceRange }) },
  ]
}

const useMovement = (): MenuItem[] => {
  const [s, set] = useS()
  return [
    { t: 'choice', label: L('旋回', 'Turning'), value: s.turnMode, options: [opt('snap', 'スナップ', 'Snap'), opt('smooth', 'スムーズ', 'Smooth')], onChange: (v) => set({ turnMode: v as DeviceSettings['turnMode'] }) },
    { t: 'range', label: L('スナップの角度', 'Snap angle'), value: s.snapAngle, min: 10, max: 90, step: 5, format: (v) => `${v}°`, onChange: (snapAngle) => set({ snapAngle }) },
    { t: 'range', label: L('スムーズ旋回の速さ', 'Smooth turn speed'), value: s.smoothTurnSpeed, min: 30, max: 360, step: 10, format: (v) => `${v}°/s`, onChange: (smoothTurnSpeed) => set({ smoothTurnSpeed }) },
    { t: 'range', label: L('移動中の視野の絞り（酔い対策）', 'Comfort vignette'), value: s.vignette, min: 0, max: 1, step: 0.05, format: pct, onChange: (vignette) => set({ vignette }) },
    { t: 'range', label: L('歩く速さ', 'Walk speed'), value: s.moveSpeed, min: 1, max: 5, step: 0.1, format: (v) => `${v.toFixed(1)}m/s`, onChange: (moveSpeed) => set({ moveSpeed }) },
    { t: 'choice', label: L('VR の移動の向き', 'VR move direction'), value: s.moveDirection, options: [opt('head', '頭', 'Head'), opt('hand', '手', 'Hand')], onChange: (v) => set({ moveDirection: v as DeviceSettings['moveDirection'] }) },
    { t: 'choice', label: L('利き手', 'Dominant hand'), value: s.dominantHand, options: [opt('right', '右', 'Right'), opt('left', '左', 'Left')], onChange: (v) => set({ dominantHand: v as DeviceSettings['dominantHand'] }) },
    { t: 'choice', label: L('ポータルの設置方法', 'Portal Mode'), value: s.portalMode, options: [opt('manual', '手動で設置', 'Place Manually'), opt('front', '前方に設置', 'Drop in Front')], onChange: (v) => set({ portalMode: v as DeviceSettings['portalMode'] }) },
    { t: 'toggle', label: L('ポータルに入る前に入力確認', 'Portal Prompt'), value: s.portalPrompt, onChange: (portalPrompt) => set({ portalPrompt }) },
    { t: 'toggle', label: L('座って遊ぶ（VR）', 'Seated play (VR)'), hint: L('座っていても立っている高さの視点にします', 'Raises your view to standing height'), value: s.seatedMode, onChange: (seatedMode) => set({ seatedMode }) },
    { t: 'range', label: L('自分の身長', 'Your height'), value: s.playerHeight, min: 1, max: 2.3, step: 0.01, format: (v) => `${Math.round(v * 100)}cm`, onChange: (playerHeight) => set({ playerHeight }) },
    { t: 'buttons', size: 'small', items: [{ label: L('身長を合わせる（VR でまっすぐ立って）', 'Calibrate height (stand up straight in VR)'), onClick: actions.calibrateHeight }] },
    { t: 'range', label: L('PC の視点の高さの調整', 'Desktop eye offset'), value: s.desktopEyeOffset, min: -0.5, max: 0.5, step: 0.01, format: (v) => `${Math.round(v * 100)}cm`, onChange: (desktopEyeOffset) => set({ desktopEyeOffset }) },
    { t: 'range', label: L('マウスの感度', 'Mouse sensitivity'), value: s.mouseSensitivity, min: 0.2, max: 3, step: 0.05, format: (v) => v.toFixed(2), onChange: (mouseSensitivity) => set({ mouseSensitivity }) },
    { t: 'toggle', label: L('上下を反転', 'Invert Y'), value: s.invertY, onChange: (invertY) => set({ invertY }) },
    { t: 'toggle', label: L('三人称視点（PC）', 'Third person (desktop)'), hint: 'H', value: s.thirdPerson, onChange: (thirdPerson) => set({ thirdPerson }) },
    { t: 'range', label: L('振動の強さ', 'Haptics'), value: s.hapticsStrength, min: 0, max: 1, step: 0.05, format: pct, onChange: (hapticsStrength) => set({ hapticsStrength }) },
    {
      t: 'note',
      text: L(
        'PC: WASD 移動 · Shift 走る · Space ジャンプ · C しゃがむ · Z 伏せる · クリック 押す・つかむ · F 持った物を使う · R / Esc メニュー · Enter チャット · M ミュート · Alt+1〜8 ジェスチャー。VR: 左スティック 移動 · 右スティック 向き · トリガー 押す · グリップ つかむ · 左手の Y メニュー開閉 · 右手の B 表情メニュー',
        'Desktop: WASD move · Shift run · Space jump · C crouch · Z prone · Click use/grab · F use held · R/Esc menu · Enter chat · M mute · Alt+1–8 gestures. VR: left stick move · right stick turn · trigger press · grip grab · left Y toggle menu · right B expressions',
      ),
    },
  ]
}

const useAvatarTracking = (): MenuItem[] => {
  const [s, set] = useS()
  useTick(500)
  const native = !!(window as unknown as { __tentenvOSC?: unknown }).__tentenvOSC
  const receiving = oscState.status !== 'off' && performance.now() - oscState.last < 1000
  const status =
    oscState.status === 'off'
      ? L('ワールドに入ると受け取りを始めます', 'Starts when you join a world')
      : oscState.status === 'error'
        ? L(`ポート ${s.oscPort} を開けません: ${oscState.error}`, `Cannot open port ${s.oscPort}: ${oscState.error}`)
        : receiving
          ? L('受け取り中', 'Receiving')
          : L('待っています（送り手の送り先を確かめてください）', 'Waiting for data')
  const items: MenuItem[] = [
    { t: 'range', label: L('アバターの大きさ', 'Avatar size'), value: s.avatarScale, min: 0.3, max: 3, step: 0.05, format: pct, onChange: (avatarScale) => set({ avatarScale }) },
    { t: 'toggle', label: L('寝転びの自動判定（VR）', 'Auto sleep pose (VR)'), hint: L('床に寝転ぶと寝るポーズになります。誤判定するときは切ってください', 'Lying on the floor switches to a sleep pose'), value: s.autoSleep, onChange: (autoSleep) => set({ autoSleep }) },
    { t: 'toggle', label: L('他の人のアバターをすべて標準アバターにする', 'Show everyone as the default avatar'), value: s.hideAllAvatars, onChange: (hideAllAvatars) => set({ hideAllAvatars }) },
    { t: 'section', title: L('フェイストラッキング（OSC）', 'Face tracking (OSC)') },
    {
      t: 'toggle',
      label: L('OSC で表情を受け取る', 'Receive face tracking over OSC'),
      hint: L('VMC プロトコルと /avatar/parameters の表情パラメーターに対応します', 'Supports VMC and /avatar/parameters face tracking messages'),
      value: s.oscFace,
      onChange: (oscFace) => set({ oscFace }),
    },
  ]
  if (s.oscFace) {
    if (native)
      items.push({
        t: 'input',
        label: L('受ける UDP ポート', 'UDP port'),
        value: String(s.oscPort),
        numeric: true,
        onSubmit: (v) => {
          const n = Math.round(Number(v))
          if (n >= 1024 && n <= 65535) set({ oscPort: n })
        },
      })
    else items.push({ t: 'note', text: L(`ブラウザでは UDP を直接受けられないため、PC で「node scripts/osc-bridge.mjs」を動かしてください（${OSC_BRIDGE_URL} へ中継します）。Windows 版はそのまま受け取れます。`, `Browsers cannot receive UDP. Run "node scripts/osc-bridge.mjs" on your PC (relays to ${OSC_BRIDGE_URL}). The Windows app receives OSC directly.`) })
    items.push({ t: 'note', text: `${L('状態', 'Status')}: ${status}` })
  }
  items.push({ t: 'section', title: L('フルトラッキング', 'Full-body tracking') })
  items.push({
    t: 'note',
    text: bodyTracking.available
      ? bodyTracking.calibrated
        ? L('腰と両足のトラッカーを使っています', 'Using waist and feet trackers')
        : L('トラッカーを見つけました。まっすぐ立って「トラッカーを合わせる」を押してください', 'Trackers found. Stand up straight and press Calibrate')
      : L('Windows 版で腰・左足・右足のトラッカーを使えます', 'In the Windows app, waist, left foot and right foot trackers are supported'),
  })
  if (bodyTracking.available)
    items.push({
      t: 'buttons',
      size: 'small',
      items: [
        { label: bodyTracking.calibrated ? L('トラッカーを合わせ直す', 'Recalibrate trackers') : L('トラッカーを合わせる', 'Calibrate trackers'), primary: !bodyTracking.calibrated, onClick: () => bodyTracking.calibrate() },
        ...(bodyTracking.calibrated ? [{ label: L('トラッカーを使わない', 'Stop using trackers'), onClick: () => bodyTracking.reset() }] : []),
      ],
    })
  return items
}

const useAccountPrivacy = (): MenuItem[] => {
  const api = useApp((s) => s.api)
  const me = useApp((s) => s.me)
  if (!api || !me) return []
  const upd = async (p: Partial<UserSettings>) => {
    const r = await run(() => api.updateMe({ settings: { ...me.settings, ...p } }))
    if (r) useApp.getState().setMe(r)
  }
  const opts = [opt('everyone', 'だれでも', 'Everyone'), opt('friends', 'フレンド', 'Friends'), opt('nobody', 'だれにも', 'Nobody')]
  return [
    { t: 'section', title: L('アカウント（親サーバーに保存）', 'Account (saved on the server)') },
    { t: 'choice', label: L('いる場所を見せる', 'Show location to'), value: me.settings.locationVisibility, options: opts, onChange: (v) => void upd({ locationVisibility: v as UserSettings['locationVisibility'] }) },
    { t: 'choice', label: L('接触を許す', 'Allow touch from'), value: me.settings.allowContact, options: opts, onChange: (v) => void upd({ allowContact: v as UserSettings['allowContact'] }) },
    { t: 'choice', label: L('招待を受ける', 'Accept invites from'), value: me.settings.allowInvites, options: opts, onChange: (v) => void upd({ allowInvites: v as UserSettings['allowInvites'] }) },
  ]
}

const usePrivacy = (): MenuItem[] => {
  const [s, set] = useS()
  const account = useAccountPrivacy()
  return [
    { t: 'toggle', label: L('ホストを引き受けない', 'Never act as host'), hint: L('バッテリーや回線が弱い端末向け', 'For weak devices or connections'), value: s.refuseHost, onChange: (refuseHost) => set({ refuseHost }) },
    { t: 'toggle', label: L('許可されていないドメインの動画・画像も読み込む', 'Allow media from any domain'), hint: L('ワールドが許可していないサイトに、あなたの IP アドレスが送られます', 'Untrusted sites will see your IP address'), value: s.allowUntrustedMedia, onChange: (allowUntrustedMedia) => set({ allowUntrustedMedia }) },
    ...account,
  ]
}

const useAccount = (): MenuItem[] => {
  const api = useApp((s) => s.api)
  const me = useApp((s) => s.me)
  const info = useApp((s) => s.info)
  const online = useNet((s) => s.online)
  const [showToken, setShowToken] = useState(false)
  const items: MenuItem[] = [
    {
      t: 'card',
      key: 'server',
      title: info?.name ?? '—',
      sub: `${api?.base ?? ''} · ${online ? L('接続中', 'Connected') : L('つながっていません', 'Disconnected')}${info ? ` · ${L('中継', 'Relay')} ${info.relay ? L('あり', 'yes') : L('なし', 'no')} · ${L('アバター上限', 'Avatar limit')} ${(info.limits.avatarBytes / 1048576).toFixed(0)}MB · v${info.version}` : ''}`,
      icon: { icon: 'server' },
    },
    { t: 'note', text: `${L('ログイン', 'Signed in as')}: ${me?.handle ?? '—'}` },
    {
      t: 'buttons',
      size: 'small',
      items: [
        {
          label: L('親サーバーを変える', 'Switch server'),
          onClick: () => {
            stopSignal()
            useApp.setState({ info: null, api: null, me: null, screen: { kind: 'connect' } })
          },
        },
        {
          label: L('ログアウト', 'Sign out'),
          danger: true,
          onClick: () => {
            stopSignal()
            useApp.getState().logout()
          },
        },
      ],
    },
    { t: 'note', text: L('親サーバーを変えると、今のインスタンスから出ます。アカウント・フレンドは親サーバーごとに別です。', 'Switching servers leaves the current instance. Accounts are per server.') },
    { t: 'section', title: L('制作者向け', 'For creators') },
    { t: 'note', text: L('ttv-world upload で使うセッショントークン。人に教えないでください。', 'Session token for "ttv-world upload". Keep it secret.') },
    {
      t: 'buttons',
      size: 'small',
      items: [
        { label: showToken ? L('隠す', 'Hide') : L('表示', 'Show'), onClick: () => setShowToken(!showToken) },
        { label: L('コピー', 'Copy'), onClick: () => void navigator.clipboard?.writeText(api?.getToken() ?? '') },
      ],
    },
  ]
  if (showToken) items.push({ t: 'note', text: api?.getToken() ?? '', mono: true })
  return items
}

const useAbout = (): MenuItem[] => {
  const lang = useLang()
  const [size, setSize] = useState<number | null>(null)
  useEffect(() => {
    void assetCacheSize().then(setSize)
  }, [])
  const reset = useSettings((s) => s.reset)
  return [
    { t: 'choice', label: L('言語', 'Language'), value: lang, options: [{ v: 'ja', label: '日本語' }, { v: 'en', label: 'English' }], onChange: (l) => setLang(l as 'ja' | 'en') },
    { t: 'note', text: `${L('保存したファイル', 'Cached files')}: ${size !== null ? `${(size / 1048576).toFixed(0)}MB` : '…'}` },
    {
      t: 'buttons',
      size: 'small',
      items: [
        { label: L('保存したファイルを消す', 'Clear cached files'), onClick: () => void clearAssetCache().then(() => assetCacheSize().then(setSize)) },
        { label: L('この端末の設定を初期値に戻す', 'Reset device settings'), onClick: reset },
      ],
    },
    { t: 'note', text: `TenTenV · AGPL-3.0 · ${L('オープンソースのソーシャル VR', 'Open-source social VR')}` },
  ]
}

const HOOKS: Record<SettingsSection, () => MenuItem[]> = {
  graphics: useGraphics,
  audio: useAudio,
  movement: useMovement,
  avatar: useAvatarTracking,
  privacy: usePrivacy,
  account: useAccount,
  about: useAbout,
}

/** 分類ごとに別の部品にして、フックの呼び出しを分類の中に閉じ込める */
const Section: React.FC<{ sec: SettingsSection; head: MenuItem; render: (items: MenuItem[]) => ReactNode }> = ({ sec, head, render }) => <>{render([head, ...HOOKS[sec]()])}</>

/** 設定の項目（分類のタブつき） */
export const SettingsItems: React.FC<{ render: (items: MenuItem[]) => ReactNode; initial?: SettingsSection }> = ({ render, initial = 'graphics' }) => {
  const [sec, setSec] = useState<SettingsSection>(initial)
  useLang()
  const head: MenuItem = { t: 'tabs', value: sec, options: SECTIONS.map(([v, ja, en]) => ({ v, label: L(ja, en) })), onChange: (v) => setSec(v as SettingsSection) }
  return <Section key={sec} sec={sec} head={head} render={render} />
}
