// ワールドの中の画面（PC・スマホ）: 照準・説明・マイク・上の帯・チャット・メニュー・スマホの操作
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { L, useLang } from '../../i18n'
import { isMobileDevice, useSettings } from '../../state/settings'
import type { WorldEngine } from '../../world/engine'
import { useHover } from '../../world/interaction'
import { enterVR, isXRSupported } from '../../world/xr'
import { useDialogs } from '../bridge'
import { menuBus, useMenu } from '../menuBus'
import { Dialogs } from './Dialogs'
import { TouchControls } from './TouchControls'
import { perfStats } from '../../features/perf'
import { usePortalPlacement } from '../../world/portalState'
import { input } from '../../player/input'
import { Icon } from '../icons'

export const Hud: React.FC<{ engine: WorldEngine; onLeave: () => void; worldError: string | null }> = ({ engine, onLeave, worldError }) => {
  useLang()
  const hover = useHover()
  const open = useMenu((m) => m.open)
  const muted = useMenu((m) => m.muted)
  const ptt = useMenu((m) => m.ptt)
  const pushToTalk = useSettings((s) => s.s.pushToTalk)
  const showFps = useSettings((s) => s.s.showFps)
  const notices = useDialogs((d) => d.notices)
  const placement = usePortalPlacement()
  const [vrOk, setVrOk] = useState(false)
  const [locked, setLocked] = useState(false)
  const mobile = isMobileDevice()
  const vr = useSyncExternalStore((cb) => engine.runtime.onDeviceChange(cb), () => engine.player.vr, () => false)
  const count = useSyncExternalStore(
    (cb) => engine.session.membersEv.on(cb),
    () => engine.session.verifiedMembers().length + 1,
    () => 1,
  )
  const server = useSyncExternalStore(
    (cb) => engine.session.t.onServer(() => cb()),
    () => engine.session.t.serverUp(),
    () => true,
  )
  useEffect(() => {
    void isXRSupported().then(setVrOk)
    // エミュレーターなどは少し遅れて使えるようになる
    const t = setTimeout(() => void isXRSupported().then(setVrOk), 2500)
    const h = () => setLocked(!!document.pointerLockElement)
    document.addEventListener('pointerlockchange', h)
    return () => {
      clearTimeout(t)
      document.removeEventListener('pointerlockchange', h)
    }
  }, [])
  // チャットや入力欄にいる間はワールドの入力を止める
  const dialogs = useDialogs((d) => d.dialogs.length)
  useEffect(() => {
    input.suspended = open || dialogs > 0
  }, [open, dialogs])
  // 性能の表示
  const [, force] = useState(0)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => {
    if (!showFps) return
    timer.current = setInterval(() => force((x) => x + 1), 500)
    return () => {
      if (timer.current) clearInterval(timer.current)
    }
  }, [showFps])

  if (vr) return <Dialogs />
  const micState = muted ? 'off' : pushToTalk && !ptt ? '' : 'live'
  return (
    <div className="hud">
      {!mobile && !open && <div className={`crosshair${hover.label ? ' hot' : ''}`} />}
      {placement.target && <div className="portal-placement">
        <div><b>{L('ポータルを設置', 'Drop Portal')}</b> · {placement.target.worldName}</div>
        <div className={placement.valid ? 'valid' : 'invalid'}>{placement.valid ? L('クリックで設置', 'Click to place') : placement.reason || L('平らな床を狙ってください', 'Aim at a flat floor')}</div>
        <button className="btn small" onClick={() => placement.cancel()}>{L('キャンセル', 'Cancel')}</button>
      </div>}
      {hover.label && !open && <div className="hover-label">{hover.label}</div>}
      {hover.holding && !open && <div className="hover-label" style={{ top: 'auto', bottom: 90 }}>{L(`「${hover.holding}」を持っています（クリックで離す・F で使う・G で置く）`, `Holding "${hover.holding}" (click to drop, F to use)`)}</div>}
      <div className="topbar">
        <div className="pill">
          <b>{engine.ctx.world.name}</b>
          <span className="muted row" style={{ gap: 4 }}><Icon name="users" size={15} /> {count}</span>
          {!server && <span title={L('親サーバーと切れています。P2P でつながっている人とは続けられます', 'Server connection lost; P2P peers still connected')} style={{ color: '#fbbf24', display: 'inline-flex', gap: 4, alignItems: 'center' }}><Icon name="warning" size={15} /> {L('サーバー切断', 'Server offline')}</span>}
          {engine.ctx.dev && <span style={{ color: '#7fb2ff' }}>DEV</span>}
        </div>
        <div className="grow" />
        {vrOk && (
          <button className="btn primary" onClick={() => void enterVR()}>
            <Icon name="vr" size={18} /> VR
          </button>
        )}
        <div className={`mic ${micState}`} onClick={() => menuBus.toggleMute()} title={L('ミュート（M）', 'Mute (M)')}>
          <Icon name={muted ? 'micOff' : 'mic'} size={22} />
        </div>
        <button className="btn icon" onClick={() => menuBus.toggle()} title={L('メニュー（R / Esc）', 'Menu (R / Esc)')}>
          <Icon name="menu" size={22} />
        </button>
      </div>
      {!mobile && !locked && !open && (
        <div className="notices" style={{ top: '40%' }}>
          <div className="notice">{L('クリックで操作を始めます（Esc で解除・R でメニュー）', 'Click to play (Esc to release, R for menu)')}</div>
        </div>
      )}
      <div className="notices">
        {worldError && <div className="notice" style={{ borderColor: '#7f1d1d' }}>{L(`ワールドでエラーが起きました: ${worldError}`, `World error: ${worldError}`)}</div>}
        {notices.map((n) => (
          <div key={n.id} className="notice">
            {n.text}
          </div>
        ))}
      </div>
      {showFps && (
        <div className="stats">
          FPS {perfStats.fps} · {perfStats.frameMs.toFixed(1)}ms
          <br />
          {L('描画', 'Calls')} {perfStats.calls} · {L('ポリゴン', 'Tris')} {perfStats.triangles.toLocaleString()}
          <br />
          {L('形状', 'Geo')} {perfStats.geometries} · {L('画像', 'Tex')} {perfStats.textures}
          {perfStats.memoryMB > 0 && ` · ${perfStats.memoryMB}MB`}
          <br />
          {L('ホスト', 'Host')}: {engine.session.isHost() ? L('自分', 'me') : (engine.session.members.get(engine.session.hostId() ?? '')?.desc.user.displayName ?? '—')} · {L('時計の誤差', 'Clock ±')}
          {Number.isFinite(engine.session.clock.uncertainty) ? `${Math.round(engine.session.clock.uncertainty)}ms` : '—'}
        </div>
      )}
      {mobile && !open && <TouchControls />}
      <Dialogs />
    </div>
  )
}
