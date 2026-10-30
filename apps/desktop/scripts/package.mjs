// 配布用のフォルダと zip を作る: dist/TenTenV-win32-x64/ と dist/TenTenV-win32-x64.zip
//
//   npm run build:native && npm run package
//   npm run package -- --rebuild-client   クライアント（apps/client）を必ずビルドし直す
//   npm run package -- --no-client        クライアントを同梱しない（起動時は設定の clientUrl を開く）
//   npm run package -- --no-zip           zip を作らない
//
// 同梱するもの: electron/（main・preload・WebXR 実装）、bin/（アドオン + openxr_loader.dll）、assets/、
// client/（apps/client/dist）、selftest/ + vendor/three（TenTenV.exe --selftest 用）、ライセンス類。
// npm の依存パッケージは入れない（main / preload は Node の組み込みと electron だけを使う）。

import { packager } from '@electron/packager'
import { flipFuses, FuseV1Options, FuseVersion } from '@electron/fuses'
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, copyFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildSelftest } from './build-selftest.mjs'

const require = createRequire(import.meta.url)
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const repo = join(root, '..', '..')
const args = process.argv.slice(2)
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const electronVersion = JSON.parse(readFileSync(require.resolve('electron/package.json'), 'utf8')).version
const dist = join(root, 'dist')
const stage = join(dist, '.stage')
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'

for (const f of ['bin/tentenv_xr.node', 'bin/openxr_loader.dll']) {
  if (!existsSync(join(root, f))) throw new Error(`${f} がありません。先に npm run build:native を実行してください`)
}
if (!existsSync(join(root, 'assets', 'icon.ico'))) execFileSync(process.execPath, [join(root, 'scripts', 'make-icons.mjs')], { stdio: 'inherit' })

// ---- クライアント
const clientDist = join(repo, 'apps', 'client', 'dist')
const withClient = !args.includes('--no-client')
if (withClient && (args.includes('--rebuild-client') || !existsSync(join(clientDist, 'index.html')))) {
  console.log('[package] building @tentenv/client ...')
  const run = (a) => execFileSync(npm, a, { cwd: repo, stdio: 'inherit', shell: true })
  run(['run', 'build', '-w', '@tentenv/protocol', '-w', '@tentenv/sdk'])
  run(['run', 'build', '-w', '@tentenv/client'])
}
if (withClient && !existsSync(join(clientDist, 'index.html'))) throw new Error(`${clientDist} がありません`)

// ---- 同梱するファイルを .stage に集める
await buildSelftest()
rmSync(stage, { recursive: true, force: true })
mkdirSync(stage, { recursive: true })
const copy = (from, to = from) => cpSync(join(root, from), join(stage, to), { recursive: true })
copy('electron')
copy('assets')
mkdirSync(join(stage, 'bin'))
copyFileSync(join(root, 'bin', 'tentenv_xr.node'), join(stage, 'bin', 'tentenv_xr.node'))
copyFileSync(join(root, 'bin', 'openxr_loader.dll'), join(stage, 'bin', 'openxr_loader.dll'))
mkdirSync(join(stage, 'selftest'))
for (const f of ['three.html', 'r3f.html', 'harness.js', 'r3f.bundle.js']) copy(join('selftest', f))
const threeBuild = dirname(require.resolve('three'))
mkdirSync(join(stage, 'vendor', 'three'), { recursive: true })
for (const f of ['three.module.js', 'three.core.js']) copyFileSync(join(threeBuild, f), join(stage, 'vendor', 'three', f))
copyFileSync(join(threeBuild, '..', 'LICENSE'), join(stage, 'vendor', 'three', 'LICENSE'))
if (withClient) cpSync(clientDist, join(stage, 'client'), { recursive: true })
copyFileSync(join(repo, 'LICENSE'), join(stage, 'LICENSE'))
copyFileSync(join(root, 'THIRD_PARTY_NOTICES.md'), join(stage, 'THIRD_PARTY_NOTICES.md'))
copyFileSync(join(root, 'native', 'third_party', 'openxr', 'LICENSE'), join(stage, 'bin', 'openxr_loader.LICENSE.txt'))
writeFileSync(
  join(stage, 'package.json'),
  JSON.stringify({ name: 'tentenv-desktop', productName: 'TenTenV', version: pkg.version, description: pkg.description, license: 'AGPL-3.0-only', main: 'electron/main.cjs' }, null, 2),
)

