// インスタンスの中での通信の共通の形。WebRTC のメッシュ（本番）と BroadcastChannel（開発用）がある
import type { PeerDescriptor, PeerMessage } from '@tentenv/protocol'

export type LinkState = 'connecting' | 'p2p' | 'relay' | 'lost'

export interface Transport {
  readonly selfId: string
  /** 自分の接続情報（チケットを含む） */
  readonly self: PeerDescriptor
  /** 見えている相手（ブロック関係の相手は含まない） */
  peers(): PeerDescriptor[]
  link(peerId: string): LinkState
  /** to: peerId か '*'（全員） */
  sendR(to: string, msg: PeerMessage): void
  sendU(to: string, buf: ArrayBuffer): void
  onR(cb: (from: string, msg: unknown) => void): () => void
  onU(cb: (from: string, buf: ArrayBuffer) => void): () => void
  onPeers(cb: (ev: { kind: 'join' | 'leave' | 'link'; peerId: string }) => void): () => void
  /** マイクの音（null で止める） */
  setAudioTrack(track: MediaStreamTrack | null): void
  onRemoteAudio(cb: (peerId: string, stream: MediaStream) => void): () => void
  /** Screen capture video is sent over the peer connection when available. */
  setVideoTrack(track: MediaStreamTrack | null): void
  onRemoteVideo(cb: (peerId: string, stream: MediaStream) => void): () => void
  /** 親サーバーにつながっているか */
  serverUp(): boolean
  onServer(cb: (up: boolean) => void): () => void
  /** 往復時間（ms、P2P のときだけわかる） */
  rtt(peerId: string): number | null
  close(): void
}

export class Emitter<T extends unknown[]> {
  private set = new Set<(...a: T) => void>()
  on(f: (...a: T) => void) {
    this.set.add(f)
    return () => {
      this.set.delete(f)
    }
  }
  emit(...a: T) {
    this.set.forEach((f) => {
      try {
        f(...a)
      } catch (e) {
        console.error(e)
      }
    })
  }
}
