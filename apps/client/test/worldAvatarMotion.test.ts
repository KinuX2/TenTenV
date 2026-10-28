import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Euler, Object3D, Quaternion, Vector3 } from 'three'
import { AvatarPoser, type PoseInput } from '../src/avatar/poser'
import { applyAvatarMotion, isAvatarMotionState, makeAvatarMotionState, makeTimedAvatarMotion, sampleAvatarMotion } from '../src/avatar/worldMotion'
import type { AvatarModel } from '../src/avatar/types'

Object.defineProperty(globalThis, 'window', { configurable: true, value: new EventTarget() })
const { LocalTransport } = await import('../src/net/local')
const { InstanceSession } = await import('../src/net/session')

const waitFor = async (ready: () => boolean) => {
  const deadline = Date.now() + 3000
  while (!ready()) {
    if (Date.now() > deadline) throw new Error('Avatar motion did not synchronize')
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

test('timed avatar motion interpolates, loops, ends, and rejects invalid bone data', () => {
  const now = Date.now()
  const motion = makeTimedAvatarMotion({
    frames: [
      { at: 0, bones: { leftUpperArm: [0, 0, 0] } },
      { at: 1000, bones: { leftUpperArm: [Math.PI / 2, 0, 0] } },
    ],
  }, now)
  const arm = new Object3D()
  const model = { bones: { leftUpperArm: arm }, flipped: false } as unknown as AvatarModel
  applyAvatarMotion(model, motion, now + 500)
  assert.ok(arm.quaternion.angleTo(new Quaternion().setFromEuler(new Euler(Math.PI / 4, 0, 0))) < 1e-6)
  assert.equal(sampleAvatarMotion(motion, now + 1000), null)
  assert.equal(sampleAvatarMotion({ ...motion, loop: true }, now + 1500)?.t, 0.5)
  assert.throws(() => makeAvatarMotionState('pose', [{ at: 0, bones: { leftUpperArm: [Infinity, 0, 0] } }], now))
  assert.equal(isAvatarMotionState({ ...motion, frames: [{ at: 0, bones: { unknownBone: [0, 0, 0] } }, motion.frames[1]] }), false)
})

test('world bone rotations are applied before avatar model update', () => {
  const arm = new Object3D()
  let updatedRotation = new Quaternion()
  const model = {
    root: new Object3D(), bones: { leftUpperArm: arm }, rest: {}, flipped: false,
    update: () => { updatedRotation = arm.quaternion.clone() },
  } as unknown as AvatarModel
  const pose = makeAvatarMotionState('pose', [{ at: 0, bones: { leftUpperArm: [0, 0, 1] } }], Date.now())
  new AvatarPoser(model).update({ root: new Vector3(), yaw: 0, scale: 1 } as PoseInput, 0.016, () => applyAvatarMotion(model, pose, pose.startedAt))
  assert.ok(updatedRotation.angleTo(new Quaternion().setFromEuler(new Euler(0, 0, 1))) < 1e-6)
})

test('avatar motion reaches other players and late joiners; peers cannot replace another player’s motion', async () => {
  const room = `avatar-motion-${Math.random()}`
  const avatar = { kind: 'builtin' as const, id: 'akane', color: '#6ea8ff', scale: 1 }
  const sessions: InstanceType<typeof InstanceSession>[] = []
  const make = (name: string, hostScore: number) => {
    const transport = new LocalTransport(room, { id: name, displayName: name, iconUrl: null, status: 'online', statusText: '' })
    const session = new InstanceSession({ transport, serverKey: null, serverId: null, instanceId: room, serverClock: null, avatar, allowContact: 'everyone', hostScore })
    sessions.push(session)
    return session
  }
  try {
    const owner = make('owner', 1)
    const peer = make('peer', 0)
    await waitFor(() => peer.hostId() === owner.selfId)
    const key = `sys:avatarMotion:${owner.selfId}`
    const pose = makeAvatarMotionState('pose', [{ at: 0, bones: { leftUpperArm: [0, 0, 1] } }], Date.now())
    owner.set(key, pose)
    await waitFor(() => isAvatarMotionState(peer.get(key)))
    const late = make('late', 0)
    await waitFor(() => isAvatarMotionState(late.get(key)))
    peer.set(key, makeAvatarMotionState('pose', [{ at: 0, bones: { leftUpperArm: [0, 0, 2] } }], Date.now()))
    await new Promise((resolve) => setTimeout(resolve, 100))
    assert.deepEqual(peer.get(key), pose)
    assert.deepEqual(late.get(key), pose)
    owner.set(key, null)
    await waitFor(() => peer.get(key) == null && late.get(key) == null)
  } finally {
    for (const session of sessions) session.close()
  }
})
