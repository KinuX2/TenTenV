import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { AvatarInfo, MeInfo } from '@tentenv/protocol'
import { Api } from '../src/api/api'

test('avatar selection follows the account across sign-ins', async () => {
  const values = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) },
  })
  values.set('ttv.servers.v1', '{"old":"format"}')
  values.set('ttv.avatar.v1', '{"kind":"vrm","id":"missing-url"}')
  const { DEFAULT_AVATAR, rememberAvatarSelection, useApp } = await import('../src/state/app')
  assert.deepEqual(useApp.getState().servers, [])
  assert.equal(useApp.getState().avatar.kind, 'builtin')
  const api = new Api('https://example.test', null)
  const avatar = {
    id: 'uploaded1', owner: { id: 'user1' }, fileUrl: 'https://example.test/files/avatars/uploaded1.vrm',
    sha256: 'abc', extensions: null, isPublic: false, allowCloning: false,
  } as AvatarInfo
  let remoteId: string | null = 'uploaded1'
  api.avatar = async () => avatar
  api.updateMe = async (change) => {
    remoteId = change.currentAvatarId ?? null
    return { id: 'user1', currentAvatarId: remoteId } as MeInfo
  }
  const server = { url: api.base, name: 'Test', token: null, lastUsed: 0 }
  const me = { id: 'user1', currentAvatarId: 'uploaded1' } as MeInfo
  useApp.setState({ api, servers: [server], me: null, avatar: DEFAULT_AVATAR })
  useApp.getState().login('token1', me)
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(useApp.getState().avatar.id, 'uploaded1')

  rememberAvatarSelection(api.base, me.id, null)
  useApp.setState({ api, me: null })
  useApp.getState().login('token1', me)
  assert.equal(useApp.getState().avatar.kind, 'builtin')
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(remoteId, null)

  useApp.setState({ api, me: null, avatar: { kind: 'vrm', id: 'uploaded1', url: avatar.fileUrl, sha256: avatar.sha256, scale: 1 } })
  useApp.getState().login('token2', { id: 'user2', currentAvatarId: null } as MeInfo)
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(useApp.getState().avatar.kind, 'builtin')
})
