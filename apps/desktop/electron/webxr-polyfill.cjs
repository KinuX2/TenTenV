// TenTenV desktop — ページ（メインワールド）に注入する WebXR 実装（webxr-polyfill.cjs）
//
// preload が contextBridge.executeInMainWorld() で、この関数をページのスクリプトより先に実行する。
// 関数は自己完結していること（外の変数や import を参照しない）。ネイティブ側へは preload が公開した
// window.__tentenvXR（最小限のブリッジ）だけを使う。
//
// three.js の WebXRManager は XRWebGLBinding が無いと XRWebGLLayer の経路を使う。XRWebGLLayer.framebuffer を
// null（= キャンバスの既定フレームバッファ）にすると、three はキャンバスを「片目の幅 x 2」に広げて
// 左右の目を横並びに描く。描き終わった同じタスクのうちに preload が WebGPU でキャンバスを GPU コピーし、
// 読み戻した画素をネイティブアドオンが OpenXR のスワップチェーンへ書く。
//
// 対応: navigator.xr.isSessionSupported / requestSession('immersive-vr')、XRSession（requestReferenceSpace
// viewer / local / local-floor / bounded-floor / unbounded、requestAnimationFrame、inputSources、
// updateRenderState、supportedFrameRates / updateTargetFrameRate、end）、XRFrame（getViewerPose / getPose /
// getJointPose / fillPoses / fillJointRadii）、XRInputSource（gamepad: xr-standard、gripSpace、targetRaySpace、hand）、
// select* / squeeze* / inputsourceschange / visibilitychange / end イベント、XRWebGLLayer、振動。

