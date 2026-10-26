// メニュー（uikit）の日本語フォントを作る。TTF を MSDF のアトラス（BMFont 形式の JSON・画像は data URL で同梱）にする
// 変換は uikit の TTFLoader（WebAssembly）をブラウザで動かして行う
//
//   node scripts/build-font.mjs <LINESeedJP-Bold.ttf> [クライアントの開発サーバー]
//
// 開発サーバー（npm run dev:client、既定 http://127.0.0.1:5190）が動いている必要があります。
// 文字は scripts/font-charset.mjs（ASCII・かな・記号・JIS 第 1 水準・ソースに出てくる文字）
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright-core'

const [ttf, client = 'http://127.0.0.1:5190'] = process.argv.slice(2)
if (!ttf) {
  console.error('使い方: node scripts/build-font.mjs <LINESeedJP-Bold.ttf> [開発サーバーの URL]')
  process.exit(1)
}
const charset = execFileSync(process.execPath, [join(import.meta.dirname, 'font-charset.mjs')], { encoding: 'utf8' })
console.log(`文字数: ${[...charset].length}`)

const browser = await chromium.launch({ executablePath: process.env.BROWSER ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true })
const page = await browser.newPage()
await page.route('**/__font.ttf', (r) => r.fulfill({ body: readFileSync(ttf), contentType: 'font/ttf' }))
page.on('console', (m) => m.type() === 'error' && console.error('[page]', m.text()))
await page.goto(`${client}/font-gen.html`)
await page.waitForFunction(() => window.fontGenReady, null, { timeout: 60000 })
const t0 = Date.now()
const json = await page.evaluate(
  (charset) => window.generateFont({ url: '/__font.ttf', charset, fontSize: 40, textureSize: [4096, 2048], fieldRange: 4, padding: 2 }),
  charset,
)
await browser.close()
const out = join(import.meta.dirname, '..', 'apps', 'client', 'public', 'fonts')
mkdirSync(out, { recursive: true })
const file = join(out, 'line-seed-jp-bold-msdf.json')
writeFileSync(file, json)
const font = JSON.parse(json)
console.log(`作りました: ${file}（${(statSync(file).size / 1048576).toFixed(1)}MB・${font.chars.length} 文字・${font.common.scaleW}x${font.common.scaleH}・${((Date.now() - t0) / 1000).toFixed(0)} 秒）`)
