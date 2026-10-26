// SteamVR のライブラリに「TenTenV」を登録する（開発用。配布版はアプリのメニューか TenTenV.exe --register）
//
//   npm run register                       開発中の Electron（このフォルダ）を --vr 付きで起動するよう登録
//   npm run register -- --packaged         dist/TenTenV-win32-x64/TenTenV.exe を登録
//   npm run register -- --exe <path>       任意の TenTenV.exe を登録
//   npm run unregister                     登録を解除
//   npm run register -- --dry-run          書き込まずに、作るマニフェストと見つかった SteamVR を表示するだけ
//
// SteamVR が起動していれば OpenVR（IVRApplications）で即時に登録し、止まっていれば Steam の
// config/appconfig.json に追記する（次に SteamVR を起動したときに読まれる）。
// マニフェストはアプリと同じ %APPDATA%\TenTenV\tentenv.vrmanifest に書く（アプリのメニューからも解除できる）。

import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const require = createRequire(import.meta.url)
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const steamvr = require('../electron/steamvr.cjs')
const { values } = parseArgs({ options: { remove: { type: 'boolean' }, packaged: { type: 'boolean' }, exe: { type: 'string' }, 'dry-run': { type: 'boolean' } } })

let native = null
try {
  native = require(join(root, 'bin', 'tentenv_xr.node'))
} catch {
  console.warn('[register] ネイティブアドオンが読めないため、appconfig.json だけで登録します（npm run build:native 推奨）')
}
const manifestPath = join(process.env.APPDATA ?? join(process.env.USERPROFILE ?? '', 'AppData', 'Roaming'), 'TenTenV', steamvr.MANIFEST_NAME)

if (values.remove) {
  const how = steamvr.unregister(native, manifestPath)
  console.log(`[register] 登録を解除しました（${how}）`)
  process.exit(0)
}

let binaryPath, args, workingDirectory, imagePath
const exe = values.exe ?? (values.packaged ? join(root, 'dist', 'TenTenV-win32-x64', 'TenTenV.exe') : null)
if (exe) {
  if (!existsSync(exe)) throw new Error(`${exe} がありません（npm run package で作れます）`)
  binaryPath = exe
  args = ['--vr']
  workingDirectory = dirname(exe)
  imagePath = join(dirname(exe), 'resources', 'app', 'assets', 'steamvr-library.png')
} else {
  binaryPath = require('electron') // node から require すると electron.exe のパスが返る
  if (!existsSync(binaryPath)) throw new Error(`${binaryPath} がありません（node node_modules/electron/install.js を実行してください）`)
  args = [root, '--vr']
  workingDirectory = root
  imagePath = join(root, 'assets', 'steamvr-library.png')
}

const manifest = steamvr.buildManifest({ binaryPath, args, workingDirectory, imagePath })
if (values['dry-run']) {
  console.log(JSON.stringify(manifest, null, 2))
  console.log(`[register] (dry run) manifest -> ${manifestPath}`)
  console.log(`[register] (dry run) openvr_api.dll: ${steamvr.findOpenVRDll() ?? '(not found)'}`)
  console.log(`[register] (dry run) Steam config: ${steamvr.findSteamConfigDir() ?? '(not found)'}`)
  process.exit(0)
}
steamvr.writeManifest(manifestPath, manifest)
const r = steamvr.register(native, manifestPath)
console.log(`[register] SteamVR に登録しました（app key: ${steamvr.APP_KEY}, 方法: ${r.method}, ${r.detail}）`)
console.log(`  manifest: ${manifestPath}`)
console.log(`  起動: ${binaryPath} ${args.join(' ')}`)
if (r.method === 'appconfig') console.log('  SteamVR が起動していなかったため、次に SteamVR を起動したときにライブラリへ出ます')
