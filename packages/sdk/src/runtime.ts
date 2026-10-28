// ワールドとクライアントのあいだの約束。クライアント（または開発用の実行環境）がこれを実装して
// <WorldRuntimeProvider> で渡す。ワールドのコードはフック・部品を通してだけ使う
import { createContext, useContext } from 'react'
import type { AudioListener, Object3D, Vector3Tuple } from 'three'
import type { InstanceInfo, SharedFileInfo, WorldInfo, WorldSummary } from '@tentenv/protocol'
import type { AvatarBones, AvatarMotionApi, QuaternionTuple } from './motion'

export type DeviceKind = 'desktop' | 'mobile' | 'vr'
export type Unsubscribe = () => void

export interface PlayerInfo {
  /** ユーザー ID（同じ人なら入り直しても同じ） */
  userId: string
  /** 接続 ID（このインスタンスにいるあいだだけ有効） */
  peerId: string
  displayName: string
  iconUrl: string | null
  isLocal: boolean
  isHost: boolean
  isGuest: boolean
  /** インスタンスの作成者・モデレーター */
  role: 'owner' | 'moderator' | 'member'
  device: DeviceKind
}

export interface PlayerPose {
  /** 足元 */
  position: Vector3Tuple
  /** 体の向き（ラジアン） */
  yaw: number
  head: Vector3Tuple
  leftHand: Vector3Tuple
  rightHand: Vector3Tuple
  /** 頭（視点）の向き。ワールドの座標の回転 [x, y, z, w]。正面は -Z */
  headRotation: QuaternionTuple
  /**
   * 手の向き（VR はコントローラーの握り・ハンドトラッキングの手首、ワールドの座標）。
   * 手を追跡していないとき（PC・スマホ）は頭の向きと同じ
   */
  leftHandRotation: QuaternionTuple
  rightHandRotation: QuaternionTuple
  /** 手の位置・向きが VR で追跡されているか */
  handsTracked: boolean
  /** アバターの身長と目の高さ（m） */
  height: number
  eyeHeight: number
  grounded: boolean
  sitting: boolean
  velocity: Vector3Tuple
}

export interface ClickSpec {
  label?: string
  enabled?: boolean
  /** VR の指先が触れただけで押せるか（既定: true） */
  poke?: boolean
  /** 届く距離（m） */
  reach?: number
  onClick: (e: { peerId: string; hand: 'left' | 'right' | 'none'; point: Vector3Tuple }) => void
  /** VR で手を近づけたとき（任意） */
  onHover?: (hovered: boolean) => void
}

export interface PickupSpec {
  id: string
  label?: string
  /** 物理演算で動かす（離すと落ちる・投げられる） */
  physics: boolean
  /** つかむ位置の向きを保つか、手の向きに合わせるか */
  orientation: 'keep' | 'grip'
  throwable: boolean
  onGrab?: (by: PlayerInfo) => void
  onDrop?: (by: PlayerInfo) => void
  /** つかんでいる人がトリガー（使う）を押したとき */
  onUse?: (by: PlayerInfo) => void
  /** 持ったまま「使う」を押した／離したとき。手放した場合も false が届く */
  onUseChange?: (pressed: boolean, by: PlayerInfo) => void
}

export interface PickupHandle {
  /** 今つかんでいる人（peerId） */
  holder: () => string | null
  /** この端末で持っている物の「使う」が押されているか */
  isUsing: () => boolean
  drop: () => void
  /** 位置を全員で合わせ直す */
  reset: (position: Vector3Tuple, quaternion?: [number, number, number, number]) => void
}

export interface SeatSpec {
  id: string
  label?: string
  /** 立ち上がったときの位置（座席から見て前・右・上、m） */
  exit?: { forward?: number; right?: number; up?: number }
  /** 座っている間の移動入力を受け取る（乗り物など） */
  onInput?: (input: { forward: number; right: number; up: number }) => void
  onEnter?: (player: PlayerInfo) => void
  onLeave?: (player: PlayerInfo) => void
}

export interface SeatHandle {
  occupant: () => string | null
  /** 自分を座らせる・立たせる */
  sit: () => void
  stand: () => void
}

export interface FileRequest {
  accept?: string
  multiple?: boolean
  maxBytes?: number
  onPick: (files: File[]) => void
  onCancel?: () => void
  onError?: (e: { kind: 'too_large' | 'wrong_type'; message: string }) => void
}

export interface ConfirmRequest {
  title?: string
  message: string
  okLabel?: string
  cancelLabel?: string
}

export interface PromptRequest {
  title?: string
  message?: string
  initial?: string
  maxLength?: number
  multiline?: boolean
}

export interface ClockState {
  /** インスタンス全体で共通の時刻（ms） */
  now: () => number
  synced: boolean
  /** 推定誤差の上限（ms） */
  uncertainty: number
  /** 時刻が飛んだ回数（同期し直したとき） */
  jumps: number
}

export interface InstanceFilesApi {
  list: () => Promise<SharedFileInfo[]>
  upload: (file: File, opts?: { description?: string; meta?: Record<string, string>; onProgress?: (ratio: number) => void }) => Promise<SharedFileInfo>
  update: (id: string, changes: { fileName?: string; description?: string | null; meta?: Record<string, string> | null; locked?: boolean }) => Promise<SharedFileInfo>
  remove: (id: string) => Promise<void>
}

