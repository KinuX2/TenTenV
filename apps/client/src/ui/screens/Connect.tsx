// 起動画面: 親サーバーを選んでログインする（4.3・5.1）
import type { ServerInfo } from '@tentenv/protocol'
import { PROTOCOL_VERSION } from '@tentenv/protocol'
import { useEffect, useState } from 'react'
import { Api, ApiError } from '../../api/api'
import { L, setLang, useLang } from '../../i18n'
import { useApp } from '../../state/app'
import { startSignal } from '../../state/net'
import { Icon } from '../icons'

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

export const Connect: React.FC<{ initialServer?: string }> = ({ initialServer }) => {
  useLang()
  const servers = useApp((s) => s.servers)
  const api = useApp((s) => s.api)
  const info = useApp((s) => s.info)
  const [url, setUrl] = useState(initialServer ?? servers[0]?.url ?? DEFAULT_SERVER)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [name, setName] = useState(() => localStorage.getItem('ttv.guestName') ?? '')
  const [host, setHost] = useState(() => localStorage.getItem('ttv.misskeyHost') ?? 'misskey.io')
  const [devUrl, setDevUrl] = useState('http://localhost:5180/')
  const [linkedServer] = useState(() => initialServer ?? new URLSearchParams(location.search).get('server'))

  const connect = async (target: string) => {
    const u = normalize(target)
    if (!u) return
    setBusy(true)
    setErr(null)
    try {
      const a = new Api(u, null)
      const inf: ServerInfo = await a.info()
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
            ? L('前回のログインを復元できません。ゲストで入り直すと別のアカウントになり、以前のアップロードは表示されません。', 'The saved sign-in could not be restored. Signing in as a guest creates a different account, so earlier uploads will not appear.')
            : L('前回のログインを確認できません。接続先と通信状態を確認してください。', 'Could not verify the saved sign-in. Check the server and connection.'))
        }
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  // MiAuth から戻ってきた
  useEffect(() => {
    const q = new URLSearchParams(location.search)
    const session = q.get('session')
    const pending = localStorage.getItem(PENDING_MIAUTH)
    if (session && pending) {
      const { server } = JSON.parse(pending) as { server: string }
      localStorage.removeItem(PENDING_MIAUTH)
      history.replaceState(null, '', location.pathname)
      void (async () => {
        setBusy(true)
        try {
          const a = new Api(server, null)
          const inf = await a.info()
          useApp.getState().connect(server, inf)
          const r = await useApp.getState().api!.misskeyFinish(session)
          useApp.getState().login(r.token, r.me)
          startSignal()
          useApp.getState().setScreen({ kind: 'home' })
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
    } else if (servers[0]) void connect(servers[0].url)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const guest = async () => {
    if (!api) return
    const n = name.trim() || `Guest${Math.floor(Math.random() * 9000 + 1000)}`
    setBusy(true)
    setErr(null)
    try {
      localStorage.setItem('ttv.guestName', n)
      const r = await api.guest(n)
      useApp.getState().login(r.token, r.me)
      startSignal()
      useApp.getState().setScreen({ kind: 'home' })
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

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

  const lang = useLang()
  return (
    <div className="screen">
      <div className="center-wrap">
        <div className="card connect-card">
          <div className="row">
            <div className="brand grow">
              <img src="/icon.svg" alt="" />
              TenTenV
            </div>
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
              {info.auth.guest && (
                <div className="col">
                  <div className="section-title">{L('ゲストで入る', 'Continue as guest')}</div>
                  <div className="row">
                    <input className="input grow" value={name} maxLength={32} onChange={(e) => setName(e.target.value)} placeholder={L('表示名', 'Display name')} onKeyDown={(e) => e.key === 'Enter' && void guest()} />
                    <button className="btn" disabled={busy} onClick={() => void guest()}>
                      {L('入る', 'Enter')}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
          {err && <div className="err">{err}</div>}
          <div className="muted small">{L('親サーバーごとにアカウント・フレンド・ワールドは別々です（5.2）。', 'Accounts, friends and worlds are separate on each server.')}</div>
        </div>
      </div>
    </div>
  )
}
