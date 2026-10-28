// 共有リンクのプレビュー（OGP）: クライアントの画面を返すときに、URL に合わせたタグを差し込む
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, test } from 'node:test'
import { injectMeta } from '../src/ogp'
import { api, buildWorldZip, startServer, testUser, type TestServer } from './helpers'

const INDEX = '<!doctype html><html><head><meta charset="UTF-8" /><title>TenTenV</title></head><body><div id="root"></div></body></html>'
const meta = (html: string, key: string) => html.match(new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)"`))?.[1] ?? null
const page = async (srv: TestServer, path: string) => {
  const r = await fetch(srv.url + path)
  assert.equal(r.status, 200)
  assert.match(r.headers.get('content-type') ?? '', /text\/html/)
  return r.text()
}

describe('OGP', () => {
  let srv: TestServer
  let client: string
  before(async () => {
    client = mkdtempSync(join(tmpdir(), 'ttv-ogp-client-'))
    writeFileSync(join(client, 'index.html'), INDEX)
    writeFileSync(join(client, 'og-image.png'), new Uint8Array([0x89, 0x50, 0x4e, 0x47]))
    srv = await startServer({ clientDir: client, name: 'みんなの広場', description: '週末に集まるサーバー', publicUrl: 'https://vr.example.com' })
  })
  after(async () => {
    await srv.close()
    rmSync(client, { recursive: true, force: true })
  })

  test('サーバーのトップは、サーバーの名前・説明と画像を出す', async () => {
    const html = await page(srv, '/')
    assert.match(html, /<title>みんなの広場 - TenTenV<\/title>/)
    assert.equal((html.match(/<title>/g) ?? []).length, 1)
    assert.equal(meta(html, 'og:title'), 'みんなの広場')
    assert.equal(meta(html, 'og:site_name'), 'TenTenV')
    assert.equal(meta(html, 'og:description'), '週末に集まるサーバー')
    assert.equal(meta(html, 'og:url'), 'https://vr.example.com/')
    assert.equal(meta(html, 'og:image'), 'https://vr.example.com/og-image.png')
    assert.equal(meta(html, 'twitter:card'), 'summary')
    // 画面のほかのパス（クライアントの中の画面）も同じ
    assert.equal(meta(await page(srv, '/some/screen'), 'og:title'), 'みんなの広場')
  })

  test('ワールドの共有リンクと招待リンクは、ワールドの名前・説明・サムネイルを出し、非公開のワールドは出さない', async () => {
    const a = await testUser(srv, '作者')
    const w = (await api(srv, 'POST', '/api/worlds', { token: a.token, raw: buildWorldZip({ name: '星空の <部屋>', description: '夜に "集まる" 所 & 話す所' }) })).data
    const html = await page(srv, `/?server=${encodeURIComponent(srv.app.publicUrl)}&world=${w.id}`)
    assert.match(html, /<title>星空の &lt;部屋&gt; - TenTenV<\/title>/)
    assert.equal(meta(html, 'og:title'), '星空の &lt;部屋&gt;')
    assert.equal(meta(html, 'og:description'), '夜に &quot;集まる&quot; 所 &amp; 話す所')
    assert.equal(meta(html, 'og:image'), w.thumbnailUrl)
    assert.match(meta(html, 'og:image')!, /^https:\/\/vr\.example\.com\/files\/worlds\//)
    assert.equal(meta(html, 'twitter:card'), 'summary_large_image')
    assert.equal(meta(html, 'og:url'), `https://vr.example.com/?server=${encodeURIComponent('https://vr.example.com')}&amp;world=${w.id}`)

    // 招待リンク: インスタンスの名前は出さず、ワールドへの招待として出す
    const inst = (await api(srv, 'POST', '/api/instances', { token: a.token, body: { worldId: w.id, access: 'invite', name: '内緒の会' } })).data
    const invite = await page(srv, `/?server=x&instance=${inst.id}`)
    assert.equal(meta(invite, 'og:title'), '「星空の &lt;部屋&gt;」への招待')
    assert.ok(!invite.includes('内緒の会'))
    assert.match(meta(invite, 'og:url')!, new RegExp(`instance=${inst.id}$`))

    // 非公開にすると、サーバーのプレビューに戻る
    await api(srv, 'PATCH', `/api/worlds/${w.id}`, { token: a.token, body: { visibility: 'private' } })
    assert.equal(meta(await page(srv, `/?world=${w.id}`), 'og:title'), 'みんなの広場')
    assert.equal(meta(await page(srv, `/?instance=${inst.id}`), 'og:title'), 'みんなの広場')
    // 知らない ID・おかしな ID
    assert.equal(meta(await page(srv, '/?world=nope'), 'og:title'), 'みんなの広場')
    assert.equal(meta(await page(srv, `/?world=${encodeURIComponent('"><script>')}`), 'og:title'), 'みんなの広場')
  })

  test('HEAD はタグ入りの長さだけを返し、ほかのファイルは書き換えない', async () => {
    const head = await fetch(srv.url + '/', { method: 'HEAD' })
    assert.equal(head.status, 200)
    assert.ok(Number(head.headers.get('content-length')) > INDEX.length)
    const png = await fetch(srv.url + '/og-image.png')
    assert.equal(png.headers.get('content-type'), 'image/png')
  })
})

test('置き換えの記号（$& など）が名前にあっても、そのまま出す', () => {
  const html = injectMeta(INDEX, { title: 'a $& b', ogTitle: "$' $`", description: 'd', url: 'u', image: null, largeImage: false }, 'S')
  assert.match(html, /<title>a \$&amp; b<\/title>/)
  assert.ok(html.includes('content="$&#39; $`"'))
  assert.ok(html.indexOf('og:title') < html.indexOf('</head>'))
})
