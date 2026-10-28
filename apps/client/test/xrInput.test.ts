// VR の入力の毎フレームの片付け
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resetHandInputs, xrInput } from '../src/player/xrInput'

test('つながっていない手は、ハンドトラッキング・握り・振動の宛先を残さない', () => {
  const l = xrInput.left
  l.connected = true
  l.handTracking = true
  l.squeeze = 1
  l.trigger = 0.9
  l.source = {} as XRInputSource
  resetHandInputs()
  assert.equal(l.connected, false)
  assert.equal(l.handTracking, false)
  assert.equal(l.squeeze, 0)
  assert.equal(l.trigger, 0)
  assert.equal(l.source, null)
})
