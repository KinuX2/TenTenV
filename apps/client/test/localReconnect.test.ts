import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { PeerDescriptor } from '@tentenv/protocol'

Object.defineProperty(globalThis, 'window', { configurable: true, value: new EventTarget() })
const { LocalTransport } = await import('../src/net/local')

const waitFor = async (ready: () => boolean, timeout = 6500) => {
  const deadline = Date.now() + timeout
  while (!ready()) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for local peer recovery')
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}

test('a tab whose heartbeat timed out is discovered again when it resumes', async () => {
  const room = `local-reconnect-${Math.random()}`
  const a = new LocalTransport(room, { id: 'a', displayName: 'A', iconUrl: null, status: 'online', statusText: '' })
  const b = new BroadcastChannel(`ttv-dev:${room}`)
  const peer: PeerDescriptor = {
    peerId: 'local-revived',
    user: { id: 'b', displayName: 'B', iconUrl: null, status: 'online', statusText: '' },
    joinedAt: Date.now(), hostScore: 1, ticket: '',
  }
  const received: unknown[] = []
  const events: string[] = []
  b.onmessage = (event) => received.push(event.data)
  const off = a.onPeers((event) => events.push(`${event.kind}:${event.peerId}`))
  try {
    b.postMessage({ k: 'hello', from: peer, reply: false })
    await waitFor(() => a.link(peer.peerId) === 'p2p')
    await waitFor(() => a.link(peer.peerId) === 'lost')
    const before = received.length
    b.postMessage({ k: 'beat', from: peer.peerId })
    await waitFor(() => received.slice(before).some((wire) => (wire as { k?: string; reply?: boolean }).k === 'hello' && (wire as { reply?: boolean }).reply === false))
    b.postMessage({ k: 'hello', from: peer, reply: true })
    await waitFor(() => a.link(peer.peerId) === 'p2p')
    assert.deepEqual(events, [`join:${peer.peerId}`, `link:${peer.peerId}`, `leave:${peer.peerId}`, `join:${peer.peerId}`, `link:${peer.peerId}`])
  } finally {
    off()
    a.close()
    b.close()
  }
})
