// 共有リンクのプレビュー（OGP）
// SNS やチャットのクローラーはスクリプトを動かさないので、クライアントの index.html を返すときに
// URL（?world= ・?instance=）に合わせた <title> と OGP・Twitter Card のタグを差し込む
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { App } from './app'
import { brandLogo } from './files'
import { WORLD_SELECT, worldSummary, type WorldRow } from './views'

export interface PageMeta {
  title: string
  /** og:title（<title> は「タイトル - サイト名」にする） */
  ogTitle: string
  description: string
  url: string
  image: string | null
  /** 大きな画像のカード（ワールドのサムネイル）か、小さなアイコンのカードか */
  largeImage: boolean
}

/** ロゴが SVG だと多くのクローラーが画像として扱わないので、そのときはクライアントの PNG を使う */
export const OG_FALLBACK_IMAGE = 'og-image.png'

const ID = /^[A-Za-z0-9_-]{1,64}$/
const clip = (s: string, n: number) => {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > n ? `${t.slice(0, n - 1)}…` : t
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

/** サーバー自体のプレビューの画像 */
const serverImage = (app: App) => {
  const logo = brandLogo(app.config.branding.logoFile)
  if (logo && logo.type !== 'image/svg+xml') return `${app.publicUrl}/branding/logo`
  if (app.config.clientDir && existsSync(join(app.config.clientDir, OG_FALLBACK_IMAGE))) return `${app.publicUrl}/${OG_FALLBACK_IMAGE}`
  return null
}

/** 非公開でないワールド（共有リンクで誰でも見られるもの） */
const visibleWorld = (app: App, id: string | null) => {
  if (!id || !ID.test(id)) return null
  const row = app.db.get<WorldRow>(`${WORLD_SELECT} WHERE w.id = ?`, id)
  return row && row.visibility !== 'private' ? row : null
}

/** 開いた URL に合わせたプレビューの内容 */
export const pageMeta = (app: App, url: URL): PageMeta => {
  const site = app.config.branding.siteName
  const name = app.config.name
  const base: PageMeta = {
    title: name === site ? site : `${name} - ${site}`,
    ogTitle: name,
    description: clip(app.config.description || `${site} の親サーバーです。ブラウザーや VR ゴーグルからワールドに入って、ほかの人と話せます。`, 200),
    url: `${app.publicUrl}/`,
    image: serverImage(app),
    largeImage: false,
  }
  // 共有リンクの形（?server=…&world=… / ?instance=…）だけを見る
  const instanceId = url.searchParams.get('instance')
  const instance = instanceId && ID.test(instanceId) ? app.instances.get(instanceId) : undefined
  const world = visibleWorld(app, instance ? instance.worldId : url.searchParams.get('world'))
  if (!world) return base
  const summary = worldSummary(app, world)
  const link = new URL(`${app.publicUrl}/`)
  link.searchParams.set('server', app.publicUrl)
  if (instance) link.searchParams.set('instance', instance.id)
  else link.searchParams.set('world', world.id)
  const author = summary.author?.displayName
  const description = clip(world.description || (author ? `${author} さんのワールド` : 'ワールド'), 200)
  return {
    title: `${world.name} - ${site}`,
    // インスタンスの名前は作った人が付けたもので公開を前提にしていないので、ワールドの名前だけを出す
    ogTitle: instance ? `「${world.name}」への招待` : world.name,
    description,
    url: link.toString(),
    image: summary.thumbnailUrl ?? base.image,
    largeImage: !!summary.thumbnailUrl,
  }
}

/** index.html の <title> を差し替え、OGP のタグを足す */
export const injectMeta = (html: string, meta: PageMeta, siteName: string) => {
  const tags = [
    `<title>${escapeHtml(meta.title)}</title>`,
    `<meta name="description" content="${escapeHtml(meta.description)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${escapeHtml(siteName)}" />`,
    `<meta property="og:title" content="${escapeHtml(meta.ogTitle)}" />`,
    `<meta property="og:description" content="${escapeHtml(meta.description)}" />`,
    `<meta property="og:url" content="${escapeHtml(meta.url)}" />`,
    ...(meta.image ? [`<meta property="og:image" content="${escapeHtml(meta.image)}" />`] : []),
    `<meta name="twitter:card" content="${meta.largeImage ? 'summary_large_image' : 'summary'}" />`,
    `<meta name="twitter:title" content="${escapeHtml(meta.ogTitle)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(meta.description)}" />`,
    ...(meta.image ? [`<meta name="twitter:image" content="${escapeHtml(meta.image)}" />`] : []),
  ].join('\n    ')
  const withoutTitle = html.replace(/<title>[\s\S]*?<\/title>\s*/i, '')
  // 置き換えは関数で渡す（ワールド名などに $& があっても置き換えの記号として読まれないように）
  return /<\/head>/i.test(withoutTitle) ? withoutTitle.replace(/<\/head>/i, () => `  ${tags}\n  </head>`) : `${tags}\n${withoutTitle}`
}
