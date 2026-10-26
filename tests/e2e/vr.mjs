// VR の確認（開発モードの WebXR エミュレーター）: VR に入る → 頭と手の追従 → メニュー
// 使い方: node tests/e2e/vr.mjs [クライアントの URL] [ワールド名] [出力の頭]
import { chromium } from 'playwright-core'

const CLIENT = process.argv[2] ?? 'http://127.0.0.1:5190'
const WORLD = process.argv[3] ?? 'テンプレートワールド'
const OUT = process.argv[4] ?? 'tests/e2e/out-vr'
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
const logs = []
try {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 700 } })
  // WebXR が使えないことにして、エミュレーターを使わせる
  await ctx.addInitScript(() => {
    try {
      Object.defineProperty(navigator, 'xr', { value: undefined, configurable: true })
    } catch {}
  })
  const p = await ctx.newPage()
  p.on('pageerror', (e) => logs.length < 3 && logs.push(`pageerror: ${e.message} ${e.stack}`))
  p.on('console', (m) => m.type() === 'error' && logs.push(`console: ${m.text()}`))
  await p.goto(CLIENT)
  await p.getByRole('button', { name: /接続|Connect/ }).click()
  await p.getByPlaceholder(/表示名|Display name/).fill('VRTester')
  await p.getByRole('button', { name: /^入る$|^Enter$/ }).click()
  await p.getByRole('heading', { name: /ワールド|Worlds/ }).waitFor({ timeout: 15000 })
  await p.getByText(WORLD, { exact: true }).first().click()
  await p.getByRole('button', { name: /作って入る|Create & join/ }).click()
  await p.locator('canvas').first().waitFor({ timeout: 30000 })
  await p.waitForTimeout(6000)
  const vrBtn = p.getByRole('button', { name: /VR/ })
  check('VR ボタンが出ている', (await vrBtn.count()) > 0)
  await vrBtn.first().click()
  await p.waitForTimeout(6000)
  const st = await p.evaluate(() => {
    const e = window.__ttvEngine
    const pl = e.player
    return { vr: pl.vr, device: pl.device, head: pl.head.p.toArray().map((x) => +x.toFixed(2)), left: pl.left ? pl.left.p.toArray().map((x) => +x.toFixed(2)) : null, right: pl.right ? pl.right.p.toArray().map((x) => +x.toFixed(2)) : null, eye: +pl.eyeHeight.toFixed(2) }
  })
  check('VR モードになった', st.vr, JSON.stringify(st))
  check('頭の位置が取れている', st.head[1] > 0.5)
  check('両手の位置が取れている', !!st.left && !!st.right)
  await p.screenshot({ path: `${OUT}-1.png` })
  // メニューを開く（キーの R）
  await p.keyboard.press('KeyR')
  await p.waitForTimeout(1500)
  await p.screenshot({ path: `${OUT}-2-menu.png` })
  await p.keyboard.press('KeyR')
  await p.waitForTimeout(800)
  await p.screenshot({ path: `${OUT}-3-hands.png`, clip: { x: 230, y: 250, width: 640, height: 450 } })
} catch (e) {
  console.error('失敗:', e)
  ok = false
} finally {
  if (logs.length) console.log(logs.slice(0, 20).join('\n'))
  await browser.close()
  process.exitCode = ok ? 0 : 1
}