// ---- Electron で包む
const [appDir] = await packager({
  dir: stage,
  out: dist,
  name: 'TenTenV',
  executableName: 'TenTenV',
  platform: 'win32',
  arch: 'x64',
  electronVersion,
  overwrite: true,
  asar: false, // ネイティブアドオン（.node / .dll）を読むため
  prune: false,
  icon: join(root, 'assets', 'icon.ico'),
  appVersion: pkg.version,
  appCopyright: 'TenTenV contributors (AGPL-3.0)',
  win32metadata: { CompanyName: 'TenTenV', ProductName: 'TenTenV', FileDescription: 'TenTenV', InternalName: 'TenTenV', OriginalFilename: 'TenTenV.exe' },
})
rmSync(stage, { recursive: true, force: true })

// 配布版では「Node として起動」などの抜け道を閉じる
await flipFuses(join(appDir, 'TenTenV.exe'), {
  version: FuseVersion.V1,
  [FuseV1Options.RunAsNode]: false,
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
  [FuseV1Options.EnableNodeCliInspectArguments]: false,
})

// 解凍してすぐ読めるファイル
copyFileSync(join(repo, 'LICENSE'), join(appDir, 'LICENSE.txt'))
copyFileSync(join(root, 'THIRD_PARTY_NOTICES.md'), join(appDir, 'THIRD_PARTY_NOTICES.md'))
// SteamVR 用マニフェストの見本（パスは exe からの相対。アプリのメニューの「登録」は絶対パスで書き直して登録する）
copyFileSync(join(root, 'tentenv.vrmanifest'), join(appDir, 'tentenv.vrmanifest'))
writeFileSync(
  join(appDir, 'はじめにお読みください.txt'),
  [
    `TenTenV デスクトップ版 v${pkg.version}`,
    '',
    '1. TenTenV.exe を起動し、親サーバーを選んでログインします（普段のブラウザ版と同じ画面です）',
    '2. VR で遊ぶには SteamVR（または Quest Link / Virtual Desktop など OpenXR ランタイム）を起動し、',
    '   ホーム画面の「VR モード」をオンにしてワールドに入ります（初期状態はオン）',
    '   オフのときはワールド右上の「VR」ボタン（または Ctrl+Shift+V）で切り替えます',
    '3. SteamVR のライブラリから起動したい場合は、メニュー「TenTenV」→「SteamVR のライブラリに登録」（初回のみ）',
    '',
    'コマンドライン: TenTenV.exe --vr（ワールドに入ったら自動で VR）/ --client-url <URL> / --selftest',
    '設定: %APPDATA%\\TenTenV\\config.json、ログ: %APPDATA%\\TenTenV\\logs\\desktop.log',
    '',
  ].join('\r\n'),
)

let zip = null
if (!args.includes('--no-zip')) {
  zip = join(dist, 'TenTenV-win32-x64.zip')
  rmSync(zip, { force: true })
  const packageDir = join(dist, 'TenTenV-win32-x64')
  if (process.platform === 'win32') {
    // Windows runner の tar.exe は大きな Electron 配布物の圧縮中に異常終了することがあるため、
    // Windows 標準の Compress-Archive を使う。
    execFileSync('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      "$ErrorActionPreference = 'Stop'; Compress-Archive -LiteralPath $env:TTV_PACKAGE_DIR -DestinationPath $env:TTV_ZIP -CompressionLevel Optimal -Force",
    ], {
      stdio: 'inherit',
      env: { ...process.env, TTV_PACKAGE_DIR: packageDir, TTV_ZIP: zip },
    })
  } else {
    execFileSync('tar', ['-a', '-c', '-f', zip, '-C', dist, 'TenTenV-win32-x64'], { stdio: 'inherit' })
  }
}
console.log(`\n[package] ${appDir}${zip ? `\n[package] ${zip}` : ''}`)
