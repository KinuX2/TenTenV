import { AVATAR_MOTION_BONES, type AvatarBoneRotations, type AvatarMotion, type AvatarMotionFrame } from '@tentenv/sdk/motion'
import { Euler, Quaternion } from 'three'
import type { AvatarModel } from './types'

export interface AvatarMotionState {
  mode: 'pose' | 'motion'
  startedAt: number
  frames: AvatarMotionFrame[]
  loop: boolean
  weight: number
}

const BONE_NAMES = new Set<string>(AVATAR_MOTION_BONES)
const MAX_FRAMES = 32
const MAX_DURATION = 60_000
const MAX_ANGLE = Math.PI * 2

const validBones = (value: unknown): value is AvatarBoneRotations => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const entries = Object.entries(value)
  return entries.length > 0 && entries.length <= AVATAR_MOTION_BONES.length && entries.every(([name, angles]) =>
    BONE_NAMES.has(name) && Array.isArray(angles) && angles.length === 3 &&
    angles.every((n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= MAX_ANGLE))
}

export const isAvatarMotionState = (value: unknown): value is AvatarMotionState => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const v = value as Partial<AvatarMotionState>
  if (v.mode !== 'pose' && v.mode !== 'motion') return false
  if (typeof v.startedAt !== 'number' || !Number.isFinite(v.startedAt) || v.startedAt <= 0 || v.startedAt > 1e15) return false
  if (typeof v.loop !== 'boolean' || typeof v.weight !== 'number' || !Number.isFinite(v.weight) || v.weight < 0 || v.weight > 1) return false
  if (!Array.isArray(v.frames) || v.frames.length < (v.mode === 'pose' ? 1 : 2) || v.frames.length > MAX_FRAMES) return false
  if (v.mode === 'pose' && (v.frames.length !== 1 || v.loop)) return false
  let previous = -1
  for (const frame of v.frames) {
    if (!frame || typeof frame !== 'object' || !Number.isInteger(frame.at) || frame.at <= previous || frame.at > MAX_DURATION || !validBones(frame.bones)) return false
    previous = frame.at
  }
  return v.frames[0].at === 0
}

export const makeAvatarMotionState = (mode: 'pose' | 'motion', frames: AvatarMotionFrame[], startedAt: number, weight = 1, loop = false): AvatarMotionState => {
  const state: AvatarMotionState = { mode, startedAt, frames, weight, loop }
  if (!isAvatarMotionState(state)) throw new Error('Invalid avatar motion: use 1 pose or 2–32 ordered frames, valid humanoid bones, and radians within ±2π')
  return { ...state, frames: frames.map((frame) => ({ at: frame.at, bones: Object.fromEntries(Object.entries(frame.bones).map(([name, angles]) => [name, [...angles]])) })) }
}

export const makeTimedAvatarMotion = (motion: AvatarMotion, startedAt: number) =>
  makeAvatarMotionState('motion', motion.frames, startedAt, motion.weight ?? 1, motion.loop ?? false)

export interface MotionSample {
  from: AvatarBoneRotations
  to: AvatarBoneRotations
  t: number
  weight: number
}

export const sampleAvatarMotion = (state: AvatarMotionState | null, now: number): MotionSample | null => {
  if (!state) return null
  if (state.mode === 'pose') return { from: state.frames[0].bones, to: state.frames[0].bones, t: 0, weight: state.weight }
  const duration = state.frames[state.frames.length - 1].at
  const elapsed = Math.max(0, now - state.startedAt)
  if (!state.loop && elapsed >= duration) return null
  const at = state.loop ? elapsed % duration : elapsed
  for (let i = 1; i < state.frames.length; i++) {
    const b = state.frames[i]
    if (at <= b.at) {
      const a = state.frames[i - 1]
      return { from: a.bones, to: b.bones, t: (at - a.at) / (b.at - a.at), weight: state.weight }
    }
  }
  return null
}

const euler = new Euler()
const fromQ = new Quaternion()
const toQ = new Quaternion()
const motionQ = new Quaternion()

/** Apply local humanoid rotations after the ordinary avatar poser has reset and updated the bones. */
export const applyAvatarMotion = (model: AvatarModel, state: AvatarMotionState | null, now: number) => {
  const sample = sampleAvatarMotion(state, now)
  if (!sample || sample.weight === 0) return
  const names = new Set([...Object.keys(sample.from), ...Object.keys(sample.to)])
  for (const name of names) {
    if (!BONE_NAMES.has(name)) continue
    const bone = model.bones[name as keyof typeof model.bones]
    if (!bone) continue
    const a = sample.from[name as keyof AvatarBoneRotations] ?? [0, 0, 0]
    const b = sample.to[name as keyof AvatarBoneRotations] ?? [0, 0, 0]
    fromQ.setFromEuler(euler.set(a[0], a[1], a[2], 'XYZ'))
    toQ.setFromEuler(euler.set(b[0], b[1], b[2], 'XYZ'))
    motionQ.copy(fromQ).slerp(toQ, sample.t)
    if (model.flipped) motionQ.set(-motionQ.x, motionQ.y, -motionQ.z, motionQ.w)
    bone.quaternion.slerp(motionQ, sample.weight)
  }
}
