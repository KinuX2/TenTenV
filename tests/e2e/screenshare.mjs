// 画面共有の確認（開発ビルド）: Alice が画面を共有 → 中継でつながる Bob と、後から P2P で入る Carol の両方に映像と音が届くか
// 使い方: node tests/e2e/screenshare.mjs [クライアントの URL] [ワールド名] [親サーバー URL]
// 画面の選択はテストではできないので、getDisplayMedia を「動く絵のキャンバス」の映像と「発振音」に差し替える
import { chromium } from 'playwright-core'
import { prepareTestLogin } from './auth.mjs'

const CLIENT = process.argv[2] ?? 'http://127.0.0.1:5190'
const WORLD = process.argv[3] ?? 'ホーム'
const clientUrl = new URL(CLIENT)
const SERVER = process.argv[4] ?? process.env.E2E_SERVER ?? (clientUrl.port === '5190' ? `${clientUrl.protocol}//${clientUrl.hostname}:8787` : clientUrl.origin)
const browser = await chromium.launch({
  executablePath: process.env.BROWSER ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true,
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--autoplay-policy=no-user-gesture-required'],
})
const errors = []
let ok = true
const check = (label, cond, detail = '') => {
  console.log(`${cond ? '[OK]' : '[NG]'} ${label} ${detail}`)
  if (!cond) ok = false
}

const open = async (name, { blockP2P = false, link } = {}) => {
  const ctx = await browser.newContext({ viewport: { width: 640, height: 400 }, permissions: ['microphone'] })
  await prepareTestLogin(ctx, name, link ?? CLIENT, SERVER)
  if (blockP2P)
    await ctx.addInitScript(() => {
      const Native = window.RTCPeerConnection
      window.RTCPeerConnection = class extends Native {
        constructor(config) {
          super({ ...config, iceTransportPolicy: 'relay', iceServers: [] })
        }
      }
    })
  // 描画を軽くする（ソフトウェア描画のテスト環境で、映像の符号化が詰まらないように）
  await ctx.addInitScript(() => localStorage.setItem('ttv.settings.v1', JSON.stringify({ quality: 'low', renderScale: 0.5, shadows: false, startMuted: true })))
  // 共有する「画面」: 色と数字が変わり続けるキャンバスと、440Hz の音
  await ctx.addInitScript(() => {
    navigator.mediaDevices.getDisplayMedia = async () => {
      const c = document.createElement('canvas')
      c.width = 640
      c.height = 360
      const g = c.getContext('2d')
      let n = 0
      setInterval(() => {
        n++
        g.fillStyle = `hsl(${(n * 7) % 360} 80% 50%)`
        g.fillRect(0, 0, 640, 360)
        g.fillStyle = '#fff'
        g.font = '64px sans-serif'
        g.fillText(String(n), 40, 200)
      }, 50)
      const stream = c.captureStream(20)
      const ac = new AudioContext()
      const osc = ac.createOscillator()
      const dest = ac.createMediaStreamDestination()
      osc.frequency.value = 440
      osc.connect(dest)
      osc.start()
      stream.addTrack(dest.stream.getAudioTracks()[0])
      return stream
    }
  })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push(`[${name}] ${e.message}`))
  await page.goto(link ?? CLIENT)
  if (!link) await page.getByRole('heading', { name: /ワールド|Worlds/ }).waitFor({ timeout: 15000 })
  return page
}

/** 共有の映像が届いて、動いているか（中央の画素が変わるか） */
const received = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        const e = window.__ttvEngine
        const owner = e.screenShare.ownerId()
        const v = e.screenShare.video()
        if (!v || !v.videoWidth) return resolve({ owner, video: false })
        const c = document.createElement('canvas')
        c.width = 8
        c.height = 8
        const g = c.getContext('2d')
        const sample = () => {
          g.drawImage(v, 0, 0, 8, 8)
          return Array.from(g.getImageData(4, 4, 1, 1).data).join(',')
        }
        const a = sample()
        setTimeout(() => resolve({ owner, video: true, width: v.videoWidth, height: v.videoHeight, moving: sample() !== a, link: owner ? e.session.t.link(owner) : null }), 4000)
      }),
  )

