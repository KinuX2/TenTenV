// 画面の切り替え
import { lazy, Suspense, useEffect } from 'react'
import { L, useLang } from './i18n'
import { useApp } from './state/app'
import { useModeration } from './state/moderation'
import { useNet } from './state/net'
import { Toasts } from './ui/common'
import { Connect } from './ui/screens/Connect'
import { Home } from './ui/screens/Home'
import { playUiClick } from './ui/clickSound'
import { LoadingParticles } from './ui/LoadingParticles'
// 3D の部分は必要になってから読み込む（ホーム画面を速く開くため）
const WorldSession = lazy(() => import('./world/WorldSession').then((m) => ({ default: m.WorldSession })))

const PENDING_INSTANCE = 'ttv.pendingInstance'

export const App: React.FC = () => {
  useLang()
  const screen = useApp((s) => s.screen)
  const me = useApp((s) => s.me)
  const api = useApp((s) => s.api)
  const online = useNet((s) => s.online)

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

  // 招待リンク（?server=…&instance=…）
  useEffect(() => {
    const q = new URLSearchParams(location.search)
    const inst = q.get('instance')
    const server = q.get('server')
    if (inst) {
      sessionStorage.setItem(PENDING_INSTANCE, JSON.stringify({ inst, server }))
      history.replaceState(null, '', location.pathname)
    }
  }, [])
  useEffect(() => {
    if (!me || !api) return
    const raw = sessionStorage.getItem(PENDING_INSTANCE)
    if (!raw) return
    const { inst, server } = JSON.parse(raw) as { inst: string; server: string | null }
    sessionStorage.removeItem(PENDING_INSTANCE)
    if (!server || server === api.base) useApp.getState().setScreen({ kind: 'world', instanceId: inst })
    else useApp.getState().toast(L('招待リンクは別の親サーバーのものです。親サーバーを切り替えてから開いてください', 'The invite link is for a different server'), 'error')
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
  else if (!me || screen.kind === 'connect') body = <Connect />
  else if (screen.kind === 'world') body = <WorldSession instanceId={screen.instanceId} />
  else body = <Home />
  return (
    <>
      <Suspense fallback={<LoadingParticles />}>{body}</Suspense>
      <Toasts />
    </>
  )
}
