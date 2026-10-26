// R3F + @react-three/xr の自己テスト（クライアントの apps/client/src/world/xr.ts と同じ設定の createXRStore で
// enterVR() し、useFrame の中でクライアントの readXrInput / fingerCurls と同じ読み方をする）
// scripts/build-selftest.mjs が esbuild で selftest/r3f.bundle.js にまとめる。

import { createElement as h, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { XR, XROrigin, createXRStore } from '@react-three/xr'
import { createHarness, createInputProbe, near, sleep } from './harness.js'

const H = createHarness('r3f')
const { expect, notes, show } = H
const BG = [0x33, 0x55, 0x77]

const store = createXRStore({
  controller: false,
  hand: false,
  gaze: false,
  screenInput: false,
  transientPointer: false,
  offerSession: false,
  emulate: false,
  frameRate: 'high',
  foveation: 0.5,
  handTracking: true,
  anchors: false,
  layers: false,
  meshDetection: false,
  planeDetection: false,
  hitTest: false,
  domOverlay: false,
})

const probe = createInputProbe()
const counters = { frames: 0, xrFrames: 0, viewer: 0, curls: 0 }

function Probe() {
  const gl = useThree((s) => s.gl)
  const box = useRef()
  useFrame((_, dt) => {
    counters.frames++
    if (box.current) box.current.rotation.y += dt
    const session = gl.xr.getSession()
    const frame = gl.xr.getFrame()
    const ref = gl.xr.getReferenceSpace()
    if (!session || !frame || !ref) return
    counters.xrFrames++
    if (frame.getViewerPose(ref)) counters.viewer++
    probe.sample(frame, ref, session)
    // クライアントの handCurls と同じ: 関節の位置から指の曲がり
    for (const src of session.inputSources) {
      if (!src.hand) continue
      const ps = ['index-finger-metacarpal', 'index-finger-phalanx-proximal', 'index-finger-phalanx-intermediate', 'index-finger-tip'].map((n) => frame.getJointPose(src.hand.get(n), ref))
      if (ps.every(Boolean)) counters.curls++
    }
  })
  return h(
    'group',
    null,
    h('mesh', { ref: box, position: [1.6, 1.6, -2] }, h('boxGeometry', { args: [0.4, 0.4, 0.4] }), h('meshStandardMaterial', { color: 'orange' })),
    h('mesh', { position: [-1.6, 1.6, -2] }, h('sphereGeometry', { args: [0.25] }), h('meshStandardMaterial', { color: 'hotpink' })),
  )
}

function App() {
  return h(
    Canvas,
    { gl: { antialias: true } },
    h(
      XR,
      { store },
      h('color', { attach: 'background', args: [(BG[0] << 16) | (BG[1] << 8) | BG[2]] }),
      h('hemisphereLight', { args: ['#ffffff', '#445566', 2.5] }),
      h(XROrigin, null),
      h(Probe),
    ),
  )
}

createRoot(document.getElementById('root')).render(h(App))

;(async () => {
  try {
    await sleep(1500)
    expect(await navigator.xr.isSessionSupported('immersive-vr'), "isSessionSupported('immersive-vr')")
    await store.enterVR()
    const session = store.getState().session
    expect(!!session, 'store.enterVR() created a session')
    for (let i = 0; i < 8; i++) {
      show(`r3f: running ${i + 1}/8 s, xr frames ${counters.xrFrames}`)
      await sleep(1000)
    }
    const stats = await navigator.xr.__tentenv.stats()
    notes.stats = stats
    notes.xrFrames = counters.xrFrames
    notes.counters = counters
    notes.input = probe.seen
    notes.frameRate = session && session.frameRate
    notes.enabledFeatures = session ? [...session.enabledFeatures] : null
    await session.end()
    await sleep(500)
    expect(counters.xrFrames > 150, `useFrame ran inside the XR loop (${counters.xrFrames})`)
    expect(counters.viewer > 150, 'gl.xr.getFrame().getViewerPose()')
    expect(stats.native && stats.native.submits > 100, 'frames submitted')
    expect(stats.native && near(stats.native.sampleLeft, BG, 4) && near(stats.native.sampleRight, BG, 4), `submitted pixels match the scene (${stats.native && stats.native.sampleLeft})`)
    expect(notes.frameRate === 120, `frameRate 'high' picked the highest rate (${notes.frameRate})`)
    expect(probe.seen.controllerFrames > 20 && probe.seen.mapping === 'xr-standard', 'controllers via session.inputSources')
    expect(probe.seen.triggerPressed && probe.seen.stickMoved, 'gamepad buttons / axes')
    expect(probe.seen.handFrames > 20 && counters.curls > 20, 'hand joints (finger curls)')
    expect(!store.getState().session, 'store session cleared after end')
    H.report()
  } catch (err) {
    H.fail(err)
  }
})()
