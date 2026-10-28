// 自動中継の確認: Bob の P2P 接続を失敗させ、姿勢・チャット・声（Opus の中継）が届くか
// 使い方: node tests/e2e/relay.mjs [クライアントの URL] [ワールド名] [親サーバー URL]（開発ビルドで動かす）
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'
import { prepareTestLogin } from './auth.mjs'

const CLIENT = process.argv[2] ?? 'http://127.0.0.1:5190'
const WORLD = process.argv[3] ?? 'テンプレートワールド'
const clientUrl = new URL(CLIENT)
const SERVER = process.argv[4] ?? (clientUrl.port === '5190' ? `${clientUrl.protocol}//${clientUrl.hostname}:8787` : clientUrl.origin)
mkdirSync('tests/e2e/out', { recursive: true })
const browser = await chromium.launch({
  executablePath: process.env.BROWSER ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true,
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--autoplay-policy=no-user-gesture-required'],
})
const logs = []
const open = async (name, blockP2P, link) => {
  const ctx = await browser.newContext({ viewport: { width: 960, height: 600 }, permissions: ['microphone'] })
  await prepareTestLogin(ctx, name, link ?? CLIENT, SERVER)
  if (blockP2P) await ctx.addInitScript(() => {
    const NativePeerConnection = window.RTCPeerConnection
    window.RTCPeerConnection = class extends NativePeerConnection {
      constructor(config) {
        super({ ...config, iceTransportPolicy: 'relay' })
      }
    }
  })
  // 送った数を種類ごとに数える（調査用）
  await ctx.addInitScript(() => {
    const orig = WebSocket.prototype.send
    window.__sent = {}
    WebSocket.prototype.send = function (d) {
      try {
        const m = JSON.parse(d)
        const k = m.t + (m.ch ? ':' + m.ch : '')
        window.__sent[k] = (window.__sent[k] ?? 0) + 1
        if (m.t === 'join') window.__lastJoin = m
      } catch {}
      return orig.call(this, d)
    }
  })
  const page = await ctx.newPage()
  page.on('console', (m) => /error|relay|中継/i.test(m.text()) && logs.push(`[${name}] ${m.text()}`))
  page.on('pageerror', (e) => logs.push(`[${name}] pageerror: ${e.message} ${(e.stack ?? '').split(String.fromCharCode(10)).slice(1, 4).join(' | ')}`))
  await page.goto(link ?? CLIENT)
  if (!link) await page.getByRole('heading', { name: /ワールド|Worlds/ }).waitFor({ timeout: 15000 })
  return page
}
let ok = true
const check = (label, cond, detail = '') => {
  console.log(`${cond ? '[OK]' : '[NG]'} ${label} ${detail}`)
  if (!cond) ok = false
}
try {
  const a = await open('Alice', false)
  await a.getByText(WORLD, { exact: true }).first().click()
  await a.getByRole('button', { name: /作って入る|Create & join/ }).click()
  await a.locator('canvas').first().waitFor({ timeout: 30000 })
  await a.waitForTimeout(4000)
  // Alice のインスタンスへ招待リンクで入る
  // 開発ビルドなら中の状態から、本番ビルドなら API から、Alice のいるインスタンスを調べる
  const iid = await a.evaluate(async () => {
    if (window.__ttvEngine) return window.__ttvEngine.ctx.instance.id
    const sv = JSON.parse(localStorage.getItem('ttv.servers.v1'))[0]
    const me = await (await fetch(`${sv.url}/api/me`, { headers: { authorization: `Bearer ${sv.token}` } })).json()
    return me.location?.instanceId
  })
  const link = `${CLIENT}/?server=${encodeURIComponent(SERVER)}&instance=${iid}`
  const b = await open('Bob', true, link)
  await b.locator('canvas').first().waitFor({ timeout: 30000 })
  await b.waitForTimeout(12000)
  check('廃止した中継専用設定を送らない', !(await b.evaluate(() => 'relayOnly' in window.__lastJoin)))
  const dbg = () => {
    const e = window.__ttvEngine
    return { iid: e.ctx.instance.id, self: e.session.selfId, peers: e.session.t.peers().map((p) => p.peerId + ':' + e.session.t.link(p.peerId)), members: [...e.session.members.values()].map((m) => m.desc.peerId + ':' + m.verified) }
  }
  console.log('Alice:', JSON.stringify(await a.evaluate(dbg)), 'Bob:', JSON.stringify(await b.evaluate(dbg)))
  console.log('Alice の受信:', (await a.evaluate(() => window.__ttvSignalLog)).join(String.fromCharCode(10) + '  '))
  console.log('Bob の受信:', (await b.evaluate(() => window.__ttvSignalLog)).join(String.fromCharCode(10) + '  '))
  console.log('Bob の URL:', b.url(), 'Bob の状態:', JSON.stringify(await b.evaluate(() => { const e = window.__ttvEngine; return e ? { iid: e.ctx.instance.id, members: e.session.members.size, peers: e.session.t.peers().length } : null })))
  await b.screenshot({ path: 'tests/e2e/out/relay-bob.png' })
  const s0 = await b.evaluate(() => ({ ...window.__sent }))
  const poseAt0 = await a.evaluate(() => window.__ttvEngine.session.verifiedMembers()[0]?.frames.at(-1)?.t ?? 0)
  await b.waitForTimeout(3000)
  const s1 = await b.evaluate(() => ({ ...window.__sent }))
  console.log('Bob の送信（3 秒）:', JSON.stringify(Object.fromEntries(Object.keys(s1).map((k) => [k, s1[k] - (s0[k] ?? 0)]))))
  const st = await a.evaluate(() => {
    const e = window.__ttvEngine
    const m = e.session.verifiedMembers()[0]
    if (!m) return null
    return { link: e.session.t.link(m.desc.peerId), lastPoseAt: m.frames.at(-1)?.t ?? 0, level: e.voice.remoteLevel(m.desc.peerId, 0.1).level, hasAudio: !!e.voice.remoteAudio(m.desc.peerId) }
  })
  check('Alice から Bob が見える', !!st, JSON.stringify(st))
  check('中継でつながっている', st?.link === 'relay')
  check('姿勢が届き続けている', (st?.lastPoseAt ?? 0) > poseAt0)
  // 3 秒間の声の大きさの最大（テスト用のマイクは周期的にビープ音を出す）
  const peak = await a.evaluate(async () => {
    const e = window.__ttvEngine
    const id = e.session.verifiedMembers()[0]?.desc.peerId
    let max = 0
    for (let i = 0; i < 60; i++) {
      max = Math.max(max, e.voice.remoteLevel(id, 0.05).level)
      await new Promise((r) => setTimeout(r, 50))
    }
    return max
  })
  check('声が届いている（中継の Opus）', !!st?.hasAudio && peak > 0.1, `peak=${peak.toFixed(3)}`)
  await b.evaluate(() => window.__ttvEngine.session.sendChat('relay test'))
  await a.waitForTimeout(1500)
  check('チャットが届いている', await a.evaluate(() => window.__ttvEngine.session.chatLog.some((entry) => entry.text === 'relay test' && !entry.self)))
} catch (e) {
  console.error('失敗:', e)
  ok = false
} finally {
  if (logs.length) console.log('\n' + logs.slice(0, 30).join('\n'))
  await browser.close()
  process.exitCode = ok ? 0 : 1
}
