// TenTenV desktop — Electron のメインプロセス
//
// TenTenV の Web クライアントをウィンドウに表示し、ページの WebXR（navigator.xr）を OpenXR に繋ぐ。
//   electron .                          開発: http://127.0.0.1:5190（npm run dev:client）を開く
//   electron . --client-url bundled     apps/client/dist（npm run build）を app://tentenv/ で開く
//   electron . --vr                     ワールドに入ったら自動で VR に入る
//   electron . --selftest [three|r3f]   疑似 HMD で WebXR の経路を確かめて終了
// オプションの一覧は config.cjs を参照。

'use strict'

const { app, BrowserWindow, Menu, dialog, ipcMain, powerSaveBlocker, protocol, screen, session, shell } = require('electron')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { loadConfig, originOf, sameOrigin, configFileCandidates, BUNDLED_CLIENT_URL } = require('./config.cjs')
const { createHandler, registerPrivileged, SCHEME } = require('./protocol.cjs')
const { loadAddon, detectSupport, IpcXrHost } = require('./xr-host.cjs')
const steamvr = require('./steamvr.cjs')

const APP_NAME = 'TenTenV'
const PARTITION = 'persist:tentenv'
const SELFTEST_ORIGIN = 'app://selftest'
const appRoot = path.join(__dirname, '..')

app.setName(APP_NAME)
if (process.platform === 'win32') app.setAppUserModelId('tentenv.client')

// ------------------------------------------------------------------ 設定
const argv = process.argv.slice(1)
// --profile <dir>: ユーザーデータ（ログイン状態・設定・ログ）の場所を変える（複数アカウントやテスト用）
const profileDir = require('./config.cjs').makeArgReader(argv).get('profile')
if (profileDir) app.setPath('userData', path.resolve(profileDir))
const bundledDir = app.isPackaged ? path.join(appRoot, 'client') : path.join(appRoot, '..', 'client', 'dist')
const bundledAvailable = fs.existsSync(path.join(bundledDir, 'index.html'))
const parsed = loadConfig({
  argv,
  env: process.env,
  files: configFileCandidates({ userData: app.getPath('userData'), packaged: app.isPackaged, exeDir: path.dirname(process.execPath), appDir: appRoot }),
  packaged: app.isPackaged,
  bundledAvailable,
})
const cfg = parsed.config
const selftest = parsed.selftest
if (selftest) {
  // 自己テストは別のユーザーデータで（普段のウィンドウ・ログイン状態と混ざらないように）
  app.setPath('userData', path.join(app.getPath('temp'), 'tentenv-desktop-selftest'))
  if (!selftest.real) cfg.mock = true
}

// ------------------------------------------------------------------ ログ（%APPDATA%\TenTenV\logs\desktop.log）
const logDir = path.join(app.getPath('userData'), 'logs')
fs.mkdirSync(logDir, { recursive: true })
const logFile = path.join(logDir, 'desktop.log')
try {
  if (fs.existsSync(logFile) && fs.statSync(logFile).size > 5e6) fs.renameSync(logFile, logFile + '.old')
} catch {}
function log(...parts) {
  const line = `${new Date().toISOString()} ${parts.map((p) => (typeof p === 'string' ? p : JSON.stringify(p))).join(' ')}`
  console.log(line)
  try {
    fs.appendFileSync(logFile, line + '\n')
  } catch {}
}
process.on('uncaughtException', (e) => log('[main] uncaught', e && e.stack))
for (const w of parsed.warnings) log('[config]', w)

// ------------------------------------------------------------------ Chromium の設定
// VR 中はデスクトップのウィンドウが隠れていても描画・タイマーを止めない
app.commandLine.appendSwitch('disable-background-timer-throttling')
app.commandLine.appendSwitch('disable-renderer-backgrounding')
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion')
app.commandLine.appendSwitch('force_high_performance_gpu')
app.commandLine.appendSwitch('ignore-gpu-blocklist')
app.commandLine.appendSwitch('enable-gpu-rasterization')
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')
// モニタの垂直同期（60Hz など）に縛られないようにする（VR は 72〜120Hz）。デスクトップでは GPU を余計に使うので --vr のときだけ
if (cfg.unlockFrameRate) app.commandLine.appendSwitch('disable-gpu-vsync')

