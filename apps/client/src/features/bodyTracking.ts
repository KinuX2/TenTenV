// 体のトラッカー（[20] フルトラッキング）と、コントローラーを持ったままの指の関節
// Windows 版が OpenXR の XR_HTCX_vive_tracker_interaction（SteamVR の Vive トラッカーなど）で読んだ値を、
// WebXR の拡張 XRFrame.__ttvExtra から受け取る。SteamVR で役割（腰・左足・右足）を割り当てたトラッカーを使う
import { Matrix4, Quaternion, Vector3, type Object3D, type WebGLRenderer } from 'three'
import { L } from '../i18n'
import { uiBridge } from '../ui/bridge'

interface TtvExtra {
  trackers: (Float32Array | null)[]
  skeletal: (Float32Array | null)[]
}
export interface BodyPose {
  hips: { p: Vector3; q: Quaternion }
  left: { p: Vector3; q: Quaternion }
  right: { p: Vector3; q: Quaternion }
}

/** トラッカーの位置・向きから体の部位へのずれ（トラッカーの座標）。合わせるまでは null */
let offsets: { p: Vector3; q: Quaternion }[] | null = null
let raw: { p: Vector3; q: Quaternion }[] | null = null
let notified = false
let wantCalibrate = false

export const bodyTracking = {
  /** トラッカーが 3 つとも見えている */
  get available() {
    return !!raw
  },
  get calibrated() {
    return !!offsets
  },
  /** 次のフレームで合わせる（まっすぐ立って正面を向いた状態で） */
  calibrate() {
    wantCalibrate = true
  },
  reset() {
    offsets = null
  },
}

const extraOf = (gl: WebGLRenderer): TtvExtra | null => {
  const frame = gl.xr.getFrame() as (XRFrame & { __ttvExtra?: (ref: XRReferenceSpace) => TtvExtra }) | null
  const ref = gl.xr.getReferenceSpace()
  if (!frame?.__ttvExtra || !ref) return null
  try {
    return frame.__ttvExtra(ref)
  } catch {
    return null
  }
}

const _m = new Matrix4()
const _s = new Vector3()

/**
 * このフレームのトラッカーから、腰・左足首・右足首の目標（ワールド）を出す
 * @param origin XROrigin（部屋 → ワールド）
 * @param bodyYaw 体の向き（合わせるときに使う）
 * @param floorY 足元の高さ
 */
export const readBodyTrackers = (gl: WebGLRenderer, origin: Object3D, bodyYaw: number, floorY: number, ankle: number): BodyPose | null => {
  const ex = extraOf(gl)
  const t = ex?.trackers
  if (!t || t.length < 3 || t.some((m) => !m)) {
    raw = null
    return null
  }
  raw = t.map((m) => {
    _m.fromArray(m as unknown as number[]).premultiply(origin.matrixWorld)
    const p = new Vector3()
    const q = new Quaternion()
    _m.decompose(p, q, _s)
    return { p, q }
  })
  if (!notified) {
    notified = true
    uiBridge.notify(L('トラッカーを見つけました。まっすぐ立って、メニューの「フルトラ調整」を押してください', 'Trackers found. Stand up straight and press "Calibrate body" in the menu'))
  }
  if (wantCalibrate) {
    wantCalibrate = false
    // 体の向き（アバターの root と同じく、正面の反対を向いた回転）
    const body = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), bodyYaw + Math.PI)
    offsets = raw.map((r, i) => {
      const inv = r.q.clone().invert()
      // 腰はトラッカーの位置のまま、足はトラッカーの真下の足首の高さ
      const target = i === 0 ? r.p.clone() : new Vector3(r.p.x, floorY + ankle, r.p.z)
      return { p: target.sub(r.p).applyQuaternion(inv), q: inv.multiply(body) }
    })
    uiBridge.notify(L('トラッカーを合わせました', 'Trackers calibrated'))
  }
  if (!offsets) return null
  const out = raw.map((r, i) => ({ p: offsets![i].p.clone().applyQuaternion(r.q).add(r.p), q: r.q.clone().multiply(offsets![i].q) }))
  return { hips: out[0], left: out[1], right: out[2] }
}

// WebXR の関節の順（stride 8: px py pz qx qy qz qw radius）。各指の 4 点
const FINGER_IDX = [
  [1, 2, 3, 4],
  [5, 6, 7, 9],
  [10, 11, 12, 14],
  [15, 16, 17, 19],
  [20, 21, 22, 24],
]

/** コントローラーを持ったまま取れる指の関節（SteamVR の Index など）から曲がりを出す。[左 5, 右 5]。無い手は null */
export const skeletalCurls = (gl: WebGLRenderer): (number[] | null)[] | null => {
  const ex = extraOf(gl)
  if (!ex?.skeletal) return null
  return ex.skeletal.map((a) => {
    if (!a) return null
    const out: number[] = []
    for (const [fi, idx] of FINGER_IDX.entries()) {
      const ps = idx.map((j) => (a[j * 8 + 7] >= 0 ? new Vector3(a[j * 8], a[j * 8 + 1], a[j * 8 + 2]) : null))
      if (ps.some((v) => !v)) return null
      const [p0, p1, p2, p3] = ps as Vector3[]
      const v1 = p1.clone().sub(p0).normalize()
      const v2 = p2.clone().sub(p1).normalize()
      const v3 = p3.clone().sub(p2).normalize()
      out.push(Math.min(1, Math.max(0, (v1.angleTo(v2) + v2.angleTo(v3)) / (fi === 0 ? 1.4 : 2.6))))
    }
    return out
  })
}
