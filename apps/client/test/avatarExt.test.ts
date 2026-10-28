// アバターの拡張定義（衣装の状態・使ってよいアバター）
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { AvatarExtensions, AvatarInfo } from '@tentenv/protocol'
import { activeFromTokens, canWearAvatar, outfitTokens, useAvatarExt, vrmAvatarRef } from '../src/state/avatarExt'

const ext: AvatarExtensions = {
  version: 1,
  outfits: [
    { id: 'coat', label: 'Coat', nodes: ['Coat', 'CoatBelt'], default: true },
    { id: 'hat', label: 'Hat', nodes: ['Hat'], default: false },
  ],
  actions: [{ id: 'glasses', label: 'Glasses', kind: 'toggle', target: 'Glasses' }],
}

test('衣装の指定から、有効な衣装・トグルを戻す', () => {
  assert.deepEqual([...activeFromTokens(ext, undefined)], ['coat'])
  const active = activeFromTokens(ext, ['-Coat', '-CoatBelt', '+Hat', '+Glasses'])
  assert.deepEqual([...active].sort(), ['glasses', 'hat'])
  assert.deepEqual(outfitTokens(ext, active), ['-Coat', '-CoatBelt', '+Hat', '+Glasses'])
  // 別のアバターのノード名は無視して既定のまま
  assert.deepEqual([...activeFromTokens(ext, ['+Other'])], ['coat'])
})

test('拡張定義は持ち主のアバターと一緒に覚える', () => {
  useAvatarExt.getState().set(ext, 'avatarA', ['+Hat', '-Coat', '-CoatBelt'])
  assert.equal(useAvatarExt.getState().avatarId, 'avatarA')
  assert.deepEqual([...useAvatarExt.getState().active], ['hat'])
  useAvatarExt.getState().set(null)
  assert.equal(useAvatarExt.getState().avatarId, null)
})

test('一覧から選んだアバターは既定の衣装で着る・使ってよいものだけ', () => {
  const a = { id: 'a1', fileUrl: '/files/avatars/a1.vrm', sha256: 'x', extensions: ext } as AvatarInfo
  const ref = vrmAvatarRef(a, (url) => `https://example.test${url}`)
  assert.equal(ref.kind === 'vrm' && ref.url, 'https://example.test/files/avatars/a1.vrm')
  assert.deepEqual(ref.outfits, ['+Coat', '+CoatBelt', '-Hat', '-Glasses'])
  assert.equal(canWearAvatar({ owner: { id: 'me' }, isPublic: false, allowCloning: false } as AvatarInfo, 'me'), true)
  assert.equal(canWearAvatar({ owner: { id: 'other' }, isPublic: true, allowCloning: false } as AvatarInfo, 'me'), false)
  assert.equal(canWearAvatar({ owner: { id: 'other' }, isPublic: false, allowCloning: true } as AvatarInfo, 'me'), false)
  assert.equal(canWearAvatar({ owner: { id: 'other' }, isPublic: true, allowCloning: true } as AvatarInfo, 'me'), true)
})
