import assert from 'node:assert/strict'
import { test } from 'node:test'
import { FaceDriver } from '../src/avatar/face'
import type { AvatarModel } from '../src/avatar/types'
import type { VoiceLevel } from '../src/net/voice'

const voice = (aa: number): VoiceLevel => ({ level: aa, talking: aa > 0, visemes: { aa, ih: 0, ou: 0, ee: 0, oh: 0 } })
const face = (standard: boolean, expression: string, aa: number) => {
  const weights: Record<string, number> = {}
  const model = { expressions: [expression, 'aa', 'oh'], setExpression: (name: string, weight: number) => { weights[name] = weight } } as AvatarModel
  new FaceDriver(model, standard).update(0.1, { [expression]: 1 }, voice(aa))
  return weights
}

test('Akane はどの感情の表情でも発話中に口形を優先する', () => {
  for (const expression of ['happy', 'angry', 'sad', 'relaxed', 'surprised']) {
    const silent = face(true, expression, 0)
    const talking = face(true, expression, 0.5)
    assert.equal(talking.aa, 0.1875, `${expression}: 母音を半分にする`)
    assert.equal(talking.oh, 0.25, `${expression}: 開口用の口形を半分にする`)
    assert.ok(talking[expression] < silent[expression], `${expression}: 口元と競合する表情が弱まる`)
  }
  const loud = face(true, 'happy', 1)
  assert.equal(loud.aa, 0.375)
  assert.equal(loud.oh, 0.25)
  assert.equal(face(true, 'aa', 1).aa, 0.375)
})

test('ほかのアバターの表情と口形の重みは変えない', () => {
  const weights = face(false, 'surprised', 0.5)
  assert.ok(weights.surprised > 0.5)
  assert.equal(weights.aa, 0.2)
})
