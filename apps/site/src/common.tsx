// サイトの共通部品: 言語・ヘッダー・フッター・リンク先
import { useEffect, useState, useSyncExternalStore } from 'react'
import { Icon } from '../../client/src/ui/icons'

export { Icon }

// ---------------- 言語 ----------------

type Lang = 'ja' | 'en'
const KEY = 'ttv.site.lang'
const detect = (): Lang => {
  try {
    const s = localStorage.getItem(KEY)
    if (s === 'ja' || s === 'en') return s
  } catch {
    // 保存できない環境
  }
  return navigator.language.toLowerCase().startsWith('ja') ? 'ja' : 'en'
}
let lang: Lang = detect()
const subs = new Set<() => void>()
export const setLang = (l: Lang) => {
  lang = l
  try {
    localStorage.setItem(KEY, l)
  } catch {
    // 保存できなくても切り替える
  }
  document.documentElement.lang = l
  subs.forEach((f) => f())
}
export const useLang = () =>
  useSyncExternalStore(
    (f) => {
      subs.add(f)
      return () => subs.delete(f)
    },
    () => lang,
    () => lang,
  )
export const L = (ja: string, en: string) => (lang === 'ja' ? ja : en)

// ---------------- リンク先 ----------------

/** 「ブラウザで始める」の行き先（クライアント）。ビルド時に VITE_CLIENT_URL で変えられる */
export const CLIENT_URL = import.meta.env.VITE_CLIENT_URL ?? (import.meta.env.DEV ? 'http://127.0.0.1:5190' : 'https://tenten.marusankakusikakuonline.com/')
/** ソースコードの置き場所（あれば） */
export const REPO_URL: string = import.meta.env.VITE_REPO_URL ?? 'https://github.com/KinuX2/TenTenV'
export const WINDOWS_ZIP = `${import.meta.env.BASE_URL}downloads/TenTenV-win32-x64.zip`
export const page = (p: '' | 'docs/' | 'download/') => `${import.meta.env.BASE_URL}${p}`

// ---------------- ヘッダー・フッター ----------------

export const Logo: React.FC<{ size?: number }> = ({ size = 34 }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
    <rect width="64" height="64" rx="16" fill="#0d0f17" />
    <rect x="1.5" y="1.5" width="61" height="61" rx="14.5" fill="none" stroke="url(#lg)" strokeWidth="3" />
    <defs>
      <linearGradient id="lg" x1="0" y1="0" x2="64" y2="64">
        <stop offset="0" stopColor="#6ea8ff" />
        <stop offset="1" stopColor="#ff7eb6" />
      </linearGradient>
    </defs>
    <circle cx="22" cy="28" r="7" fill="#6ea8ff" />
    <circle cx="42" cy="28" r="7" fill="#ff7eb6" />
    <path d="M14 46c10 6 26 6 36 0" stroke="#fff" strokeWidth="4" fill="none" strokeLinecap="round" />
  </svg>
)

export const Header: React.FC<{ current: 'home' | 'docs' | 'download' }> = ({ current }) => {
  useLang()
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const f = () => setScrolled(window.scrollY > 8)
    f()
    window.addEventListener('scroll', f, { passive: true })
    return () => window.removeEventListener('scroll', f)
  }, [])
  const links: [string, string, string, boolean][] = [
    [page('') + '#features', '特徴', 'Features', false],
    [page('') + '#creators', '制作者の方へ', 'Creators', false],
    [page('') + '#servers', 'サーバー運営', 'Hosting', false],
    [page('download/'), 'ダウンロード', 'Download', current === 'download'],
    [page('docs/'), 'ドキュメント', 'Docs', current === 'docs'],
  ]
  return (
    <header className={`site-header${scrolled || current !== 'home' ? ' solid' : ''}`}>
      <div className="wrap header-row">
        <a className="brand" href={page('')}>
          <Logo />
          <span>TenTenV</span>
        </a>
        <nav className={`nav${open ? ' open' : ''}`}>
          {links.map(([href, ja, en, on]) => (
            <a key={href} href={href} className={on ? 'on' : undefined} onClick={() => setOpen(false)}>
              {L(ja, en)}
            </a>
          ))}
          <button className="lang" onClick={() => setLang(lang === 'ja' ? 'en' : 'ja')}>
            <Icon name="globe" size={16} />
            {lang === 'ja' ? 'English' : '日本語'}
          </button>
          <a className="btn primary small" href={CLIENT_URL}>
            {L('ブラウザで始める', 'Launch in browser')}
          </a>
        </nav>
        <button className="menu-btn" onClick={() => setOpen(!open)} aria-label={L('メニュー', 'Menu')}>
          <Icon name={open ? 'close' : 'menu'} size={24} />
        </button>
      </div>
    </header>
  )
}

export const Footer: React.FC = () => {
  useLang()
  return (
    <footer className="site-footer">
      <div className="wrap footer-grid">
        <div>
          <a className="brand" href={page('')}>
            <Logo size={28} />
            <span>TenTenV</span>
          </a>
          <p className="muted">{L('オープンソース・分散型のソーシャル VR。', 'Open-source, decentralized social VR.')}</p>
        </div>
        <div>
          <h4>{L('はじめる', 'Get started')}</h4>
          <a href={CLIENT_URL}>{L('ブラウザで始める', 'Launch in browser')}</a>
          <a href={page('download/')}>{L('ダウンロード', 'Download')}</a>
          <a href={page('docs/') + '?doc=user-guide'}>{L('利用ガイド', 'User guide')}</a>
        </div>
        <div>
          <h4>{L('つくる・運営する', 'Build & host')}</h4>
          <a href={page('docs/') + '?doc=sdk'}>{L('ワールド SDK', 'World SDK')}</a>
          <a href={page('docs/') + '?doc=server'}>{L('親サーバーの運営', 'Hosting a server')}</a>
          <a href={page('docs/') + '?doc=protocol'}>{L('通信の仕様', 'Protocol')}</a>
        </div>
        <div>
          <h4>{L('プロジェクト', 'Project')}</h4>
          <a href={REPO_URL}>{L('ソースコード（GitHub）', 'Source code (GitHub)')}</a>
          <a href={page('docs/') + '?doc=third-party'}>{L('ライセンス', 'Licenses')}</a>
          <a href={page('docs/') + '?doc=plan'}>{L('開発計画', 'Roadmap')}</a>
        </div>
      </div>
      <div className="wrap copyright muted">© 2026 TenTenV contributors · AGPL-3.0</div>
    </footer>
  )
}
