// Electron を起動せずに確かめられる部分の単体テスト（設定の読み方・オリジン判定・app:// のパス解決・SteamVR マニフェスト）
//   node test/unit.cjs

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { loadConfig, originOf, sameOrigin, DEV_CLIENT_URL, BUNDLED_CLIENT_URL } = require('../electron/config.cjs')
const { resolveInside } = require('../electron/protocol.cjs')
const steamvr = require('../electron/steamvr.cjs')

let n = 0
const test = (name, fn) => {
  fn()
  n++
  console.log('  ok', name)
}

test('defaults (dev)', () => {
  const { config, selftest, register } = loadConfig({ argv: ['.'] })
  assert.equal(config.clientUrl, DEV_CLIENT_URL)
  assert.equal(config.bridge, 'native')
  assert.equal(config.vr, false)
  assert.equal(config.unlockFrameRate, false)
  assert.equal(selftest, null)
  assert.equal(register, null)
})

test('packaged prefers the bundled client', () => {
  assert.equal(loadConfig({ argv: [], packaged: true, bundledAvailable: true }).config.clientUrl, BUNDLED_CLIENT_URL)
  assert.equal(loadConfig({ argv: [], packaged: true, bundledAvailable: false }).config.clientUrl, DEV_CLIENT_URL)
})

test('command line overrides file and env', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tentenv-unit-'))
  const file = path.join(dir, 'config.json')
  fs.writeFileSync(file, JSON.stringify({ clientUrl: 'https://file.example', resolutionScale: 0.8, bridge: 'ipc' }))
  let r = loadConfig({ argv: [], files: [file] })
  assert.equal(r.config.clientUrl, 'https://file.example')
  assert.equal(r.config.resolutionScale, 0.8)
  assert.equal(r.config.bridge, 'ipc')
  r = loadConfig({ argv: [], files: [file], env: { TENTENV_CLIENT_URL: 'https://env.example' } })
  assert.equal(r.config.clientUrl, 'https://env.example')
  r = loadConfig({ argv: ['--client-url', 'https://cli.example', '--vr', '--scale=1.5', '--bridge', 'native'], files: [file], env: { TENTENV_CLIENT_URL: 'https://env.example' } })
  assert.equal(r.config.clientUrl, 'https://cli.example')
  assert.equal(r.config.vr, true)
  assert.equal(r.config.unlockFrameRate, true, '--vr unlocks the frame rate by default')
  assert.equal(r.config.resolutionScale, 1.5)
  assert.equal(r.config.bridge, 'native')
  fs.rmSync(dir, { recursive: true, force: true })
})

test('invalid values fall back', () => {
  const r = loadConfig({ argv: ['--client-url', 'ftp://x', '--bridge', 'weird', '--scale', '99', '--latency', 'x'] })
  assert.equal(r.config.clientUrl, DEV_CLIENT_URL)
  assert.equal(r.config.bridge, 'native')
  assert.equal(r.config.resolutionScale, 1)
  assert.equal(r.config.latency, 'smooth')
  assert.ok(r.warnings.length > 0)
})

test('aliases, mock, selftest and register flags', () => {
  assert.equal(loadConfig({ argv: ['--client-url', 'bundled'], bundledAvailable: true }).config.clientUrl, BUNDLED_CLIENT_URL)
  assert.equal(loadConfig({ argv: ['--client-url', 'dev'] }).config.clientUrl, DEV_CLIENT_URL)
  const m = loadConfig({ argv: ['--xr-mock', 'hands'] }).config
  assert.equal(m.mock, true)
  assert.equal(m.mockInput, 'hands')
  assert.deepEqual(loadConfig({ argv: ['--selftest', 'r3f'] }).selftest, { page: 'r3f', real: false, seconds: 40 })
  assert.equal(loadConfig({ argv: ['--selftest', '--bridge', 'ipc'] }).selftest.page, 'three')
  assert.equal(loadConfig({ argv: ['--register'] }).register, 'add')
  assert.equal(loadConfig({ argv: ['--unregister'] }).register, 'remove')
})

test('origins', () => {
  assert.equal(originOf('app://tentenv/world?x=1'), 'app://tentenv')
  assert.equal(originOf('http://127.0.0.1:5190/'), 'http://127.0.0.1:5190')
  assert.equal(originOf('blob:http://x/1'), null)
  assert.ok(sameOrigin('http://localhost:5190/a', 'http://127.0.0.1:5190'))
  assert.ok(sameOrigin('app://tentenv/a/b', 'app://tentenv/'))
  assert.ok(!sameOrigin('app://selftest/a', 'app://tentenv/'))
  assert.ok(!sameOrigin('https://evil.example/', 'https://tentenv.example/'))
})

test('app:// paths stay inside the root', () => {
  const root = path.resolve('/srv/client')
  assert.equal(resolveInside(root, '/index.html'), path.join(root, 'index.html'))
  assert.equal(resolveInside(root, '/assets/a.js'), path.join(root, 'assets', 'a.js'))
  assert.equal(resolveInside(root, '/../secret.txt'), path.join(root, 'secret.txt'))
  assert.equal(resolveInside(root, '/%2e%2e/%2e%2e/secret.txt'), path.join(root, 'secret.txt'))
  assert.equal(resolveInside(root, '/a/..\\..\\x'), path.join(root, 'x'))
  assert.equal(resolveInside(root, '/%E0%A4%A'), null)
})

test('SteamVR manifest', () => {
  const m = steamvr.buildManifest({ binaryPath: 'C:\\Apps\\TenTenV\\TenTenV.exe', args: ['C:\\My Apps\\desktop', '--vr'], imagePath: 'C:\\x.png' })
  const a = m.applications[0]
  assert.equal(a.app_key, 'tentenv.client')
  assert.equal(a.launch_type, 'binary')
  assert.equal(a.arguments, '"C:\\My Apps\\desktop" --vr')
  assert.equal(a.image_path, 'C:\\x.png')
  assert.equal(a.strings.en_us.name, 'TenTenV')
  const tpl = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'tentenv.vrmanifest'), 'utf8'))
  assert.equal(tpl.applications[0].app_key, steamvr.APP_KEY)
  assert.equal(tpl.applications[0].binary_path_windows, 'TenTenV.exe')
})

test('polyfill is self-contained', () => {
  const fn = require('../electron/webxr-polyfill.cjs')
  assert.equal(typeof fn, 'function')
  // preload は関数の文字列から作り直してメインワールドで実行する
  const again = new Function(`return (${fn.toString()})`)()
  assert.equal(typeof again, 'function')
  // ブリッジが無ければ何もしない
  global.window = {}
  again()
  assert.equal(global.window.__tentenvWebXRInstalled, undefined)
  delete global.window
})

console.log(`[unit] ${n} tests passed`)
