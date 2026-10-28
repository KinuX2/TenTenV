// 画面の切り替え
import { lazy, Suspense, useEffect, useState } from 'react'
import { L, useLang } from './i18n'
import { useApp } from './state/app'
import { useModeration } from './state/moderation'
import { useNet } from './state/net'
import { Toasts } from './ui/common'
import { Connect } from './ui/screens/Connect'
import { SharedWorld } from './ui/screens/SharedWorld'
import { Home } from './ui/screens/Home'
import { playUiClick } from './ui/clickSound'
import { LoadingParticles } from './ui/LoadingParticles'
import { applyBrowserBranding } from './ui/Brand'
// 3D の部分は必要になってから読み込む（ホーム画面を速く開くため）
const WorldSession = lazy(() => import('./world/WorldSession').then((m) => ({ default: m.WorldSession })))

const PENDING_INSTANCE = 'ttv.pendingInstance'
const PENDING_WORLD = 'ttv.pendingWorld'
const LINK_ID = /^[A-Za-z0-9_-]{1,64}$/

const incomingWorld = (): { world: string; server: string } | null => {
  const q = new URLSearchParams(location.search)
  const world = q.get('world')
  if (world && LINK_ID.test(world)) return { world, server: q.get('server') || location.origin }
  try {
    const stored = JSON.parse(sessionStorage.getItem(PENDING_WORLD) ?? 'null') as { world?: string; server?: string } | null
    if (stored?.world && LINK_ID.test(stored.world)) return { world: stored.world, server: stored.server || location.origin }
  } catch { /* 古いデータは無視する */ }
  return null
}

export const App: React.FC = () => {
  useLang()
  const screen = useApp((s) => s.screen)
  const me = useApp((s) => s.me)
  const api = useApp((s) => s.api)
  const info = useApp((s) => s.info)
  const online = useNet((s) => s.online)
  const [sharedWorld] = useState(incomingWorld)
  const [showConnect, setShowConnect] = useState(() => new URLSearchParams(location.search).has('session'))

  useEffect(() => applyBrowserBranding(info, api?.base ?? null), [info, api])

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Element)) return
      const control = target.closest('button, a[href], select, [role="button"], .tile, .nav, .mic')
      if (control && !(control instanceof HTMLButtonElement && control.disabled)) playUiClick()
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [])

  // インスタンス招待とワールド共有のリンクを、ログイン後まで保持する。
  useEffect(() => {
    const q = new URLSearchParams(location.search)
    const inst = q.get('instance')
    const world = q.get('world')
    const server = q.get('server')
    if (inst && LINK_ID.test(inst)) {
      sessionStorage.setItem(PENDING_INSTANCE, JSON.stringify({ inst, server }))
    } else if (world && LINK_ID.test(world)) {
      sessionStorage.setItem(PENDING_WORLD, JSON.stringify({ world, server }))
    }
    if (inst || world) {
      q.delete('instance')
      q.delete('world')
      q.delete('server')
      history.replaceState(null, '', `${location.pathname}${q.size ? `?${q}` : ''}${location.hash}`)
    }
  }, [])
  useEffect(() => {
    if (!me || !api) return
    const raw = sessionStorage.getItem(PENDING_INSTANCE)
    if (raw) {
      sessionStorage.removeItem(PENDING_INSTANCE)
      const { inst, server } = JSON.parse(raw) as { inst: string; server: string | null }
      if (!server || server === api.base) useApp.getState().setScreen({ kind: 'world', instanceId: inst })
      else useApp.getState().toast(L('招待リンクは別の親サーバーのものです。親サーバーを切り替えてから開いてください', 'The invite link is for a different server'), 'error')
      return
    }
    const worldRaw = sessionStorage.getItem(PENDING_WORLD)
    if (!worldRaw) return
    sessionStorage.removeItem(PENDING_WORLD)
    const { world, server } = JSON.parse(worldRaw) as { world: string; server: string | null }
    if (!server || server === api.base) useApp.getState().setScreen({ kind: 'home', worldId: world })
    else useApp.getState().toast(L('このリンクは別の親サーバーのワールドです。接続先を切り替えてください', 'This world belongs to a different server'), 'error')
  }, [me, api])

  // ブロックの一覧（ブロックした相手は見えなくなる）
  useEffect(() => {
    if (!me || !api || !online) return
    void api
      .blocks()
      .then((list) => useModeration.getState().setBlocked(list.map((u) => u.id)))
      .catch(() => {})
  }, [me, api, online])

  // 画面を閉じる前に
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (useApp.getState().screen.kind === 'world') e.preventDefault()
    }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [])

  let body: React.ReactNode
  if (screen.kind === 'dev') body = <WorldSession devUrl={screen.worldUrl} />
  else if (!me || screen.kind === 'connect') body = sharedWorld && !showConnect
    ? <SharedWorld worldId={sharedWorld.world} server={sharedWorld.server} onContinue={() => setShowConnect(true)} />
    : <Connect initialServer={sharedWorld?.server} />
  else if (screen.kind === 'world') body = <WorldSession instanceId={screen.instanceId} />
  else body = <Home />
  return (
    <>
      <Suspense fallback={<LoadingParticles />}>{body}</Suspense>
      <Toasts />
    </>
  )
}
