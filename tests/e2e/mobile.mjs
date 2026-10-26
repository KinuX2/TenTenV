// スマホの確認: 画面の幅・タッチ操作・仮想スティック
// 使い方: node tests/e2e/mobile.mjs [クライアントの URL] [ワールド名] [出力の頭]
import { chromium, devices } from 'playwright-core'

const CLIENT = process.argv[2] ?? 'http://127.0.0.1:5190'
const WORLD = process.argv[3] ?? 'テンプレートワールド'
const OUT = process.argv[4] ?? 'tests/e2e/out-mobile'
const browser = await chromium.launch({
  executablePath: process.env.BROWSER ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true,
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
})
let ok = true
const check = (label, cond, detail = '') => {
  console.log(`${cond ? '[OK]' : '[NG]'} ${label} ${detail}`)
  if (!cond) ok = false
}
try {
  const ctx = await browser.newContext({ ...devices['Pixel 7'] })
  const p = await ctx.newPage()
  const errors = []
  p.on('pageerror', (e) => errors.push(e.message))
  await p.goto(CLIENT)
  await p.screenshot({ path: `${OUT}-0-connect.png` })
  await p.getByRole('button', { name: /接続|Connect/ }).click()
  await p.getByPlaceholder(/表示名|Display name/).fill('Phone')
  await p.getByRole('button', { name: /^入る$|^Enter$/ }).click()
  await p.getByRole('heading', { name: /ワールド|Worlds/ }).waitFor({ timeout: 15000 })
  await p.waitForTimeout(800)
  await p.screenshot({ path: `${OUT}-1-home.png` })
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
  check('ホーム画面が横にはみ出さない', !overflow)
  // 左上のメニューボタンで、引き出しのメニューが開く
  check('下にメニューの帯がない', !(await p.locator('.side').isVisible()) || (await p.locator('.side').boundingBox()).x < 0)
  await p.getByRole('button', { name: /メニュー|Menu/ }).first().click()
  await p.waitForTimeout(400)
  await p.screenshot({ path: `${OUT}-1b-drawer.png` })
  const drawer = await p.locator('.side').boundingBox()
  check('メニューが左から開く', !!drawer && drawer.x >= -1, JSON.stringify(drawer))
  await p.locator('.side .nav').first().click()
  await p.waitForTimeout(400)
  await p.getByText(WORLD, { exact: true }).first().click()
  await p.getByRole('button', { name: /作って入る|Create & join/ }).click()
  await p.locator('canvas').first().waitFor({ timeout: 30000 })
  await p.waitForTimeout(6000)
  check('仮想スティックが出ている', (await p.locator('.touch-stick').count()) === 1)
  const before = await p.evaluate(() => window.__ttvEngine.player.position.toArray())
  // スティックを上へ倒して 1.5 秒
  const box = await p.locator('.touch-stick').boundingBox()
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  await p.touchscreen.tap(cx, cy)
  const cdp = await ctx.newCDPSession(p)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy }] })
  for (let i = 0; i < 10; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx, y: cy - 6 * i }] })
  await p.waitForTimeout(1500)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await p.waitForTimeout(500)
  const after = await p.evaluate(() => window.__ttvEngine.player.position.toArray())
  const moved = Math.hypot(after[0] - before[0], after[2] - before[2])
  check('スティックで歩ける', moved > 0.5, `moved=${moved.toFixed(2)}m`)
  console.log('状態:', JSON.stringify(await p.evaluate(() => { const e = window.__ttvEngine; const pl = e.player; return { pos: pl.position.toArray().map((x) => +x.toFixed(2)), yaw: +pl.yaw.toFixed(2), head: pl.head.p.toArray().map((x) => +x.toFixed(2)), third: pl.thirdPerson, drone: pl.drone } })))
  await p.screenshot({ path: `${OUT}-2-world.png` })
  await p.getByRole('button', { name: /メニュー|Menu/ }).last().click()
  await p.waitForTimeout(700)
  await p.screenshot({ path: `${OUT}-3-menu.png` })
  check('ページのエラーがない', errors.length === 0, errors.slice(0, 3).join(' / '))
} catch (e) {
  console.error('失敗:', e)
  ok = false
} finally {
  await browser.close()
  process.exitCode = ok ? 0 : 1
}
