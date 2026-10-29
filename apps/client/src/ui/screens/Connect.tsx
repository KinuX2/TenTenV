// 起動画面: 親サーバーを選んでログインする（4.3・5.1）
import type { MeInfo, ServerInfo } from '@tentenv/protocol'
import { PROTOCOL_VERSION } from '@tentenv/protocol'
import { useEffect, useRef, useState } from 'react'
import { Api, ApiError, type OAuthProvider } from '../../api/api'
import { L, setLang, useLang } from '../../i18n'
import { useApp } from '../../state/app'
import { startSignal } from '../../state/net'
import { Icon } from '../icons'
import { Brand } from '../Brand'

const normalize = (u: string) => {
  let s = u.trim()
  if (!s) return ''
  if (!/^https?:\/\//i.test(s)) s = `${/^(localhost|127\.|192\.168\.|10\.)/.test(s) ? 'http' : 'https'}://${s}`
  return s.replace(/\/+$/, '')
}

const DEFAULT_SERVER = import.meta.env.VITE_DEFAULT_SERVER ?? (import.meta.env.DEV
  ? `${location.protocol}//${location.hostname}:8787`
  : location.protocol === 'app:' ? 'https://tenten.marusankakusikakuonline.com' : location.origin)
const PENDING_MIAUTH = 'ttv.miauth.pending'
/** デスクトップ版は X の許可の画面を既定のブラウザーで開き、終わるまで待つ（ふだんのブラウザーのログイン状態をそのまま使える） */
const OAUTH_POLL_MS = 3000
const OAUTH_WAIT_MS = 15 * 60_000
const OAUTH_LABEL: Record<OAuthProvider, string> = { x: 'X' }

export const Connect: React.FC<{ initialServer?: string }> = ({ initialServer }) => {
  useLang()
  const servers = useApp((s) => s.servers)
  const api = useApp((s) => s.api)
  const info = useApp((s) => s.info)
  const [url, setUrl] = useState(initialServer ?? servers[0]?.url ?? DEFAULT_SERVER)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [host, setHost] = useState(() => localStorage.getItem('ttv.misskeyHost') ?? 'misskey.io')
  const [devUrl, setDevUrl] = useState('http://localhost:5180/')
  const [linkedServer] = useState(() => initialServer ?? new URLSearchParams(location.search).get('server'))
  /** 既定のブラウザーでの許可を待っている方法 */
  const [waiting, setWaiting] = useState<OAuthProvider | null>(null)
  const waitId = useRef(0)
  useEffect(() => () => void waitId.current++, [])

  const connect = async (target: string, knownInfo?: ServerInfo) => {
    const u = normalize(target)
    if (!u) return
    setBusy(true)
    setErr(null)
    try {
      const a = new Api(u, null)
      const inf: ServerInfo = knownInfo ?? await a.info()
      if (inf.protocol !== PROTOCOL_VERSION) throw new Error(L(`この親サーバーは通信の版が違います（${inf.protocol}）`, `Protocol mismatch (${inf.protocol})`))
      useApp.getState().connect(u, inf)
      // 保存したトークンでそのまま入る
      const saved = useApp.getState().servers.find((s) => s.url === u)?.token
      if (saved) {
        const api2 = useApp.getState().api!
        api2.setToken(saved)
        try {
          const me = await api2.me()
          useApp.getState().login(saved, me)
          startSignal()
          useApp.getState().setScreen({ kind: 'home' })
          return
        } catch (e) {
          api2.setToken(null)
          setErr(e instanceof ApiError && e.status === 401
            ? L('前回のログインを復元できません。もう一度ログインしてください。', 'The saved sign-in could not be restored. Please sign in again.')
            : L('前回のログインを確認できません。接続先と通信状態を確認してください。', 'Could not verify the saved sign-in. Check the server and connection.'))
        }
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const signedIn = (token: string, me: MeInfo) => {
    useApp.getState().login(token, me)
    startSignal()
    useApp.getState().setScreen({ kind: 'home' })
  }

  // MiAuth・X から戻ってきた
  useEffect(() => {
    const q = new URLSearchParams(location.search)
    const session = q.get('session')
    const pending = localStorage.getItem(PENDING_MIAUTH)
    if (session && pending) {
      const { server, provider } = JSON.parse(pending) as { server: string; provider?: OAuthProvider }
      localStorage.removeItem(PENDING_MIAUTH)
      history.replaceState(null, '', location.pathname)
      void (async () => {
        setBusy(true)
        try {
          const a = new Api(server, null)
          const inf = await a.info()
          useApp.getState().connect(server, inf)
          const a2 = useApp.getState().api!
          const r = provider ? await a2.oauthFinish(provider, session) : await a2.misskeyFinish(session)
          if ('pending' in r) throw new Error(L('ログインを確認できませんでした。もう一度やり直してください。', 'Could not confirm the sign-in. Please try again.'))
          signedIn(r.token, r.me)
        } catch (e) {
          setErr(e instanceof Error ? e.message : String(e))
        } finally {
          setBusy(false)
        }
      })()
      return
    }
    const dev = q.get('devWorld')
    if (dev) {
      useApp.getState().setScreen({ kind: 'dev', worldUrl: dev })
      return
    }
    if (linkedServer) {
      setUrl(normalize(linkedServer))
      void connect(linkedServer)
    } else if (!import.meta.env.DEV && /^https?:$/.test(location.protocol)) {
      void new Api(location.origin, null).info().then((inf) => {
        if (inf?.protocol === PROTOCOL_VERSION) {
          setUrl(location.origin)
          void connect(location.origin, inf)
        } else if (servers[0]) void connect(servers[0].url)
      }).catch(() => { if (servers[0]) void connect(servers[0].url) })
    } else if (servers[0]) void connect(servers[0].url)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const misskey = async () => {
    if (!api) return
    setBusy(true)
    setErr(null)
    try {
      const h = host.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
      localStorage.setItem('ttv.misskeyHost', h)
      const callback = `${location.origin}${location.pathname}`
      const r = await api.misskeyStart(h, callback)
      localStorage.setItem(PENDING_MIAUTH, JSON.stringify({ server: api.base, session: r.session }))
      location.href = r.url
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  const oauth = async (provider: OAuthProvider) => {
    if (!api) return
    setBusy(true)
    setErr(null)
    try {
      if (location.protocol !== 'app:') {
        const r = await api.oauthStart(provider, `${location.origin}${location.pathname}`)
        localStorage.setItem(PENDING_MIAUTH, JSON.stringify({ server: api.base, session: r.session, provider }))
        location.href = r.url
        return
      }
      const r = await api.oauthStart(provider)
      // 新しいウィンドウにすると、デスクトップ版は既定のブラウザーで開く
      window.open(r.url, '_blank', 'noopener')
      const id = ++waitId.current
      setWaiting(provider)
      const until = Date.now() + OAUTH_WAIT_MS
      try {
        while (Date.now() < until) {
          await new Promise((ok) => setTimeout(ok, OAUTH_POLL_MS))
          if (waitId.current !== id) return
          const f = await api.oauthFinish(provider, r.session)
          if (waitId.current !== id) return
          if ('pending' in f) continue
          signedIn(f.token, f.me)
          return
        }
        throw new Error(L('ログインの有効期限が切れました。もう一度やり直してください。', 'The sign-in expired. Please try again.'))
      } finally {
        if (waitId.current === id) setWaiting(null)
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  const cancelWait = () => {
    waitId.current++
    setWaiting(null)
    setBusy(false)
  }

  const lang = useLang()
  const oauthProviders = (['x'] as const).filter((p) => info?.auth[p])
  const canSignIn = !!info && (info.auth.misskey || oauthProviders.length > 0)
  return (
    <div className="screen">
      <div className="center-wrap">
        <div className="card connect-card">
          <div className="row">
            <Brand info={info} server={api?.base ?? null} className="brand grow" />
            <button className="btn small" onClick={() => setLang(lang === 'ja' ? 'en' : 'ja')}>
              {lang === 'ja' ? 'English' : '日本語'}
            </button>
          </div>
          <div className="muted">{L('オープンソース・分散型のソーシャル VR。接続する親サーバーを選んでください。', 'Open-source, decentralized social VR. Choose a server to connect to.')}</div>
          {!info ? (
            <>
              <label className="field">
                {L('親サーバーの URL', 'Server URL')}
                <div className="row">
                  <input className="input grow" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void connect(url)} placeholder="https://example.com" />
                  <button className="btn primary" disabled={busy} onClick={() => void connect(url)}>
                    {L('接続', 'Connect')}
                  </button>
                </div>
              </label>
              {servers.length > 0 && (
                <div className="list">
                  <div className="muted small">{L('前に使った親サーバー', 'Recent servers')}</div>
                  {servers.map((s) => (
                    <div key={s.url} className="list-item click" onClick={() => void connect(s.url)}>
                      <div className="grow">
                        <div>{s.name}</div>
                        <div className="muted small">{s.url}</div>
                      </div>
                      <button
                        className="btn ghost small"
                        onClick={(e) => {
                          e.stopPropagation()
                          useApp.getState().forgetServer(s.url)
                        }}
                      >
                        <Icon name="close" size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <details>
                <summary className="muted small" style={{ cursor: 'pointer' }}>
                  {L('ワールド制作者向け: 開発中のワールドを開く', 'For creators: open a world in development')}
                </summary>
                <div className="row" style={{ marginTop: 8 }}>
                  <input className="input grow" value={devUrl} onChange={(e) => setDevUrl(e.target.value)} />
                  <button className="btn" onClick={() => useApp.getState().setScreen({ kind: 'dev', worldUrl: devUrl })}>
                    {L('開く', 'Open')}
                  </button>
                </div>
                <div className="muted small" style={{ marginTop: 6 }}>
                  {L('ワールドのフォルダで npx ttv-world dev を実行し、表示された URL を入れます。親サーバーなしで動き、同じブラウザの複数のタブで多人数テストができます。', 'Run "npx ttv-world dev" in the world folder. Works without a server; open several tabs to test multiplayer.')}
                </div>
              </details>
            </>
          ) : (
            <>
              <div className="list-item">
                <div className="grow">
                  <div style={{ fontWeight: 700 }}>{info.name}</div>
                  <div className="muted small">{api?.base}</div>
                  {info.description && <div className="small" style={{ marginTop: 4 }}>{info.description}</div>}
                  {info.termsUrl && (
                    <a className="small" href={info.termsUrl} target="_blank" rel="noreferrer">
                      {L('利用規約', 'Terms of service')}
                    </a>
                  )}
                </div>
                <button className="btn small" onClick={() => useApp.setState({ info: null, api: null })}>
                  {L('変更', 'Change')}
                </button>
              </div>
              {info.auth.misskey && (
                <div className="col">
                  <div className="section-title">{L('Misskey でログイン', 'Sign in with Misskey')}</div>
                  <div className="row">
                    <input className="input grow" value={host} onChange={(e) => setHost(e.target.value)} placeholder="misskey.io" list="mk-hosts" />
                    <datalist id="mk-hosts">{info.auth.misskeyHosts?.map((h) => <option key={h} value={h} />)}</datalist>
                    <button className="btn primary" disabled={busy} onClick={() => void misskey()}>
                      {L('ログイン', 'Sign in')}
                    </button>
                  </div>
                  <div className="muted small">{L('パスワードはこの親サーバーに送られません。Misskey の画面で許可してください。', 'Your password is never sent to this server.')}</div>
                </div>
              )}
              {oauthProviders.length > 0 && (
                <div className="col">
                  <div className="section-title">{info.auth.misskey ? L('ほかのアカウントでログイン', 'Or sign in with') : L('ログイン', 'Sign in')}</div>
                  <div className="row">
                    {oauthProviders.map((p) => (
                      <button key={p} className="btn grow" disabled={busy} onClick={() => void oauth(p)}>
                        {L(`${OAUTH_LABEL[p]} でログイン`, `Sign in with ${OAUTH_LABEL[p]}`)}
                      </button>
                    ))}
                  </div>
                  {waiting ? (
                    <div className="row">
                      <div className="muted small grow">{L(`ブラウザーで開いた ${OAUTH_LABEL[waiting]} の画面で許可してください。許可すると自動でログインします。`, `Approve in the ${OAUTH_LABEL[waiting]} page opened in your browser. You will be signed in automatically.`)}</div>
                      <button className="btn small" onClick={cancelWait}>{L('やめる', 'Cancel')}</button>
                    </div>
                  ) : (
                    <div className="muted small">{L('パスワードはこの親サーバーに送られません。親サーバーが読むのは名前とアイコンだけです。', 'Your password is never sent to this server. Only your name and icon are read.')}</div>
                  )}
                </div>
              )}
              {!canSignIn && <div className="muted">{L('この親サーバーではログインを利用できません。', 'Sign-in is unavailable on this server.')}</div>}
            </>
          )}
          {err && <div className="err">{err}</div>}
          <div className="muted small">{L('親サーバーごとにアカウント・フレンド・ワールドは別々です（5.2）。', 'Accounts, friends and worlds are separate on each server.')}</div>
        </div>
      </div>
    </div>
  )
}