registerPrivileged(protocol)

if (!selftest && !parsed.register && !app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

// ------------------------------------------------------------------ ネイティブアドオン
const addon = loadAddon(appRoot)
if (addon.error) log('[xr]', addon.error)
const support = detectSupport({ native: addon.native, loadError: addon.error, mock: cfg.mock })
log(`[tentenv] start v${app.getVersion()} client=${cfg.clientUrl} bridge=${cfg.bridge} mock=${cfg.mock} vr=${cfg.vr} xr=${JSON.stringify(support)}`)
const polyfillSource = require('./webxr-polyfill.cjs').toString()
const ipcHost = new IpcXrHost({ native: addon.native, config: cfg, log })

let mainWindow = null
let forceClose = false // 自己テスト・診断の終了時は確認しない

const isTrusted = (url) => sameOrigin(url, cfg.clientUrl) || (!!selftest && sameOrigin(url, SELFTEST_ORIGIN))
const isInAppNavigation = (url) => isTrusted(url) || cfg.allowedOrigins.some((o) => sameOrigin(url, o))
// ログイン（MiAuth / OAuth）の画面とみなす URL。アプリ内の小さなウィンドウで開き、クライアントへ戻ってきたら閉じる
const looksLikeAuth = (url) => /\/(miauth|oauth2?|authorize|login|signin|auth)(\/|\?|$)/i.test(new URL(url).pathname + '/')

// ------------------------------------------------------------------ ウィンドウの位置と大きさを覚える
const stateFile = path.join(app.getPath('userData'), 'window-state.json')
function loadWindowState() {
  try {
    const s = JSON.parse(fs.readFileSync(stateFile, 'utf8'))
    const area = screen.getDisplayMatching(s).workArea
    const visible = s.x < area.x + area.width - 50 && s.x + s.width > area.x + 50 && s.y >= area.y - 10 && s.y < area.y + area.height - 50
    if (visible && s.width >= 400 && s.height >= 300) return s
  } catch {}
  return { width: 1400, height: 860 }
}
function trackWindowState(win) {
  let timer = null
  const save = () => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      if (win.isDestroyed() || win.isMinimized() || win.isFullScreen()) return
      const b = win.getNormalBounds()
      try {
        fs.writeFileSync(stateFile, JSON.stringify({ ...b, maximized: win.isMaximized() }))
      } catch {}
    }, 400)
  }
  win.on('resize', save)
  win.on('move', save)
  win.on('maximize', save)
  win.on('unmaximize', save)
  win.on('close', () => {
    clearTimeout(timer)
    if (win.isFullScreen() || win.isMinimized()) return
    try {
      fs.writeFileSync(stateFile, JSON.stringify({ ...win.getNormalBounds(), maximized: win.isMaximized() }))
    } catch {}
  })
}

// ------------------------------------------------------------------ セッション（権限・プロトコル・UA）
function setupSession() {
  const ses = session.fromPartition(PARTITION)
  const hosts = { tentenv: { root: bundledDir, spa: true } }
  if (selftest) {
    const threeDir = app.isPackaged ? path.join(appRoot, 'vendor', 'three') : path.dirname(require.resolve('three'))
    hosts.selftest = { root: path.join(appRoot, 'selftest'), mounts: { '/vendor/three/': threeDir } }
  }
  ses.protocol.handle(SCHEME, createHandler(hosts))

  // Electron の名前を含まない、普通の Chrome と同じ UA にする（ログイン画面などのため）
  ses.setUserAgent(ses.getUserAgent().replace(/\s(Electron|TenTenV|tentenv)\/\S+/gi, ''))

  // 権限: クライアントのオリジンにだけ、マイク・カメラ・全画面・マウスロック・クリップボード書き込みを許す
  const allowed = new Set(['media', 'fullscreen', 'pointerLock', 'clipboard-sanitized-write', 'speaker-selection'])
  ses.setPermissionRequestHandler((wc, permission, cb, details) => {
    const url = details.requestingUrl || wc.getURL()
    let ok = isTrusted(url) && allowed.has(permission)
    if (ok && permission === 'media') ok = (details.mediaTypes ?? []).every((t) => t === 'audio' || t === 'video')
    if (!ok) log(`[permission] denied ${permission} for ${originOf(url)}`)
    cb(ok)
  })
  ses.setPermissionCheckHandler((_wc, permission, requestingOrigin) => isTrusted(requestingOrigin) && allowed.has(permission))
  ses.setDevicePermissionHandler(() => false)
  return ses
}

