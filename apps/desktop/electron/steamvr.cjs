// SteamVR のライブラリへの登録（.vrmanifest）
//
// 1. SteamVR が動いていれば、SteamVR 付属の openvr_api.dll の IVRApplications::AddApplicationManifest で登録する
//    （ネイティブアドオンの steamvrManifest() を使う）
// 2. SteamVR が動いていなければ、Steam の config/appconfig.json の manifest_paths に追記する
//    （SteamVR が次に起動したときに読み込まれる。書き換える前に .bak を残す）
//
// Electron に依存しない（scripts/register-steamvr.mjs からも使う）。

'use strict'

const fs = require('node:fs')
const path = require('node:path')

const APP_KEY = 'tentenv.client'
const MANIFEST_NAME = 'tentenv.vrmanifest'

function readVrPaths() {
  const file = path.join(process.env.LOCALAPPDATA ?? '', 'openvr', 'openvrpaths.vrpath')
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

function findOpenVRDll() {
  const candidates = [...(readVrPaths()?.runtime ?? []), 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\SteamVR']
  for (const dir of candidates) {
    const dll = path.join(dir, 'bin', 'win64', 'openvr_api.dll')
    if (fs.existsSync(dll)) return dll
  }
  return null
}

function findSteamConfigDir() {
  const candidates = [...(readVrPaths()?.config ?? []), 'C:\\Program Files (x86)\\Steam\\config']
  for (const dir of candidates) if (dir && fs.existsSync(dir)) return path.resolve(dir)
  return null
}

/**
 * @param {object} o
 * @param {string} o.binaryPath     起動する exe（配布版は TenTenV.exe、開発時は electron.exe）
 * @param {string[]} [o.args]       引数（開発時はアプリのフォルダ + --vr）
 * @param {string} [o.workingDirectory]
 * @param {string} [o.imagePath]    ライブラリに出す画像（PNG）
 */
function buildManifest({ binaryPath, args = ['--vr'], workingDirectory, imagePath }) {
  const app = {
    app_key: APP_KEY,
    launch_type: 'binary',
    binary_path_windows: binaryPath,
    arguments: args.map((a) => (/\s/.test(a) && !a.startsWith('"') ? `"${a}"` : a)).join(' '),
    is_dashboard_overlay: false,
    strings: {
      en_us: { name: 'TenTenV', description: 'TenTenV social VR (WebXR client bridged to OpenXR)' },
      ja_jp: { name: 'TenTenV', description: 'TenTenV ソーシャル VR（WebXR クライアントを OpenXR で表示）' },
    },
  }
  if (workingDirectory) app.working_directory = workingDirectory
  if (imagePath) app.image_path = imagePath
  return { source: 'builtin', applications: [app] }
}

function writeManifest(file, manifest) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + '\n')
  return file
}

/** appconfig.json の manifest_paths を書き換える（SteamVR が止まっているとき用） */
function editAppConfig(manifestPath, add) {
  const dir = findSteamConfigDir()
  if (!dir) throw new Error('Steam の config フォルダが見つかりません')
  const file = path.join(dir, 'appconfig.json')
  let json = { manifest_paths: [] }
  if (fs.existsSync(file)) {
    json = JSON.parse(fs.readFileSync(file, 'utf8'))
    fs.copyFileSync(file, file + '.bak')
  }
  const norm = (p) => path.resolve(p).toLowerCase()
  const list = Array.isArray(json.manifest_paths) ? json.manifest_paths.filter((p) => norm(p) !== norm(manifestPath)) : []
  if (add) list.push(path.resolve(manifestPath))
  json.manifest_paths = list
  fs.writeFileSync(file, JSON.stringify(json, null, 3) + '\n')
  return file
}

/**
 * @param {object} native   ネイティブアドオン（steamvrManifest を持つ）。無ければ appconfig.json だけで行う
 * @param {string} manifestPath
 * @returns {{ method: 'openvr' | 'appconfig', detail: string }}
 */
function register(native, manifestPath) {
  const dll = findOpenVRDll()
  if (native && dll) {
    const r = native.steamvrManifest('add', dll, manifestPath)
    if (r.ok) {
      const check = native.steamvrManifest('check', dll, APP_KEY)
      return { method: 'openvr', detail: check.installed ? `${APP_KEY} installed` : `${APP_KEY} added (not confirmed)` }
    }
    if (r.initError === undefined) throw new Error(r.error || 'AddApplicationManifest failed')
  }
  // SteamVR が起動していない → 次回起動時に読まれるよう appconfig.json に追記
  const file = editAppConfig(manifestPath, true)
  return { method: 'appconfig', detail: file }
}

function unregister(native, manifestPath) {
  const dll = findOpenVRDll()
  let removed = false
  if (native && dll) {
    const r = native.steamvrManifest('remove', dll, manifestPath)
    removed = r.ok
  }
  try {
    editAppConfig(manifestPath, false)
  } catch {}
  return removed ? 'openvr' : 'appconfig'
}

module.exports = { APP_KEY, MANIFEST_NAME, buildManifest, writeManifest, register, unregister, findOpenVRDll, findSteamConfigDir }
