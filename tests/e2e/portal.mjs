// ローカルの縦断確認: メニュー表示 → ポータルの同期 → 別ユーザーの入場
// E2E_SERVER=http://127.0.0.1:8797 node tests/e2e/portal.mjs http://127.0.0.1:5197
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'
import { prepareTestLogin } from './auth.mjs'

const client = process.argv[2] ?? 'http://127.0.0.1:5190'
const server = process.env.E2E_SERVER ?? 'http://127.0.0.1:8787'
const out = 'tests/e2e/out'
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({
  executablePath: process.env.BROWSER ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true,
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
})
const errors = []
const open = async (name, link = client) => {
  const context = await browser.newContext({ viewport: { width: 1024, height: 640 }, permissions: ['microphone', 'camera'] })
  await prepareTestLogin(context, name, link, server)
  await context.addInitScript(() => {
    const settings = JSON.parse(localStorage.getItem('ttv.settings.v1') || '{}')
    localStorage.setItem('ttv.settings.v1', JSON.stringify({ ...settings, quality: 'low', renderScale: 0.6, shadows: false, startMuted: true }))
  })
  const page = await context.newPage()
  page.on('pageerror', (error) => errors.push(`[${name}] ${error.message}`))
  await page.goto(link)
  return page
}
try {
  const alice = await open('Portal Alice', `${client}/?server=${encodeURIComponent(server)}`)
  await alice.getByRole('heading', { name: /ワールド|Worlds/ }).waitFor({ timeout: 15000 })
  await alice.getByText('ホーム', { exact: true }).first().click()
  await alice.getByRole('button', { name: /作って入る|Create & join/ }).click()
  await alice.waitForFunction(() => window.__ttvEngine?.ctx.world.name === 'ホーム', { timeout: 30000 })
  await alice.locator('canvas').first().waitFor()
  await alice.waitForTimeout(4000)
  const sourceId = await alice.evaluate(() => window.__ttvEngine.ctx.instance.id)
  const bob = await open('Portal Bob', `${client}/?server=${encodeURIComponent(server)}&instance=${sourceId}`)
  await bob.waitForFunction((id) => window.__ttvEngine?.ctx.instance.id === id, sourceId, { timeout: 30000 })
  await alice.waitForFunction(() => window.__ttvEngine?.session.verifiedMembers().length >= 1, undefined, { timeout: 20000 })
  await bob.waitForFunction(() => window.__ttvEngine?.session.verifiedMembers().length >= 1, undefined, { timeout: 20000 })
  const aliceId = await alice.evaluate(() => window.__ttvEngine.session.selfId)
  await alice.waitForFunction((id) => window.__ttvEngine?.session.hostId() === id, aliceId, { timeout: 20000 })
  await bob.waitForFunction((id) => window.__ttvEngine?.session.hostId() === id, aliceId, { timeout: 20000 })
  await alice.locator('canvas').first().waitFor()
  await alice.waitForTimeout(1200)

  await alice.evaluate(() => window.__ttvMenu.getState().setOpen(true, 'main'))
  await alice.waitForTimeout(1200)
  await alice.screenshot({ path: `${out}/portal-01-launch-pad.png` })
  await alice.evaluate(() => window.__ttvMenu.getState().setPage('tools'))
  await alice.waitForTimeout(400)
  await alice.screenshot({ path: `${out}/portal-01-tools.png` })
  await alice.evaluate(() => window.__ttvMenu.getState().setPage('avatars'))
  await alice.waitForTimeout(700)
  await alice.screenshot({ path: `${out}/portal-01-avatars.png` })
  await alice.evaluate(() => window.__ttvMenu.getState().setPage('friends'))
  await alice.waitForFunction(() => window.__ttvMenu.getState().page === 'friends', undefined, { timeout: 5000 })
  await alice.screenshot({ path: `${out}/portal-01-friends.png` })
  await alice.evaluate(() => window.__ttvMenu.getState().setPage('chat'))
  await bob.evaluate(() => window.__ttvEngine.session.sendChat('Portal Bobからのテストメッセージ'))
  await alice.waitForFunction(() => window.__ttvEngine.session.chatLog.some((message) => message.text === 'Portal Bobからのテストメッセージ'), undefined, { timeout: 15000 })
  await alice.evaluate(() => window.__ttvEngine.session.sendChat('Aliceから返信'))
  await alice.waitForTimeout(750)
  await alice.screenshot({ path: `${out}/portal-01-chat.png` })
  await alice.mouse.click(412, 430)
  await alice.waitForFunction(() => document.activeElement?.tagName === 'INPUT', undefined, { timeout: 3000 })
  await alice.keyboard.type('Hi')
  await alice.waitForFunction(() => document.activeElement?.value === 'Hi', undefined, { timeout: 3000 })
  await alice.keyboard.press('Enter')
  await alice.waitForFunction(() => window.__ttvEngine.session.chatLog.some((message) => message.text === 'Hi'), undefined, { timeout: 5000 })
  await alice.evaluate(() => window.__ttvMenu.getState().setPage('settings'))
  await alice.waitForTimeout(500)
  await alice.screenshot({ path: `${out}/portal-01-settings.png` })
  await alice.mouse.click(325, 214)
  await alice.waitForTimeout(300)
  await alice.screenshot({ path: `${out}/portal-01-audio.png` })
  await alice.mouse.click(485, 338)
  await alice.waitForTimeout(300)
  await alice.screenshot({ path: `${out}/portal-01-microphone-dropdown.png` })
  await alice.mouse.click(400, 405)
  await alice.waitForFunction(async () => (await import('/src/state/settings.ts')).useSettings.getState().s.micDeviceId !== '', undefined, { timeout: 5000 })
  await alice.evaluate(() => window.__ttvMenu.getState().setPage('worlds'))
  await alice.waitForTimeout(1200)
  await alice.screenshot({ path: `${out}/portal-02-worlds.png` })
  await alice.mouse.click(360, 325)
  await alice.waitForTimeout(1200)
  await alice.screenshot({ path: `${out}/portal-02-world-detail.png` })
  await alice.evaluate(() => window.__ttvMenu.getState().setOpen(false))

  const destination = await alice.evaluate(async () => {
    const engine = window.__ttvEngine
    const destination = await engine.ctx.api.createInstance({ worldId: engine.ctx.world.id, access: 'public' })
    const { placePortal } = await import('/src/world/PlacedPortals.tsx')
    const { position, yaw } = engine.player
    placePortal(engine, { worldId: engine.ctx.world.id, instanceId: destination.id, worldName: engine.ctx.world.name, access: 'Public', locked: false }, [position.x - Math.sin(yaw) * 3, position.y, position.z - Math.cos(yaw) * 3], yaw)
    const key = engine.session.keys('sys:portal:')[0]
    return { id: destination.id, expiresAt: engine.session.get(key).expiresAt }
  })
  const destinationId = destination.id
  await alice.waitForTimeout(700)
  await alice.screenshot({ path: `${out}/portal-03-owner.png` })
  await bob.waitForFunction((id) => {
    const engine = window.__ttvEngine
    return engine?.session.keys('sys:portal:').some((key) => engine.session.get(key)?.instanceId === id)
  }, destinationId, { timeout: 15000 })
  await bob.waitForFunction(() => [...window.__ttvEngine.interactables.values()].some((item) => item.spec().label?.includes('ホーム')), { timeout: 15000 })
  await bob.screenshot({ path: `${out}/portal-04-shared.png` })

  await bob.evaluate(async () => {
    const { useSettings } = await import('/src/state/settings.ts')
    useSettings.getState().set({ portalPrompt: false })
  })
  await bob.waitForTimeout(250)
  await bob.evaluate(() => {
    const portal = [...window.__ttvEngine.interactables.values()].find((item) => item.spec().label?.includes('ホーム'))
    portal.spec().onClick({ peerId: window.__ttvEngine.session.selfId, hand: 'none', point: [0, 0, 0] })
  })
  await bob.waitForFunction((id) => window.__ttvEngine?.ctx.instance.id === id, destinationId, { timeout: 45000 })
  await alice.waitForFunction((expiry) => {
    const engine = window.__ttvEngine
    return engine.session.keys('sys:portal:').some((key) => engine.session.get(key)?.expiresAt > expiry)
  }, destination.expiresAt, { timeout: 5000 })
  await alice.waitForTimeout(1200)
  await alice.screenshot({ path: `${out}/portal-05-owner-after-travel.png` })
  const beforeManual = await alice.evaluate(() => window.__ttvEngine.session.keys('sys:portal:').length)
  await alice.evaluate((id) => {
    window.__ttvPortalPlacement.getState().begin({ worldId: window.__ttvEngine.ctx.world.id, instanceId: id, worldName: window.__ttvEngine.ctx.world.name, access: 'Public', locked: false })
  }, destinationId)
  await alice.locator('.portal-placement').waitFor({ timeout: 10000 })
  await alice.waitForTimeout(700)
  await alice.screenshot({ path: `${out}/portal-06-preview.png` })
  await alice.evaluate(() => { window.__ttvPendingTap.value = { x: 0, y: -0.5 } })
  await alice.waitForTimeout(600)
  await alice.waitForFunction((count) => window.__ttvEngine?.session.keys('sys:portal:').length > count, beforeManual, { timeout: 5000 })
  await alice.screenshot({ path: `${out}/portal-06-manual-placement.png` })
  console.log(`[OK] menu, synchronized portal, travel, and manual placement to ${destinationId}`)
  if (errors.length) throw new Error(errors.join('\n'))
} finally {
  await browser.close()
}