/** 画面の音が届いているか（受けた音の大きさの最大） */
const audioLevel = (page) =>
  page.evaluate(async () => {
    const e = window.__ttvEngine
    const stream = e.screenShare.audio()
    if (!stream) return { audio: false }
    const ctx = e.listener.context
    const an = ctx.createAnalyser()
    ctx.createMediaStreamSource(stream).connect(an)
    const buf = new Float32Array(an.fftSize)
    let peak = 0
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 50))
      an.getFloatTimeDomainData(buf)
      for (const v of buf) peak = Math.max(peak, Math.abs(v))
    }
    return { audio: true, peak: Math.round(peak * 1000) / 1000 }
  })
const waitAudio = async (page, ms = 15000) => {
  const end = Date.now() + ms
  let r
  do {
    r = await audioLevel(page)
    if (r.audio && r.peak > 0.05) return r
    await page.waitForTimeout(500)
  } while (Date.now() < end)
  return r
}

/** 映像が届いて動くまで待つ（P2P・中継の切り替えや、同期の受け取りに時間がかかることがある） */
const waitReceived = async (page, want, ms = 20000) => {
  const end = Date.now() + ms
  let r
  do {
    r = await page.evaluate(() => !!window.__ttvEngine).then((ok) => (ok ? received(page) : { video: false }))
    if (r.video && r.moving && (!want || r.link === want)) return r
    await page.waitForTimeout(1000)
  } while (Date.now() < end)
  return r
}

try {
  const a = await open('Alice')
  await a.getByText(WORLD, { exact: true }).first().click()
  await a.getByRole('button', { name: /作って入る|Create & join/ }).click()
  await a.locator('canvas').first().waitFor({ timeout: 30000 })
  await a.waitForTimeout(4000)
  const iid = await a.evaluate(() => window.__ttvEngine.ctx.instance.id)
  const link = `${CLIENT}/?server=${encodeURIComponent(SERVER)}&instance=${iid}`

  // Bob: P2P を使えない（中継だけでつながる）
  const b = await open('Bob', { blockP2P: true, link })
  await b.locator('canvas').first().waitFor({ timeout: 30000 })
  // P2P をあきらめて中継に切り替わるまで（10 秒）待つ
  await b.waitForTimeout(14000)
  const bobLink = await b.evaluate(() => {
    const e = window.__ttvEngine
    const alice = e.session.verifiedMembers()[0]
    return alice ? e.session.t.link(alice.desc.peerId) : null
  })
  check('Bob は中継でつながっている', bobLink === 'relay', `link=${bobLink}`)

  // Alice が共有を始める（ボタンを押したのと同じ。テストでは画面の選択を差し替え済み）
  await a.evaluate(() => window.__ttvEngine.screenShare.start({ frameRate: 15 }))
  const rb = await waitReceived(b, 'relay')
  check('中継の Bob に共有の映像が届く', rb.video && rb.moving, JSON.stringify(rb))
  const ab = await waitAudio(b)
  check('中継の Bob に画面の音が届く', ab.audio && ab.peak > 0.05, JSON.stringify(ab))

  // Carol: 共有を始めたあとに P2P で入る（先に入った人の映像が後から入った人に届くか）
  const c = await open('Carol', { link })
  await c.locator('canvas').first().waitFor({ timeout: 30000 })
  // ソフトウェア描画のテスト環境では、後から入った人に最初の映像が出るまで 30 秒以上かかることがある
  const rc = await waitReceived(c, 'p2p', 60000)
  check('後から P2P で入った Carol に共有の映像が届く', rc.video && rc.moving && rc.link === 'p2p', JSON.stringify(rc))
  const ac = await waitAudio(c)
  check('P2P の Carol に画面の音が届く', ac.audio && ac.peak > 0.05, JSON.stringify(ac))

  // 共有をやめると、どちらも映像がなくなる
  await a.evaluate(() => window.__ttvEngine.screenShare.stop())
  await a.waitForTimeout(2500)
  const after = await Promise.all([b, c].map((p) => p.evaluate(() => !!window.__ttvEngine.screenShare.video() || !!window.__ttvEngine.screenShare.audio())))
  check('共有をやめると映像と音が消える', after.every((x) => !x), JSON.stringify(after))
  check('ページのエラーがない', errors.length === 0, errors.slice(0, 3).join(' / '))
} catch (e) {
  console.error('失敗:', e)
  ok = false
} finally {
  await browser.close()
  process.exitCode = ok ? 0 : 1
}
