// ネイティブアドオンの疎通テスト（Node 単体で動く）
//
//   node test/native-smoke.cjs                 読み込み + ランタイム確認 + 疑似 HMD（mock）で 2 秒間フレームを回す
//   node test/native-smoke.cjs --real          さらに本物の OpenXR セッションで 5 秒間、左目=青 右目=橙を出す
//                                               （SteamVR などが起動します。HMD が無ければ xrGetSystem で失敗して終わる）
//   node test/native-smoke.cjs --allow-missing  アドオンが未ビルドなら「スキップ」で正常終了（npm test 用）

const path = require('node:path')
const fs = require('node:fs')
const assert = require('node:assert/strict')

const args = process.argv.slice(2)
const addonPath = path.join(__dirname, '..', 'bin', 'tentenv_xr.node')
if (!fs.existsSync(addonPath)) {
  const msg = `[native-smoke] ${addonPath} がありません（npm run build:native でビルドしてください）`
  if (args.includes('--allow-missing')) {
    console.log(msg + ' -> skipped')
    process.exit(0)
  }
  console.error(msg)
  process.exit(1)
}

const native = require(addonPath)
console.log('[native-smoke] loaded', addonPath, 'version', native.version)
assert.equal(typeof native.XrSession, 'function')
assert.equal(typeof native.activeRuntime, 'function')
assert.equal(typeof native.steamvrManifest, 'function')
const rt = native.activeRuntime()
console.log('[native-smoke] activeRuntime', rt)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function fillStereo(info, left, right) {
  const pitch = Math.ceil((info.width * 2 * 4) / 256) * 256
  const buf = new Uint8Array(pitch * info.height)
  const bgra = info.colorFormat === 'bgra8unorm'
  const put = (c) => (bgra ? [c[2], c[1], c[0], c[3]] : c)
  const L = put(left), R = put(right)
  for (let y = 0; y < info.height; y++) {
    const row = y * pitch
    for (let x = 0; x < info.width; x++) {
      buf.set(L, row + x * 4)
      buf.set(R, row + (info.width + x) * 4)
    }
  }
  return { buf, pitch }
}

async function runLoop(s, seconds, { left, right, log = false }) {
  const info = s.getInfo()
  const { buf, pitch } = fillStereo(info, left, right)
  const t0 = Date.now()
  let frames = 0, rendered = 0, layers = 0, inputs = null, views = null, trackers = null
  const events = []
  let exiting = false
  while (Date.now() - t0 < seconds * 1000 + 3000) {
    for (const e of s.pollEvents()) {
      events.push(e.type + (e.detail ? ':' + e.detail : ''))
      if (log) console.log('  event', e)
      if (e.type === 'exit') exiting = true
    }
    if (exiting) break
    if (Date.now() - t0 > seconds * 1000) {
      s.requestExit()
      await sleep(20)
      continue
    }
    if (!s.isRunning()) {
      await sleep(10)
      continue
    }
    const fs = await s.waitFrame()
    s.beginFrame()
    views = s.locateViews()
    inputs = s.syncInput()
    trackers = s.locateTrackers()
    if (fs.shouldRender || rendered === 0) {
      await s.submit(buf.buffer, 0, info.width * 4, pitch, views.seq)
      rendered++
    }
    if (s.endFrame()) layers++
    if (frames % 30 === 0) s.applyHaptics(1, 0.3, 20)
    frames++
  }
  return { frames, rendered, layers, events, views, inputs, trackers, seconds: (Date.now() - t0) / 1000 }
}

;(async () => {
  // ---- 疑似 HMD
  const mock = new native.XrSession({ mock: true, resolutionScale: 0.5, mockInput: 'cycle' })
  const info = mock.getInfo()
  console.log('[native-smoke] mock info', info)
  assert.equal(info.backend, 'mock')
  assert.ok(info.width % 64 === 0 && info.height > 0)
  const r = await runLoop(mock, 2, { left: [40, 90, 220, 255], right: [230, 140, 40, 255] })
  const stats = mock.getStats()
  console.log('[native-smoke] mock result', { frames: r.frames, rendered: r.rendered, layers: r.layers, fps: +(r.frames / 2).toFixed(1) })
  console.log('[native-smoke] mock events', r.events.join(' '))
  console.log('[native-smoke] mock stats', stats)
  console.log('[native-smoke] mock bounds', mock.getBounds(), 'rates', mock.getRefreshRates(), 'rate', mock.getRefreshRate())
  const hand = r.inputs[1]
  console.log('[native-smoke] mock input (right)', { controller: hand.controller, profile: hand.profile, trigger: hand.trigger, joints: hand.joints ? hand.joints.length : null })
  console.log('[native-smoke] mock trackers', r.trackers.map((t) => (t ? Array.from(t).map((v) => +v.toFixed(2)) : null)))
  assert.equal(info.bodyTrackers, true)
  assert.ok(r.trackers.length === 3 && r.trackers.every((t) => t && t.length === 7))
  assert.ok(r.frames > 100, 'mock should run ~72 fps')
  assert.ok(r.events.includes('begin') && r.events.includes('exit:exiting'))
  assert.deepEqual(stats.sampleLeft, [40, 90, 220, 255])
  assert.deepEqual(stats.sampleRight, [230, 140, 40, 255])
  assert.ok(stats.haptics > 0)
  assert.equal(r.views.data.length, 22)
  assert.ok(mock.setRefreshRate(90))
  mock.destroy()
  assert.throws(() => mock.getInfo(), /destroyed/)
  console.log('[native-smoke] mock OK')

  if (!args.includes('--real')) {
    console.log('[native-smoke] real OpenXR session skipped (pass --real to try; it may start SteamVR)')
    return
  }
  // ---- 本物の OpenXR
  const probe = native.probeRuntime()
  console.log('[native-smoke] probeRuntime', probe)
  if (!probe.ok) {
    console.log('[native-smoke] no HMD available -> real session skipped')
    return
  }
  const s = new native.XrSession({ appName: 'TenTenV smoke test', resolutionScale: 0.5 })
  console.log('[native-smoke] real info', s.getInfo())
  const rr = await runLoop(s, 5, { left: [40, 90, 220, 255], right: [230, 140, 40, 255], log: true })
  console.log('[native-smoke] real result', { frames: rr.frames, rendered: rr.rendered, layers: rr.layers, fps: +(rr.frames / 5).toFixed(1) })
  console.log('[native-smoke] real stats', s.getStats(), 'bounds', s.getBounds())
  s.destroy()
})().catch((e) => {
  console.error('[native-smoke] FAILED', e)
  process.exit(1)
})
