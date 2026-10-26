// メインプロセス側の XR: アドオンの読み込み、VR が使えるかの判定、ipc ブリッジ方式のときのセッション本体

'use strict'

const fs = require('node:fs')
const path = require('node:path')

function addonPath(appRoot) {
  return path.join(appRoot, 'bin', 'tentenv_xr.node')
}

function loadAddon(appRoot) {
  const file = addonPath(appRoot)
  if (!fs.existsSync(file)) return { native: null, file, error: `${file} がありません（npm run build:native）` }
  try {
    return { native: require(file), file, error: null }
  } catch (err) {
    return { native: null, file, error: String(err && err.message) }
  }
}

/**
 * VR が使えるか（ランタイムを起動せずに判定する）。
 * isSessionSupported('immersive-vr') の答えになる。実際に HMD があるかは requestSession で分かる
 */
function detectSupport({ native, loadError, mock }) {
  if (mock) return { ok: true, mock: true, reason: 'mock runtime' }
  if (!native) return { ok: false, reason: loadError || 'native addon is not available' }
  try {
    const rt = native.activeRuntime()
    if (rt.found) return { ok: true, runtime: rt.manifestPath, source: rt.source }
    return { ok: false, reason: rt.manifestPath ? `OpenXR runtime manifest not found: ${rt.manifestPath}` : 'no OpenXR runtime is registered' }
  } catch (err) {
    return { ok: false, reason: String(err && err.message) }
  }
}

function describe(s) {
  const info = s.getInfo()
  let rates = null
  try {
    rates = s.getRefreshRates()
  } catch {}
  return { ...info, refreshRates: rates ? Array.from(rates) : null, refreshRate: s.getRefreshRate() }
}

/** ipc ブリッジ方式: preload（サンドボックス）からの呼び出しを受けてアドオンを動かす */
class IpcXrHost {
  constructor({ native, config, log }) {
    this.native = native
    this.config = config
    this.log = log || (() => {})
    this.session = null
    this.owner = null
  }

  destroy() {
    if (this.session) {
      try {
        this.session.destroy()
      } catch {}
    }
    this.session = null
    this.owner = null
  }

  /** @returns {Promise<any>} */
  async handle(sender, method, args) {
    if (method === 'create') {
      this.destroy()
      if (!this.native) return { error: 'native addon is not available' }
      try {
        this.session = new this.native.XrSession({
          mock: this.config.mock,
          appName: 'TenTenV',
          resolutionScale: this.config.resolutionScale,
          mockInput: this.config.mockInput,
        })
        this.owner = sender.id
        return describe(this.session)
      } catch (err) {
        this.session = null
        return { error: String(err && err.message).replace(/Failed to construct 'XrSession': /g, '') }
      }
    }
    const s = this.session
    if (!s || this.owner !== sender.id) {
      if (method === 'poll') return [{ type: 'exit', detail: 'no session' }]
      if (method === 'destroy' || method === 'stats') return null
      throw new Error('no XR session')
    }
    switch (method) {
      case 'poll':
        return s.pollEvents()
      case 'waitFrame':
        return s.waitFrame()
      case 'frame':
        s.beginFrame()
        {
          const views = s.locateViews()
          const input = s.syncInput()
          return { views, input, trackers: s.locateTrackers ? s.locateTrackers() : null }
        }
      case 'submit': {
        const [pixels, offL, offR, pitch, seq] = args
        return s.submit(pixels, offL, offR, pitch, seq)
      }
      case 'endFrame':
        return s.endFrame()
      case 'haptics':
        return s.applyHaptics(args[0], args[1], args[2])
      case 'stopHaptics':
        return s.stopHaptics(args[0])
      case 'requestExit':
        return s.requestExit()
      case 'bounds':
        return s.getBounds()
      case 'setRefreshRate':
        return s.setRefreshRate(args[0])
      case 'stats':
        return s.getStats()
      case 'destroy':
        this.destroy()
        return null
      default:
        throw new Error('unknown method ' + method)
    }
  }
}

module.exports = { addonPath, loadAddon, detectSupport, IpcXrHost }
