// ダウンロード: ブラウザ・Windows 版・VR ヘッドセットでの始め方
import { createRoot } from 'react-dom/client'
import { useEffect, useState } from 'react'
import { CLIENT_URL, Footer, Header, Icon, L, page, useLang, WINDOWS_ZIP } from './common'
import './site.css'

/** Windows 版の zip がこのサイトに置いてあるか */
const useZip = () => {
  const [state, setState] = useState<{ ok: boolean; size?: number } | null>(null)
  useEffect(() => {
    fetch(WINDOWS_ZIP, { method: 'HEAD' })
      .then((r) => {
        const type = r.headers.get('content-type') ?? ''
        // 開発サーバーは無いファイルにも index.html を返すので、種類も見る
        setState(r.ok && !type.includes('text/html') ? { ok: true, size: Number(r.headers.get('content-length')) || undefined } : { ok: false })
      })
      .catch(() => setState({ ok: false }))
  }, [])
  return state
}

const Download: React.FC = () => {
  useLang()
  const zip = useZip()
  useEffect(() => {
    document.title = `${L('ダウンロード', 'Download')} — TenTenV`
  })
  return (
    <>
      <Header current="download" />
      <main>
        <div className="page-head">
          <div className="wrap">
            <h1>{L('TenTenV を始める', 'Get TenTenV')}</h1>
            <p>{L('いちばん手軽なのはブラウザです。PC につないだ VR ヘッドセットで遊ぶなら Windows 版が便利です。', 'The browser is the easiest way in. For PC VR headsets, the Windows app is handy.')}</p>
          </div>
        </div>
        <section>
          <div className="wrap dl-grid">
            <div className="dl featured">
              <div className="ic">
                <Icon name="browser" size={30} />
              </div>
              <h2>{L('ブラウザ', 'Browser')}</h2>
              <p className="muted">{L('インストールは要りません。PC・スマホ・スタンドアロンの VR ヘッドセットのブラウザで開けます。', 'Nothing to install. Works in browsers on PC, phones and standalone VR headsets.')}</p>
              <ul>
                <li>{L('最新版の対応ブラウザ', 'Latest supported browser')}</li>
                <li>{L('対応するヘッドセットのブラウザで VR', 'VR in a supported headset browser')}</li>
                <li>{L('ホーム画面に追加してアプリのように使える', 'Add to your home screen like an app')}</li>
              </ul>
              <a className="btn primary" href={CLIENT_URL}>
                <Icon name="browser" size={18} />
                {L('ブラウザで始める', 'Launch in browser')}
              </a>
            </div>

            <div className="dl">
              <div className="ic">
                <Icon name="windows" size={30} />
              </div>
              <h2>{L('Windows 版', 'Windows')}</h2>
              <p className="muted">{L('OpenXR 対応の PC VR で遊べるアプリです。', 'A desktop app for OpenXR compatible PC VR.')}</p>
              <ul>
                <li>{L('Windows 10 / 11（x64）', 'Windows 10 / 11 (x64)')}</li>
                <li>{L('OpenXR に対応した VR ランタイム', 'Any OpenXR runtime')}</li>
                <li>{L('対応する VR ランタイムのライブラリに登録できる', 'Can be added to a compatible VR runtime library')}</li>
              </ul>
              {zip?.ok ? (
                <a className="btn" href={WINDOWS_ZIP} download>
                  <Icon name="download" size={18} />
                  {L('zip をダウンロード', 'Download zip')}
                  {zip.size ? ` (${Math.round(zip.size / 1048576)} MB)` : ''}
                </a>
              ) : (
                <a className="btn" href={page('docs/') + '?doc=desktop#ビルドと起動'}>
                  <Icon name="code" size={18} />
                  {zip ? L('ソースからビルドする', 'Build from source') : L('確認しています…', 'Checking…')}
                </a>
              )}
            </div>

            <div className="dl">
              <div className="ic">
                <Icon name="vr" size={30} />
              </div>
              <h2>{L('VR ヘッドセット', 'VR headsets')}</h2>
              <p className="muted">{L('スタンドアロンの VR ヘッドセットは、ヘッドセットのブラウザで開くだけです。', 'On standalone headsets, just open it in the headset browser.')}</p>
              <ul>
                <li>{L('対応する単体型 VR ヘッドセット', 'Compatible standalone VR headsets')}</li>
                <li>{L('WebXR 対応機', 'WebXR compatible devices')}</li>
                <li>{L('ハンドトラッキングにも対応', 'Hand tracking supported')}</li>
              </ul>
              <a className="btn" href={page('docs/') + '?doc=user-guide'}>
                <Icon name="book" size={18} />
                {L('使い方を見る', 'Read the guide')}
              </a>
            </div>
          </div>
        </section>

        <section className="alt">
          <div className="wrap split">
            <div>
              <h2 style={{ marginBottom: 18 }}>{L('Windows 版の始め方', 'Setting up the Windows app')}</h2>
              <ol className="steps">
                <li>
                  <div>
                    <b>{L('zip を展開する', 'Extract the zip')}</b>
                    <div className="muted">{L('好きな場所に展開し、TenTenV.exe を起動します。', 'Extract anywhere and run TenTenV.exe.')}</div>
                  </div>
                </li>
                <li>
                  <div>
                    <b>{L('親サーバーに接続する', 'Connect to a server')}</b>
                    <div className="muted">{L('親サーバーの URL を入れて接続し、ログインします（ブラウザ版と同じ画面です）。', 'Enter a server URL and sign in — the same screen as the browser version.')}</div>
                  </div>
                </li>
                <li>
                  <div>
                    <b>{L('VR に入る', 'Enter VR')}</b>
                    <div className="muted">{L('ワールドで右上の「VR」ボタンか Ctrl+Shift+V。対応する VR ランタイムに登録すると、そこから直接 VR で起動できます。', 'Press the VR button or Ctrl+Shift+V in a world. Register it in a compatible VR runtime to launch straight into VR.')}</div>
                  </div>
                </li>
              </ol>
            </div>
            <div>
              <h2 style={{ marginBottom: 18 }}>{L('VR ヘッドセットのブラウザで', 'In a headset browser')}</h2>
              <ol className="steps">
                <li>
                  <div>
                    <b>{L('ブラウザでクライアントを開く', 'Open the client')}</b>
                    <div className="muted">{L('親サーバーの URL をヘッドセットのブラウザで開きます。', 'Open the server URL in the headset browser.')}</div>
                  </div>
                </li>
                <li>
                  <div>
                    <b>{L('ワールドに入る', 'Join a world')}</b>
                    <div className="muted">{L('ログインしてワールドを選び、「参加」を押します。', 'Sign in, choose a world and press Join.')}</div>
                  </div>
                </li>
                <li>
                  <div>
                    <b>{L('「VR」を押す', 'Press VR')}</b>
                    <div className="muted">{L('左手の Y / B ボタンでメニュー。コントローラーを置くとハンドトラッキングに切り替わります。', 'Y / B on the left hand opens the menu. Put the controllers down to switch to hand tracking.')}</div>
                  </div>
                </li>
              </ol>
            </div>
          </div>
        </section>

        <section>
          <div className="wrap">
            <div className="section-head">
              <span className="kicker">{L('親サーバー', 'Servers')}</span>
              <h2>{L('自分で親サーバーを立てる', 'Host your own server')}</h2>
              <p>{L('Node.js 22.13 以上があれば、リポジトリのルートで次のコマンドを実行するだけです。クライアントもワールドも、この親サーバーから配信されます。', 'With Node.js 22.13+, run this at the repository root. The server also serves the client and the worlds.')}</p>
            </div>
            <pre className="code">npm install{'\n'}npm start{'\n\n'}<span className="c">{L('# http://localhost:8787 を開く', '# open http://localhost:8787')}</span></pre>
            <div className="cta" style={{ marginTop: 22 }}>
              <a className="btn" href={page('docs/') + '?doc=server'}>
                <Icon name="book" size={18} />
                {L('親サーバーの運営ガイド', 'Server operator guide')}
              </a>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}

createRoot(document.getElementById('root')!).render(<Download />)