export interface KvStore {
  get: (key: string) => Promise<unknown>
  list: () => Promise<{ key: string; value: unknown }[]>
  set: (key: string, value: unknown) => Promise<void>
  increment: (key: string, delta: number) => Promise<number>
  remove: (key: string) => Promise<void>
}

export interface WorldStoreApi {
  /** ワールド全体で 1 つ */
  shared: KvStore
  /** プレイヤーごと（自分の分だけ書ける。読むときは userId で他人の分も） */
  player: KvStore & { read: (userId: string, key: string) => Promise<unknown> }
}

export interface MediaApi {
  /** 許可されたドメインか（動画・画像・通信） */
  isAllowed: (url: string) => boolean
  /** 許可されたドメインにだけ送れる fetch */
  fetch: (url: string, init?: RequestInit) => Promise<Response>
}

export interface ScreenShareApi {
  /** Call directly from a user action; the browser asks which screen or window to share. */
  /** audio: false で画面の音を送らない（既定では、ブラウザーの選択画面で音声の共有を選べる） */
  start: (options?: { frameRate?: number; audio?: boolean }) => Promise<void>
  stop: () => void
  isSharing: () => boolean
  ownerId: () => string | null
  /** The live video element for the active share, or null when unavailable. */
  video: () => HTMLVideoElement | null
  /** 共有している人の画面の音。自分が共有しているとき・音を共有していないときは null（古いクライアントにはない） */
  audio?: () => MediaStream | null
  onChange: (cb: () => void) => Unsubscribe
  revision: () => number
}

export interface WorldRuntime {
  /** ワールドのファイルの基準 URL（末尾 /） */
  baseUrl: string
  world: { id: string; name: string }
  instance: { id: string; persistent: boolean }
  /** 開発用の実行環境か */
  dev: boolean
  device: () => DeviceKind
  onDeviceChange: (cb: (d: DeviceKind) => void) => Unsubscribe

  // ---- 同期 ----
  self: () => PlayerInfo
  players: () => PlayerInfo[]
  onPlayers: (cb: () => void) => Unsubscribe
  pose: (peerId: string) => PlayerPose | null
  /** 表示しているアバターの骨（遠い・隠した・読み込み中のアバターは null）。描いた直後の値で、useFrame の中で読む */
  avatarBones: (peerId: string) => AvatarBones | null
  avatar: AvatarMotionApi
  hostId: () => string | null
  onHost: (cb: () => void) => Unsubscribe
  state: {
    get: (key: string) => unknown
    has: (key: string) => boolean
    set: (key: string, value: unknown) => void
    subscribe: (key: string, cb: (value: unknown, by: string) => void) => Unsubscribe
  }
  events: {
    emit: (name: string, payload: unknown, target?: 'all' | 'others' | 'host' | string) => void
    on: (name: string, cb: (payload: unknown, from: PlayerInfo) => void) => Unsubscribe
  }
  clock: () => ClockState
  onClock: (cb: () => void) => Unsubscribe

  // ---- 操作 ----
  interact: (obj: Object3D, spec: () => ClickSpec) => Unsubscribe
  pickup: (obj: Object3D, spec: () => PickupSpec) => PickupHandle & { dispose: Unsubscribe }
  seat: (obj: Object3D, spec: () => SeatSpec) => SeatHandle & { dispose: Unsubscribe }
  setSpawn: (position: Vector3Tuple, yaw: number) => Unsubscribe
  teleport: (position: Vector3Tuple, yaw?: number) => void
  respawn: () => void
  /** 他人の音声の音量（0〜2）を、このワールドの中だけ変える（DJ ブースのマイクなど） */
  setVoiceGain: (peerId: string, gain: number | null) => void

  // ---- 移動 ----
  openWorld: (worldId: string) => void
  openInstance: (instanceId: string) => void
  getWorldInfo: (worldId: string) => Promise<WorldInfo>
  getInstanceInfo: (instanceId: string) => Promise<InstanceInfo>
  /** 親サーバーのワールドを探す（ポータルの一覧など） */
  listWorlds: (q: { query?: string; tag?: string; sort?: 'popular' | 'new' | 'recommended'; limit?: number }) => Promise<WorldSummary[]>

  // ---- データ ----
  files: InstanceFilesApi
  store: WorldStoreApi
  media: MediaApi
  screenShare: ScreenShareApi
  pickFile: (req: FileRequest) => void
  confirm: (req: ConfirmRequest) => Promise<boolean>
  prompt: (req: PromptRequest) => Promise<string | null>
  notify: (text: string) => void

  // ---- 音 ----
  audioListener: () => AudioListener
}

export const WorldRuntimeContext = createContext<WorldRuntime | null>(null)
export const WorldRuntimeProvider = WorldRuntimeContext.Provider

export const useRuntime = (): WorldRuntime => {
  const rt = useContext(WorldRuntimeContext)
  if (!rt) throw new Error('TenTenV SDK: ワールドが実行環境の外で描画されました（WorldRuntimeProvider がありません）')
  return rt
}
