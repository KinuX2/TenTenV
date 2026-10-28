// ブラウザで 1 人でワールドに入り、スクリーンショットを撮る
// 使い方: node tests/e2e/visit.mjs <クライアントの URL> <ワールド名> <出力ファイル名の頭> [待ち ms]
import { chromium } from 'playwright-core'
import { prepareTestLogin } from './auth.mjs'
const [,, url, world, out, waitMs = '15000'] = process.argv
const b = await chromium.launch({ executablePath: process.env.BROWSER ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--enable-unsafe-swiftshader','--use-angle=swiftshader','--autoplay-policy=no-user-gesture-required'] })
const ctx = await b.newContext({ viewport: { width: 1280, height: 760 } })
await prepareTestLogin(ctx, 'Tester', url)
const p = await ctx.newPage()
const logs = []
p.on('console', (m) => logs.push(`${m.type()}: ${m.text()}`))
p.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`))
await p.goto(url)
await p.getByRole('heading', { name: /ワールド|Worlds/ }).waitFor({ timeout: 15000 })
await p.getByText(world, { exact: true }).first().click()
await p.getByRole('button', { name: /作って入る|Create & join/ }).click()
await p.locator('canvas').first().waitFor({ timeout: 60000 })
await p.waitForTimeout(Number(waitMs))
await p.screenshot({ path: `${out}-1.png` })
await p.locator('canvas').first().click()
await p.keyboard.down('KeyW'); await p.waitForTimeout(2500); await p.keyboard.up('KeyW')
await p.waitForTimeout(2000)
await p.screenshot({ path: `${out}-2.png` })
console.log(logs.filter(l => /error|warn/i.test(l)).slice(0, 40).join('\n'))
await b.close()
