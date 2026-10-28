import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { PickupEntry, WorldEngine } from '../src/world/engine'

const canvas = new EventTarget() as unknown as HTMLElement
const testWindow = new EventTarget()
const testDocument = new EventTarget() as EventTarget & { pointerLockElement: HTMLElement | null }
testDocument.pointerLockElement = canvas
const pads: Array<{ mapping: string; axes: number[]; buttons: Array<{ pressed: boolean }> }> = []
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { userAgent: '', maxTouchPoints: 0, language: 'ja', getGamepads: () => pads } })
Object.defineProperty(globalThis, 'window', { configurable: true, value: testWindow })
Object.defineProperty(globalThis, 'document', { configurable: true, value: testDocument })

const { WorldEngine } = await import('../src/world/engine')
const { input } = await import('../src/player/input')

const send = (type: string, props: Record<string, unknown> = {}) => {
  const event = new Event(type)
  Object.assign(event, props)
  testWindow.dispatchEvent(event)
}

test('「使う」の押下・継続・解放をキーボード、マウス、ゲームパッドから読める', () => {
  input.attach(canvas)
  send('keydown', { code: 'KeyF' })
  assert.equal(input.poll(1 / 60).use, true)
  const held = input.poll(1 / 60)
  assert.equal(held.use, false)
  assert.equal(held.useHeld, true)
  send('keyup', { code: 'KeyF' })
  assert.equal(input.poll(1 / 60).useHeld, false)

  send('mousedown', { button: 2 })
  assert.equal(input.poll(1 / 60).useHeld, true)
  assert.equal(input.poll(1 / 60).useHeld, true)
  send('mouseup', { button: 2 })
  assert.equal(input.poll(1 / 60).useHeld, false)
  send('mousedown', { button: 2 })
  assert.equal(input.poll(1 / 60).useHeld, true)
  send('blur')
  assert.equal(input.poll(1 / 60).useHeld, false)
  send('mousedown', { button: 2 })
  assert.equal(input.poll(1 / 60).useHeld, true)
  testDocument.pointerLockElement = null
  testDocument.dispatchEvent(new Event('pointerlockchange'))
  assert.equal(input.poll(1 / 60).useHeld, false)
  testDocument.pointerLockElement = canvas

  pads.push({ mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 16 }, (_, i) => ({ pressed: i === 2 })) })
  assert.equal(input.poll(1 / 60).useHeld, true)
  assert.equal(input.poll(1 / 60).useHeld, true)
  pads[0].buttons[2].pressed = false
  assert.equal(input.poll(1 / 60).useHeld, false)
  pads.length = 0

  input.touchButton('use', true)
  assert.equal(input.poll(1 / 60).useHeld, true)
  input.touchButton('use', false)
  assert.equal(input.poll(1 / 60).useHeld, false)

  send('keydown', { code: 'KeyF' })
  input.suspended = true
  assert.equal(input.poll(1 / 60).useHeld, false)
  input.suspended = false
  send('keyup', { code: 'KeyF' })
})

test('持っている物の使用状態は変化時だけ通知し、従来の onUse は押した瞬間だけ呼ぶ', () => {
  const events: string[] = []
  const engine = Object.create(WorldEngine.prototype) as WorldEngine
  engine.selfInfo = () => ({ peerId: 'self' }) as ReturnType<WorldEngine['selfInfo']>
  const pk = {
    using: false,
    spec: () => ({
      onUse: () => events.push('use'),
      onUseChange: (pressed: boolean) => events.push(String(pressed)),
    }),
  } as PickupEntry

  engine.setPickupUsing(pk, true, true)
  assert.equal(pk.using, true)
  engine.setPickupUsing(pk, true)
  engine.setPickupUsing(pk, false)
  assert.equal(pk.using, false)
  engine.setPickupUsing(pk, false)
  assert.deepEqual(events, ['true', 'use', 'false'])

  engine.setPickupUsing(pk, true)
  assert.deepEqual(events, ['true', 'use', 'false', 'true'])
})