// ------------------------------------------------------------------ メニュー
const ENTER_VR_JS = `(() => {
  if (navigator.xr && navigator.xr.__tentenv && navigator.xr.__tentenv.active()) return 'active'
  const b = [...document.querySelectorAll('button')].find((b) => /(^|\\s)VR(\\s|$)/.test((b.textContent || '').replace(/[^\\w\\s]/g, ' ')) && b.offsetParent !== null)
  if (b) { b.click(); return 'clicked' }
  return 'none'
})()`

function enterVR(win) {
  return win.webContents.executeJavaScript(ENTER_VR_JS, true).catch(() => 'error')
}
function exitVR(win) {
  return win.webContents.executeJavaScript('navigator.xr && navigator.xr.__tentenv ? navigator.xr.__tentenv.end() : null', true).catch(() => {})
}

function steamvrManifestFile() {
  return path.join(app.getPath('userData'), steamvr.MANIFEST_NAME)
}
function registerSteamVR() {
  const manifest = steamvr.buildManifest({
    binaryPath: process.execPath,
    args: app.isPackaged ? ['--vr'] : [app.getAppPath(), '--vr'],
    workingDirectory: path.dirname(process.execPath),
    imagePath: path.join(appRoot, 'assets', 'steamvr-library.png'),
  })
  const file = steamvr.writeManifest(steamvrManifestFile(), manifest)
  const r = steamvr.register(addon.native, file)
  log('[steamvr] registered', r.method, r.detail)
  return r
}

