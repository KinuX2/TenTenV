import { Emitter } from '../net/transport'
import { ScreenRelay } from '../net/screenRelay'
import { ScreenAudio, screenAudioSupported } from '../net/screenAudio'
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

/** 中継で受けた映像は、WebRTC の映像と別のキーで持つ */
const relayKey = (peerId: string) => `relay:${peerId}`

/**
 * One live screen per instance. Capturing always goes through the browser's source picker.
 * P2P でつながっている相手には WebRTC の映像、中継でつながっている相手には ScreenRelay（WebCodecs）で届ける
 * 画面の音は ScreenAudio（Opus）で全員に届ける
 */
export class ScreenShareManager {
  private local: MediaStream | null = null
  /** キーは peerId（WebRTC）か relay:peerId（中継） */
  private videos = new Map<string, VideoEntry>()
  private relay: ScreenRelay
  private sound: ScreenAudio | null = null
  /** 受けている画面の音（キーは peerId） */
  private sounds = new Map<string, MediaStream>()
  private changed = new Emitter<[]>()
  private offs: (() => void)[] = []
  private version = 0
  private starting = false
  private disposed = false

  /** audio を渡すと、画面の音も送受信する */
  constructor(private session: InstanceSession, audio?: AudioContext) {
    this.relay = new ScreenRelay(session, () => this.ownerId(), (peerId, stream) => (stream ? this.attach(relayKey(peerId), stream) : this.detach(relayKey(peerId))))
    if (audio) this.sound = new ScreenAudio(session, audio, () => this.ownerId(), (peerId, stream) => {
      if (stream) this.sounds.set(peerId, stream)
      else this.sounds.delete(peerId)
      this.emit()
    })
    this.offs.push(session.subscribe(SCREEN_SHARE_KEY, (value) => {
      if (this.local && (!isScreenShareClaim(value) || value.owner !== session.selfId)) this.stopLocal()
      // 共有している人が変わった・終わったら、中継の受信をやめる
      const owner = isScreenShareClaim(value) ? value.owner : null
      for (const key of [...this.videos.keys()]) if (key.startsWith('relay:') && key !== (owner && relayKey(owner))) this.relay.drop(key.slice('relay:'.length))
      for (const id of this.sound?.receiving() ?? []) if (id !== owner) this.sound!.drop(id)
      this.emit()
    }))
    this.offs.push(session.t.onRemoteVideo((peerId, stream) => this.attach(peerId, stream)))
    this.offs.push(session.t.onPeers((ev) => {
      if (ev.kind === 'leave') {
        this.detach(ev.peerId)
        this.relay.drop(ev.peerId)
        this.sound?.drop(ev.peerId)
      } else if (ev.kind === 'link') this.emit()
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
    // 中継でつながっている相手は中継の映像を先に、P2P なら WebRTC の映像を先に使う
    const keys = owner === this.session.selfId ? [owner] : this.session.t.link(owner) === 'relay' ? [relayKey(owner), owner] : [owner, relayKey(owner)]
    for (const key of keys) {
      const entry = this.videos.get(key)
      const track = entry?.stream.getVideoTracks()[0]
      if (track?.readyState === 'live' && !track.muted) return entry!.video
    }
    return null
  }

  /** 共有している人の画面の音（自分が共有しているとき・音がないときは null） */
  audio = () => {
    const owner = this.ownerId()
    return owner && owner !== this.session.selfId ? (this.sounds.get(owner) ?? null) : null
  }

  private attach(key: string, stream: MediaStream) {
    if (this.disposed || this.videos.get(key)?.stream === stream) return
    this.detach(key)
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
    this.videos.set(key, {
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

  private detach(key: string) {
    const entry = this.videos.get(key)
    if (!entry) return
    entry.dispose()
    this.videos.delete(key)
    this.emit()
  }

  start = async (options: { frameRate?: number; audio?: boolean } = {}) => {
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
      // 音はブラウザーの選択画面で「音声も共有」を選んだときだけ付く（画面の音を送れない環境では聞かない）
      // restrictOwnAudio: 画面全体の音から、このタブの音（ボイスチャットの声）を除く（対応していないブラウザーは無視する）
      const audio = options.audio !== false && !!this.sound && screenAudioSupported()
      const stream = await capture.call(navigator.mediaDevices, { video: { frameRate }, audio: audio ? { restrictOwnAudio: true } : false, ...(audio ? { systemAudio: 'include' } : {}) } as DisplayMediaStreamOptions)
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
      // 中継でつながっている相手へは WebCodecs で送る（相手がいるあいだだけ符号化する）
      const own = this.videos.get(this.session.selfId)
      if (own) this.relay.startSending(own.video, frameRate)
      const sound = stream.getAudioTracks()[0]
      if (sound) void this.sound?.setTrack(sound)
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
    this.relay.stopSending()
    void this.sound?.setTrack(null)
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
    this.relay.dispose()
    this.sound?.dispose()
    for (const key of [...this.videos.keys()]) this.detach(key)
  }
}
