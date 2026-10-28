// ワールドへ渡すアバターの骨: VRM 1.0 と 0.x（180° 回したもの）で同じ値になる
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Euler, Object3D, Quaternion, Vector3 } from 'three'
import { readAvatarBones } from '../src/avatar/boneReader'
import type { AvatarModel } from '../src/avatar/types'

/** 体の向き yaw の、腰 → 左上腕の小さな骨組み。flipped なら VRM 0.x と同じく、骨の座標を 180° 回しておく */
const rig = (yaw: number, armLocal: Euler, flipped: boolean) => {
  const root = new Object3D()
  root.rotation.y = yaw
  const scene = new Object3D()
  if (flipped) scene.rotation.y = Math.PI
  root.add(scene)
  const hips = new Object3D()
  hips.position.set(0, 1, 0)
  scene.add(hips)
  const arm = new Object3D()
  arm.position.set(flipped ? -0.2 : 0.2, 0.4, 0)
  // 体の座標で考えた回転を、骨の座標に直す（poser・worldMotion と同じ）
  const q = new Quaternion().setFromEuler(armLocal)
  if (flipped) q.set(-q.x, q.y, -q.z, q.w)
  arm.quaternion.copy(q)
  hips.add(arm)
  root.updateMatrixWorld(true)
  return { root, bones: { hips, leftUpperArm: arm }, flipped } as unknown as AvatarModel
}

const close = (a: number[], b: number[], eps = 1e-6) => a.every((x, i) => Math.abs(x - b[i]) < eps)
const sameRotation = (a: number[], b: number[]) => close(a, b) || close(a, b.map((x) => -x))

test('骨の位置・向き・親から見た回転を返し、VRM 0.x でも同じになる', () => {
  const armLocal = new Euler(0.1, -0.2, 0.9, 'XYZ')
  const v1 = readAvatarBones(rig(0.7, armLocal, false))
  const v0 = readAvatarBones(rig(0.7, armLocal, true))
  for (const b of [v1, v0]) {
    assert.ok(b.hips && b.leftUpperArm)
    assert.equal(b.leftEye, undefined)
    assert.ok(close(b.leftUpperArm!.rotation, [0.1, -0.2, 0.9]), `rotation ${b.leftUpperArm!.rotation}`)
  }
  assert.ok(close(v1.leftUpperArm!.position, v0.leftUpperArm!.position))
  assert.ok(sameRotation(v1.leftUpperArm!.quaternion, v0.leftUpperArm!.quaternion))
  // 休めの姿勢の腰は、体の向き（yaw）だけ回っている
  const yawQ = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0.7)
  assert.ok(sameRotation(v0.hips!.quaternion, [yawQ.x, yawQ.y, yawQ.z, yawQ.w]))
})
