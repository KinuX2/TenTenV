// DJ ラウンジの確認（開発ビルド用）: 2 人で入り、Alice がデッキを操作すると Bob の同期状態も変わるか
// 使い方: node tests/e2e/dj.mjs [クライアントの URL]
import { chromium } from 'playwright-core'
import { prepareTestLogin } from './auth.mjs'

const CLIENT = process.argv[2] ?? 'http://127.0.0.1:5190'
const browser = await chromium.launch({
  executablePath: process.env.BROWSER ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true,
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--autoplay-policy=no-user-gesture-required'],
})
let ok = true
const check = (label, cond, detail = '') => {
  console.log(`${cond ? '[OK]' : '[NG]'} ${label} ${detail}`)
  if (!cond) ok = false
}
const errors = []
const open = async (name, link) => {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 600 } })
  await prepareTestLogin(ctx, name, link ?? CLIENT)
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push(`[${name}] ${e.message}`))
  await page.goto(link ?? CLIENT)
  if (!link) await page.getByRole('heading', { name: /ワールド|Worlds/ }).waitFor({ timeout: 15000 })
  return page
}
try {
  const a = await open('DJ-A')
  await a.getByText('DJ Lounge', { exact: true }).first().click()
  await a.getByRole('button', { name: /作って入る|Create & join/ }).click()
  await a.locator('canvas').first().waitFor({ timeout: 60000 })
  await a.waitForTimeout(12000)
  const labels = await a.evaluate(() => [...window.__ttvEngine.interactables.values()].map((i) => i.spec().label).filter(Boolean))
  check('DJ ブースのボタンがある', labels.length > 20, `${labels.length} 個（例: ${labels.slice(0, 8).join(' / ')}）`)
  const iid = await a.evaluate(() => window.__ttvEngine.ctx.instance.id)
  const u = new URL(CLIENT)
  const b = await open('DJ-B', `${CLIENT}/?server=${encodeURIComponent(`${u.protocol}//${u.hostname}:8787`)}&instance=${iid}`)
  await b.locator('canvas').first().waitFor({ timeout: 60000 })
  await b.waitForTimeout(12000)
  const before = await b.evaluate(() => JSON.stringify(window.__ttvEngine.session.get('w:dj-mix-v6') ?? null))
  // 再生ボタン（ラベルに PLAY を含むもの）を押す
  const pressed = await a.evaluate(() => {
    const e = window.__ttvEngine
    const list = [...e.interactables.values()]
    const it = list.find((i) => /^PLAY/i.test(i.spec().label ?? '')) ?? list.find((i) => /再生/.test(i.spec().label ?? ''))
    if (!it) return null
    it.spec().onClick({ peerId: e.session.selfId, hand: 'none', point: [0, 0, 0] })
    return it.spec().label
  })
  check('再生ボタンを押した', !!pressed, String(pressed))
  await b.waitForTimeout(3000)
  const after = await b.evaluate(() => JSON.stringify(window.__ttvEngine.session.get('w:dj-mix-v6') ?? null))
  check('Bob の画面のミキサーの状態が変わった', before !== after, `${before.length} → ${after.length} 文字`)
  check('ページのエラーがない', errors.length === 0, errors.slice(0, 3).join(' / '))
} catch (e) {
  console.error('失敗:', e)
  ok = false
} finally {
  await browser.close()
  process.exitCode = ok ? 0 : 1
}
