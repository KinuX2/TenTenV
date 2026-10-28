// 画面共有の音: パケットの読み書きと、音の速さの変換
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BINARY_SCREEN_AUDIO, SCREEN_AUDIO_PACKET_BYTES } from '@tentenv/protocol'
import { encodeScreenAudioPacket, readScreenAudioPacket, resamplePlanar } from '../src/net/screenAudio'

test('パケットを作って読み直せ、壊れたもの・大きすぎるものは読まない', () => {
  const data = Uint8Array.from({ length: 200 }, (_, i) => i)
  const buf = encodeScreenAudioPacket(65537, 2, data)!
  assert.equal(new DataView(buf).getUint8(0), BINARY_SCREEN_AUDIO)
  const p = readScreenAudioPacket(buf)!
  assert.equal(p.channels, 2)
  assert.equal(p.seq, 1)
  assert.deepEqual(p.data, data)
  assert.equal(encodeScreenAudioPacket(0, 2, new Uint8Array(SCREEN_AUDIO_PACKET_BYTES)), null)
  const bad = buf.slice(0)
  new DataView(bad).setUint8(1, 3)
  assert.equal(readScreenAudioPacket(bad), null)
  const other = buf.slice(0)
  new DataView(other).setUint8(0, 3)
  assert.equal(readScreenAudioPacket(other), null)
  assert.equal(readScreenAudioPacket(new ArrayBuffer(4)), null)
})

test('左右の音を混ぜずに速さを変える', () => {
  const n = 441
  const x = new Float32Array(n * 2)
  x.fill(0.25, 0, n)
  x.fill(-0.5, n)
  const y = resamplePlanar(x, 2, 44100, 48000)
  assert.equal(y.length, 480 * 2)
  assert.ok(y.subarray(0, 480).every((v) => Math.abs(v - 0.25) < 1e-6))
  assert.ok(y.subarray(480).every((v) => Math.abs(v + 0.5) < 1e-6))
  assert.equal(resamplePlanar(x, 2, 48000, 48000), x)
})
