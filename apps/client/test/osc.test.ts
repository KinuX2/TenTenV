// OSC での表情の受け取り（VMC プロトコルとアバターパラメーター形式）
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { handleOsc, oscFaceExpression, oscState, parseOsc } from '../src/features/oscFace'

/** OSC のメッセージを作る（テスト用） */
const pad = (b: number[]) => {
  while (b.length % 4) b.push(0)
  return b
}
const str = (s: string) => pad([...new TextEncoder().encode(s), 0])
const msg = (addr: string, ...args: (string | number)[]) => {
  const tags = ',' + args.map((a) => (typeof a === 'string' ? 's' : 'f')).join('')
  const out = [...str(addr), ...str(tags)]
  for (const a of args) {
    if (typeof a === 'string') out.push(...str(a))
    else {
      const v = new DataView(new ArrayBuffer(4))
      v.setFloat32(0, a)
      out.push(...new Uint8Array(v.buffer))
    }
  }
  return new Uint8Array(out)
}
const bundle = (...msgs: Uint8Array[]) => {
  const out = [...str('#bundle'), 0, 0, 0, 0, 0, 0, 0, 1]
  for (const m of msgs) {
    const v = new DataView(new ArrayBuffer(4))
    v.setInt32(0, m.length)
    out.push(...new Uint8Array(v.buffer), ...m)
  }
  return new Uint8Array(out)
}

test('OSC のメッセージとバンドルを読む', () => {
  const got: [string, unknown[]][] = []
  parseOsc(bundle(msg('/VMC/Ext/Blend/Val', 'Joy', 0.5), msg('/VMC/Ext/Blend/Apply')), (a, args) => got.push([a, args]))
  assert.deepEqual(got, [
    ['/VMC/Ext/Blend/Val', ['Joy', 0.5]],
    ['/VMC/Ext/Blend/Apply', []],
  ])
  // 壊れたパケットは捨てる
  parseOsc(new Uint8Array([0x23, 0x62, 1, 2, 3]), () => assert.fail())
})

test('VMC の表情の名前を VRM の表情に置き換える', () => {
  oscState.status = 'receiving'
  for (const [n, v] of [['A', 0.8], ['Blink_L', 1], ['Joy', 0.3]] as const) handleOsc('/VMC/Ext/Blend/Val', [n, v])
  handleOsc('/VMC/Ext/Blend/Apply', [])
  const e = oscFaceExpression(['aa', 'blinkLeft', 'happy'])!
  assert.ok(Math.abs(e.aa - 0.8) < 1e-6)
  assert.equal(e.blinkLeft, 1)
  assert.ok(Math.abs(e.happy - 0.3) < 1e-6)
})

test('ARKit の名前はパーフェクトシンクならそのまま、なければ VRM の表情を作る', async () => {
  const fresh = await import('../src/features/oscFace?arkit')
  fresh.oscState.status = 'receiving'
  fresh.handleOsc('/avatar/parameters/JawOpen', [0.5])
  fresh.handleOsc('/avatar/parameters/FT/v2/EyeLidLeft', [0])
  // アバターに JawOpen があれば、そのまま使う
  assert.equal(fresh.oscFaceExpression(['JawOpen', 'aa'])!.JawOpen, 0.5)
  // VRM の標準の表情へ: 口を開く・左目を閉じる（EyeLid は開き具合）
  const e = fresh.oscFaceExpression(['aa', 'blinkLeft'])!
  assert.ok(Math.abs(e.aa - 0.7) < 1e-6)
  assert.equal(e.blinkLeft, 1)
})
