// ドキュメント: リポジトリの Markdown をそのまま読み込んで表示する（目次・検索つき）
import { createRoot } from 'react-dom/client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { marked } from 'marked'
import { Footer, Header, Icon, L, page, useLang } from './common'
import './site.css'
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

const docHref = (id: string, hash = '') => `${page('docs/')}?doc=${id}${hash ? '#' + hash : ''}`

const currentId = () => {
  const id = new URLSearchParams(location.search).get('doc')
  return DOCS.some((d) => d.id === id) ? id! : DOCS[0].id
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
  useLang()
  const [id, setId] = useState(currentId)
  const [q, setQ] = useState('')
  const [toc, setToc] = useState<TocItem[]>([])
  const [active, setActive] = useState('')
  const body = useRef<HTMLDivElement>(null)
  const doc = DOCS.find((d) => d.id === id)!
  const html = useMemo(() => marked.parse(doc.md, { async: false, gfm: true }), [doc])
  const hits = useMemo(() => search(q), [q])

  // ブラウザの戻る・進む
  useEffect(() => {
    const f = () => setId(currentId())
    window.addEventListener('popstate', f)
    return () => window.removeEventListener('popstate', f)
  }, [])

  const open = (next: string, hash = '') => {
    history.pushState(null, '', docHref(next, hash))
    setId(next)
    setQ('')
    if (!hash) window.scrollTo({ top: 0 })
  }

  // 描いた本文に、見出しのアンカーとリンクの書き換えをする
  useEffect(() => {
    const el = body.current
    if (!el) return
    document.title = `${L(doc.ja, doc.en)} — TenTenV`
    const used = new Map<string, number>()
    const items: TocItem[] = []
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

  return (
    <>
      <Header current="docs" />
      <div className="wrap docs-layout">
        <aside className="docs-side">
          <label className="search">
            <Icon name="search" size={16} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={L('ドキュメントを検索', 'Search docs')} />
          </label>
          {GROUPS.map(([g, ja, en]) => (
            <div key={g} style={{ display: 'grid', gap: 2 }}>
              <div className="group">{L(ja, en)}</div>
              {DOCS.filter((d) => d.group === g).map((d) => (
                <a
                  key={d.id}
                  href={docHref(d.id)}
                  className={d.id === id && !q ? 'on' : undefined}
                  onClick={(e) => {
                    e.preventDefault()
                    open(d.id)
                  }}
                >
                  <Icon name={d.icon} size={18} />
                  {L(d.ja, d.en)}
                </a>
              ))}
            </div>
          ))}
        </aside>
        <main style={{ minWidth: 0 }}>
          <div className="docs-mobile-nav">
            <select value={id} onChange={(e) => open(e.target.value)} aria-label={L('ドキュメント', 'Document')}>
              {DOCS.map((d) => (
                <option key={d.id} value={d.id}>
                  {L(d.ja, d.en)}
                </option>
              ))}
            </select>
            <label className="search" style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, padding: '0 10px' }}>
              <Icon name="search" size={16} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={L('検索', 'Search')} style={{ background: 'none', border: 'none', outline: 'none', color: 'var(--text)', font: 'inherit', width: '100%' }} />
            </label>
          </div>
          {q.trim().length >= 2 && (
            <div className="results">
              <div className="muted">{hits.length ? L(`「${q}」の検索結果 ${hits.length} 件`, `${hits.length} results for "${q}"`) : L(`「${q}」は見つかりませんでした`, `No results for "${q}"`)}</div>
              {hits.map((h, i) => (
                <a
                  key={i}
                  href={docHref(h.doc.id, slug(h.heading))}
                  onClick={(e) => {
                    e.preventDefault()
                    open(h.doc.id, slug(h.heading))
                  }}
                >
                  <b>
                    {L(h.doc.ja, h.doc.en)} / {h.heading}
                  </b>
                  <small>
                    <Highlight text={h.snippet} q={q} />
                  </small>
                </a>
              ))}
            </div>
          )}
          <article className="md" ref={body} dangerouslySetInnerHTML={{ __html: html }} />
        </main>
        <nav className="docs-toc">
          <div className="t">{L('このページの内容', 'ON THIS PAGE')}</div>
          {toc.map((t) => (
            <a key={t.id} href={`#${t.id}`} className={`${t.level === 3 ? 'h3' : ''}${active === t.id ? ' on' : ''}`}>
              {t.text}
            </a>
          ))}
        </nav>
      </div>
      <Footer />
    </>
  )
}

createRoot(document.getElementById('root')!).render(<Docs />)
