// トップページ
import { createRoot } from 'react-dom/client'
import { useState } from 'react'
import { CLIENT_URL, Footer, Header, Icon, L, page, useLang } from './common'
import './site.css'

const shot = (name: string) => `${import.meta.env.BASE_URL}shots/${name}.png`

const DEVICES: { icon: string; ja: string; en: string; dja: string; den: string; items: [string, string][] }[] = [
  {
    icon: 'vr',
    ja: 'VR ヘッドセット',
    en: 'VR headsets',
    dja: 'WebXR に対応したブラウザや、Windows 版から VR で参加できます。',
    den: 'Join in VR from WebXR browsers or the Windows app.',
    items: [
      ['頭と両手の動きを全身に反映', 'Head and hands drive the full body'],
      ['ハンドトラッキングで指まで', 'Finger tracking with hand tracking'],
      ['寝転ぶと寝るポーズに', 'Lie down and your avatar does too'],
    ],
  },
  {
    icon: 'desktop',
    ja: 'パソコン',
    en: 'Desktop',
    dja: 'キーボードとマウス、ゲームパッドで、ふつうの 3D ゲームのように遊べます。',
    den: 'Play like a regular 3D game with keyboard, mouse or gamepad.',
    items: [
      ['インストール不要（ブラウザ）', 'No install needed (browser)'],
      ['Windows 版は OpenXR に対応', 'Windows app supports OpenXR'],
      ['フルトラッキング（Windows 版）', 'Full-body tracking (Windows app)'],
      ['OSC でフェイストラッキング', 'Face tracking over OSC'],
    ],
  },
  {
    icon: 'phone',
    ja: 'スマートフォン',
    en: 'Smartphones',
    dja: '仮想スティックとタップで、VR のない人も同じ場所に集まれます。',
    den: 'Virtual stick and taps — everyone meets in the same place.',
    items: [
      ['VR・PC の人と同じインスタンスへ', 'Same instance as VR and PC users'],
      ['画面の大きさに合わせた UI', 'UI that fits small screens'],
      ['軽い画質の設定', 'Lightweight quality presets'],
    ],
  },
]

const FEATURES: { icon: string; ja: string; en: string; dja: string; den: string }[] = [
  { icon: 'server', ja: '親サーバーを選べる', en: 'Choose your server', dja: 'だれでも親サーバーを立てられ、利用者は接続先を自由に選べます。特定の運営に頼りません。', den: 'Anyone can run a server, and players choose where to connect.' },
  { icon: 'wifi', ja: 'P2P で軽く、止まっても続く', en: 'Peer-to-peer and resilient', dja: 'インスタンスの中は参加者どうしで直接つながります。親サーバーが止まっても、その場の交流は続きます。', den: 'Players connect directly. If the server stops, the session keeps going.' },
  { icon: 'avatar', ja: 'VRM アバター', en: 'VRM avatars', dja: 'VRM 0.x / 1.0 に対応。揺れもの・表情・リップシンク、OSC のフェイストラッキング、フルトラッキング。標準アバターは CC0 の Akane。', den: 'VRM 0.x / 1.0 with spring bones, lip sync, OSC face tracking and full-body tracking. Default avatar: Akane (CC0).' },
  { icon: 'mic', ja: '立体音響の声', en: 'Spatial voice', dja: '距離と向きで聞こえ方が変わる声。ノイズ抑制、Push-to-Talk、人ごとの音量。', den: 'Voice that sounds where people are, with noise suppression and per-user volume.' },
  { icon: 'code', ja: 'ワールドを作れる', en: 'Build worlds', dja: 'React と three.js でワールドを作り、コマンド 1 つでアップロード。複数タブで多人数のテストも。', den: 'Build with React and three.js, upload with one command, test multiplayer in tabs.' },
  { icon: 'shield', ja: '安心して遊べる', en: 'Safety built in', dja: 'ミュート・アバターの非表示・ブロック・通報。ワールドのコードはアップロード時に検査されます。', den: 'Mute, hide, block and report. World code is scanned on upload.' },
  { icon: 'users', ja: 'フレンドと集まる', en: 'Meet your friends', dja: 'フレンド・招待・参加の申請・通知。公開範囲は 5 段階から選べます。', den: 'Friends, invites, join requests and five instance access levels.' },
  { icon: 'mirror', ja: '鏡とリアクション', en: 'Mirrors & reactions', dja: '持ち運べるパーソナルミラー、自分の顔を映すフェイスミラー、ステッカーと頭上のリアクション。', den: 'A personal mirror you can carry, a face mirror, stickers and reactions.' },
]

