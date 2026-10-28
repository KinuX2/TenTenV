// 親サーバーの停止の確認（開発ビルド用）: 2 人が入ったあと親サーバーを止める → P2P で続く → 再起動 → 入り直す
// 使い方: TTV_DATA=<親サーバーのデータ> node tests/e2e/outage.mjs [クライアントの URL]
// 注意: ポート 8787 の親サーバーを止めて、同じデータで起動し直す
import { chromium } from 'playwright-core'
import { execSync, spawn } from 'node:child_process'
import { prepareTestLogin } from './auth.mjs'

const CLIENT = process.argv[2] ?? 'http://127.0.0.1:5190'
const WORLD = 'テンプレートワールド'
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
const open = async (name, link) => {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 600 } })
  await prepareTestLogin(ctx, name, link ?? CLIENT)
  const page = await ctx.newPage()
  await page.goto(link ?? CLIENT)
  if (!link) await page.getByRole('heading', { name: /ワールド|Worlds/ }).waitFor({ timeout: 15000 })
  return page
}
const serverPids = () =>
  [...new Set(execSync('netstat -ano').toString().split('\n').filter((l) => /:8787\s.*LISTENING/.test(l)).map((l) => l.trim().split(/\s+/).pop()))]
const stopServer = () => serverPids().forEach((pid) => execSync(`taskkill /PID ${pid} /F /T`))
const startServer = () => {
  const p = spawn('npm', ['start', '-w', '@tentenv/server'], { env: { ...process.env }, detached: true, stdio: 'ignore', shell: true })
  p.unref()
}
try {
  const a = await open('Alice')
  await a.getByText(WORLD, { exact: true }).first().click()
  await a.getByRole('button', { name: /作って入る|Create & join/ }).click()
  await a.locator('canvas').first().waitFor({ timeout: 30000 })
  await a.waitForTimeout(4000)
  const iid = await a.evaluate(() => window.__ttvEngine.ctx.instance.id)
  const u = new URL(CLIENT)
  const b = await open('Bob', `${CLIENT}/?server=${encodeURIComponent(`${u.protocol}//${u.hostname}:8787`)}&instance=${iid}`)
  await b.locator('canvas').first().waitFor({ timeout: 30000 })
  await b.waitForTimeout(8000)
  const link = await a.evaluate(() => { const e = window.__ttvEngine; const m = e.session.verifiedMembers()[0]; return m && e.session.t.link(m.desc.peerId) })
  check('最初は P2P でつながっている', link === 'p2p', String(link))

  stopServer()
  console.log('親サーバーを止めました')
  await a.waitForTimeout(5000)
  const st = await a.evaluate(() => { const e = window.__ttvEngine; const m = e.session.verifiedMembers()[0]; return { server: e.session.t.serverUp(), link: m && e.session.t.link(m.desc.peerId), members: e.session.verifiedMembers().length } })
  check('親サーバーが止まったことがわかる', st.server === false, JSON.stringify(st))
  check('P2P のつながりは残っている', st.link === 'p2p' && st.members === 1)
  const f0 = await a.evaluate(() => window.__ttvEngine.session.verifiedMembers()[0].frames.at(-1)?.t ?? 0)
  await a.waitForTimeout(1500)
  const f1 = await a.evaluate(() => window.__ttvEngine.session.verifiedMembers()[0].frames.at(-1)?.t ?? 0)
  check('Bob の姿勢が届き続けている', f1 > f0, `${f0} → ${f1}`)
  await b.evaluate(() => window.__ttvEngine.session.sendChat('サーバーなしでも届く'))
  await a.waitForTimeout(1000)
  check('チャットが P2P で届く', (await a.locator('.chat-log').innerText()).includes('サーバーなしでも届く'))
  await a.evaluate(() => window.__ttvEngine.runtime.state.set('w:lamp', true))
  await b.waitForTimeout(800)
  check('同期状態も P2P で届く', (await b.evaluate(() => window.__ttvEngine.session.get('w:lamp'))) === true)

  startServer()
  console.log('親サーバーを起動し直しました')
  await a.waitForTimeout(25000)
  const st2 = await a.evaluate(() => { const e = window.__ttvEngine; return { server: e.session.t.serverUp(), members: e.session.verifiedMembers().length } })
  check('親サーバーに入り直した', st2.server === true, JSON.stringify(st2))
  check('入り直したあとも Bob が見える', st2.members === 1)
} catch (e) {
  console.error('失敗:', e)
  ok = false
} finally {
  await browser.close()
  if (!serverPids().length) startServer()
  process.exitCode = ok ? 0 : 1
}
