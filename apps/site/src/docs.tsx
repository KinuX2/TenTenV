// ドキュメント: リポジトリの Markdown をそのまま読み込んで表示する（目次・検索つき）
import { createRoot } from 'react-dom/client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { marked } from 'marked'
import { HOME, Icon, L, REPO_URL, setLang, useLang } from './common'
import './site.css'
import './docs-theme.css'
import userGuide from '../../../docs/USER_GUIDE.md?raw'
import sdk from '../../../docs/SDK.md?raw'
import protocol from '../../../docs/PROTOCOL.md?raw'
import testing from '../../../docs/TESTING.md?raw'
import thirdParty from '../../../docs/THIRD_PARTY.md?raw'
import server from '../../server/README.md?raw'
import desktop from '../../desktop/README.md?raw'

interface Doc {
  id: string
  /** リポジトリの中のパス（Markdown どうしのリンクを、このページの中のリンクに変えるのに使う） */
  path: string
  group: 'use' | 'build' | 'project'
  icon: string
  ja: string
  en: string
  md: string
}

const DOCS: Doc[] = [
  { id: 'user-guide', path: 'docs/USER_GUIDE.md', group: 'use', icon: 'book', ja: '利用ガイド', en: 'User guide', md: userGuide },
  { id: 'desktop', path: 'apps/desktop/README.md', group: 'use', icon: 'windows', ja: 'Windows 版', en: 'Windows app', md: desktop },
  { id: 'sdk', path: 'docs/SDK.md', group: 'build', icon: 'code', ja: 'ワールド SDK', en: 'World SDK', md: sdk },
  { id: 'server', path: 'apps/server/README.md', group: 'build', icon: 'server', ja: '親サーバーの運営', en: 'Hosting a server', md: server },
  { id: 'protocol', path: 'docs/PROTOCOL.md', group: 'build', icon: 'wifi', ja: '通信の仕様', en: 'Protocol', md: protocol },
  { id: 'testing', path: 'docs/TESTING.md', group: 'project', icon: 'check', ja: 'テストと確認', en: 'Testing', md: testing },
  { id: 'third-party', path: 'docs/THIRD_PARTY.md', group: 'project', icon: 'shield', ja: 'ライセンス', en: 'Licenses', md: thirdParty },
]

const GROUPS: [Doc['group'], string, string][] = [
  ['use', '使う', 'USE'],
  ['build', 'つくる・運営する', 'BUILD & HOST'],
  ['project', 'プロジェクト', 'PROJECT'],
]

const SUMMARIES: Record<string, [string, string]> = {
  'user-guide': ['ワールド、メニュー、アバター、音声の使い方', 'Worlds, menus, avatars, and voice'],
  desktop: ['Windows 版の導入と VR の操作', 'Install and use the Windows app'],
  sdk: ['ワールド制作とアップロード', 'Create and upload worlds'],
  server: ['設定、公開、バックアップ', 'Configure, publish, and back up a server'],
  protocol: ['API、接続、同期の仕組み', 'API, connections, and synchronization'],
  testing: ['動作確認とトラブルの切り分け', 'Verification and troubleshooting'],
  'third-party': ['素材とライブラリの利用条件', 'Licenses for assets and libraries'],
}

/** 見出しのアンカー（GitHub と同じ規則: 小文字にして記号を消し、空白を - に） */
const slug = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-')

/** 'a/b/../c.md' のようなパスを整える */
const normalize = (p: string) => {
  const out: string[] = []
  for (const part of p.split('/')) {
    if (part === '..') out.pop()
    else if (part && part !== '.') out.push(part)
  }
  return out.join('/')
}

const docHref = (id: string, hash = '') => `${HOME}?doc=${id}${hash ? '#' + hash : ''}`

const currentId = () => {
  const id = new URLSearchParams(location.search).get('doc')
  return DOCS.some((d) => d.id === id) ? id : null
}

