import assert from 'node:assert/strict'
import { test } from 'node:test'
import { SCREEN_SHARE_KEY, ScreenShareManager } from '../src/world/screenShare'

Object.defineProperty(globalThis, 'window', { configurable: true, value: new EventTarget() })

class FakeTrack extends EventTarget {
  kind = 'video'
  muted = false
  readyState: 'live' | 'ended' = 'live'
  stop() { this.readyState = 'ended' }
}

const track = new FakeTrack()
const stream = { getVideoTracks: () => [track], getAudioTracks: () => [], getTracks: () => [track] } as unknown as MediaStream
const makeVideo = () => Object.assign(new EventTarget(), {
  muted: false, autoplay: false, playsInline: false, srcObject: null as MediaStream | null,
  videoWidth: 1920, videoHeight: 1080,
  play: async () => {}, pause: () => {},
}) as unknown as HTMLVideoElement
Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: (tag: string) => tag === 'video' ? makeVideo() : null } })
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: { getDisplayMedia: async () => stream } } })

const { LocalTransport } = await import('../src/net/local')
const { InstanceSession } = await import('../src/net/session')

const waitFor = async (ready: () => boolean) => {
  const deadline = Date.now() + 3000
  while (!ready()) {
    if (Date.now() > deadline) throw new Error('Screen share state did not synchronize')
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

test('screen capture claims the shared screen, reaches late joiners, and ends with the capture track', async () => {
  const room = `screen-share-${Math.random()}`
  const avatar = { kind: 'builtin' as const, id: 'akane', color: '#6ea8ff', scale: 1 }
  const sessions: InstanceType<typeof InstanceSession>[] = []
  const make = (name: string, score: number) => {
    const transport = new LocalTransport(room, { id: name, displayName: name, iconUrl: null, status: 'online', statusText: '' })
    const session = new InstanceSession({ transport, serverKey: null, serverId: null, instanceId: room, serverClock: null, avatar, allowContact: 'everyone', hostScore: score })
    sessions.push(session)
    return session
  }
  let manager: ScreenShareManager | null = null
  try {
    const host = make('host', 1)
    manager = new ScreenShareManager(host)
    await manager.start()
    assert.equal(manager.isSharing(), true)
    assert.equal(manager.video()?.srcObject, stream)
    const peer = make('peer', 0)
    await waitFor(() => (peer.get(SCREEN_SHARE_KEY) as { owner?: string } | undefined)?.owner === host.selfId)
    const late = make('late', 0)
    await waitFor(() => (late.get(SCREEN_SHARE_KEY) as { owner?: string } | undefined)?.owner === host.selfId)
    peer.set(SCREEN_SHARE_KEY, { owner: peer.selfId, startedAt: Date.now() })
    await new Promise((resolve) => setTimeout(resolve, 80))
    assert.equal((peer.get(SCREEN_SHARE_KEY) as { owner: string }).owner, host.selfId)
    track.dispatchEvent(new Event('ended'))
    await waitFor(() => peer.get(SCREEN_SHARE_KEY) == null && late.get(SCREEN_SHARE_KEY) == null)
    assert.equal(manager.isSharing(), false)
    assert.equal(track.readyState, 'ended')
  } finally {
    manager?.dispose()
    for (const session of sessions) session.close()
  }
})
