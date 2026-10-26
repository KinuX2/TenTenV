// WebXR のセッション（[2][3][10]）。コントローラーや手の見た目はアバターの手で出すので、既定の表示は使わない
import { createXRStore } from '@react-three/xr'
import { Matrix4, Quaternion, Vector3, type Object3D, type WebGLRenderer } from 'three'

export const xrStore = createXRStore({
  controller: false,
  hand: false,
  gaze: false,
  screenInput: false,
  transientPointer: false,
  offerSession: false,
  // 開発時だけ: WebXR がないブラウザでは Quest 3 のエミュレーターを使う
  // （?noemu を付けると使わない: 実機や Meta XR Simulator で確かめるとき）
  emulate: import.meta.env.DEV && ['localhost', '127.0.0.1'].includes(location.hostname) && !new URLSearchParams(location.search).has('noemu') ? { type: 'metaQuest3', inject: true, syntheticEnvironment: false } : false,
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

export const enterVR = async () => {
  try {
    await xrStore.enterVR()
    return true
  } catch (e) {
    console.warn('[xr] VR に入れません', e)
    return false
  }
}

export const isXRSupported = async () => {
  try {
    return !!navigator.xr && (await navigator.xr.isSessionSupported('immersive-vr'))
  } catch {
    return false
  }
}

const _m1 = new Matrix4()
const _m2 = new Matrix4()

/** XR の空間（手・コントローラー・関節）の、ワールドでの位置と向き。origin は XROrigin */
export const xrSpaceToWorld = (gl: WebGLRenderer, space: XRSpace, origin: Object3D, outP: Vector3, outQ: Quaternion) => {
  const frame = gl.xr.getFrame()
  const ref = gl.xr.getReferenceSpace()
  if (!frame || !ref) return false
  const isJoint = 'jointName' in space
  const pose = isJoint ? frame.getJointPose?.(space as XRJointSpace, ref) : frame.getPose(space, ref)
  if (!pose) return false
  _m1.fromArray(pose.transform.matrix as unknown as number[])
  _m2.copy(origin.matrixWorld).multiply(_m1)
  const s = new Vector3()
  _m2.decompose(outP, outQ, s)
  return true
}

/** 頭（目の中心）の位置。基準空間（自分の部屋）での値 */
export const xrViewerLocal = (gl: WebGLRenderer) => {
  const frame = gl.xr.getFrame()
  const ref = gl.xr.getReferenceSpace()
  if (!frame || !ref) return null
  const pose = frame.getViewerPose(ref)
  if (!pose) return null
  const p = pose.transform.position
  const o = pose.transform.orientation
  return { p: new Vector3(p.x, p.y, p.z), q: new Quaternion(o.x, o.y, o.z, o.w) }
}

/** 手の関節から指の曲がり（0〜1）を出す（[21]） */
const FINGER_JOINTS: [string, string, string, string][] = [
  ['thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip'],
  ['index-finger-metacarpal', 'index-finger-phalanx-proximal', 'index-finger-phalanx-intermediate', 'index-finger-tip'],
  ['middle-finger-metacarpal', 'middle-finger-phalanx-proximal', 'middle-finger-phalanx-intermediate', 'middle-finger-tip'],
  ['ring-finger-metacarpal', 'ring-finger-phalanx-proximal', 'ring-finger-phalanx-intermediate', 'ring-finger-tip'],
  ['pinky-finger-metacarpal', 'pinky-finger-phalanx-proximal', 'pinky-finger-phalanx-intermediate', 'pinky-finger-tip'],
]
export const handCurls = (frame: XRFrame, ref: XRReferenceSpace, hand: XRHand): number[] | null => {
  const out: number[] = []
  const pos = (name: string) => {
    const j = hand.get(name as XRHandJoint)
    const p = j ? frame.getJointPose?.(j, ref) : null
    return p ? new Vector3(p.transform.position.x, p.transform.position.y, p.transform.position.z) : null
  }
  for (const [i, joints] of FINGER_JOINTS.entries()) {
    const ps = joints.map(pos)
    if (ps.some((p) => !p)) return null
    const [a, b, c, d] = ps as Vector3[]
    const v1 = b.clone().sub(a).normalize()
    const v2 = c.clone().sub(b).normalize()
    const v3 = d.clone().sub(c).normalize()
    const ang = v1.angleTo(v2) + v2.angleTo(v3)
    out.push(Math.min(1, Math.max(0, ang / (i === 0 ? 1.4 : 2.6))))
  }
  return out
}
