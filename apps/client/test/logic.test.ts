// クライアントの計算のテスト（手の形・表情・かな変換・時計）
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { classifyGesture, GESTURE_CURLS } from '../src/avatar/poser'
import { gestureExpression } from '../src/avatar/face'
import { kanaConvert } from '../src/ui/vr/kana'
import { SharedClock } from '../src/net/clock'

test('指の曲がりから手の形を判定する', () => {
  for (const g of ['fist', 'open', 'point', 'victory', 'rocknroll', 'gun', 'thumbsup'] as const) assert.equal(classifyGesture(GESTURE_CURLS[g]), g)
  assert.equal(classifyGesture([0.5, 0.5, 0.5, 0.5, 0.5]), 'neutral')
})

test('手の形から表情を決める（選んだ表情・組み合わせ・右手優先）', () => {
  assert.deepEqual(gestureExpression(['neutral', 'victory'], null, null), { happy: 1 })
  assert.deepEqual(gestureExpression(['victory', 'neutral'], null, 'sad'), { sad: 1 })
  // 左はグー（怒り）、右はピース（笑顔）: 感情は右手を優先
  const e = gestureExpression(['fist', 'victory'], null, null)
  assert.equal(e.happy, 1)
  assert.equal(e.angry, undefined)
  // アバターの割り当て
  assert.deepEqual(gestureExpression(['fist', 'fist'], { version: 1, gestureCombos: { 'fist+fist': { surprised: 1 } } }, null), { surprised: 1 })
})

test('ローマ字をかなにする', () => {
  const all = (s: string) => {
    const r = kanaConvert(s)
    return r.done + r.rest
  }
  assert.equal(all('konnnichiha'), 'こんにちは')
  assert.equal(all('kitte'), 'きって')
  assert.equal(all('shinbun'), 'しんぶn')
  assert.equal(kanaConvert('ky').rest, 'ky')
  assert.equal(all('arigatou-'), 'ありがとうー')
})

test('共有時計: 往復の短い測定を使い、時刻の飛びを数える', () => {
  const c = new SharedClock()
  assert.equal(c.synced, false)
  const t = performance.now()
  // 相手の時計が 1000ms 進んでいる
  const server = (local: number) => performance.timeOrigin + local + 1000
  c.addSample(t - 100, server(t - 50), t)
  c.addSample(t - 20, server(t - 10), t)
  assert.equal(c.synced, true)
  assert.ok(Math.abs(c.now() - (performance.timeOrigin + performance.now() + 1000)) < 30)
  assert.ok(c.uncertainty <= 15)
})
