// 姿勢・物の位置のバイナリ形式とレート制限のテスト
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { decodeObjects, decodePose, encodeObjects, encodePose, objectHash, PoseFlag, type PoseFrame } from './peer'
import { ByteBucket, RateLimiter } from './limits'

const frame = (): PoseFrame => ({
  seq: 7,
  time: 123456789,
  flags: PoseFlag.VR | PoseFlag.Grounded,
  sleep: 0,
  root: { x: 1.5, y: 0, z: -3.25 },
  yaw: 1.2,
  speed: 2.4,
  moveX: 0.5,
  moveZ: -1,
  head: { p: { x: 0, y: 1.6, z: 0.05 }, q: { x: 0, y: 0.3826834, z: 0, w: 0.9238795 } },
  left: { p: { x: -0.3, y: 1.2, z: -0.2 }, q: { x: 0, y: 0, z: 0, w: 1 } },
  right: { p: { x: 0.3, y: 1.2, z: -0.2 }, q: { x: 0.7071068, y: 0, z: 0, w: 0.7071068 } },
  fingers: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 1],
})

test('姿勢を詰めて戻せる', () => {
  const f = frame()
  const d = decodePose(encodePose(f))!
  assert.ok(d)
  assert.equal(d.seq, 7)
  assert.equal(d.time, 123456789)
  assert.ok(Math.abs(d.root.z - -3.25) < 1e-5)
  assert.ok(Math.abs(d.yaw - 1.2) < 1e-3)
  assert.ok(Math.abs(d.head.p.y - 1.6) < 1e-3)
  assert.ok(Math.abs(d.right.q.x - 0.7071) < 1e-3)
  assert.ok(Math.abs(d.fingers![9] - 1) < 1e-2)
  assert.ok((d.flags & PoseFlag.Fingers) !== 0)
})

test('壊れた姿勢は捨てる', () => {
  const buf = encodePose(frame())
  assert.equal(decodePose(buf.slice(0, 20)), null)
  const bad = new Uint8Array(buf.slice(0))
  new DataView(bad.buffer).setFloat32(10, NaN, true)
  assert.equal(decodePose(bad.buffer), null)
  const big = new ArrayBuffer(300)
  assert.equal(decodePose(big), null)
})

test('物の位置を詰めて戻せる', () => {
  const list = [{ hash: objectHash('box'), p: { x: 1, y: 2, z: 3 }, q: { x: 0, y: 0, z: 0, w: 1 }, vel: { x: 0.5, y: -1, z: 0 } }]
  const d = decodeObjects(encodeObjects(42, list))!
  assert.equal(d.time, 42)
  assert.equal(d.list[0].hash, objectHash('box'))
  assert.ok(Math.abs(d.list[0].vel.y - -1) < 1e-2)
  // 長さ 0 の回転は回転なしとして届く
  const zero = decodeObjects(encodeObjects(1, [{ ...list[0], q: { x: 0, y: 0, z: 0, w: 0 } }]))!
  assert.deepEqual(zero.list[0].q, { x: 0, y: 0, z: 0, w: 1 })
})

test('ありえない位置の物は捨てる', () => {
  const far = { hash: 1, p: { x: 3e38, y: 0, z: 0 }, q: { x: 0, y: 0, z: 0, w: 1 }, vel: { x: 0, y: 0, z: 0 } }
  assert.equal(decodeObjects(encodeObjects(1, [far])), null)
  assert.ok(decodeObjects(encodeObjects(1, [{ ...far, p: { x: 1e5, y: -1e5, z: 0 } }])))
})

test('レート制限', () => {
  const r = new RateLimiter(3, 1000)
  assert.ok(r.take(0) && r.take(1) && r.take(2))
  assert.equal(r.take(3), false)
  assert.ok(r.take(1001))
  const b = new ByteBucket(100, 100)
  assert.ok(b.take(80))
  assert.equal(b.take(80), false)
})