function buildMenu(win) {
  const wc = win.webContents
  const info = (message, detail) => dialog.showMessageBox(win, { type: 'info', title: APP_NAME, message, detail })
  const fail = (message, err) => dialog.showMessageBox(win, { type: 'error', title: APP_NAME, message, detail: String(err && err.message ? err.message : err) })
  return Menu.buildFromTemplate([
    {
      label: 'TenTenV',
      submenu: [
        { label: 'ホームへ戻る', accelerator: 'Alt+Home', click: () => wc.loadURL(cfg.clientUrl) },
        { label: '戻る', accelerator: 'Alt+Left', click: () => wc.navigationHistory.canGoBack() && wc.navigationHistory.goBack() },
        { label: '再読み込み', accelerator: 'CmdOrCtrl+R', click: () => wc.reload() },
        { label: '強制再読み込み', accelerator: 'CmdOrCtrl+Shift+R', click: () => wc.reloadIgnoringCache() },
        { type: 'separator' },
        {
          label: 'VR に入る',
          accelerator: 'CmdOrCtrl+Shift+V',
          click: async () => {
            if (!support.ok) return info('VR を使えません', support.reason)
            if ((await enterVR(win)) === 'none') info('ワールドに入ってから VR に入ってください', '画面右上の「VR」ボタンと同じ操作です。')
          },
        },
        { label: 'VR を終了', accelerator: 'CmdOrCtrl+Shift+X', click: () => exitVR(win) },
        { label: 'VR の正面をリセット', accelerator: 'CmdOrCtrl+Shift+C', click: () => wc.executeJavaScript("window.dispatchEvent(new Event('tentenv:recenter'))").catch(() => {}) },
        { type: 'separator' },
        {
          label: 'SteamVR のライブラリに登録',
          click: () => {
            try {
              const r = registerSteamVR()
              info(
                'SteamVR のライブラリに「TenTenV」を登録しました',
                r.method === 'openvr' ? 'SteamVR のライブラリから起動できます。' : `SteamVR が起動していなかったため ${r.detail} に追記しました。次に SteamVR を起動したときに反映されます。`,
              )
            } catch (err) {
              fail('登録できませんでした', err)
            }
          },
        },
        {
          label: 'SteamVR の登録を解除',
          click: () => {
            try {
              steamvr.unregister(addon.native, steamvrManifestFile())
              info('登録を解除しました')
            } catch (err) {
              fail('解除できませんでした', err)
            }
          },
        },
        { type: 'separator' },
        {
          label: '設定ファイルを開く',
          click: () => {
            const f = path.join(app.getPath('userData'), 'config.json')
            if (!fs.existsSync(f)) fs.writeFileSync(f, JSON.stringify({ clientUrl: cfg.clientUrl, resolutionScale: cfg.resolutionScale, latency: cfg.latency }, null, 2) + '\n')
            shell.openPath(f)
          },
        },
        { label: 'ログのフォルダを開く', click: () => shell.openPath(logDir) },
        { type: 'separator' },
        { role: 'quit', label: '終了' },
      ],
    },
    { role: 'editMenu', label: '編集' },
    {
      label: '表示',
      submenu: [
        { label: 'フルスクリーン', accelerator: 'F11', click: () => win.setFullScreen(!win.isFullScreen()) },
        { role: 'resetZoom', label: '実際のサイズ' },
        { role: 'zoomIn', label: '拡大' },
        { role: 'zoomOut', label: '縮小' },
        { type: 'separator' },
        { label: '開発者ツール', accelerator: 'F12', click: () => wc.toggleDevTools() },
      ],
    },
    {
      label: 'ヘルプ',
      submenu: [
        {
          label: 'VR の状態',
          click: () =>
            info(
              support.ok ? 'VR を使えます' : 'VR を使えません',
              [
                `ランタイム: ${support.mock ? '疑似 HMD（--xr-mock）' : support.runtime || '-'}`,
                support.reason ? `理由: ${support.reason}` : '',
                `ブリッジ: ${cfg.bridge}`,
                `解像度の倍率: ${cfg.resolutionScale}`,
                `ネイティブアドオン: ${addon.native ? addon.file : addon.error}`,
              ]
                .filter(Boolean)
                .join('\n'),
            ),
        },
        { label: 'バージョン情報', click: () => info(`${APP_NAME} ${app.getVersion()}`, `Electron ${process.versions.electron} / Chromium ${process.versions.chrome}\nクライアント: ${cfg.clientUrl}`) },
      ],
    },
  ])
}

// ------------------------------------------------------------------ ログイン用の小さなウィンドウ
function openAuthWindow(parent, url) {
  const win = new BrowserWindow({
    parent,
    width: 520,
    height: 720,
    title: `${APP_NAME} — ログイン`,
    autoHideMenuBar: true,
    webPreferences: { partition: PARTITION, sandbox: true, contextIsolation: true, nodeIntegration: false },
  })
  // クライアント（コールバック）へ戻ってきたら閉じて、メインのウィンドウで開く
  const back = (e, target) => {
    if (!isTrusted(target)) return
    e.preventDefault()
    win.close()
    parent.webContents.loadURL(target)
  }
  win.webContents.on('will-navigate', back)
  win.webContents.on('will-redirect', back)
  win.webContents.setWindowOpenHandler(({ url: u }) => {
    if (/^https?:/i.test(u)) shell.openExternal(u)
    return { action: 'deny' }
  })
  win.loadURL(url)
  return win
}

