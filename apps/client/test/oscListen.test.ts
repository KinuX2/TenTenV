// Windows 版の OSC の受け口（listen の失敗・止めた後の結果）
import assert from 'node:assert/strict'
import { test } from 'node:test'

test('listen が失敗したら error にし、止めた後の結果では状態を変えない', async () => {
  const pending: ((r: { ok: boolean; error?: string }) => void)[] = []
  let fail = true
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      __tentenvOSC: {
        listen: () => (fail ? Promise.reject(new Error('port in use')) : new Promise((resolve) => pending.push(resolve))),
        close: () => {},
        onPacket: () => {},
      },
    },
  })
  const { useSettings } = await import('../src/state/settings')
  const { oscState, startOscFace } = await import('../src/features/oscFace')
  useSettings.getState().set({ oscFace: true, oscPort: 9000 })
  const stop = startOscFace()
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(oscState.status, 'error')
  assert.equal(oscState.error, 'port in use')
  // ポートを変えたら、前の結果は使わない
  fail = false
  useSettings.getState().set({ oscPort: 9001 })
  assert.equal(oscState.status, 'waiting')
  stop()
  pending.forEach((resolve) => resolve({ ok: false, error: 'late' }))
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(oscState.status, 'off')
})
