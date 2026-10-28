// 共有リンクの親サーバーの照合（公開 URL と接続に使った URL が違うとき）
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { ServerInfo } from '@tentenv/protocol'
import { Api } from '../src/api/api'

test('リンクの server が公開 URL でも、接続中の親サーバーとみなす', async () => {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => null, setItem: () => {} } })
  const { useApp } = await import('../src/state/app')
  const { isCurrentServer } = await import('../src/ui/join')
  useApp.setState({ api: new Api('http://192.168.1.2:8080', null), info: { publicUrl: 'https://vr.example.test' } as ServerInfo })
  assert.equal(isCurrentServer(null), true)
  assert.equal(isCurrentServer('https://vr.example.test'), true)
  assert.equal(isCurrentServer('http://192.168.1.2:8080/'), true)
  assert.equal(isCurrentServer('https://other.example.test'), false)
})
