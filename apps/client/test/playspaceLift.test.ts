import assert from 'node:assert/strict'
import { test } from 'node:test'
import { playspaceOriginY, updatePlayspaceLift } from '../src/player/playspaceLift'

test('VR の基準空間を上げた高度を維持し、下げたら通常の重力に戻る', () => {
  let state = { active: false, floorY: 0 }
  let result = updatePlayspaceLift(state, 1.6, 1.6, 1, 2, true)
  assert.equal(result.targetY, null)
  state = result.state

  result = updatePlayspaceLift(state, 1.2, 1.6, 1, 2, true)
  assert.equal(result.targetY, null)
  state = result.state

  result = updatePlayspaceLift(state, 2.2, 1.6, 1, 2, true)
  assert.equal(result.state.active, true)
  assert.ok(Math.abs(result.targetY! - 2.6) < 0.0001)
  // ボディが 0.6m 上がっても、頭とボディの距離は元の 1.6m のまま。
  const headWorldY = playspaceOriginY(result.targetY!, 0, result.state, result.targetY) + 2.2
  assert.ok(Math.abs(headWorldY - result.targetY! - 1.6) < 0.0001)
  state = result.state

  result = updatePlayspaceLift(state, 2.2, 1.6, 1, 2.6, false)
  assert.ok(Math.abs(result.targetY! - 2.6) < 0.0001)
  state = result.state

  result = updatePlayspaceLift(state, 1.72, 1.6, 1, 2.6, false)
  assert.ok(Math.abs(result.targetY! - 2.12) < 0.0001)
  state = result.state

  result = updatePlayspaceLift(state, 1.61, 1.6, 1, 2.12, false)
  assert.equal(result.state.active, false)
  assert.equal(result.targetY, null)
})
