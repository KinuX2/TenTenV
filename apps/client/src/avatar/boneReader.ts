// ワールドへ渡すアバターの骨の姿勢（SDK の avatarBones）
// 位置と向きはワールドの座標。rotation は親の骨から見た回転（useAvatarMotion の setPose と同じ形）なので、読んだ値をそのまま setPose に渡せる
import type { AvatarBoneName, AvatarBones, QuaternionTuple } from '@tentenv/sdk'
import { AVATAR_BONE_NAMES } from '@tentenv/sdk'
import { Euler, Quaternion, Vector3 } from 'three'
import type { AvatarModel } from './types'

const FLIP_Y = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI)
const _p = new Vector3()
const _q = new Quaternion()
const _s = new Vector3()
const _l = new Quaternion()
const _e = new Euler()

/**
 * いま描いているアバターの骨を読む
 * VRM 0.x は 180° 回して前を向かせているので、VRM 1.0 と同じ向き（T ポーズで回転 0、体は +Z）に直して返す
 */
export const readAvatarBones = (model: AvatarModel): AvatarBones => {
  const out: AvatarBones = {}
  for (const name of AVATAR_BONE_NAMES) {
    const bone = model.bones[name as AvatarBoneName]
    if (!bone) continue
    bone.matrixWorld.decompose(_p, _q, _s)
    if (model.flipped) _q.multiply(FLIP_Y)
    _l.copy(bone.quaternion)
    if (model.flipped) _l.set(-_l.x, _l.y, -_l.z, _l.w)
    _e.setFromQuaternion(_l, 'XYZ')
    const quaternion: QuaternionTuple = [_q.x, _q.y, _q.z, _q.w]
    out[name] = { position: [_p.x, _p.y, _p.z], quaternion, rotation: [_e.x, _e.y, _e.z] }
  }
  return out
}