/** Markdown から検索用の平文を作る */
const plain = (md: string) =>
  md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*`|_[\]()-]/g, ' ')
    .replace(/\s+/g, ' ')

interface Hit {
  doc: Doc
  heading: string
  snippet: string
}

const search = (q: string): Hit[] => {
  const k = q.trim().toLowerCase()
  if (k.length < 2) return []
  const hits: Hit[] = []
  for (const doc of DOCS) {
    // 見出しごとに区切って、どの節に出てくるかを示す
    const sections = doc.md.split(/^(?=#{1,3} )/m)
    for (const sec of sections) {
      const heading = /^#{1,3} (.*)/.exec(sec)?.[1] ?? doc.ja
      const text = plain(sec)
      const i = text.toLowerCase().indexOf(k)
      if (i < 0) continue
      hits.push({ doc, heading, snippet: (i > 40 ? '…' : '') + text.slice(Math.max(0, i - 40), i + k.length + 60).trim() + '…' })
      if (hits.length >= 30) return hits
    }
  }
  return hits
}

const Highlight: React.FC<{ text: string; q: string }> = ({ text, q }) => {
  const k = q.trim().toLowerCase()
  const i = text.toLowerCase().indexOf(k)
  if (i < 0 || !k) return <>{text}</>
  return (
    <>
      {text.slice(0, i)}
      <mark>{text.slice(i, i + k.length)}</mark>
      {text.slice(i + k.length)}
    </>
  )
}

interface TocItem {
  id: string
  text: string
  level: number
}

const Docs: React.FC = () => {
  const lang = useLang()
  const [id, setId] = useState<string | null>(currentId)
  const [q, setQ] = useState('')
  const [toc, setToc] = useState<TocItem[]>([])
  const [active, setActive] = useState('')
  const body = useRef<HTMLDivElement>(null)
  const doc = DOCS.find((d) => d.id === id) ?? null
  const html = useMemo(() => doc ? marked.parse(doc.md, { async: false, gfm: true }) : '', [doc])
  const hits = useMemo(() => search(q), [q])

  // ブラウザの戻る・進む
  useEffect(() => {
    document.documentElement.classList.add('docs-theme')
    const f = () => setId(currentId())
    window.addEventListener('popstate', f)
    return () => { document.documentElement.classList.remove('docs-theme'); window.removeEventListener('popstate', f) }
  }, [])

  const open = (next: string | null, hash = '') => {
    history.pushState(null, '', next ? docHref(next, hash) : HOME)
    setId(next)
    setQ('')
    if (!hash) window.scrollTo({ top: 0 })
  }

  // 描いた本文に、見出しのアンカーとリンクの書き換えをする
  useEffect(() => {
    document.title = doc ? `${L(doc.ja, doc.en)} — TenTenV Docs` : 'TenTenV Docs'
    const el = body.current
    if (!el) return
    const used = new Map<string, number>()
    const items: TocItem[] = []
    if (!doc) { setToc([]); return }
    el.querySelectorAll<HTMLHeadingElement>('h1, h2, h3').forEach((h) => {
      const base = slug(h.textContent ?? '')
      const n = used.get(base) ?? 0
      used.set(base, n + 1)
      h.id = n ? `${base}-${n}` : base
      if (h.tagName !== 'H1') items.push({ id: h.id, text: h.textContent ?? '', level: h.tagName === 'H2' ? 2 : 3 })
    })
    setToc(items)
    const dir = doc.path.split('/').slice(0, -1).join('/')
    el.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((a) => {
      const href = a.getAttribute('href')!
      if (/^[a-z]+:/i.test(href)) {
        a.target = '_blank'
        a.rel = 'noopener'
        return
      }
      if (href.startsWith('#')) return
      const [file, hash = ''] = href.split('#')
      const target = DOCS.find((d) => d.path === normalize(`${dir}/${file}`) || d.path === normalize(file))
      if (target) {
        a.href = docHref(target.id, hash)
        a.onclick = (e) => {
          e.preventDefault()
          open(target.id, decodeURIComponent(hash))
        }
      } else if (file.endsWith('.md')) {
        a.href = `${REPO_URL}/blob/main/${normalize(`${dir}/${file}`)}${hash ? `#${hash}` : ''}`
        a.target = '_blank'
        a.rel = 'noopener noreferrer'
      }
    })
    // URL の # の位置へ
    const h = decodeURIComponent(location.hash.slice(1))
    if (h) requestAnimationFrame(() => document.getElementById(h)?.scrollIntoView())
  }, [html, doc])

  // いま読んでいる見出しを目次で示す
  useEffect(() => {
    const f = () => {
      let cur = ''
      for (const t of toc) {
        const el = document.getElementById(t.id)
        if (el && el.getBoundingClientRect().top < 120) cur = t.id
      }
      setActive(cur)
    }
    f()
    window.addEventListener('scroll', f, { passive: true })
    return () => window.removeEventListener('scroll', f)
  }, [toc])

  return <div className="docs-app">
    <header className="docs-topbar">
      <div className="docs-width docs-topbar-inner">
        <a className="docs-brand" href={HOME} onClick={(e) => { e.preventDefault(); open(null) }}>
          <span className="docs-brand-mark">T</span><span>TenTenV <strong>Docs</strong></span>
        </a>
        <nav aria-label={L('サイト', 'Site')}>
          <a href={HOME} onClick={(e) => { e.preventDefault(); open(null) }}>{L('ガイド', 'Guide')}</a>
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer">GitHub ↗</a>
          <button onClick={() => setLang(lang === 'ja' ? 'en' : 'ja')}>{lang === 'ja' ? 'EN' : '日本語'}</button>
        </nav>
      </div>
    </header>
    <div className="docs-search-band"><div className="docs-width">
      <label className="docs-search-box"><Icon name="search" size={19} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={L('ドキュメントを検索', 'Search documentation')} aria-label={L('ドキュメントを検索', 'Search documentation')} /><kbd>⌕</kbd></label>
    </div></div>
    <div className="docs-width">
      {q.trim().length >= 2 ? <main className="docs-results" aria-live="polite">
        <span className="docs-eyebrow">SEARCH</span><h1>{L('検索結果', 'Search results')} <small>{hits.length}</small></h1>
        {hits.length ? hits.map((hit, index) => <a key={`${hit.doc.id}-${index}`} href={docHref(hit.doc.id, slug(hit.heading))} onClick={(e) => { e.preventDefault(); open(hit.doc.id, slug(hit.heading)) }}>
          <small>{L(hit.doc.ja, hit.doc.en)}</small><strong>{hit.heading}</strong><p>{hit.snippet}</p>
        </a>) : <p className="muted">{L('一致する項目がありません。別の言葉で検索してください。', 'No matches. Try another search term.')}</p>}
      </main> : !doc ? <main className="docs-home">
        <div className="docs-home-hero">
          <div><span className="docs-eyebrow">TENTENV DOCUMENTATION</span><h1>{L('TenTenV ドキュメント', 'TenTenV Documentation')}</h1><p>{L('遊び方、ワールド制作、サーバー運営に必要な情報をまとめています。', 'Guides for playing, creating worlds, and hosting a server.')}</p>
            <p className="docs-credit">{L('ワールドの作り方は ', 'The world-building workflow is inspired by ')}<a href="https://github.com/WebXR-JP" target="_blank" rel="noopener noreferrer">XRift</a>{L(' を参考にしています。内容を確認してくださった XRift の作者の sawa-zen さんに感謝します。', '. Thanks to sawa-zen, the creator of XRift, for reviewing it.')}</p>
            <a className="docs-start" href={docHref('user-guide')} onClick={(e) => { e.preventDefault(); open('user-guide') }}>{L('使い方から始める', 'Start with the guide')} <span>↗</span></a>
          </div>
        </div>
        {GROUPS.map(([group, ja, en]) => <section className="docs-home-group" key={group}>
          <div className="docs-group-heading"><span>{L(ja, en)}</span><i /></div>
          <div className="docs-card-grid">{DOCS.filter((item) => item.group === group).map((item) => <a className="docs-card" key={item.id} href={docHref(item.id)} onClick={(e) => { e.preventDefault(); open(item.id) }}>
            <span className="docs-card-icon"><Icon name={item.icon} size={24} /></span><strong>{L(item.ja, item.en)}</strong><p>{L(...SUMMARIES[item.id])}</p><span className="docs-card-arrow">↗</span>
          </a>)}</div>
        </section>)}
      </main> : <div className="docs-reader">
        <aside className="docs-reader-nav" aria-label={L('ドキュメントの一覧', 'Document navigation')}>
          <a className="docs-back" href={HOME} onClick={(e) => { e.preventDefault(); open(null) }}>← {L('すべてのガイド', 'All guides')}</a>
          {GROUPS.map(([group, ja, en]) => <div className="docs-nav-group" key={group}><span>{L(ja, en)}</span>{DOCS.filter((item) => item.group === group).map((item) => <a className={item.id === id ? 'selected' : ''} key={item.id} href={docHref(item.id)} onClick={(e) => { e.preventDefault(); open(item.id) }}>{L(item.ja, item.en)}</a>)}</div>)}
        </aside>
        <main className="docs-reader-main">
          <div className="docs-breadcrumb"><a href={HOME} onClick={(e) => { e.preventDefault(); open(null) }}>Docs</a><span>/</span><span>{L(doc.ja, doc.en)}</span></div>
          <div className="docs-reader-intro"><span className="docs-eyebrow">{L('ガイド', 'GUIDE')}</span><p>{L(...SUMMARIES[doc.id])}</p></div>
          {toc.length > 0 && <details className="docs-inline-toc"><summary>{L('このページの内容', 'On this page')} <span>＋</span></summary><div>{toc.map((item) => <a key={item.id} className={`${item.level === 3 ? 'nested ' : ''}${active === item.id ? 'selected' : ''}`} href={`#${item.id}`}>{item.text}</a>)}</div></details>}
          <article className="md" ref={body} dangerouslySetInnerHTML={{ __html: html }} />
          <div className="docs-end"><a href={HOME} onClick={(e) => { e.preventDefault(); open(null) }}>← {L('ガイド一覧に戻る', 'Back to all guides')}</a><a href={`${REPO_URL}/blob/main/${doc.path}`} target="_blank" rel="noopener noreferrer">{L('原文を見る', 'View source')} ↗</a></div>
        </main>
      </div>}
    </div>
    <footer className="docs-footer"><div className="docs-width"><span>TenTenV Docs</span><a href={REPO_URL} target="_blank" rel="noopener noreferrer">GitHub ↗</a></div></footer>
  </div>
}

createRoot(document.getElementById('root')!).render(<Docs />)
