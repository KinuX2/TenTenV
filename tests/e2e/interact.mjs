// 操作の同期の確認（開発ビルド用）: Alice がライトを押す → Bob にも反映 / Alice が箱をつかむ → Bob から見て持ち主が Alice
// 使い方: node tests/e2e/interact.mjs [クライアントの URL]（ワールドは「テンプレートワールド」）
import { chromium } from 'playwright-core'
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
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 640 } })
  await prepareTestLogin(ctx, name, link ?? CLIENT)
  const page = await ctx.newPage()
  await page.goto(link ?? CLIENT)
  if (!link) await page.getByRole('heading', { name: /ワールド|Worlds/ }).waitFor({ timeout: 15000 })
  return page
}
/** 目標の点を見る向きにする（足元 pos から目の高さで） */
const aim = (page, pos, target) =>
  page.evaluate(
    ([pos, target]) => {
      const e = window.__ttvEngine
      e.runtime.teleport(pos)
      return new Promise((r) =>
        setTimeout(() => {
          const p = e.player
          const eye = [p.position.x, p.position.y + p.eyeHeight, p.position.z]
          const dx = target[0] - eye[0], dy = target[1] - eye[1], dz = target[2] - eye[2]
          p.yaw = Math.atan2(-dx, -dz)
          p.pitch = Math.atan2(dy, Math.hypot(dx, dz))
          r(null)
        }, 600),
      )
    },
    [pos, target],
  )
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
  // 画面をクリックしてマウスを固定する
  await a.locator('canvas').first().click()
  await a.waitForTimeout(500)
  const locked = await a.evaluate(() => !!document.pointerLockElement)
  check('マウスを固定できた', locked)
  // ライト（-2, 1, 0）を見て押す
  await aim(a, [-1.2, 0, 1.6], [-2, 1, 0])
  await a.waitForTimeout(400)
  const label = await a.locator('.hover-label').first().innerText().catch(() => '')
  check('照準を合わせると説明が出る', /ライト/.test(label), label)
  await a.mouse.down()
  await a.mouse.up()
  await b.waitForTimeout(1500)
  const lamp = await b.evaluate(() => window.__ttvEngine.session.get('w:lamp'))
  check('Alice が押したライトが Bob でも点いた', lamp === true, `w:lamp=${lamp}`)
  // 箱（1, 1, 1）をつかむ
  const boxPos = await a.evaluate(() => window.__ttvEngine.pickups.get('box').obj.getWorldPosition(new window.__ttvEngine.player.position.constructor()).toArray())
  await aim(a, [boxPos[0] - 0.2, 0, boxPos[2] + 1.6], boxPos)
  await a.waitForTimeout(800)
  await a.mouse.down()
  await a.mouse.up()
  await a.waitForTimeout(1500)
  const holderA = await a.evaluate(() => window.__ttvEngine.session.get('sys:pick:box'))
  const aliceId = await a.evaluate(() => window.__ttvEngine.session.selfId)
  const holderB = await b.evaluate(() => window.__ttvEngine.session.get('sys:pick:box'))
  check('Alice が箱をつかんだ', holderA?.holder === aliceId, JSON.stringify(holderA))
  check('Bob から見て持ち主が Alice', holderB?.holder === aliceId, JSON.stringify(holderB))
  // 向きを変えて、箱が Bob の画面でも動くか
  const before = await b.evaluate(() => window.__ttvEngine.pickups.get('box').obj.getWorldPosition(new window.__ttvEngine.player.position.constructor()).toArray())
  await a.evaluate(() => (window.__ttvEngine.player.yaw += 1.2))
  await a.waitForTimeout(1500)
  const after = await b.evaluate(() => window.__ttvEngine.pickups.get('box').obj.getWorldPosition(new window.__ttvEngine.player.position.constructor()).toArray())
  const moved = Math.hypot(after[0] - before[0], after[1] - before[1], after[2] - before[2])
  check('Alice が持って動かした箱が Bob の画面でも動いた', moved > 0.3, `moved=${moved.toFixed(2)}m`)
  // ホストの引き継ぎ: ホストの Alice が抜けても、Bob がホストになり状態が残る
  const hostBefore = await b.evaluate(() => window.__ttvEngine.session.hostId())
  check('最初のホストは Alice', hostBefore === aliceId)
  await a.context().close()
  await b.waitForTimeout(4000)
  const st = await b.evaluate(() => ({ host: window.__ttvEngine.session.isHost(), lamp: window.__ttvEngine.session.get('w:lamp'), members: window.__ttvEngine.session.verifiedMembers().length }))
  check('Alice が抜けたら Bob がホストになった', st.host && st.members === 0, JSON.stringify(st))
  check('ライトの状態が残っている', st.lamp === true)
  await b.evaluate(() => window.__ttvEngine.runtime.state.set('w:lamp', false))
  await b.waitForTimeout(300)
  check('新しいホストとして状態を変えられる', (await b.evaluate(() => window.__ttvEngine.session.get('w:lamp'))) === false)
} catch (e) {
  console.error('失敗:', e)
  ok = false
} finally {
  await browser.close()
  process.exitCode = ok ? 0 : 1
}