// ------------------------------------------------------------------ メインのウィンドウ
function createWindow() {
  const ses = setupSession()
  const st = loadWindowState()
  const win = new BrowserWindow({
    ...st,
    minWidth: 640,
    minHeight: 400,
    title: APP_NAME,
    icon: path.join(appRoot, 'assets', 'icon.png'),
    backgroundColor: '#0d0f17',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      session: ses,
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      // native ブリッジは preload でネイティブアドオンを読むため、このウィンドウだけサンドボックスを外す
      // （ページ側には Node を渡さない。ipc ブリッジならサンドボックスのまま）
      sandbox: cfg.bridge === 'ipc',
      webSecurity: true,
      backgroundThrottling: false,
      spellcheck: false,
    },
  })
  mainWindow = win
  if (st.maximized) win.maximize()
  win.once('ready-to-show', () => win.show())
  trackWindowState(win)
  Menu.setApplicationMenu(buildMenu(win))

  const wc = win.webContents
  wc.setWindowOpenHandler(({ url }) => {
    // 外部のリンクは既定のブラウザで開く
    if (/^https?:/i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  wc.on('will-navigate', (e, url) => {
    if (isInAppNavigation(url)) return
    e.preventDefault()
    if (!/^https?:/i.test(url)) return
    if (looksLikeAuth(url)) openAuthWindow(win, url)
    else shell.openExternal(url)
  })
  wc.on('will-attach-webview', (e) => e.preventDefault())
  // クライアントはワールドにいる間 beforeunload で離脱を止める。Electron では何も出ずに閉じられなくなるので確認する
  wc.on('will-prevent-unload', (e) => {
    if (forceClose) return e.preventDefault()
    const choice = dialog.showMessageBoxSync(win, {
      type: 'question',
      title: APP_NAME,
      message: 'ワールドから退出しますか？',
      buttons: ['退出する', 'キャンセル'],
      defaultId: 0,
      cancelId: 1,
    })
    if (choice === 0) e.preventDefault()
  })
  // ページが入れ替わったら、そのページの XR セッションは終わり（ipc ブリッジのときはメインプロセス側を片付ける）
  wc.on('did-start-navigation', (d) => {
    if (d.isMainFrame && !d.isSameDocument) {
      ipcHost.destroy()
      setVrActive(false)
    }
  })
  wc.on('page-title-updated', (e) => {
    e.preventDefault()
    win.setTitle(APP_NAME)
  })
  wc.on('console-message', (e) => {
    const msg = e.message
    if (typeof msg === 'string' && (msg.includes('[TenTenV') || e.level === 'error')) log('[page]', msg.slice(0, 2000))
  })
  wc.on('render-process-gone', (_e, d) => {
    log(`[tentenv] renderer gone: ${d.reason} exitCode=${d.exitCode}`)
    ipcHost.destroy()
    setVrActive(false)
    if (!selftest && d.reason !== 'clean-exit') {
      dialog.showMessageBox(win, { type: 'error', title: APP_NAME, message: 'ページが停止しました。再読み込みします。', detail: d.reason }).then(() => wc.reload())
    }
  })
  app.on('child-process-gone', (_e, d) => log(`[tentenv] child process gone: ${d.type} ${d.reason} exitCode=${d.exitCode}`))
  if (cfg.devTools) wc.openDevTools({ mode: 'detach' })
  return win
}

// ------------------------------------------------------------------ VR 中はプロセスの優先度を上げ、画面のスリープを止める
let blocker = null
function setVrActive(active) {
  const prio = active ? os.constants.priority.PRIORITY_HIGH : os.constants.priority.PRIORITY_NORMAL
  const pids = new Set([process.pid])
  if (mainWindow && !mainWindow.isDestroyed()) pids.add(mainWindow.webContents.getOSProcessId())
  for (const p of app.getAppMetrics()) if (p.type === 'GPU' || p.type === 'Tab') pids.add(p.pid)
  for (const pid of pids) {
    try {
      if (pid) os.setPriority(pid, prio)
    } catch {}
  }
  if (active && blocker === null) blocker = powerSaveBlocker.start('prevent-display-sleep')
  if (!active && blocker !== null) {
    powerSaveBlocker.stop(blocker)
    blocker = null
  }
}

// ------------------------------------------------------------------ preload との IPC
ipcMain.on('tentenv:preload-init', (e, href) => {
  // クライアント（と自己テストのページ）にだけブリッジを渡す
  const frameUrl = (e.senderFrame && e.senderFrame.url) || href
  const allowed = !!mainWindow && e.sender === mainWindow.webContents && isTrusted(frameUrl)
  e.returnValue = allowed
    ? {
        allowed: true,
        bridge: cfg.bridge,
        addonPath: addon.file,
        mock: cfg.mock,
        mockInput: cfg.mockInput,
        resolutionScale: cfg.resolutionScale,
        latency: cfg.latency,
        supported: support,
        polyfill: polyfillSource,
      }
    : { allowed: false }
})
ipcMain.handle('tentenv:xr', (e, method, ...args) => {
  if (!mainWindow || e.sender !== mainWindow.webContents || !isTrusted(e.senderFrame ? e.senderFrame.url : '')) throw new Error('forbidden')
  if (cfg.bridge !== 'ipc') throw new Error('ipc bridge is disabled')
  return ipcHost.handle(e.sender, method, args)
})
// ------------------------------------------------------------------ OSC（フェイストラッキング）
// ページは UDP を受けられないので、ここで受けてクライアントのページへそのまま渡す
let osc = null // { socket, port }
const closeOsc = () => {
  if (!osc) return
  try {
    osc.socket.close()
  } catch {}
  osc = null
}
ipcMain.handle('tentenv:osc', (e, method, port) => {
  if (!mainWindow || e.sender !== mainWindow.webContents || !isTrusted(e.senderFrame ? e.senderFrame.url : '')) throw new Error('forbidden')
  if (method === 'close') return closeOsc()
  if (method !== 'listen') throw new Error('unknown method')
  if (!Number.isInteger(port) || port < 1024 || port > 65535) return { ok: false, error: 'invalid port' }
  if (osc && osc.port === port) return { ok: true }
  closeOsc()
  const socket = require('node:dgram').createSocket({ type: 'udp4', reuseAddr: true })
  const target = e.sender
  return new Promise((resolve) => {
    socket.once('error', (err) => {
      log('[osc] could not listen on', port, err.message)
      try {
        socket.close()
      } catch {}
      resolve({ ok: false, error: err.message })
    })
    socket.on('message', (msg) => {
      if (msg.length <= 65536 && !target.isDestroyed()) target.send('tentenv:osc-packet', msg)
    })
    socket.bind(port, () => {
      osc = { socket, port }
      log('[osc] listening on udp', port)
      resolve({ ok: true })
    })
  })
})

let lastXrErrorAt = 0
ipcMain.on('tentenv:xr-state', (e, s) => {
  if (!mainWindow || e.sender !== mainWindow.webContents || !s) return
  if (s.error) {
    log('[xr] could not start:', s.error)
    // クライアントはコンソールに出すだけなので、ここで知らせる（連続しては出さない）
    if (!selftest && Date.now() - lastXrErrorAt > 5000) {
      lastXrErrorAt = Date.now()
      const noHmd = /FORM_FACTOR_UNAVAILABLE|xrGetSystem/.test(s.error)
      dialog.showMessageBox(mainWindow, {
        type: 'warning',
        title: APP_NAME,
        message: 'VR を開始できませんでした',
        detail: (noHmd ? 'ヘッドセットが見つかりません。ヘッドセットを接続し、SteamVR（または Quest Link / Virtual Desktop など）を起動してからもう一度お試しください。\n\n' : '') + s.error,
      })
    }
    return
  }
  log('[xr] session', s.active ? `started ${s.backend} ${s.runtimeName} ${s.width}x${s.height}` : 'ended')
  setVrActive(!!s.active)
})

// ------------------------------------------------------------------ 自己テスト
async function runSelftest(win) {
  const outDir = app.isPackaged ? path.join(app.getPath('temp'), 'tentenv-selftest') : path.join(appRoot, 'test', 'output')
  fs.mkdirSync(outDir, { recursive: true })
  const name = `selftest-${selftest.page}-${cfg.bridge}${selftest.real ? '-real' : ''}`
  let done = false
  const finish = async (result) => {
    if (done) return
    done = true
    try {
      const img = await win.webContents.capturePage()
      fs.writeFileSync(path.join(outDir, name + '.png'), img.toPNG())
    } catch {}
    fs.writeFileSync(path.join(outDir, name + '.json'), JSON.stringify(result, null, 2))
    log(`[selftest] ${name}: ${result.ok ? 'PASS' : 'FAIL'}`, result.failures ?? '')
    setTimeout(() => app.exit(result.ok ? 0 : 1), 300)
  }
  win.webContents.on('console-message', (e) => {
    const msg = e.message
    const tag = '[TenTenV selftest] RESULT '
    if (typeof msg === 'string' && msg.startsWith(tag)) {
      let result
      try {
        result = JSON.parse(msg.slice(tag.length))
      } catch (err) {
        result = { ok: false, failures: ['bad result json: ' + err.message] }
      }
      finish(result)
    }
  })
  setTimeout(() => finish({ ok: false, failures: [`timeout after ${selftest.seconds}s`] }), selftest.seconds * 1000)
  await win.loadURL(`${SELFTEST_ORIGIN}/${selftest.page}.html`)
}

// ------------------------------------------------------------------ 起動
app.on('second-instance', (_e, args) => {
  const w = mainWindow
  if (!w) return
  if (w.isMinimized()) w.restore()
  w.focus()
  // SteamVR から 2 回目に起動されたら VR に入る
  if (args.includes('--vr')) enterVR(w)
})

app.whenReady().then(async () => {
  // TenTenV.exe --register / --unregister: ウィンドウを出さずに SteamVR へ登録して終了
  if (parsed.register) {
    try {
      if (parsed.register === 'add') registerSteamVR()
      else steamvr.unregister(addon.native, steamvrManifestFile())
      app.exit(0)
    } catch (err) {
      log('[steamvr] failed:', err.message)
      dialog.showErrorBox(APP_NAME, 'SteamVR への登録に失敗しました: ' + err.message)
      app.exit(1)
    }
    return
  }
  const win = createWindow()
  if (selftest) return runSelftest(win)

  if (cfg.clientUrl.startsWith(BUNDLED_CLIENT_URL) && !bundledAvailable) log('[tentenv] bundled client is missing:', bundledDir)
  try {
    await win.loadURL(cfg.clientUrl)
  } catch (err) {
    log('[tentenv] load failed', cfg.clientUrl, err.message)
    const dev = cfg.clientUrl.startsWith('http://127.0.0.1') || cfg.clientUrl.startsWith('http://localhost')
    const html = `<!doctype html><meta charset="utf-8"><title>${APP_NAME}</title><body style="background:#0d0f17;color:#e5e7eb;font:15px system-ui;padding:40px">
      <h2>クライアントを開けませんでした</h2><p>${cfg.clientUrl}</p>
      <p>${dev ? '開発サーバー（<code>npm run dev:client</code>）が起動しているか確認してください。<br>同梱のクライアントを使うには <code>--client-url bundled</code> を付けて起動します。' : 'ネットワークか URL を確認してください。'}</p>
      <p style="color:#9ca3af">${String(err.message).replace(/</g, '&lt;')}</p></body>`
    win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
  }

  // --vr: ワールドに入って「VR」ボタンが出たら押す（1 回だけ）
  if (cfg.vr && support.ok) {
    const timer = setInterval(async () => {
      if (win.isDestroyed()) return clearInterval(timer)
      const r = await enterVR(win)
      if (r === 'clicked' || r === 'active') {
        log('[tentenv] auto enter VR:', r)
        clearInterval(timer)
      }
    }, 1500)
  }

  // 診断用: --capture <png> [--capture-wait 秒] [--eval <js>] [--capture-quit]
  const diag = require('./config.cjs').makeArgReader(argv)
  const capture = diag.get('capture')
  if (capture) {
    setTimeout(async () => {
      const js = diag.get('eval')
      if (js) log('[diag] eval:', JSON.stringify(await win.webContents.executeJavaScript(js, true).catch((e) => String(e))))
      const img = await win.webContents.capturePage()
      fs.writeFileSync(capture, img.toPNG())
      log('[diag] captured', capture, win.webContents.getURL())
      if (diag.has('capture-quit')) {
        forceClose = true
        app.quit()
      }
    }, Number(diag.get('capture-wait') ?? 8) * 1000)
  }
})

app.on('window-all-closed', () => {
  ipcHost.destroy()
  app.quit()
})
