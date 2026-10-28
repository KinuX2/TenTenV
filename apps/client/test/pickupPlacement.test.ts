import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Object3D, Quaternion, Vector3 } from 'three'
import { capturePickupPlacement, readPickupPlacement, setPickupWorldPlacement } from '../src/world/pickupPlacement'

Object.defineProperty(globalThis, 'window', { configurable: true, value: new EventTarget() })
const { LocalTransport } = await import('../src/net/local')
const { InstanceSession } = await import('../src/net/session')

const waitFor = async (ready: () => boolean) => {
  const deadline = Date.now() + 3000
  while (!ready()) {
    if (Date.now() > deadline) throw new Error('同期状態を受信できませんでした')
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

test('Pickup の配置を親グループの変換に関係なくワールド座標で復元する', () => {
  const parent = new Object3D()
  parent.position.set(3, 1, -2)
  parent.rotation.y = Math.PI / 2
  const item = new Object3D()
  item.scale.setScalar(0.7)
  parent.add(item)
  const targetPosition = new Vector3(5, 2, -4)
  const targetRotation = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 3)

  setPickupWorldPlacement(item, targetPosition, targetRotation)
  const saved = readPickupPlacement(capturePickupPlacement(item))!
  const restored = new Object3D()
  parent.add(restored)
  setPickupWorldPlacement(restored, new Vector3(...saved.p), new Quaternion(...saved.q))

  assert.ok(restored.getWorldPosition(new Vector3()).distanceTo(targetPosition) < 1e-6)
  assert.ok(restored.getWorldQuaternion(new Quaternion()).angleTo(targetRotation) < 1e-6)
  assert.equal(item.scale.x, 0.7)
  assert.equal(readPickupPlacement({ p: [Infinity, 0, 0], q: [0, 0, 0, 1] }), null)
  assert.equal(readPickupPlacement({ p: [0, 0, 0], q: [0, 0, 0, 0] }), null)
})

test('離した位置と reset の位置が参加中の人と後から入った人へ届く', async () => {
  const room = `pickup-placement-${Math.random()}`
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
    const key = 'sys:pick:box'
    const dropped = { p: [2, 1, -3], q: [0, 0, 0, 1] }
    owner.set(key, { holder: null, owner: owner.selfId, pose: dropped })
    await new Promise((resolve) => setTimeout(resolve, 20))
    const peer = make('peer', 0)
    await waitFor(() => JSON.stringify((peer.get(key) as { pose?: unknown } | undefined)?.pose) === JSON.stringify(dropped))

    const home = { p: [0, 1, 0], q: [0, 0, 0, 1] }
    peer.set(key, { holder: null, owner: peer.selfId, pose: home, reset: true })
    await waitFor(() => JSON.stringify((owner.get(key) as { pose?: unknown } | undefined)?.pose) === JSON.stringify(home))

    const late = make('late', 0)
    await waitFor(() => JSON.stringify((late.get(key) as { pose?: unknown } | undefined)?.pose) === JSON.stringify(home))
  } finally {
    for (const session of sessions) session.close()
  }
})
