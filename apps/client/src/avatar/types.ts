// アバターの共通の形。VRM でも同梱の標準アバターでも、同じ「正規化された人型の骨」を動かす
// 正規化された骨: T ポーズで回転がすべて 0、体は +Z を向き、左腕は +X に伸びる
import type { Object3D } from 'three'

export const BONES = [
  'hips', 'spine', 'chest', 'upperChest', 'neck', 'head', 'leftEye', 'rightEye', 'jaw',
  'leftShoulder', 'leftUpperArm', 'leftLowerArm', 'leftHand',
  'rightShoulder', 'rightUpperArm', 'rightLowerArm', 'rightHand',
  'leftUpperLeg', 'leftLowerLeg', 'leftFoot', 'leftToes',
  'rightUpperLeg', 'rightLowerLeg', 'rightFoot', 'rightToes',
  'leftThumbMetacarpal', 'leftThumbProximal', 'leftThumbDistal',
  'leftIndexProximal', 'leftIndexIntermediate', 'leftIndexDistal',
  'leftMiddleProximal', 'leftMiddleIntermediate', 'leftMiddleDistal',
  'leftRingProximal', 'leftRingIntermediate', 'leftRingDistal',
  'leftLittleProximal', 'leftLittleIntermediate', 'leftLittleDistal',
  'rightThumbMetacarpal', 'rightThumbProximal', 'rightThumbDistal',
  'rightIndexProximal', 'rightIndexIntermediate', 'rightIndexDistal',
  'rightMiddleProximal', 'rightMiddleIntermediate', 'rightMiddleDistal',
  'rightRingProximal', 'rightRingIntermediate', 'rightRingDistal',
  'rightLittleProximal', 'rightLittleIntermediate', 'rightLittleDistal',
] as const
export type BoneName = (typeof BONES)[number]

export const FINGERS = ['Thumb', 'Index', 'Middle', 'Ring', 'Little'] as const
export const FINGER_SEGMENTS: Record<(typeof FINGERS)[number], [string, string, string]> = {
  Thumb: ['ThumbMetacarpal', 'ThumbProximal', 'ThumbDistal'],
  Index: ['IndexProximal', 'IndexIntermediate', 'IndexDistal'],
  Middle: ['MiddleProximal', 'MiddleIntermediate', 'MiddleDistal'],
  Ring: ['RingProximal', 'RingIntermediate', 'RingDistal'],
  Little: ['LittleProximal', 'LittleIntermediate', 'LittleDistal'],
}

export interface AvatarModel {
  /** シーンに置く入れ物。足元が原点、+Z が前 */
  root: Object3D
  /** 正規化された骨（ない骨もある） */
  bones: Partial<Record<BoneName, Object3D>>
  /** T ポーズのときの各骨の位置（root から見た、拡大前の値） */
  rest: Partial<Record<BoneName, [number, number, number]>>
  /** 目の高さ・身長（拡大前、m） */
  eyeHeight: number
  height: number
  /** 頭の骨から目の中心までのずれ（頭の骨のローカル座標） */
  eyeOffset: [number, number, number]
  /** 表情の名前（VRM の Expression 名） */
  expressions: string[]
  setExpression: (name: string, weight: number) => void
  /** 視線を向ける先（ワールド座標、null で正面） */
  lookAt: (target: Object3D | null) => void
  /** 衣装の切り替え（ノード名の一覧ごと） */
  setNodeVisible: (name: string, visible: boolean) => void
  /** 自分のアバター: 一人称で頭を隠す */
  setupFirstPerson: () => void
  /** 骨を動かしたあとに毎フレーム呼ぶ（揺れもの・表情の反映） */
  update: (dt: number) => void
  /** 揺れもの（SpringBone）に、ほかの物（手など）を当たり判定として加える */
  setExtraColliders: (spheres: { obj: Object3D; radius: number }[]) => void
  dispose: () => void
  kind: 'vrm'
  /** VRM のメタ情報（利用条件の表示に使う） */
  meta: Record<string, unknown> | null
  /** 多角形の数（性能の目安） */
  stats: { triangles: number; materials: number; bones: number }
  /** VRM 0.x（180° 回して前を向かせたもの）。正規化された骨の座標が体の座標と前後・左右逆 */
  flipped?: boolean
}
