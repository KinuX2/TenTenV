import type { Vector3Tuple } from 'three'

/** Humanoid bones whose local rotations a world can animate (radians, XYZ order). */
export const AVATAR_MOTION_BONES = [
  'hips', 'spine', 'chest', 'upperChest', 'neck', 'head',
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
export type AvatarMotionBone = (typeof AVATAR_MOTION_BONES)[number]

/** Bones a world can read (the animatable bones plus the eyes and jaw). */
export const AVATAR_BONE_NAMES = [...AVATAR_MOTION_BONES, 'leftEye', 'rightEye', 'jaw'] as const
export type AvatarBoneName = (typeof AVATAR_BONE_NAMES)[number]

/** Quaternion [x, y, z, w]. */
export type QuaternionTuple = [number, number, number, number]

export interface AvatarBoneTransform {
  /** World position of the bone (m). */
  position: Vector3Tuple
  /**
   * World rotation of the bone. In the rest (T) pose every bone has the same rotation as the avatar's body,
   * so `quaternion` is comparable across VRM 0.x / 1.0 avatars.
   */
  quaternion: QuaternionTuple
  /** Rotation relative to the parent bone (radians, XYZ order) — the same form that useAvatarMotion().setPose takes. */
  rotation: Vector3Tuple
}

/** Bones of a displayed avatar. Bones the avatar does not have are missing. */
export type AvatarBones = Partial<Record<AvatarBoneName, AvatarBoneTransform>>
export type AvatarBoneRotations = Partial<Record<AvatarMotionBone, Vector3Tuple>>

export interface AvatarMotionFrame {
  /** Milliseconds from the start. The first frame must be at 0. */
  at: number
  bones: AvatarBoneRotations
}

export interface AvatarMotion {
  /** Two or more frames, up to 32. The final frame ends a non-looping motion. */
  frames: AvatarMotionFrame[]
  loop?: boolean
  /** Blend with ordinary tracking and movement, 0–1 (default 1). */
  weight?: number
}

export interface AvatarMotionApi {
  /** Hold a pose until stop() or another motion. Only this player's avatar is changed. */
  setPose: (bones: AvatarBoneRotations, weight?: number) => void
  /** Play a timed bone animation. Non-looping motions return to ordinary movement at the end. */
  play: (motion: AvatarMotion) => void
  stop: () => void
  isActive: () => boolean
}