/* eslint-disable no-restricted-globals */
// 文字列にしてから注入するので、関数の名前は残る
function installTenTenVWebXR() {
  'use strict'
  const B = window.__tentenvXR
  if (!B || window.__tentenvWebXRInstalled) return
  window.__tentenvWebXRInstalled = true
  const TAG = '[TenTenV XR]'
  const log = (...a) => console.log(TAG, ...a)
  const warn = (...a) => console.warn(TAG, ...a)

  // ------------------------------------------------------------------ 行列（列優先 4x4、WebGL と同じ）
  const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])
  function poseToMat(p, q, out) {
    out = out || new Float32Array(16)
    const x = q[0], y = q[1], z = q[2], w = q[3]
    const x2 = x + x, y2 = y + y, z2 = z + z
    const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2
    const wx = w * x2, wy = w * y2, wz = w * z2
    out[0] = 1 - (yy + zz); out[1] = xy + wz; out[2] = xz - wy; out[3] = 0
    out[4] = xy - wz; out[5] = 1 - (xx + zz); out[6] = yz + wx; out[7] = 0
    out[8] = xz + wy; out[9] = yz - wx; out[10] = 1 - (xx + yy); out[11] = 0
    out[12] = p[0]; out[13] = p[1]; out[14] = p[2]; out[15] = 1
    return out
  }
  // 7 要素（px py pz qx qy qz qw）の配列から
  const arrToMat = (a, o = 0) => poseToMat([a[o], a[o + 1], a[o + 2]], [a[o + 3], a[o + 4], a[o + 5], a[o + 6]])
  function invertRigid(m) {
    const o = new Float32Array(16)
    o[0] = m[0]; o[1] = m[4]; o[2] = m[8]
    o[4] = m[1]; o[5] = m[5]; o[6] = m[9]
    o[8] = m[2]; o[9] = m[6]; o[10] = m[10]
    o[12] = -(m[0] * m[12] + m[1] * m[13] + m[2] * m[14])
    o[13] = -(m[4] * m[12] + m[5] * m[13] + m[6] * m[14])
    o[14] = -(m[8] * m[12] + m[9] * m[13] + m[10] * m[14])
    o[15] = 1
    return o
  }
  function multiply(a, b) {
    const r = new Float32Array(16)
    for (let c = 0; c < 4; c++) {
      const b0 = b[c * 4], b1 = b[c * 4 + 1], b2 = b[c * 4 + 2], b3 = b[c * 4 + 3]
      r[c * 4] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3
      r[c * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3
      r[c * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3
      r[c * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3
    }
    return r
  }
  function matToPosQuat(m) {
    const m00 = m[0], m01 = m[4], m02 = m[8], m10 = m[1], m11 = m[5], m12 = m[9], m20 = m[2], m21 = m[6], m22 = m[10]
    const tr = m00 + m11 + m22
    let x, y, z, w
    if (tr > 0) {
      const s = 0.5 / Math.sqrt(tr + 1); w = 0.25 / s; x = (m21 - m12) * s; y = (m02 - m20) * s; z = (m10 - m01) * s
    } else if (m00 > m11 && m00 > m22) {
      const s = 2 * Math.sqrt(1 + m00 - m11 - m22); w = (m21 - m12) / s; x = 0.25 * s; y = (m01 + m10) / s; z = (m02 + m20) / s
    } else if (m11 > m22) {
      const s = 2 * Math.sqrt(1 + m11 - m00 - m22); w = (m02 - m20) / s; x = (m01 + m10) / s; y = 0.25 * s; z = (m12 + m21) / s
    } else {
      const s = 2 * Math.sqrt(1 + m22 - m00 - m11); w = (m10 - m01) / s; x = (m02 + m20) / s; y = (m12 + m21) / s; z = 0.25 * s
    }
    const l = Math.hypot(x, y, z, w) || 1
    return { pos: [m[12], m[13], m[14]], quat: [x / l, y / l, z / l, w / l] }
  }
  // OpenXR の視野（各方向の角度）→ WebGL（クリップ深度 -1..1）の非対称投影
  function projectionFromFov(l, r, u, d, near, far) {
    const tl = Math.tan(l), tr = Math.tan(r), tu = Math.tan(u), td = Math.tan(d)
    const w = tr - tl, h = tu - td
    const o = new Float32Array(16)
    o[0] = 2 / w; o[5] = 2 / h; o[8] = (tr + tl) / w; o[9] = (tu + td) / h; o[11] = -1
    if (far === Infinity) { o[10] = -1; o[14] = -2 * near } else { o[10] = -(far + near) / (far - near); o[14] = -(2 * far * near) / (far - near) }
    return o
  }

  // ------------------------------------------------------------------ 基本の型
  class DOMPointReadOnlyLike {
    constructor(x = 0, y = 0, z = 0, w = 1) { this.x = x; this.y = y; this.z = z; this.w = w }
    toJSON() { return { x: this.x, y: this.y, z: this.z, w: this.w } }
  }
  const Point = typeof DOMPointReadOnly === 'function' ? DOMPointReadOnly : DOMPointReadOnlyLike

  class XRRigidTransform {
    constructor(position, orientation) {
      if (position instanceof Float32Array && position.length === 16 && orientation === undefined) {
        this._m = position
        const { pos, quat } = matToPosQuat(position)
        this.position = new Point(pos[0], pos[1], pos[2], 1)
        this.orientation = new Point(quat[0], quat[1], quat[2], quat[3])
        return
      }
      const p = position || {}
      const o = orientation || {}
      let q = [o.x || 0, o.y || 0, o.z || 0, o.w === undefined ? 1 : o.w]
      const len = Math.hypot(q[0], q[1], q[2], q[3]) || 1
      q = q.map((v) => v / len)
      this.position = new Point(p.x || 0, p.y || 0, p.z || 0, 1)
      this.orientation = new Point(q[0], q[1], q[2], q[3])
      this._m = poseToMat([p.x || 0, p.y || 0, p.z || 0], q)
    }
    get matrix() { return this._m }
    get inverse() { return new XRRigidTransform(invertRigid(this._m)) }
  }
  const matrixOf = (t) => (t && t._m) || (t && t.matrix ? Float32Array.from(t.matrix) : IDENTITY)

  // 空間: _pose(frame) が「ネイティブの基準空間（app 空間）での原点の姿勢」（取れなければ null）
  class XRSpace extends EventTarget {
    constructor(session, fn) { super(); this._session = session; this._fn = fn }
    _pose(frame) { return this._fn(frame) }
  }
  class XRReferenceSpace extends XRSpace {
    constructor(session, type, base, offset = IDENTITY) {
      super(session, (f) => { const b = base(f); return b ? multiply(b, offset) : null })
      this.type = type
      this._base = base
      this._offset = offset
      this.onreset = null
    }
    getOffsetReferenceSpace(originOffset) {
      const s = new XRReferenceSpace(this._session, this.type, this._base, multiply(this._offset, matrixOf(originOffset)))
      this._session._refSpaces.push(s)
      return s
    }
  }
  class XRBoundedReferenceSpace extends XRReferenceSpace {
    constructor(session, type, base, offset, bounds) { super(session, type, base, offset); this._bounds = bounds }
    get boundsGeometry() {
      const b = this._bounds
      if (!b) return []
      const w = b[0] / 2, d = b[1] / 2
      return [new Point(-w, 0, -d, 1), new Point(w, 0, -d, 1), new Point(w, 0, d, 1), new Point(-w, 0, d, 1)]
    }
    getOffsetReferenceSpace(originOffset) {
      const s = new XRBoundedReferenceSpace(this._session, this.type, this._base, multiply(this._offset, matrixOf(originOffset)), this._bounds)
      this._session._refSpaces.push(s)
      return s
    }
  }
  class XRReferenceSpaceEvent extends Event {
    constructor(type, init) { super(type); this.referenceSpace = init.referenceSpace; this.transform = init.transform || null }
  }

  class XRView {
    constructor(eye, transform, projectionMatrix, index) {
      this.eye = eye; this.transform = transform; this.projectionMatrix = projectionMatrix
      this.recommendedViewportScale = 1; this.isFirstPersonObserver = false; this._index = index
    }
    requestViewportScale() {}
  }
  class XRViewport { constructor(x, y, w, h) { this.x = x; this.y = y; this.width = w; this.height = h } }
  class XRPose { constructor(t, emulated = false) { this.transform = t; this.emulatedPosition = emulated; this.linearVelocity = null; this.angularVelocity = null } }
  class XRViewerPose extends XRPose { constructor(t, views, emulated) { super(t, emulated); this.views = Object.freeze(views) } }
  class XRJointPose extends XRPose { constructor(t, radius) { super(t, false); this.radius = radius } }

  class XRFrame {
    constructor(session, d) { this.session = session; this.predictedDisplayTime = d.time; this._d = d; this.trackedAnchors = undefined }
    getViewerPose(ref) {
      const d = this._d
      if (!d.viewsValid || !ref) return null
      const r = ref._pose(this)
      if (!r) return null
      const inv = invertRigid(r)
      const near = this.session.renderState.depthNear, far = this.session.renderState.depthFar
      const views = d.views.map((v, i) => new XRView(i === 0 ? 'left' : 'right', new XRRigidTransform(multiply(inv, v.matrix)), projectionFromFov(v.fov[0], v.fov[1], v.fov[2], v.fov[3], near, far), i))
      return new XRViewerPose(new XRRigidTransform(multiply(inv, d.head)), views, !d.positionTracked)
    }
    getPose(space, base) {
      if (!space || !base) return null
      const s = space._pose(this)
      const b = base._pose(this)
      if (!s || !b) return null
      return new XRPose(new XRRigidTransform(multiply(invertRigid(b), s)))
    }
    getJointPose(joint, base) {
      if (!(joint instanceof XRJointSpace)) return null
      const s = joint._pose(this)
      const b = base && base._pose(this)
      if (!s || !b) return null
      return new XRJointPose(new XRRigidTransform(multiply(invertRigid(b), s)), joint._radius(this))
    }
    fillPoses(spaces, base, out) {
      let ok = true
      const b = base && base._pose(this)
      const inv = b ? invertRigid(b) : null
      let i = 0
      for (const space of spaces) {
        const s = inv && space._pose(this)
        if (s) out.set(multiply(inv, s), i * 16)
        else { out.fill(NaN, i * 16, i * 16 + 16); ok = false }
        i++
      }
      return ok
    }
    fillJointRadii(joints, out) {
      let ok = true
      let i = 0
      for (const j of joints) {
        const r = j instanceof XRJointSpace ? j._radius(this) : null
        if (r === null) { out[i] = NaN; ok = false } else out[i] = r
        i++
      }
      return ok
    }
    // TenTenV の拡張（WebXR にない情報）:
    //   trackers … 体のトラッカー [腰, 左足, 右足]（base から見た 4x4 行列、無ければ null）
    //   skeletal … コントローラーを持ったまま取れる指の関節（SteamVR の Index など。[左, 右] 関節 26 x 8 の配列、無ければ null）
    __ttvExtra(base) {
      const b = base && base._pose(this)
      const inv = b ? invertRigid(b) : null
      const d = this._d
      return {
        trackers: (d.trackers || []).map((m) => (m && inv ? multiply(inv, m) : null)),
        skeletal: d.hands.map((h) => (h.controller && h.joints ? h.joints : null)),
      }
    }
    getHitTestResults() { return [] }
    getHitTestResultsForTransientInput() { return [] }
    getLightEstimate() { return null }
    getDepthInformation() { return null }
  }

  // ------------------------------------------------------------------ 手（XR_EXT_hand_tracking）
  const JOINTS = [
    'wrist',
    'thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip',
    'index-finger-metacarpal', 'index-finger-phalanx-proximal', 'index-finger-phalanx-intermediate', 'index-finger-phalanx-distal', 'index-finger-tip',
    'middle-finger-metacarpal', 'middle-finger-phalanx-proximal', 'middle-finger-phalanx-intermediate', 'middle-finger-phalanx-distal', 'middle-finger-tip',
    'ring-finger-metacarpal', 'ring-finger-phalanx-proximal', 'ring-finger-phalanx-intermediate', 'ring-finger-phalanx-distal', 'ring-finger-tip',
    'pinky-finger-metacarpal', 'pinky-finger-phalanx-proximal', 'pinky-finger-phalanx-intermediate', 'pinky-finger-phalanx-distal', 'pinky-finger-tip',
  ]
  const PALM = 25
  const STRIDE = 8
  const jointsOf = (f, hand) => { const h = f && f._d.hands[hand]; return h && h.joints }
  function jointMat(f, hand, j) {
    const a = jointsOf(f, hand)
    if (!a || !(a[j * STRIDE + 7] >= 0)) return null
    return arrToMat(a, j * STRIDE)
  }
  class XRJointSpace extends XRSpace {
    constructor(session, hand, index) {
      super(session, (f) => jointMat(f, hand, index))
      this.jointName = JOINTS[index]
      this._hand = hand
      this._index = index
    }
    _radius(f) { const a = jointsOf(f, this._hand); const r = a ? a[this._index * STRIDE + 7] : -1; return r >= 0 ? r : null }
  }
  class XRHand extends Map {
    constructor(session, hand) {
      super()
      JOINTS.forEach((name, i) => super.set(name, new XRJointSpace(session, hand, i)))
    }
    set() { throw new TypeError('XRHand is read-only') }
  }

  // ------------------------------------------------------------------ 入力
  const PROFILES = {
    '/interaction_profiles/oculus/touch_controller': ['oculus-touch-v3', 'oculus-touch', 'generic-trigger-squeeze-thumbstick'],
    '/interaction_profiles/meta/touch_controller_plus': ['meta-quest-touch-plus', 'oculus-touch-v3', 'generic-trigger-squeeze-thumbstick'],
    '/interaction_profiles/valve/index_controller': ['valve-index', 'generic-trigger-squeeze-touchpad-thumbstick'],
    '/interaction_profiles/htc/vive_controller': ['htc-vive', 'generic-trigger-squeeze-touchpad'],
    '/interaction_profiles/microsoft/motion_controller': ['microsoft-mixed-reality', 'generic-trigger-squeeze-touchpad-thumbstick'],
    '/interaction_profiles/khr/simple_controller': ['generic-trigger'],
  }
  const HAND_PROFILES = ['generic-hand', 'generic-hand-select']

  class XRGamepadButton { constructor() { this.pressed = false; this.touched = false; this.value = 0 } }
  class XRGamepad {
    constructor(hand) {
      this.id = ''
      this.index = -1
      this.connected = true
      this.mapping = 'xr-standard'
      this.timestamp = performance.now()
      this.buttons = Array.from({ length: 6 }, () => new XRGamepadButton())
      this.axes = [0, 0, 0, 0]
      const pulse = (intensity = 1, duration = 100) => {
        try { B.haptics(hand, Math.max(0, Math.min(1, Number(intensity) || 0)), Math.max(0, Number(duration) || 0)) } catch {}
        return Promise.resolve(true)
      }
      this.hapticActuators = [{ type: 'vibration', pulse, reset: () => { try { B.stopHaptics(hand) } catch {} return Promise.resolve(true) } }]
      this.vibrationActuator = {
        type: 'dual-rumble',
        effects: ['dual-rumble'],
        playEffect: (_t, p = {}) => pulse(Math.max(p.strongMagnitude ?? 1, p.weakMagnitude ?? 0), p.duration ?? 100).then(() => 'complete'),
        reset: () => { try { B.stopHaptics(hand) } catch {} return Promise.resolve('complete') },
      }
    }
    _update(s) {
      const set = (i, value, pressed, touched) => { const b = this.buttons[i]; b.value = value; b.pressed = pressed; b.touched = touched || pressed }
      set(0, s.trigger, s.trigger > 0.5, s.triggerTouch || s.trigger > 0.05)
      set(1, s.squeeze, s.squeeze > 0.5, s.squeeze > 0.05)
      set(2, s.trackpadClick ? 1 : 0, s.trackpadClick, s.trackpadTouch)
      set(3, s.thumbstickClick ? 1 : 0, s.thumbstickClick, s.thumbstickTouch)
      set(4, s.primary ? 1 : 0, s.primary, s.primaryTouch)
      set(5, s.secondary ? 1 : 0, s.secondary, s.secondaryTouch)
      // xr-standard: axes[0,1] = タッチパッド、axes[2,3] = スティック（y は上が負）
      this.axes[0] = s.trackpad[0]; this.axes[1] = -s.trackpad[1]
      this.axes[2] = s.thumbstick[0]; this.axes[3] = -s.thumbstick[1]
      if (!s.hasThumbstick && s.hasTrackpad) { this.axes[2] = this.axes[0]; this.axes[3] = this.axes[1] }
      this.timestamp = performance.now()
    }
  }

  class XRInputSource {
    constructor(session, i, kind, profile) {
      this.handedness = i === 0 ? 'left' : 'right'
      this.targetRayMode = 'tracked-pointer'
      this.skipRendering = false
      this._kind = kind
      this._profile = profile
      this._i = i
      if (kind === 'hand') {
        this.profiles = HAND_PROFILES.slice()
        this.hand = new XRHand(session, i)
        this.gamepad = null
        this.gripSpace = new XRSpace(session, (f) => jointMat(f, i, PALM))
        // 照準: 人差し指の付け根から、手首の向き（OpenXR の関節は -Z が指先方向）
        this.targetRaySpace = new XRSpace(session, (f) => {
          const w = jointMat(f, i, 0), p = jointMat(f, i, 6)
          if (!w || !p) return null
          const m = Float32Array.from(w)
          m[12] = p[12]; m[13] = p[13]; m[14] = p[14]
          return m
        })
      } else {
        this.profiles = (PROFILES[profile] || ['generic-trigger-squeeze-thumbstick']).slice()
        this.hand = null
        this.gamepad = new XRGamepad(i)
        this.gripSpace = new XRSpace(session, (f) => f._d.hands[i].grip)
        this.targetRaySpace = new XRSpace(session, (f) => f._d.hands[i].aim || f._d.hands[i].grip)
      }
      Object.freeze(this.profiles)
    }
  }
  class XRInputSourceEvent extends Event { constructor(type, init) { super(type); this.frame = init.frame; this.inputSource = init.inputSource } }
  class XRInputSourcesChangeEvent extends Event { constructor(type, init) { super(type); this.session = init.session; this.added = init.added; this.removed = init.removed } }
  class XRSessionEvent extends Event { constructor(type, init) { super(type); this.session = init.session } }

  // ------------------------------------------------------------------ XRWebGLLayer（横並び両眼）
  class XRWebGLLayer {
    static getNativeFramebufferScaleFactor() { return 1 }
    constructor(session, gl, init = {}) {
      if (!(session instanceof XRSession)) throw new TypeError('XRWebGLLayer: not a TenTenV XR session')
      if (session._ended) throw new DOMException('session has ended', 'InvalidStateError')
      const info = session._info
      this._gl = gl
      this._session = session
      this._eyeW = info.width
      this._eyeH = info.height
      this.framebuffer = null
      this.framebufferWidth = info.width * 2
      this.framebufferHeight = info.height
      this.antialias = init.antialias !== false && !!(gl.getContextAttributes() || {}).antialias
      this.ignoreDepthValues = true
      this.fixedFoveation = 0
      // デスクトップのウィンドウには左目だけを出す（横並びのまま引き伸ばさない）
      const c = gl.canvas
      if (c && c.style && !session._mirror) {
        session._mirror = { canvas: c, box: c.style.getPropertyValue('object-view-box'), fit: c.style.objectFit }
        c.style.setProperty('object-view-box', 'inset(0% 50% 0% 0%)')
        c.style.objectFit = 'cover'
      }
    }
    getViewport(view) {
      const i = view && view._index !== undefined ? view._index : view && view.eye === 'right' ? 1 : 0
      return new XRViewport(i * this._eyeW, 0, this._eyeW, this._eyeH)
    }
    _present(seq) {
      const c = this._gl.canvas
      // three が setSize するまでの最初のフレームなどは大きさが合わない
      if (!c || c.width !== this.framebufferWidth || c.height !== this.framebufferHeight) return null
      return B.present(c, this._eyeW, this._eyeH, seq)
    }
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const CONFIG = B.config || {}

  // ------------------------------------------------------------------ XRSession
  class XRSession extends EventTarget {
    constructor(info, mode, enabledFeatures) {
      super()
      this._info = info
      this._callbacks = new Map()
      this._handle = 1
      this._ended = false
      this._running = false
      this._sources = [null, null]
      this._press = [{ select: false, squeeze: false }, { select: false, squeeze: false }]
      this._refSpaces = []
      this._origin = null
      this._recenter = false
      this._hands = enabledFeatures.includes('hand-tracking')
      // ネイティブの基準空間の床の高さ（LOCAL のときは目の高さが 0 なので、おおよその値で補う）
      this._floorY = info.space === 'local' ? -1.6 : 0
      this.mode = mode
      this.enabledFeatures = Object.freeze(enabledFeatures)
      this.environmentBlendMode = 'opaque'
      this.interactionMode = 'world-space'
      this.visibilityState = 'hidden'
      this.supportedFrameRates = info.refreshRates ? new Float32Array(info.refreshRates) : null
      this.frameRate = info.refreshRate || undefined
      this.isSystemKeyboardSupported = false
      this.domOverlayState = null
      this.renderState = { depthNear: 0.1, depthFar: 1000, inlineVerticalFieldOfView: null, baseLayer: null, layers: [] }
      for (const k of ['end', 'inputsourceschange', 'select', 'selectstart', 'selectend', 'squeeze', 'squeezestart', 'squeezeend', 'visibilitychange', 'frameratechange']) this['on' + k] = null
      this._st = { n: 0, t: performance.now(), cb: 0, maxCb: 0, wait: 0, late: 0, renderable: 0, drawn: 0, queued: 0 }
      // ループは次のタスクから（requestSession の呼び出し元がイベントを登録してから状態が進むように）
      this._loop = sleep(0).then(() => this._run())
    }
    get inputSources() { return this._sourceList || (this._sourceList = Object.freeze(this._sources.filter(Boolean))) }
    updateRenderState(s = {}) {
      if (this._ended) throw new DOMException('session has ended', 'InvalidStateError')
      if (s.layers && s.layers.length) throw new DOMException('WebXR layers are not supported', 'NotSupportedError')
      const next = { ...this.renderState }
      for (const k of ['depthNear', 'depthFar', 'inlineVerticalFieldOfView', 'baseLayer']) if (s[k] !== undefined) next[k] = s[k]
      this.renderState = next
    }
    async updateTargetFrameRate(rate) {
      if (!this.supportedFrameRates) throw new DOMException('frame rate control is not supported', 'NotSupportedError')
      if (!Array.from(this.supportedFrameRates).some((r) => Math.abs(r - rate) < 0.5)) throw new DOMException('unsupported frame rate ' + rate, 'NotSupportedError')
      await B.setRefreshRate(rate)
    }
    async requestReferenceSpace(type) {
      if (this._ended) throw new DOMException('session has ended', 'InvalidStateError')
      let s
      // local / local-floor の原点は「VR に入ったときの立ち位置と向き（ヨーのみ）」。bounded-floor / unbounded は STAGE そのまま
      if (type === 'viewer') s = new XRReferenceSpace(this, type, (f) => f._d.head)
      else if (type === 'local') s = new XRReferenceSpace(this, type, () => this._localOrigin(true))
      else if (type === 'local-floor') s = new XRReferenceSpace(this, type, () => this._localOrigin(false))
      else if (type === 'unbounded' && this.enabledFeatures.includes('unbounded')) s = new XRReferenceSpace(this, type, () => IDENTITY)
      else if (type === 'bounded-floor' && this.enabledFeatures.includes('bounded-floor') && this._info.space === 'stage') {
        s = new XRBoundedReferenceSpace(this, type, () => IDENTITY, IDENTITY, await B.bounds())
      } else throw new DOMException(`reference space "${type}" is not supported`, 'NotSupportedError')
      this._refSpaces.push(s)
      return s
    }
    _captureOrigin(head) {
      if (this._origin && !this._recenter) return
      const yaw = Math.atan2(head[8], head[10])
      const fresh = !this._origin
      this._origin = { x: head[12], y: head[13], z: head[14], c: Math.cos(yaw), s: Math.sin(yaw) }
      if (!fresh) {
        this._recenter = false
        for (const sp of this._refSpaces) {
          if (sp.type !== 'local' && sp.type !== 'local-floor') continue
          const ev = new XRReferenceSpaceEvent('reset', { referenceSpace: sp })
          try { if (typeof sp.onreset === 'function') sp.onreset(ev) } catch (e) { console.error(e) }
          sp.dispatchEvent(ev)
        }
        log('recentered')
      }
    }
    _localOrigin(eyeLevel) {
      const o = this._origin
      if (!o) return null
      return new Float32Array([o.c, 0, -o.s, 0, 0, 1, 0, 0, o.s, 0, o.c, 0, o.x, eyeLevel ? o.y : this._floorY, o.z, 1])
    }
    requestAnimationFrame(cb) { if (this._ended) return 0; const h = this._handle++; this._callbacks.set(h, cb); return h }
    cancelAnimationFrame(h) { this._callbacks.delete(h) }
    requestHitTestSource() { return Promise.reject(new DOMException('hit-test is not supported', 'NotSupportedError')) }
    requestHitTestSourceForTransientInput() { return this.requestHitTestSource() }
    async end() {
      if (this._ended) return
      this._ending = true
      try { await B.requestExit() } catch {}
      await Promise.race([this._loop, sleep(3000)])
      this._finish()
    }
    _emit(type, ev) {
      const h = this['on' + type]
      try { if (typeof h === 'function') h.call(this, ev) } catch (e) { console.error(e) }
      this.dispatchEvent(ev)
    }

    async _run() {
      try {
        while (!this._ended) {
          for (const e of await B.poll()) this._event(e)
          if (this._ended || this._exit) break
          if (!this._running) { await sleep(10); continue }
          try {
            await this._frame()
            this._errors = 0
          } catch (err) {
            // 一時的な失敗は続ける（続けて失敗し続けるならセッションを終える）
            if (!this._errors) console.error(TAG, 'frame error', err)
            this._errors = (this._errors || 0) + 1
            if (this._errors > 30) throw err
            await sleep(5)
          }
        }
      } catch (err) {
        console.error(TAG, 'frame loop stopped', err)
      } finally {
        this._finish()
      }
    }
    _event(e) {
      if (e.type === 'begin') this._running = true
      else if (e.type === 'end') this._running = false
      else if (e.type === 'exit') this._exit = true
      else if (e.type === 'state') this._state(e.detail)
      else if (e.type === 'reset') this._recenter = true
      else if (e.type === 'refreshrate') { this.frameRate = e.value; this._emit('frameratechange', new XRSessionEvent('frameratechange', { session: this })) }
      else if (e.type === 'error') warn(e.detail)
    }
    _state(s) {
      const vis = s === 'focused' ? 'visible' : s === 'visible' ? 'visible-blurred' : 'hidden'
      if (vis !== this.visibilityState) {
        this.visibilityState = vis
        this._emit('visibilitychange', new XRSessionEvent('visibilitychange', { session: this }))
      }
    }
    async _frame() {
      const t0 = performance.now()
      let fs
      try {
        fs = await B.waitFrame()
      } catch (err) {
        // セッションが止まりかけている（STOPPING）など。イベントを待つ
        await sleep(5)
        return
      }
      const frameStart = performance.now()
      const period = fs.predictedDisplayPeriodMs || 13.9
      const { views: lv, input, trackers } = await B.frame()
      const d = lv.data
      const views = [0, 1].map((e) => ({ matrix: arrToMat(d, e * 11), fov: [d[e * 11 + 7], d[e * 11 + 8], d[e * 11 + 9], d[e * 11 + 10]] }))
      // 頭 = 両眼の中点、向きは左目と同じ
      const head = poseToMat([(d[0] + d[11]) / 2, (d[1] + d[12]) / 2, (d[2] + d[13]) / 2], [d[3], d[4], d[5], d[6]])
      if (lv.valid) this._captureOrigin(head)
      const hands = input.map((h) => ({ ...h, grip: h.grip ? arrToMat(h.grip) : null, aim: h.aim ? arrToMat(h.aim) : null }))
      const frame = new XRFrame(this, { time: frameStart, viewsValid: lv.valid && !!this._origin, positionTracked: lv.positionTracked, views, head, hands, trackers: (trackers || []).map((t) => (t ? arrToMat(t) : null)) })
      this._inputs(hands, frame)

      const layer = this.renderState.baseLayer
      // shouldRender が false でも、まだ 1 枚も出していなければ描く（ランタイムによっては最初の画像が届くまで表示状態に進まない）
      const render = layer && lv.valid && (fs.shouldRender || !this._presentedOnce)
      let presented = null
      if (render) {
        this._st.renderable++
        const cbs = [...this._callbacks.values()]
        this._callbacks.clear()
        const c0 = performance.now()
        for (const cb of cbs) {
          try { cb(c0, frame) } catch (err) { console.error(TAG, 'XR frame callback error', err) }
        }
        const c1 = performance.now()
        this._st.cb += c1 - c0
        this._st.maxCb = Math.max(this._st.maxCb, c1 - c0)
        if (cbs.length) {
          this._st.drawn++
          // 新しい描画があるときだけ GPU コピーを積む。古い画面の再転送は負荷になる。
          presented = layer._present(lv.seq)
          if (presented) {
            this._st.queued++
            this._presentedOnce = true
          }
        }
      }
      if (presented && CONFIG.latency !== 'smooth') {
        // 低遅延: 次のフレームの締め切りの少し前までは、この画像の転送を待ってから endFrame する
        const budget = Math.max(0, period * 0.8 - (performance.now() - frameStart))
        let done = false
        await Promise.race([presented.then(() => { done = true }, () => {}), sleep(budget)])
        if (!done) this._st.late++
      }
      await B.endFrame()
      const st = this._st
      st.n++
      st.wait += frameStart - t0
      const now = performance.now()
      if (now - st.t > 10000) {
        log(`${((st.n * 1000) / (now - st.t)).toFixed(1)} fps | draw ${st.drawn}/${st.renderable}/${st.n} | queue ${st.queued} | page ${(st.cb / st.n).toFixed(1)}ms (max ${st.maxCb.toFixed(1)}) | wait ${(st.wait / st.n).toFixed(1)}ms | late ${st.late}`)
        Promise.resolve(B.stats()).then((s) => {
          if (s?.bridge) log(`transfer submitted ${s.bridge.presented} dropped ${s.bridge.dropped} failed ${s.bridge.failed} | map ${s.bridge.mapMs}ms submit ${s.bridge.submitMs}ms`)
        }).catch(() => {})
        st.n = st.cb = st.maxCb = st.wait = st.late = st.renderable = st.drawn = st.queued = 0
        st.t = now
      }
    }
    _inputs(hands, frame) {
      const added = [], removed = []
      hands.forEach((h, i) => {
        const useHand = this._hands && !h.controller && !!h.joints
        const kind = h.controller ? 'controller' : useHand ? 'hand' : null
        const cur = this._sources[i]
        if (cur && (cur._kind !== kind || (kind === 'controller' && cur._profile !== h.profile))) {
          this._release(i, cur, frame)
          removed.push(cur)
          this._sources[i] = null
        }
        if (kind && !this._sources[i]) {
          const s = new XRInputSource(this, i, kind, h.profile)
          this._sources[i] = s
          added.push(s)
        }
      })
      if (added.length || removed.length) {
        this._sourceList = null
        this._emit('inputsourceschange', new XRInputSourcesChangeEvent('inputsourceschange', { session: this, added, removed }))
      }
      hands.forEach((h, i) => {
        const src = this._sources[i]
        if (!src) return
        let select, squeeze
        if (src._kind === 'controller') {
          src.gamepad._update(h)
          select = h.trigger > 0.5
          squeeze = h.squeeze > 0.5
        } else {
          // ハンド: 親指と人差し指の先が 1.5cm 以内でつまんだとみなす
          const a = h.joints, t = 4 * STRIDE, x = 9 * STRIDE
          const dist = a && a[t + 7] >= 0 && a[x + 7] >= 0 ? Math.hypot(a[t] - a[x], a[t + 1] - a[x + 1], a[t + 2] - a[x + 2]) : 1
          const was = this._press[i].select
          select = was ? dist < 0.025 : dist < 0.015
          squeeze = false
        }
        this._edges(i, src, frame, select, squeeze)
      })
    }
    _edges(i, src, frame, select, squeeze) {
      const p = this._press[i]
      const fire = (type) => this._emit(type, new XRInputSourceEvent(type, { frame, inputSource: src }))
      if (select && !p.select) fire('selectstart')
      if (!select && p.select) { fire('select'); fire('selectend') }
      if (squeeze && !p.squeeze) fire('squeezestart')
      if (!squeeze && p.squeeze) { fire('squeeze'); fire('squeezeend') }
      p.select = select
      p.squeeze = squeeze
    }
    // 押している途中で入力が無くなったら、select / squeeze は出さずに end だけ出す
    _release(i, src, frame) {
      const p = this._press[i]
      const fire = (type) => this._emit(type, new XRInputSourceEvent(type, { frame, inputSource: src }))
      if (p.select) fire('selectend')
      if (p.squeeze) fire('squeezeend')
      p.select = p.squeeze = false
    }
    _finish() {
      if (this._finished) return
      this._finished = true
      this._ended = true
      this._callbacks.clear()
      const m = this._mirror
      if (m) {
        if (m.box) m.canvas.style.setProperty('object-view-box', m.box)
        else m.canvas.style.removeProperty('object-view-box')
        m.canvas.style.objectFit = m.fit
      }
      try { B.destroy() } catch {}
      if (xr._active === this) xr._active = null
      log('session ended')
      this._emit('end', new XRSessionEvent('end', { session: this }))
    }
  }

  // ------------------------------------------------------------------ XRSystem
  const SUPPORTED = new Set(['viewer', 'local', 'local-floor', 'bounded-floor', 'unbounded', 'hand-tracking'])
  class XRSystem extends EventTarget {
    constructor() { super(); this._active = null; this.ondevicechange = null; this.onsessiongranted = null }
    async isSessionSupported(mode) {
      if (mode === 'inline') return true
      if (mode !== 'immersive-vr') return false
      try {
        const r = await B.supported()
        return r && r.ok === true
      } catch {
        return false
      }
    }
    async requestSession(mode, init = {}) {
      if (mode !== 'immersive-vr') throw new DOMException(`session mode "${mode}" is not supported`, 'NotSupportedError')
      if (this._active || this._pending) throw new DOMException('an immersive session is already active', 'InvalidStateError')
      const required = init.requiredFeatures || []
      const optional = init.optionalFeatures || []
      for (const f of required) {
        if (!SUPPORTED.has(f)) throw new DOMException(`required feature "${f}" is not supported`, 'NotSupportedError')
      }
      this._pending = true
      try {
        const sup = await B.supported()
        if (!sup || !sup.ok) throw new DOMException('VR is not available: ' + ((sup && sup.reason) || 'unknown'), 'NotSupportedError')
        const gpu = await B.prepare()
        if (!gpu || !gpu.ok) throw new DOMException('WebGPU is not available: ' + (gpu && gpu.error), 'NotSupportedError')
        const wanted = new Set(['viewer', 'local', ...required, ...optional].filter((f) => SUPPORTED.has(f)))
        const info = await B.create({ handTracking: wanted.has('hand-tracking') })
        if (!info || info.error) throw new DOMException('OpenXR: ' + ((info && info.error) || 'failed to start'), 'NotSupportedError')
        if (!info.handTracking) wanted.delete('hand-tracking')
        if (info.space !== 'stage') wanted.delete('bounded-floor')
        if (required.some((f) => !wanted.has(f))) {
          await B.destroy()
          throw new DOMException('a required feature is not available on this device', 'NotSupportedError')
        }
        log(`${info.backend}: ${info.runtimeName} / ${info.systemName} / ${info.width}x${info.height} per eye / space ${info.space}`)
        const s = new XRSession(info, mode, [...wanted])
        this._active = s
        return s
      } finally {
        this._pending = false
      }
    }
  }
  const xr = new XRSystem()

  // デスクトップ側（メニュー・自己テスト）から使う小さな窓口
  Object.defineProperty(xr, '__tentenv', {
    value: Object.freeze({
      active: () => !!xr._active,
      end: () => (xr._active ? xr._active.end() : Promise.resolve()),
      recenter: () => { if (xr._active) xr._active._recenter = true },
      stats: () => B.stats(),
    }),
  })

  // ------------------------------------------------------------------ 差し替え
  Object.defineProperty(navigator, 'xr', { value: xr, configurable: true, enumerable: true })
  const replace = {
    XRSystem, XRSession, XRFrame, XRSpace, XRReferenceSpace, XRBoundedReferenceSpace, XRReferenceSpaceEvent, XRRigidTransform, XRView, XRViewport,
    XRPose, XRViewerPose, XRJointPose, XRJointSpace, XRHand, XRInputSource, XRWebGLLayer, XRInputSourceEvent, XRInputSourcesChangeEvent, XRSessionEvent,
  }
  for (const [k, v] of Object.entries(replace)) Object.defineProperty(window, k, { value: v, configurable: true, writable: true })
  // three は XRWebGLBinding があると Layers の経路を使うので隠す
  for (const k of ['XRWebGLBinding', 'XRGPUBinding', 'XRProjectionLayer', 'XRMediaBinding', 'XRCPUDepthInformation', 'XRWebGLDepthInformation']) {
    try { delete window[k] } catch {}
    try { Object.defineProperty(window, k, { value: undefined, configurable: true, writable: true }) } catch {}
  }
  const makeXRCompatible = function () { return Promise.resolve() }
  for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) if (C) C.prototype.makeXRCompatible = makeXRCompatible
  window.addEventListener('tentenv:recenter', () => xr.__tentenv.recenter())
  log('WebXR bridge installed (' + (CONFIG.bridge || 'native') + (CONFIG.mock ? ', mock' : '') + ')')
}

if (typeof module !== 'undefined') module.exports = installTenTenVWebXR
