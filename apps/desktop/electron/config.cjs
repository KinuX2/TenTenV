// 設定: 既定値 < 設定ファイル < 環境変数 < コマンドライン の順に上書きする
//
// 設定ファイル（JSON）。次の順に探し、見つかったものを全部重ねる（後のものが優先）:
//   1. %APPDATA%\TenTenV\config.json
//   2. 実行ファイルの隣の tentenv.config.json（配布版。持ち運び用）/ 開発時は apps/desktop/tentenv.config.json
//   3. --config <path>
//
// コマンドライン:
//   --client-url <url|bundled|dev>  クライアントの URL（bundled = 同梱のクライアント、dev = http://127.0.0.1:5190）
//   --vr                            読み込み後、ワールドに入ったら自動で VR に入る
//   --bridge native|ipc             native: preload でアドオンを直接使う（速い・既定）/ ipc: preload もサンドボックス化し、アドオンはメインプロセス
//   --scale <n>                     ランタイム推奨解像度に対する倍率（既定 1）
//   --latency low|smooth            smooth: フレーム処理を止めずに転送する（既定）/ low: 同じフレームでの提出を試す
//   --xr-mock [controllers|hands|cycle]  OpenXR の代わりに疑似 HMD を使う
//   --unlock-fps                    Chromium の垂直同期を外す（--vr のときは既定でオン）
//   --devtools                      開発者ツールを開く
//   --profile <dir>                 ユーザーデータ（ログイン状態・設定・ログ）の場所（既定 %APPDATA%\TenTenV）
//   --selftest [three|r3f]          自己テスト（疑似 HMD で WebXR の経路を確かめて終了）
//   --register / --unregister       SteamVR のライブラリに登録 / 解除して終了

'use strict'

const fs = require('node:fs')
const path = require('node:path')

const DEV_CLIENT_URL = 'http://127.0.0.1:5190'
const BUNDLED_CLIENT_URL = 'app://tentenv/'

const DEFAULTS = Object.freeze({
  clientUrl: null, // null = 自動（配布版は同梱、開発時は DEV_CLIENT_URL）
  vr: false,
  bridge: 'native',
  resolutionScale: 1,
  latency: 'smooth',
  mock: false,
  mockInput: 'cycle',
  unlockFrameRate: null, // null = --vr のときだけ
  devTools: false,
  // ページ内で移動してよい追加のオリジン（ログイン画面など。既定ではクライアント以外は既定のブラウザで開く）
  allowedOrigins: [],
})

/** argv から --name value / --name=value / --flag を読む */
function makeArgReader(argv) {
  const get = (name) => {
    const eq = argv.find((a) => a.startsWith(`--${name}=`))
    if (eq) return eq.slice(name.length + 3)
    const i = argv.indexOf(`--${name}`)
    if (i >= 0 && argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) return argv[i + 1]
    return undefined
  }
  const has = (name) => argv.includes(`--${name}`) || argv.some((a) => a.startsWith(`--${name}=`))
  return { get, has }
}

function readJson(file) {
  try {
    if (!file || !fs.existsSync(file)) return null
    const v = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''))
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null
  } catch (err) {
    return { __error: `${file}: ${err.message}` }
  }
}

const oneOf = (v, list, def) => (list.includes(v) ? v : def)
const num = (v, def, min, max) => {
  const n = Number(v)
  return Number.isFinite(n) && n >= min && n <= max ? n : def
}

/**
 * @param {object} o
 * @param {string[]} o.argv          process.argv.slice(1)
 * @param {Record<string,string|undefined>} [o.env]
 * @param {string[]} [o.files]       設定ファイルの候補
 * @param {boolean} [o.packaged]
 * @param {boolean} [o.bundledAvailable] 同梱クライアントがあるか
 */