const SHOTS: { name: string; ja: string; en: string; cls: string }[] = [
  { name: 'social', ja: 'ホームの広場で', en: 'Meeting at the home plaza', cls: 'w3' },
  { name: 'dj-lounge', ja: 'DJ ラウンジ — 曲と操作は全員で同期', en: 'DJ Lounge — music and controls are synced', cls: 'w3' },
  { name: 'home-night', ja: '夜のラウンジ（昼と夜は全員で切り替わる）', en: 'Night lounge (day and night are shared)', cls: 'w2' },
  { name: 'home-plaza', ja: 'ホームワールド', en: 'The home world', cls: 'w2' },
  { name: 'mobile', ja: 'スマホから', en: 'On a phone', cls: 'w2 tall' },
  { name: 'ui-home', ja: 'ワールドを探す', en: 'Finding worlds', cls: 'w2' },
  { name: 'ui-avatars', ja: 'アバター', en: 'Avatars', cls: 'w2' },
]

/** 親サーバーと P2P の関係の図 */
const Diagram: React.FC = () => {
  useLang()
  const server = (x: number, label: string) => (
    <g transform={`translate(${x},20)`}>
      <rect width="170" height="54" rx="12" fill="#1c2234" stroke="#3b4566" />
      <text x="85" y="23" textAnchor="middle" fill="#e9ecf5" fontSize="14" fontWeight="700">
        {label}
      </text>
      <text x="85" y="42" textAnchor="middle" fill="#a0a9c2" fontSize="11">
        {L('認証・ワールド・仲介', 'auth · worlds · signaling')}
      </text>
    </g>
  )
  const people = (cx: number, cy: number, colors: string[]) => {
    const pts = colors.map((_, i) => {
      const a = (i / colors.length) * Math.PI * 2 - Math.PI / 2
      return [cx + Math.cos(a) * 44, cy + Math.sin(a) * 34] as const
    })
    return (
      <g>
        <ellipse cx={cx} cy={cy} rx="78" ry="62" fill="#5b8cff0f" stroke="#5b8cff55" strokeDasharray="5 5" />
        {pts.map((a, i) => pts.slice(i + 1).map((b, j) => <line key={`${i}-${j}`} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#6ea8ff88" strokeWidth="1.5" />))}
        {pts.map(([x, y], i) => (
          <g key={i}>
            <circle cx={x} cy={y} r="13" fill={colors[i]} />
            <circle cx={x - 4} cy={y - 2} r="2" fill="#0b0d14" />
            <circle cx={x + 4} cy={y - 2} r="2" fill="#0b0d14" />
          </g>
        ))}
      </g>
    )
  }
  return (
    <svg viewBox="0 0 520 330" width="100%" role="img" aria-label={L('親サーバーと P2P の図', 'Servers and P2P diagram')}>
      {server(40, L('親サーバー A', 'Server A'))}
      {server(310, L('親サーバー B', 'Server B'))}
      <path d="M125 74 L125 140" stroke="#a0a9c2" strokeDasharray="4 4" />
      <path d="M395 74 L395 140" stroke="#a0a9c2" strokeDasharray="4 4" />
      {people(125, 210, ['#6ea8ff', '#ff7eb6', '#7be495', '#ffd040'])}
      {people(395, 210, ['#b18cff', '#4dd0e1', '#ff9f6b'])}
      <text x="125" y="300" textAnchor="middle" fill="#a0a9c2" fontSize="12">
        {L('インスタンス（P2P でつながる）', 'Instance (peer-to-peer)')}
      </text>
      <text x="395" y="300" textAnchor="middle" fill="#a0a9c2" fontSize="12">
        {L('別の親サーバーのインスタンス', "Another server's instance")}
      </text>
    </svg>
  )
}

const Landing: React.FC = () => {
  useLang()
  const [zoom, setZoom] = useState<string | null>(null)
  return (
    <>
      <Header current="home" />
      <main>
        <section className="hero" style={{ padding: undefined }}>
          <div className="hero-bg" style={{ backgroundImage: `url(${shot('social')})` }} />
          <div className="wrap hero-inner">
            <span className="eyebrow">
              <Icon name="sparkle" size={16} />
              {L('オープンソースのソーシャル VR', 'Open-source social VR')}
            </span>
            <h1>
              {L('みんなでつくる、', 'A social VR space')}
              <br />
              <span className="grad">{L('分散型のソーシャル VR', 'run by everyone')}</span>
            </h1>
            <p className="lead">{L('VR・パソコン・スマホから、同じ場所に集まって話そう。だれでも親サーバーを立てられ、ワールドもアバターも自分で持ち込めます。', 'Meet in the same place from VR, desktop or phone. Anyone can host a server and bring their own worlds and avatars.')}</p>
            <div className="cta">
              <a className="btn primary" href={CLIENT_URL}>
                <Icon name="browser" size={18} />
                {L('ブラウザで始める', 'Launch in browser')}
              </a>
              <a className="btn" href={page('download/')}>
                <Icon name="windows" size={18} />
                {L('Windows 版', 'Windows app')}
              </a>
              <a className="btn ghost" href={page('docs/')}>
                <Icon name="book" size={18} />
                {L('ドキュメント', 'Docs')}
              </a>
            </div>
            <div className="hero-meta">
              <span>
                <Icon name="check" size={16} />
                {L('無料・AGPL-3.0', 'Free · AGPL-3.0')}
              </span>
              <span>
                <Icon name="check" size={16} />
                {L('インストール不要', 'No install required')}
              </span>
              <span>
                <Icon name="check" size={16} />
                {L('Misskey でログイン', 'Sign in with Misskey')}
              </span>
            </div>
          </div>
        </section>

        <section id="devices">
          <div className="wrap">
            <div className="section-head">
              <span className="kicker">{L('どの端末からでも', 'Any device')}</span>
              <h2>{L('VR がなくても、同じ場所へ', 'No headset? Join anyway')}</h2>
              <p>{L('VR ヘッドセット・パソコン・スマートフォンの人が、同じワールドの同じインスタンスに集まれます。', 'VR, desktop and phone users meet in the same instance of the same world.')}</p>
            </div>
            <div className="devices">
              {DEVICES.map((d) => (
                <div key={d.icon} className="device">
                  <div className="ic">
                    <Icon name={d.icon} size={28} />
                  </div>
                  <h3>{L(d.ja, d.en)}</h3>
                  <p>{L(d.dja, d.den)}</p>
                  <ul>
                    {d.items.map(([ja, en]) => (
                      <li key={ja}>{L(ja, en)}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="features" className="alt">
          <div className="wrap">
            <div className="section-head">
              <span className="kicker">{L('特徴', 'Features')}</span>
              <h2>{L('ソーシャル VR に必要なものを、ひととおり', 'Everything a social VR space needs')}</h2>
            </div>
            <div className="features">
              {FEATURES.map((f) => (
                <div key={f.icon} className="feature">
                  <Icon name={f.icon} size={26} className="ic" />
                  <h3>{L(f.ja, f.en)}</h3>
                  <p>{L(f.dja, f.den)}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="gallery">
          <div className="wrap">
            <div className="section-head">
              <span className="kicker">{L('スクリーンショット', 'Screenshots')}</span>
              <h2>{L('標準のワールドから始めよう', 'Start with the bundled worlds')}</h2>
              <p>{L('親サーバーには、ホームワールドと DJ ラウンジがはじめから入っています。', 'Every server ships with a home world and a DJ lounge.')}</p>
            </div>
            <div className="gallery">
              {SHOTS.map((s) => (
                <figure key={s.name} className={`shot ${s.cls}`} onClick={() => setZoom(s.name)}>
                  <img src={shot(s.name)} alt={L(s.ja, s.en)} loading="lazy" />
                  <figcaption>{L(s.ja, s.en)}</figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>

        <section id="servers" className="alt">
          <div className="wrap split">
            <div>
              <div className="section-head" style={{ marginBottom: 24 }}>
                <span className="kicker">{L('分散のしくみ', 'How it works')}</span>
                <h2>{L('ひとつの会社に、頼らない', 'No single company in charge')}</h2>
                <p>{L('親サーバーはログインやワールドの置き場所を受け持ち、インスタンスの中のやり取りは参加者どうしが直接行います。', 'Servers handle sign-in and hosting; inside an instance, players talk to each other directly.')}</p>
              </div>
              <ul className="points">
                <li>
                  <span className="ic">
                    <Icon name="server" size={20} />
                  </span>
                  <div>
                    <b>{L('だれでも親サーバーを立てられる', 'Anyone can host')}</b>
                    <span>{L('npm start ひとつで、クライアントの画面もワールドも配信します。', 'One npm start serves the client and the worlds.')}</span>
                  </div>
                </li>
                <li>
                  <span className="ic">
                    <Icon name="wifi" size={20} />
                  </span>
                  <div>
                    <b>{L('止まっても、その場は続く', 'Keeps going when a server stops')}</b>
                    <span>{L('親サーバーが止まっても、つながっている人どうしの声と動きはそのまま。戻れば自動で入り直します。', 'Voice and movement continue between connected players, and rejoin when the server returns.')}</span>
                  </div>
                </li>
                <li>
                  <span className="ic">
                    <Icon name="key" size={20} />
                  </span>
                  <div>
                    <b>{L('プライバシーも選べる', 'Privacy options')}</b>
                    <span>{L('IP アドレスを相手に知らせたくない人は、親サーバーの中継だけを使えます（声も中継）。', 'Prefer not to share your IP? Route everything, including voice, through the server.')}</span>
                  </div>
                </li>
              </ul>
            </div>
            <div className="diagram">
              <Diagram />
            </div>
          </div>
        </section>

        <section id="creators">
          <div className="wrap split">
            <div>
              <div className="section-head" style={{ marginBottom: 24 }}>
                <span className="kicker">{L('制作者の方へ', 'For creators')}</span>
                <h2>{L('React で、ワールドをつくる', 'Build worlds with React')}</h2>
                <p>{L('押せる物・つかめる物・椅子・鏡・動画・ポータル・全員で同期する状態・保存するデータ。SDK の部品を組み合わせて、すぐに多人数で動くワールドになります。', 'Buttons, pickups, chairs, mirrors, video, portals, synced state and saved data — combine SDK parts and it just works in multiplayer.')}</p>
              </div>
              <div className="cta">
                <a className="btn primary" href={page('docs/') + '?doc=sdk'}>
                  <Icon name="book" size={18} />
                  {L('SDK のドキュメント', 'SDK docs')}
                </a>
              </div>
            </div>
            <pre className="code">
              <span className="k">import</span> {'{ Clickable, SpawnPad, useSyncedState }'} <span className="k">from</span> <span className="s">'@tentenv/sdk'</span>
              {'\n\n'}
              <span className="k">export default function</span> <span className="t">World</span>() {'{'}
              {'\n  '}
              <span className="c">{L('// 全員で同じ値（あとから来た人にも届く）', '// shared by everyone, even late joiners')}</span>
              {'\n  '}
              <span className="k">const</span> [on, setOn] = <span className="t">useSyncedState</span>(<span className="s">'lamp'</span>, <span className="k">false</span>)
              {'\n  '}
              <span className="k">return</span> (
              {'\n    <>\n      '}
              {'<'}
              <span className="t">SpawnPad</span> position={'{[0, 0, 4]}'} /{'>'}
              {'\n      <'}
              <span className="t">Clickable</span> label=<span className="s">"{L('ライト', 'Lamp')}"</span> onClick={'{() => setOn(!on)}'}
              {'>\n        <mesh>\n          <boxGeometry />\n          <meshStandardMaterial emissive={on ? '}
              <span className="s">'orange'</span> : <span className="s">'black'</span>
              {'} />\n        </mesh>\n      </'}
              <span className="t">Clickable</span>
              {'>\n    </>\n  )\n}'}
              {'\n\n'}
              <span className="c">{L('// npx ttv-world upload --server https://… でアップロード', '// npx ttv-world upload --server https://… to publish')}</span>
            </pre>
          </div>
        </section>

        <section id="hosting" className="alt">
          <div className="wrap">
            <div className="section-head">
              <span className="kicker">{L('サーバー運営', 'Hosting')}</span>
              <h2>{L('自分たちの場所を、自分たちで', 'Your own place, on your terms')}</h2>
            </div>
            <div className="cards3">
              <div className="card">
                <h3>
                  <Icon name="server" size={22} />
                  {L('すぐに立てられる', 'Quick to start')}
                </h3>
                <p>{L('Node.js があれば、データベースも同梱の SQLite。初回起動で標準のワールドが入ります。', 'Just Node.js — SQLite is built in, and default worlds install on first start.')}</p>
                <pre className="code">npm install{'\n'}npm start</pre>
              </div>
              <div className="card">
                <h3>
                  <Icon name="key" size={22} />
                  {L('ログインを選べる', 'Pick your sign-in')}
                </h3>
                <p>{L('Misskey のアカウントでログイン（パスワードは受け取りません）。ゲストの入室も設定で切り替えられます。', 'Sign in with Misskey (no passwords are collected). Guest access is a config switch.')}</p>
              </div>
              <div className="card">
                <h3>
                  <Icon name="shield" size={22} />
                  {L('運営に必要な機能', 'Moderation tools')}
                </h3>
                <p>{L('通報の受け付けと対応、レート制限、アップロードの上限、中継の可否などを設定できます。', 'Reports, rate limits, upload limits and relay settings are all configurable.')}</p>
              </div>
            </div>
            <div className="cta" style={{ marginTop: 26 }}>
              <a className="btn" href={page('docs/') + '?doc=server'}>
                <Icon name="book" size={18} />
                {L('親サーバーの運営ガイド', 'Server operator guide')}
              </a>
            </div>
          </div>
        </section>

        <section id="faq">
          <div className="wrap">
            <div className="section-head">
              <span className="kicker">FAQ</span>
              <h2>{L('よくある質問', 'Questions')}</h2>
            </div>
            <div className="faq">
              {(
                [
                  ['無料ですか？', 'Is it free?', 'はい。TenTenV は AGPL-3.0 のオープンソースです。改変した親サーバーを公開するときは、そのソースコードも利用者に公開してください。親サーバーによっては、運営者が独自の利用規約を定めていることがあります。', "Yes. TenTenV is open source under the AGPL-3.0. If you run a modified server, you must offer its source code to your users. Individual servers may have their own terms."],
                  ['VR ヘッドセットがなくても遊べますか？', 'Do I need a VR headset?', 'はい。パソコンのブラウザやスマートフォンから、VR の人と同じインスタンスに入れます。', 'No. Join the same instances from a desktop browser or a phone.'],
                  ['iPhone で VR は使えますか？', 'Can I use VR on iPhone?', 'iPhone の Safari は WebXR の VR に対応していないため、画面での操作になります。', "iPhone Safari does not support WebXR VR, so you'll play on the screen."],
                  ['使えるアバターの形式は？', 'Which avatar formats are supported?', 'VRM 0.x と 1.0 です。VRM に書かれた利用条件を表示し、アップロードしたアバターはその人だけが使えます。', 'VRM 0.x and 1.0. License info is shown, and uploaded avatars can only be used by the uploader.'],
                  ['親サーバーを変えると、フレンドはどうなりますか？', 'What happens to my friends if I switch servers?', 'アカウント・フレンド・ワールドは親サーバーごとに別です。別の親サーバーの人とは同じインスタンスに入れません。', 'Accounts, friends and worlds are per server. You cannot share an instance across servers.'],
                  ['IP アドレスは相手に知られますか？', 'Will others see my IP address?', 'P2P では通信相手に知られることがあります。設定の「常に中継を使う」にすると、声も含めて親サーバー経由になり、相手には知られません。', 'With P2P, peers can see it. Turn on "Always relay" to route everything, including voice, through the server.'],
              ] as const
              ).map(([qja, qen, aja, aen]) => (
                <details key={qja}>
                  <summary>
                    {L(qja, qen)}
                    <Icon name="arrowRight" size={18} />
                  </summary>
                  <p>{L(aja, aen)}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="final">
          <div className="wrap">
            <h2>{L('さあ、集まろう。', "Let's meet up.")}</h2>
            <p className="muted">{L('ブラウザを開くだけ。アカウントは Misskey で作れます。', 'Just open a browser. Sign in with Misskey.')}</p>
            <div className="cta">
              <a className="btn primary" href={CLIENT_URL}>
                <Icon name="browser" size={18} />
                {L('ブラウザで始める', 'Launch in browser')}
              </a>
              <a className="btn" href={page('download/')}>
                <Icon name="download" size={18} />
                {L('ダウンロード', 'Download')}
              </a>
            </div>
          </div>
        </section>
      </main>
      <Footer />
      {zoom && (
        <div className="lightbox" onClick={() => setZoom(null)}>
          <img src={shot(zoom)} alt="" />
        </div>
      )}
    </>
  )
}

createRoot(document.getElementById('root')!).render(<Landing />)
