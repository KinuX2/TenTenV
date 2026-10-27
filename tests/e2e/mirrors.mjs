// 鏡の確認（開発ビルド用）: フェイスミラー・パーソナルミラーを持って動かす
// 使い方: node tests/e2e/mirrors.mjs [クライアントの URL] [出力の頭]
import { chromium } from 'playwright-core'

const CLIENT = process.argv[2] ?? 'http://127.0.0.1:5190'
const OUT = process.argv[3] ?? 'tests/e2e/out-mirrors'
const SERVER = process.argv[4] ?? 'http://127.0.0.1:8787'
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
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 760 } })
  await ctx.addInitScript(() => { Object.defineProperty(navigator, 'xr', { value: undefined, configurable: true }) })
  const p = await ctx.newPage()
  const errors = []
  p.on('pageerror', (e) => errors.push(e.message))
  await p.goto(CLIENT)
  const serverField = p.getByPlaceholder('https://example.com')
  if (await serverField.count()) await serverField.fill(SERVER)
  await p.getByRole('button', { name: /接続|Connect/ }).click()
  await p.getByPlaceholder(/表示名|Display name/).fill('Mirror')
  await p.getByRole('button', { name: /^入る$|^Enter$/ }).click()
  await p.getByRole('heading', { name: /ワールド|Worlds/ }).waitFor({ timeout: 15000 })
  await p.getByText('ホーム', { exact: true }).first().click()
  await p.getByRole('button', { name: /作って入る|Create & join/ }).click()
  await p.locator('canvas').first().waitFor({ timeout: 60000 })
  await p.waitForTimeout(7000)
  // フェイスミラー
  // メニューは 3D の板（uikit）なので、道具の状態から切り替える
  await p.evaluate(() => window.__ttvTools.getState().set({ faceMirror: true }))
  await p.evaluate(() => (window.__ttvEngine.player.manualExpression = 'happy'))
  await p.waitForTimeout(2000)
  await p.screenshot({ path: `${OUT}-1-facemirror.png` })
  // パーソナルミラーを持って向きを変えると、鏡もついてくる
  await p.evaluate(() => window.__ttvTools.getState().set({ mirror: true }))
  await p.waitForTimeout(3000)
  const mirrorPos = () => p.evaluate(() => { const e = window.__ttvEngine; const it = [...e.interactables.values()].find((i) => /鏡を(持つ|置く)/.test(i.spec().label ?? '')); return it ? it.obj.getWorldPosition(new e.player.position.constructor()).toArray() : null })
  const m0 = await mirrorPos()
  check('パーソナルミラーに取っ手がある', !!m0)
  const wholeMirror = await p.evaluate(() => { const e = window.__ttvEngine; const it = [...e.interactables.values()].find((i) => /鏡を持つ/.test(i.spec().label ?? '')); return !!it && it.obj.children.some((c) => c.type === 'Reflector') })
  check('鏡面からも持てる', wholeMirror)
  const isHeld = () => p.evaluate(() => { const e = window.__ttvEngine; const it = [...e.interactables.values()].find((i) => /鏡を(持つ|置く)/.test(i.spec().label ?? '')); return it?.spec().label === '鏡を置く' })
  let held = false
  for (let attempt = 0; attempt < 4 && !held; attempt++) {
    await p.mouse.click(640, 380)
    await p.waitForTimeout(300)
    held = await isHeld()
  }
  check('クリックで鏡を持てる', held)
  await p.evaluate(() => (window.__ttvEngine.player.yaw += 1.5))
  await p.waitForTimeout(800)
  const m1 = await mirrorPos()
  const moved = m0 && m1 ? Math.hypot(m1[0] - m0[0], m1[2] - m0[2]) : 0
  check('持った鏡が視点についてくる', moved > 0.5, `moved=${moved.toFixed(2)}m`)
  await p.evaluate(async () => {
    const e = window.__ttvEngine
    const it = [...e.interactables.values()].find((i) => /鏡を置く/.test(i.spec().label ?? ''))
    it.spec().onClick({ peerId: e.session.selfId, hand: 'none', point: [0, 0, 0] })
  })
  await p.waitForFunction(() => { const e = window.__ttvEngine; return [...e.interactables.values()].some((i) => i.spec().label === '鏡を持つ') }, null, { timeout: 3000 })
  await p.keyboard.press('Escape')
  await p.getByRole('button', { name: /VR/ }).first().click()
  await p.waitForFunction(() => window.__ttvEngine.player.vr, null, { timeout: 15000 })
  await p.waitForTimeout(1200)
  const vrHeight = await p.evaluate(() => { const e = window.__ttvEngine; const it = [...e.interactables.values()].find((i) => /鏡を持つ/.test(i.spec().label ?? '')); return Math.abs(it.obj.getWorldPosition(e.player.position.clone()).y - e.player.head.p.y) })
  check('VR でも鏡が目の高さに出る', vrHeight < 0.2, `差=${vrHeight.toFixed(2)}m`)
  await p.evaluate(() => {
    const e = window.__ttvEngine
    const it = [...e.interactables.values()].find((i) => /鏡を持つ/.test(i.spec().label ?? ''))
    it.obj.position.copy(window.__ttvXRInput.left.gripP)
    it.obj.updateWorldMatrix(true, false)
    window.__ttvXrStore.getState().emulator.controllers.left.updateButtonValue('squeeze', 1)
  })
  const vrHeld = await p.waitForFunction(() => { const e = window.__ttvEngine; return [...e.interactables.values()].some((i) => i.spec().label === '鏡を置く') }, null, { timeout: 5000 }).then(() => true, () => false)
  check('VR で鏡面の近くをグリップすると持てる', vrHeld)
  await p.evaluate(() => { window.__ttvXrStore.getState().emulator.controllers.left.updateButtonValue('squeeze', 0) })
  const released = await p.waitForFunction(() => { const e = window.__ttvEngine; return [...e.interactables.values()].some((i) => i.spec().label === '鏡を持つ') }, null, { timeout: 5000 }).then(() => true, () => false)
  check('グリップを離すと鏡を置く', released)
  await p.screenshot({ path: `${OUT}-2-mirror.png` })
  check('ページのエラーがない', errors.length === 0, errors.slice(0, 3).join(' / '))
} catch (e) {
  console.error('失敗:', e)
  ok = false
} finally {
  await browser.close()
  process.exitCode = ok ? 0 : 1
}
