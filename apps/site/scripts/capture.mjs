// 公式サイトのスクリーンショットを撮る（開発ビルドのクライアントと親サーバーが動いているときに使う）
// 使い方: TTV_E2E_TOKEN_AOI / REN / MIO / KAI に別々のトークンを設定して実行
// 画面の操作ボタンは隠し、3D の様子だけを撮る（スマホとホーム画面は UI ごと撮る）
import { chromium, devices } from 'playwright-core'
import { join } from 'node:path'
import { prepareTestLogin } from '../../../tests/e2e/auth.mjs'

const CLIENT = process.argv[2] ?? 'http://127.0.0.1:5190'
const OUT = join(import.meta.dirname, '..', 'public', 'shots')
const browser = await chromium.launch({
  executablePath: process.env.BROWSER ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true,
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--autoplay-policy=no-user-gesture-required'],
})
const HIDE_HUD = '.hud, .toasts { display: none !important; }'

/** ログイン済みのアカウントで入る（標準アバター） */
const open = async (name, avatar, opts = {}) => {
  const ctx = await browser.newContext(opts.device ?? { viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 })
  await prepareTestLogin(ctx, opts.authName ?? name, opts.link ?? CLIENT)
  await ctx.addInitScript((a) => {
    localStorage.setItem('ttv.avatar.v1', JSON.stringify({ kind: 'builtin', id: 'akane', color: '#6ea8ff', scale: 1 }))
    localStorage.setItem('ttv.settings.v1', JSON.stringify({ quality: 'ultra', showNameplates: true, startMuted: true, fov: 62 }))
  }, avatar)
  const p = await ctx.newPage()
  await p.goto(opts.link ?? CLIENT)
  if (!opts.link) await p.getByRole('heading', { name: /ワールド|Worlds/ }).waitFor({ timeout: 15000 })
  return p
}
const enterNew = async (p, world) => {
  await p.getByText(world, { exact: true }).first().click()
  await p.getByRole('button', { name: /作って入る|Create & join/ }).click()
  await p.locator('canvas').first().waitFor({ timeout: 60000 })
  await p.waitForTimeout(8000)
}
const linkTo = async (p) => {
  const iid = await p.evaluate(() => window.__ttvEngine.ctx.instance.id)
  const u = new URL(CLIENT)
  return `${CLIENT}/?server=${encodeURIComponent(`${u.protocol}//${u.hostname}:8787`)}&instance=${iid}`
}
const join2 = async (name, avatar, link) => {
  const p = await open(name, avatar, { link })
  await p.locator('canvas').first().waitFor({ timeout: 60000 })
  await p.waitForTimeout(6000)
  return p
}
/** 足元 pos に立ち、目の高さから target を見る */
const place = (p, pos, target) =>
  p.evaluate(
    ([pos, target]) =>
      new Promise((r) => {
        const e = window.__ttvEngine
        e.runtime.teleport(pos)
        setTimeout(() => {
          const pl = e.player
          const dx = target[0] - pl.position.x
          const dz = target[2] - pl.position.z
          pl.yaw = Math.atan2(-dx, -dz)
          pl.pitch = Math.atan2(target[1] - (pl.position.y + pl.eyeHeight), Math.hypot(dx, dz))
          r(null)
        }, 500)
      }),
    [pos, target],
  )
const shot = async (p, name, hideHud = true) => {
  if (hideHud) await p.addStyleTag({ content: HIDE_HUD })
  await p.waitForTimeout(1500)
  await p.screenshot({ path: join(OUT, `${name}.png`) })
  console.log('撮影:', name)
}

try {
  // ---- ホーム画面（UI） ----
  const a = await open('Aoi', {})
  await a.waitForTimeout(1000)
  await shot(a, 'ui-home', false)
  await a.getByRole('button', { name: /アバター/ }).first().click()
  await a.waitForTimeout(6000)
  await shot(a, 'ui-avatars', false)
  await a.getByRole('button', { name: /ワールド/ }).first().click()
  await a.waitForTimeout(800)

  // ---- 広場に 4 人 ----
  await enterNew(a, 'ホーム')
  const link = await linkTo(a)
  const b = await join2('Ren', {}, link)
  const c = await join2('Mio', {}, link)
  const d = await join2('Kai', {}, link)
  // 3 人は噴水の前でカメラ（Aoi）のほうを向く
  await place(b, [-1.4, 0, 6.2], [0, 1.4, 10])
  await place(c, [0, 0, 5.6], [0, 1.4, 10])
  await place(d, [1.4, 0, 6.2], [0, 1.4, 10])
  await b.evaluate(() => {
    const e = window.__ttvEngine
    e.player.manualExpression = 'happy'
    e.player.manualGesture = ['victory', 'victory']
  })
  await d.evaluate(() => (window.__ttvEngine.player.manualGesture = ['thumbsup', 'thumbsup']))
  await place(a, [0.3, 0, 9.6], [0, 1.25, 5.8])
  // 撮る直前にもう一度並べ直す（向きが確実に伝わるように）
  for (const [p, pos] of [[b, [-1.4, 0, 6.2]], [c, [0, 0, 5.6]], [d, [1.4, 0, 6.2]]]) {
    await p.bringToFront()
    await place(p, pos, [0.3, 1.4, 9.6])
  }
  await a.bringToFront()
  await a.waitForTimeout(5000)
  await c.evaluate(() => window.__ttvEngine.session.sendChat('ようこそ！一緒に遊ぼう'))
  await a.waitForTimeout(1500)
  await shot(a, 'social')

  // 広場の全景（入口のアーチから）
  await place(a, [0, 0, 15.5], [0, 2, 0])
  await shot(a, 'home-plaza')

  // 夜のラウンジ
  await a.evaluate(() => window.__ttvEngine.runtime.state.set('w:night', true))
  await place(a, [-5.5, 0, 6.5], [-11.5, 1.2, 11.5])
  await a.waitForTimeout(1500)
  await shot(a, 'home-night')
  await a.evaluate(() => window.__ttvEngine.runtime.state.set('w:night', false))
  for (const p of [b, c, d]) await p.context().close()

  // ---- DJ ラウンジ ----
  await a.context().close()
  const dj = await open('DJ', {}, { authName: 'Aoi' })
  await enterNew(dj, 'DJ Lounge')
  await dj.waitForTimeout(6000)
  await place(dj, [0, 0, 1.5], [0, 2.3, -6])
  await shot(dj, 'dj-lounge')
  await dj.context().close()

  // ---- スマホ（UI ごと） ----
  const m = await open('Phone', {}, { device: devices['Pixel 7'], authName: 'Aoi' })
  await enterNew(m, 'ホーム')
  await place(m, [0, 0, 11], [0, 1.6, 0])
  await shot(m, 'mobile', false)
} catch (e) {
  console.error('失敗:', e)
  process.exitCode = 1
} finally {
  await browser.close()
}
