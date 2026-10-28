import { Matrix4, Object3D, Quaternion, Vector3, type Vector3Tuple } from 'three'

export interface PickupPlacement {
  p: Vector3Tuple
  q: [number, number, number, number]
}

export const capturePickupPlacement = (obj: Object3D): PickupPlacement => {
  obj.updateWorldMatrix(true, false)
  const p = obj.getWorldPosition(new Vector3())
  const q = obj.getWorldQuaternion(new Quaternion())
  return { p: [p.x, p.y, p.z], q: [q.x, q.y, q.z, q.w] }
}

export const readPickupPlacement = (value: unknown): PickupPlacement | null => {
  if (!value || typeof value !== 'object') return null
  const pose = value as { p?: unknown; q?: unknown }
  if (!Array.isArray(pose.p) || pose.p.length !== 3 || pose.p.some((n) => typeof n !== 'number' || !Number.isFinite(n) || Math.abs(n) > 10000)) return null
  if (!Array.isArray(pose.q) || pose.q.length !== 4 || pose.q.some((n) => typeof n !== 'number' || !Number.isFinite(n) || Math.abs(n) > 1.001)) return null
  if (Math.abs(pose.q.reduce((sum: number, n: number) => sum + n * n, 0) - 1) > 0.1) return null
  return { p: pose.p as Vector3Tuple, q: pose.q as PickupPlacement['q'] }
}

const matrix = new Matrix4()
const scale = new Vector3()

/** 親グループの変換を保ちながら、ワールド座標で Pickup を置く。 */
export const setPickupWorldPlacement = (obj: Object3D, p: Vector3, q: Quaternion) => {
  const ownScale = obj.scale.clone()
  if (obj.parent) {
    obj.parent.updateWorldMatrix(true, false)
    matrix.compose(p, q, scale.set(1, 1, 1)).premultiply(obj.parent.matrixWorld.clone().invert())
    matrix.decompose(obj.position, obj.quaternion, scale)
  } else {
    obj.position.copy(p)
    obj.quaternion.copy(q)
  }
  obj.scale.copy(ownScale)
  obj.updateMatrixWorld(true)
}
