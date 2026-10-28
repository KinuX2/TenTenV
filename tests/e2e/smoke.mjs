// ブラウザでの動作確認: ログイン → ワールドを開く → 2 人で同じインスタンスに入る → 互いが見えるか
// 使い方: node tests/e2e/smoke.mjs [クライアントの URL] [ワールド名] [出力フォルダ]
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { prepareTestLogin } from './auth.mjs'

const CLIENT = process.argv[2] ?? 'http://127.0.0.1:5190'
const WORLD = process.argv[3] ?? 'テンプレートワールド'
const OUT = process.argv[4] ?? 'tests/e2e/out'
mkdirSync(OUT, { recursive: true })

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const browser = await chromium.launch({
  executablePath: process.env.BROWSER ?? EDGE,
  headless: true,
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--autoplay-policy=no-user-gesture-required'],
})

const logs = []
const open = async (name, link) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 760 }, permissions: ['microphone', 'camera'] })
  await prepareTestLogin(ctx, name, link ?? CLIENT)
  const page = await ctx.newPage()
  page.on('console', (m) => logs.push(`[${name}] ${m.type()}: ${m.text()}`))
  page.on('pageerror', (e) => logs.push(`[${name}] pageerror: ${e.message}\n${e.stack}`))
  await page.goto(link ?? CLIENT)
  if (!link) await page.getByRole('heading', { name: /ワールド|Worlds/ }).waitFor({ timeout: 15000 })
  return page
}

const shot = (page, n) => page.screenshot({ path: join(OUT, `${n}.png`) })

try {
  const a = await open('Alice')
  await shot(a, '01-home')
  await a.getByText(WORLD, { exact: true }).first().click()
  await a.getByRole('button', { name: /作って入る|Create & join/ }).click()
  await a.locator('canvas').first().waitFor({ timeout: 30000 })
  await a.waitForTimeout(6000)
  await shot(a, '02-alice-in-world')

  // Alice のインスタンスへ招待リンクで入る
  // 開発ビルドなら中の状態から、本番ビルドなら API から、Alice のいるインスタンスを調べる
  const iid = await a.evaluate(async () => {
    if (window.__ttvEngine) return window.__ttvEngine.ctx.instance.id
    const sv = JSON.parse(localStorage.getItem('ttv.servers.v1'))[0]
    const me = await (await fetch(`${sv.url}/api/me`, { headers: { authorization: `Bearer ${sv.token}` } })).json()
    return me.location?.instanceId
  })
  const u = new URL(CLIENT)
  const server = process.env.E2E_SERVER ?? (u.port === '5190' ? `${u.protocol}//${u.hostname}:8787` : u.origin)
  const link = `${CLIENT}/?server=${encodeURIComponent(server)}&instance=${iid}`
  const b = await open('Bob', link)
  await b.locator('canvas').first().waitFor({ timeout: 30000 })
  await b.waitForTimeout(8000)
  // Bob を少し前へ歩かせる
  await b.locator('canvas').first().click({ force: true })
  await b.keyboard.down('KeyW')
  await b.waitForTimeout(1200)
  await b.keyboard.up('KeyW')
  await b.waitForTimeout(1500)
  await shot(b, '03-bob-in-world')
  await shot(a, '04-alice-sees-bob')
  const countA = await a.locator('.pill').first().innerText()
  const countB = await b.locator('.pill').first().innerText()
  console.log('Alice の帯:', countA.replace(/\n/g, ' '))
  console.log('Bob の帯:', countB.replace(/\n/g, ' '))
  // チャット
  await b.keyboard.press('Enter')
  await b.getByPlaceholder(/メッセージ|Message/).fill('こんにちは！')
  await b.keyboard.press('Enter')
  await a.waitForTimeout(1500)
  const chatA = await a.locator('.chat-log').innerText()
  console.log('Alice のチャット:', chatA.replace(/\n/g, ' '))
  // メニュー
  await a.keyboard.press('KeyR')
  await a.waitForTimeout(500)
  // メニューは 3D の板（uikit）なので、タブはメニューの状態から切り替える
  await a.evaluate(() => window.__ttvMenu.getState().setPage('friends'))
  await a.waitForTimeout(800)
  await shot(a, '05-alice-menu-friends')
} catch (e) {
  console.error('失敗:', e)
  process.exitCode = 1
} finally {
  const important = logs.filter((l) => /error|warn|失敗|pageerror/i.test(l))
  console.log(`\n--- ブラウザのログ（エラー・警告 ${important.length} 件）---`)
  console.log(important.slice(0, 60).join('\n'))
  await browser.close()
}
