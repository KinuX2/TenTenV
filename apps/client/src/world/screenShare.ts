import { Emitter } from '../net/transport'
import type { InstanceSession } from '../net/session'

export const SCREEN_SHARE_KEY = 'sys:screenShare'

export interface ScreenShareClaim {
  owner: string
  startedAt: number
}

export const isScreenShareClaim = (value: unknown): value is ScreenShareClaim => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const v = value as Partial<ScreenShareClaim>
  return typeof v.owner === 'string' && v.owner.length > 0 && v.owner.length <= 120 &&
    typeof v.startedAt === 'number' && Number.isFinite(v.startedAt) && v.startedAt > 0
}

interface VideoEntry {
  video: HTMLVideoElement
  stream: MediaStream
  dispose: () => void
}

/** One live screen per instance. Capturing always goes through the browser's source picker. */
export class ScreenShareManager {
  private local: MediaStream | null = null
  private videos = new Map<string, VideoEntry>()
  private changed = new Emitter<[]>()
  private offs: (() => void)[] = []
  private version = 0
  private starting = false
  private disposed = false

  constructor(private session: InstanceSession) {
    this.offs.push(session.subscribe(SCREEN_SHARE_KEY, (value) => {
      if (this.local && (!isScreenShareClaim(value) || value.owner !== session.selfId)) this.stopLocal()
      this.emit()
    }))
    this.offs.push(session.t.onRemoteVideo((peerId, stream) => this.attach(peerId, stream)))
    this.offs.push(session.t.onPeers((ev) => {
      if (ev.kind === 'leave') this.detach(ev.peerId)
    }))
    this.offs.push(session.membersEv.on(() => this.emit()))
  }

  revision = () => this.version
  onChange = (cb: () => void) => this.changed.on(cb)

  private emit() {
    this.version++
    this.changed.emit()
  }

  ownerId = () => {
    const claim = this.session.get(SCREEN_SHARE_KEY)
    return isScreenShareClaim(claim) && this.session.isPresent(claim.owner) ? claim.owner : null
  }

  isSharing = () => this.local !== null && this.ownerId() === this.session.selfId

  video = () => {
    const owner = this.ownerId()
    if (!owner) return null
    const entry = this.videos.get(owner)
    const track = entry?.stream.getVideoTracks()[0]
    return track?.readyState === 'live' && !track.muted ? entry!.video : null
  }

  private attach(peerId: string, stream: MediaStream) {
    if (this.disposed || this.videos.get(peerId)?.stream === stream) return
    this.detach(peerId)
    const video = document.createElement('video')
    video.muted = true
    video.autoplay = true
    video.playsInline = true
    video.srcObject = stream
    const track = stream.getVideoTracks()[0]
    const update = () => {
      void video.play().catch(() => {})
      this.emit()
    }
    track?.addEventListener('unmute', update)
    track?.addEventListener('mute', update)
    track?.addEventListener('ended', update)
    video.addEventListener('loadedmetadata', update)
    video.addEventListener('resize', update)
    this.videos.set(peerId, {
      video, stream,
      dispose: () => {
        track?.removeEventListener('unmute', update)
        track?.removeEventListener('mute', update)
        track?.removeEventListener('ended', update)
        video.removeEventListener('loadedmetadata', update)
        video.removeEventListener('resize', update)
        video.pause()
        video.srcObject = null
      },
    })
    update()
  }

  private detach(peerId: string) {
    const entry = this.videos.get(peerId)
    if (!entry) return
    entry.dispose()
    this.videos.delete(peerId)
    this.emit()
  }

  start = async (options: { frameRate?: number } = {}) => {
    if (this.disposed) throw new Error('画面共有は終了しています')
    if (this.local || this.starting) return
    const current = this.ownerId()
    if (current && current !== this.session.selfId) throw new Error('ほかの参加者が画面を共有しています')
    const capture = navigator.mediaDevices?.getDisplayMedia
    if (!capture) throw new Error('この環境では画面共有を利用できません')
    this.starting = true
    try {
      // Call directly from the user's click; getDisplayMedia requires transient activation.
      const frameRate = Number.isFinite(options.frameRate) ? Math.max(1, Math.min(30, options.frameRate!)) : 24
      const stream = await capture.call(navigator.mediaDevices, { video: { frameRate }, audio: false })
      const track = stream.getVideoTracks()[0]
      if (!track || this.disposed || (this.ownerId() && this.ownerId() !== this.session.selfId)) {
        stream.getTracks().forEach((t) => t.stop())
        if (!track) throw new Error('画面の映像を取得できませんでした')
        if (this.disposed) throw new Error('画面共有は終了しています')
        throw new Error('ほかの参加者が画面を共有しています')
      }
      this.local = stream
      track.addEventListener('ended', this.stop, { once: true })
      this.attach(this.session.selfId, stream)
      this.session.t.setVideoTrack(track)
      try {
        this.session.set(SCREEN_SHARE_KEY, { owner: this.session.selfId, startedAt: Date.now() })
        if (this.ownerId() !== this.session.selfId) throw new Error('画面共有を開始できませんでした')
      } catch (error) {
        this.stopLocal()
        throw error
      }
      this.emit()
    } finally {
      this.starting = false
    }
  }

  private stopLocal() {
    const stream = this.local
    if (!stream) return
    this.local = null
    stream.getVideoTracks()[0]?.removeEventListener('ended', this.stop)
    this.session.t.setVideoTrack(null)
    this.detach(this.session.selfId)
    stream.getTracks().forEach((t) => t.stop())
    this.emit()
  }

  stop = () => {
    const mine = this.ownerId() === this.session.selfId
    this.stopLocal()
    if (mine) this.session.set(SCREEN_SHARE_KEY, null)
  }

  dispose() {
    this.disposed = true
    this.stop()
    this.offs.forEach((off) => off())
    this.offs = []
    for (const peerId of [...this.videos.keys()]) this.detach(peerId)
  }
}