function loadConfig({ argv, env = {}, files = [], packaged = false, bundledAvailable = false }) {
  const arg = makeArgReader(argv)
  const cfg = { ...DEFAULTS, allowedOrigins: [] }
  const warnings = []
  const extra = arg.get('config')
  for (const f of [...files, extra]) {
    const j = readJson(f)
    if (!j) continue
    if (j.__error) {
      warnings.push(j.__error)
      continue
    }
    for (const k of Object.keys(DEFAULTS)) if (j[k] !== undefined) cfg[k] = j[k]
  }
  if (env.TENTENV_CLIENT_URL) cfg.clientUrl = env.TENTENV_CLIENT_URL

  if (arg.get('client-url')) cfg.clientUrl = arg.get('client-url')
  if (arg.has('vr')) cfg.vr = true
  if (arg.get('bridge')) cfg.bridge = arg.get('bridge')
  if (arg.get('scale')) cfg.resolutionScale = arg.get('scale')
  if (arg.get('latency')) cfg.latency = arg.get('latency')
  if (arg.has('xr-mock')) {
    cfg.mock = true
    if (arg.get('xr-mock')) cfg.mockInput = arg.get('xr-mock')
  }
  if (arg.has('unlock-fps')) cfg.unlockFrameRate = true
  if (arg.has('devtools')) cfg.devTools = true

  cfg.bridge = oneOf(cfg.bridge, ['native', 'ipc'], 'native')
  cfg.latency = oneOf(cfg.latency, ['low', 'smooth'], 'smooth')
  cfg.mockInput = oneOf(cfg.mockInput, ['controllers', 'hands', 'cycle'], 'cycle')
  cfg.resolutionScale = num(cfg.resolutionScale, 1, 0.25, 2)
  cfg.mock = cfg.mock === true
  cfg.vr = cfg.vr === true
  cfg.devTools = cfg.devTools === true
  if (cfg.unlockFrameRate === null) cfg.unlockFrameRate = cfg.vr
  cfg.unlockFrameRate = cfg.unlockFrameRate === true
  cfg.allowedOrigins = Array.isArray(cfg.allowedOrigins) ? cfg.allowedOrigins.filter((s) => typeof s === 'string') : []

  // クライアントの URL
  let url = typeof cfg.clientUrl === 'string' ? cfg.clientUrl.trim() : ''
  if (url === 'dev') url = DEV_CLIENT_URL
  if (url === 'bundled') {
    if (!bundledAvailable) warnings.push('同梱のクライアントがありません（apps/client を npm run build してください）。開発サーバーを使います')
    url = bundledAvailable ? BUNDLED_CLIENT_URL : DEV_CLIENT_URL
  }
  if (!url) url = packaged && bundledAvailable ? BUNDLED_CLIENT_URL : DEV_CLIENT_URL
  try {
    const u = new URL(url)
    if (!['http:', 'https:', 'app:'].includes(u.protocol)) throw new Error('unsupported protocol ' + u.protocol)
  } catch (err) {
    warnings.push(`clientUrl が不正です（${url}）: ${err.message}`)
    url = packaged && bundledAvailable ? BUNDLED_CLIENT_URL : DEV_CLIENT_URL
  }
  cfg.clientUrl = url

  const selftest = arg.has('selftest')
  return {
    config: cfg,
    warnings,
    selftest: selftest ? { page: oneOf(arg.get('selftest') ?? 'three', ['three', 'r3f'], 'three'), real: arg.has('selftest-real'), seconds: num(arg.get('selftest-seconds'), 40, 5, 600) } : null,
    register: arg.has('register') ? 'add' : arg.has('unregister') ? 'remove' : null,
  }
}

/** URL のオリジン（app: のような独自スキームでも "scheme://host" を返す。Node の URL は "null" を返すため） */
function originOf(url) {
  try {
    const u = new URL(url)
    if (u.protocol === 'file:' || u.protocol === 'data:' || u.protocol === 'blob:' || u.protocol === 'about:') return null
    return `${u.protocol}//${u.host}`.toLowerCase()
  } catch {
    return null
  }
}

/** 同じオリジンか（127.0.0.1 と localhost は同じものとみなす） */
function sameOrigin(a, b) {
  const x = originOf(a)
  const y = originOf(b)
  if (!x || !y) return false
  const norm = (o) => o.replace('://localhost', '://127.0.0.1')
  return norm(x) === norm(y)
}

function configFileCandidates({ userData, packaged, exeDir, appDir }) {
  return [path.join(userData, 'config.json'), packaged ? path.join(exeDir, 'tentenv.config.json') : path.join(appDir, 'tentenv.config.json')]
}

module.exports = { DEFAULTS, DEV_CLIENT_URL, BUNDLED_CLIENT_URL, loadConfig, originOf, sameOrigin, configFileCandidates, makeArgReader }
