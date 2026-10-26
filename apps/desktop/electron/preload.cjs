// TenTenV desktop — preload（分離ワールド）
//
// ページには最小限の XR ブリッジ（window.__tentenvXR）だけを公開し、WebXR の実装（webxr-polyfill.js）を
// ページのスクリプトより先にメインワールドへ注入する。Node の機能はページへ渡さない。
//
// ブリッジの方式（メインプロセスが決めて、起動時に同期 IPC で渡す）:
//   native … preload がネイティブアドオンを直接使う（このウィンドウだけ sandbox: false）。速い・既定
//   ipc    … preload もサンドボックス化し、アドオンはメインプロセスで動かす。画素は IPC でコピーして送る（遅い）
//
// サンドボックス下でも動くよう、require するのは 'electron' と（native のときだけ）アドオンのみ。

'use strict'

const { contextBridge, ipcRenderer } = require('electron')

const init = ipcRenderer.sendSync('tentenv:preload-init', location.href)
if (init && init.allowed) setup(init)

function setup(cfg) {
  const ipc = cfg.bridge === 'ipc'
  const call = (method, ...args) => ipcRenderer.invoke('tentenv:xr', method, ...args)
  let native = null
  let session = null
  let info = null

  // ---------------------------------------------------------------- キャンバス → ネイティブ（WebGPU で GPU コピー → 読み戻し）
  // DOM は分離ワールドとも共有なので、ページのキャンバスをここで直接読める
  let gpu = null
  let staging = null // { texture, buffers, w, h, bpr, format }
  let chain = Promise.resolve()
  const stats = { presented: 0, dropped: 0, failed: 0, mapMs: 0, submitMs: 0, n: 0 }

  async function prepare() {
    try {
      if (gpu) return { ok: true }
      if (!navigator.gpu) return { ok: false, error: 'navigator.gpu is not available' }
      const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' })
      if (!adapter) return { ok: false, error: 'no WebGPU adapter' }
      gpu = await adapter.requestDevice()
      gpu.lost.then((i) => {
        console.error('[TenTenV XR] WebGPU device lost:', i.message)
        gpu = null
        staging = null
      })
      return { ok: true }
    } catch (err) {
      return { ok: false, error: String((err && err.message) || err) }
    }
  }

  function ensureStaging(w, h, format) {
    if (staging && staging.w === w && staging.h === h && staging.format === format) return staging
    if (staging) {
      staging.texture.destroy()
      for (const b of staging.buffers) b.destroy()
    }
    const bpr = Math.ceil((w * 4) / 256) * 256
    staging = {
      w,
      h,
      bpr,
      format,
      texture: gpu.createTexture({
        size: [w, h],
        format,
        usage: GPUTextureUsage.COPY_SRC | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
      }),
      buffers: [0, 1, 2].map(() => gpu.createBuffer({ size: bpr * h, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST })),
    }
    return staging
  }

  /** 横並び両眼が描かれたキャンバスを送る。GPU コピーだけ積んで戻り、転送が終わると解決する Promise を返す */
  function present(canvas, eyeW, eyeH, seq) {
    if (!gpu || !info) return null
    const w = canvas.width
    const h = canvas.height
    const st = ensureStaging(w, h, info.colorFormat)
    const buf = st.buffers.find((b) => !b.__busy && b.mapState === 'unmapped')
    if (!buf) {
      stats.dropped++
      return null
    }
    buf.__busy = true
    // premultipliedAlpha: true … キャンバス（乗算済み）の値をそのままコピーする（透明な画素を黒くしない）
    gpu.queue.copyExternalImageToTexture({ source: canvas }, { texture: st.texture, premultipliedAlpha: true }, [w, h])
    const enc = gpu.createCommandEncoder()
    enc.copyTextureToBuffer({ texture: st.texture }, { buffer: buf, bytesPerRow: st.bpr, rowsPerImage: h }, [w, h])
    gpu.queue.submit([enc.finish()])
    const t0 = performance.now()
    const mapped = buf.mapAsync(GPUMapMode.READ)
    const s = session
    const target = info
    // 読み戻し → 提出は前の画像のあとに直列でつなぐ（古い画像が新しい画像を追い越さないように）
    chain = chain
      .then(() => mapped)
      .then(async () => {
        const t1 = performance.now()
        stats.mapMs += t1 - t0
        if (target !== info) return
        const data = buf.getMappedRange()
        if (ipc) {
          // 引数は送る時点でコピーされるので、すぐ unmap してよい
          const p = call('submit', new Uint8Array(data), 0, eyeW * 4, st.bpr, seq)
          buf.unmap()
          await p
        } else {
          if (s !== session) return
          await s.submit(data, 0, eyeW * 4, st.bpr, seq)
        }
        stats.submitMs += performance.now() - t1
        stats.n++
        stats.presented++
      })
      .catch((err) => {
        stats.failed++
        if (!/busy/.test(String(err && err.message))) console.error('[TenTenV XR] present failed:', err && err.message)
      })
      .finally(() => {
        if (buf.mapState === 'mapped') buf.unmap()
        buf.__busy = false
      })
    return chain
  }

  function loadNative() {
    if (!native) native = require(cfg.addonPath)
    return native
  }

  function describe(s) {
    const i = s.getInfo()
    let rates = null
    try {
      rates = s.getRefreshRates()
    } catch {}
    return { ...i, refreshRates: rates ? Array.from(rates) : null, refreshRate: s.getRefreshRate() }
  }

  const bridge = {
    config: { bridge: cfg.bridge, latency: cfg.latency, mock: cfg.mock },
    supported: () => cfg.supported,
    prepare,
    async create(opts = {}) {
      try {
        if (ipc) {
          info = await call('create', opts)
          if (info && info.error) {
            const error = info.error
            info = null
            ipcRenderer.send('tentenv:xr-state', { active: false, error })
            return { error }
          }
        } else {
          if (session) session.destroy()
          session = new (loadNative().XrSession)({
            mock: cfg.mock,
            appName: 'TenTenV',
            resolutionScale: cfg.resolutionScale,
            mockInput: cfg.mockInput,
          })
          info = describe(session)
        }
        ipcRenderer.send('tentenv:xr-state', { active: true, backend: info.backend, runtimeName: info.runtimeName, width: info.width, height: info.height })
        return info
      } catch (err) {
        session = null
        info = null
        const error = String((err && err.message) || err).replace(/Failed to construct 'XrSession': /g, '')
        ipcRenderer.send('tentenv:xr-state', { active: false, error })
        return { error }
      }
    },
    poll: () => (ipc ? call('poll') : session ? session.pollEvents() : [{ type: 'exit', detail: 'no session' }]),
    waitFrame: () => (ipc ? call('waitFrame') : session.waitFrame()),
    frame() {
      if (ipc) return call('frame')
      session.beginFrame()
      const views = session.locateViews()
      const input = session.syncInput()
      return { views, input, trackers: session.locateTrackers ? session.locateTrackers() : null }
    },
    present,
    endFrame: () => (ipc ? call('endFrame') : session.endFrame()),
    haptics: (hand, amplitude, ms) => (ipc ? call('haptics', hand, amplitude, ms) : session && session.applyHaptics(hand, amplitude, ms)),
    stopHaptics: (hand) => (ipc ? call('stopHaptics', hand) : session && session.stopHaptics(hand)),
    requestExit: () => (ipc ? call('requestExit') : session && session.requestExit()),
    bounds: () => (ipc ? call('bounds') : session ? session.getBounds() : null),
    setRefreshRate: (hz) => (ipc ? call('setRefreshRate', hz) : !!(session && session.setRefreshRate(hz))),
    async stats() {
      const nat = ipc ? await call('stats') : session ? session.getStats() : null
      const n = stats.n || 1
      return {
        native: nat,
        bridge: { presented: stats.presented, dropped: stats.dropped, failed: stats.failed, mapMs: +(stats.mapMs / n).toFixed(2), submitMs: +(stats.submitMs / n).toFixed(2) },
      }
    },
    async destroy() {
      if (ipc) await call('destroy')
      else if (session) {
        try {
          session.destroy()
        } catch {}
      }
      session = null
      info = null
      ipcRenderer.send('tentenv:xr-state', { active: false })
    },
  }

  // ページを離れるとき（再読み込み・移動・閉じる）は XR セッションを必ず閉じる（ランタイム側に残さない）
  window.addEventListener('pagehide', () => {
    if (session || info) bridge.destroy()
  })

  contextBridge.exposeInMainWorld('__tentenvXR', bridge)

  // OSC（フェイストラッキング）: メインプロセスが UDP で受けたパケットをページへ渡す
  let oscCb = null
  ipcRenderer.on('tentenv:osc-packet', (_e, data) => {
    if (oscCb) oscCb(new Uint8Array(data))
  })
  contextBridge.exposeInMainWorld('__tentenvOSC', {
    listen: (port) => ipcRenderer.invoke('tentenv:osc', 'listen', Number(port)),
    close: () => ipcRenderer.invoke('tentenv:osc', 'close'),
    onPacket: (cb) => {
      oscCb = typeof cb === 'function' ? cb : null
    },
  })
  // ページのスクリプトより先に navigator.xr を差し替える（関数は文字列から作り、メインワールドで実行される）
  const install = new Function(`return (${cfg.polyfill})`)()
  contextBridge.executeInMainWorld({ func: install })
}
