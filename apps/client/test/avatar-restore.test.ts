// 起動時のアバターの復元（ほかの端末での選択・公開 URL の違い）
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { AvatarInfo, MeInfo, ServerInfo } from '@tentenv/protocol'
import { Api, ApiError } from '../src/api/api'

const values = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) },
})
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))
const avatarInfo = (id: string, fileUrl: string) => ({
  id, owner: { id: 'user1' }, fileUrl, sha256: `sha-${id}`, extensions: null, isPublic: false, allowCloning: false,
}) as unknown as AvatarInfo

test('覚えていたアバターが消えていたら、サーバーで選ばれている別のアバターを使い、消さない', async () => {
  const { rememberAvatarSelection, useApp, DEFAULT_AVATAR } = await import('../src/state/app')
  const api = new Api('https://example.test', null)
  const y = avatarInfo('avatarY', 'https://example.test/files/avatars/avatarY.vrm')
  api.avatar = async (id: string) => {
    if (id === 'avatarY') return y
    throw new ApiError(404, 'not_found', 'not found')
  }
  const changes: (string | null | undefined)[] = []
  api.updateMe = async (change) => {
    changes.push(change.currentAvatarId)
    return { id: 'user1', currentAvatarId: change.currentAvatarId ?? null } as MeInfo
  }
  rememberAvatarSelection(api.base, 'user1', 'avatarX')
  useApp.setState({ api, info: null, me: null, avatar: DEFAULT_AVATAR, toasts: [] })
  useApp.getState().login('token', { id: 'user1', currentAvatarId: 'avatarY' } as MeInfo)
  for (let i = 0; i < 5; i++) await settle()
  const st = useApp.getState()
  assert.equal(st.avatar.id, 'avatarY')
  assert.equal(st.me?.currentAvatarId, 'avatarY')
  assert.deepEqual(changes, [], 'サーバーの選択を消さない')
  assert.equal(st.toasts.length, 0)
})

test('ファイルの URL が公開 URL でも、同じアバターなら衣装の選択を残す', async () => {
  const { rememberAvatarSelection, useApp } = await import('../src/state/app')
  const api = new Api('http://192.168.1.2:8080', null)
  const fileUrl = 'https://public.test/files/avatars/avatarY.vrm'
  const y = { ...avatarInfo('avatarY', fileUrl), extensions: { version: 1, outfits: [{ id: 'hat', label: 'Hat', nodes: ['Hat'], default: false }] } } as AvatarInfo
  api.avatar = async () => y
  api.updateMe = async (change) => ({ id: 'user1', currentAvatarId: change.currentAvatarId ?? null }) as MeInfo
  rememberAvatarSelection(api.base, 'user1', 'avatarY')
  const previous = { kind: 'vrm' as const, id: 'avatarY', url: fileUrl, sha256: y.sha256, scale: 1, outfits: ['+Hat'] }
  useApp.setState({ api, info: { publicUrl: 'https://public.test' } as ServerInfo, me: null, avatar: previous, toasts: [] })
  useApp.getState().login('token', { id: 'user1', currentAvatarId: 'avatarY' } as MeInfo)
  // 読み込みを待つ間も、標準のアバターに戻さない
  assert.equal(useApp.getState().avatar, previous)
  await settle()
  assert.deepEqual(useApp.getState().avatar.outfits, ['+Hat'])
})
