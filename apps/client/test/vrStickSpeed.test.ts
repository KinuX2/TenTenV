import assert from 'node:assert/strict'
import { test } from 'node:test'
import { vrStickSpeed } from '../src/player/vrStickSpeed'

test('VR スティックは小さい入力で通常速度、最大入力で Shift と同じ速度になる', () => {
  const run = 1.9
  assert.equal(vrStickSpeed(0, run), 0)
  assert.equal(vrStickSpeed(0.25, run), 1)
  assert.equal(vrStickSpeed(0.6, run), 1)
  assert.ok(vrStickSpeed(0.8, run) > 1)
  assert.ok(vrStickSpeed(0.8, run) < run)
  assert.equal(vrStickSpeed(1, run), run)
})
