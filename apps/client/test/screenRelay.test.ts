// 画面共有の中継: 断片に分けて送り、受け手で組み立て直す
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BINARY_SCREEN, SCREEN_FRAGMENT_BYTES } from '@tentenv/protocol'
import { fragmentScreenFrame, readScreenFragment, ScreenFrameAssembler } from '../src/net/screenRelay'

const frameOf = (n: number, seed: number) => Uint8Array.from({ length: n }, (_, i) => (i * 31 + seed) & 0xff)

test('大きなフレームを中継の上限以下の断片に分け、順番が入れ替わっても組み立て直せる', () => {
  const data = frameOf(SCREEN_FRAGMENT_BYTES * 3 + 123, 7)
  const parts = fragmentScreenFrame(data, { key: true, codec: 'h264', frame: 65535, width: 1280, height: 720, timestamp: 1234 })
  assert.equal(parts.length, 4)
  for (const p of parts) {
    assert.ok(p.byteLength <= SCREEN_FRAGMENT_BYTES)
    assert.equal(new DataView(p).getUint8(0), BINARY_SCREEN)
  }
  const asm = new ScreenFrameAssembler()
  let done = null
  for (const p of [parts[2], parts[0], parts[3], parts[1]]) done = asm.push(readScreenFragment(p)!) ?? done
  assert.ok(done)
  assert.equal(done!.key, true)
  assert.equal(done!.codec, 'h264')
  assert.equal(done!.frame, 65535)
  assert.equal(done!.width, 1280)
  assert.equal(done!.height, 720)
  assert.equal(done!.timestamp, 1234)
  assert.deepEqual(done!.data, data)
})

test('同じ断片が 2 回届いても数えず、欠けたフレームは完成しない', () => {
  const parts = fragmentScreenFrame(frameOf(SCREEN_FRAGMENT_BYTES * 2, 1), { key: false, frame: 10, width: 640, height: 360, timestamp: 0 })
  assert.equal(parts.length, 3)
  const asm = new ScreenFrameAssembler()
  assert.equal(asm.push(readScreenFragment(parts[0])!), null)
  assert.equal(asm.push(readScreenFragment(parts[0])!), null)
  assert.equal(asm.push(readScreenFragment(parts[1])!), null)
  // 次のフレームが届き始めても、前のフレームは足りない断片のまま
  const next = fragmentScreenFrame(frameOf(100, 2), { key: false, frame: 11, width: 640, height: 360, timestamp: 100 })
  assert.ok(asm.push(readScreenFragment(next[0])!))
})

test('壊れた断片・ほかの種類のデータは読まない', () => {
  assert.equal(readScreenFragment(new ArrayBuffer(4)), null)
  const ok = fragmentScreenFrame(frameOf(50, 3), { key: true, frame: 1, width: 64, height: 64, timestamp: 0 })[0]
  const wrongType = ok.slice(0)
  new DataView(wrongType).setUint8(0, 1)
  assert.equal(readScreenFragment(wrongType), null)
  const badIndex = ok.slice(0)
  new DataView(badIndex).setUint8(4, 5)
  assert.equal(readScreenFragment(badIndex), null)
  const huge = ok.slice(0)
  new DataView(huge).setUint16(6, 9000, true)
  assert.equal(readScreenFragment(huge), null)
  assert.equal(readScreenFragment(new ArrayBuffer(SCREEN_FRAGMENT_BYTES + 1)), null)
})

test('断片が 255 個を超えるフレームは送らない', () => {
  assert.deepEqual(fragmentScreenFrame(new Uint8Array(SCREEN_FRAGMENT_BYTES * 256), { key: true, frame: 0, width: 64, height: 64, timestamp: 0 }), [])
})
