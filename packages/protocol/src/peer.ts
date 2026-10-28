// 参加者どうし（P2P のデータチャネル、または親サーバーの中継）でやり取りするメッセージ
import type { HandGesture } from './models'

export const PEER_PROTOCOL = 1

/** アバターの指定。builtin は同梱の標準アバター */
export type AvatarRef =
  | { kind: 'builtin'; id: string; color: string; scale: number; outfits?: string[] }
  | { kind: 'vrm'; id: string; url: string; sha256: string; scale: number; outfits?: string[] }

/** 信頼性ありのチャネル（JSON）。サイズ上限は PEER_MESSAGE_LIMIT */
export type PeerMessage =
  | {
      t: 'hello'
      v: number
      ticket: string
      avatar: AvatarRef
      /** 接触を許す相手（古い版は boolean） */
      allowContact: boolean | 'everyone' | 'friends' | 'nobody'
      hostScore: number
      /** すでに同期状態を持っていれば、その世代（ホスト移譲の判断に使う） */
      stateEpoch: number
    }
  | { t: 'avatar'; avatar: AvatarRef }
  | { t: 'expr'; weights: Record<string, number>; gesture: [HandGesture, HandGesture] }
  | { t: 'chat'; id: string; text: string }
  | { t: 'typing'; on: boolean }
  /** 同期状態の更新要求（ホストへ） */
  | { t: 'set'; key: string; value: unknown; nonce: number }
  /** 同期状態の確定（ホストから全員へ） */
  | { t: 'state'; key: string; value: unknown; rev: number; by: string; nonce?: number }
  /** 同期状態の一覧（ホストから新しい参加者へ・ホスト移譲直後） */
  | { t: 'snapshot'; epoch: number; host: string; entries: [string, unknown, number, string][] }
  | { t: 'reject'; key: string; nonce: number; reason: string }
  /** ワールドのイベント（送り手から直接） */
  | { t: 'event'; name: string; payload: unknown; target: 'all' | 'host' | string }
  /** ホストの時計に合わせる（親サーバーが使えないとき） */
  | { t: 'tping'; c: number }
  | { t: 'tpong'; c: number; h: number }
  /** 接触（[43]）。相手に触れた部位 */
  | { t: 'touch'; part: string; strength: number }
  | { t: 'bye' }

export const PEER_MESSAGE_LIMIT = 64 * 1024

export const isPeerMessage = (m: unknown): m is PeerMessage =>
  typeof m === 'object' && m !== null && typeof (m as { t?: unknown }).t === 'string'

// ---------- 姿勢（信頼性なしのチャネル、バイナリ） ----------

export const enum PoseFlag {
  VR = 1 << 0,
  Grounded = 1 << 1,
  Crouch = 1 << 2,
  Prone = 1 << 3,
  Sitting = 1 << 4,
  HandTracking = 1 << 5,
  Fingers = 1 << 6,
  Trackers = 1 << 7,
  Talking = 1 << 8,
  Muted = 1 << 9,
  Jumping = 1 << 10,
  Flying = 1 << 11,
  Seated = 1 << 12,
}

export const enum SleepPose {
  None = 0,
  Supine = 1,
  Prone = 2,
  Left = 3,
  Right = 4,
  Relax = 5,
}

export interface Vec3 { x: number; y: number; z: number }
export interface Quat { x: number; y: number; z: number; w: number }
export interface TrackedPoint { p: Vec3; q: Quat }

export interface PoseFrame {
  seq: number
  /** 送信側の共有時計（ms）の下位 32 ビット */
  time: number
  flags: number
  sleep: SleepPose
  /** 足元の位置（ワールド座標） */
  root: Vec3
  /** 体の向き（ラジアン） */
  yaw: number
  /** 移動速度（m/s）とローカルの移動方向（-1〜1） */
  speed: number
  moveX: number
  moveZ: number
  /** 頭と両手（root からの相対位置、ワールドの向き） */
  head: TrackedPoint
  left: TrackedPoint
  right: TrackedPoint
  /** 指の曲がり 0〜1：左の親指〜小指、右の親指〜小指 */
  fingers?: number[]
  /** 腰・左足・右足（root からの相対位置） */
  trackers?: [TrackedPoint, TrackedPoint, TrackedPoint]
}

const POSE_TYPE = 1
const OBJECT_TYPE = 2

const writeVecMm = (v: DataView, o: number, p: Vec3) => {
  v.setInt16(o, clampI16(p.x * 1000), true)
  v.setInt16(o + 2, clampI16(p.y * 1000), true)
  v.setInt16(o + 4, clampI16(p.z * 1000), true)
  return o + 6
}
const readVecMm = (v: DataView, o: number): Vec3 => ({ x: v.getInt16(o, true) / 1000, y: v.getInt16(o + 2, true) / 1000, z: v.getInt16(o + 4, true) / 1000 })
const writeQuat = (v: DataView, o: number, q: Quat) => {
  // 正規化してから w >= 0 にそろえる
  let { x, y, z, w } = q
  const n = Math.hypot(x, y, z, w) || 1
  const s = w < 0 ? -1 / n : 1 / n
  x *= s; y *= s; z *= s; w *= s
  v.setInt16(o, Math.round(x * 32767), true)
  v.setInt16(o + 2, Math.round(y * 32767), true)
  v.setInt16(o + 4, Math.round(z * 32767), true)
  v.setInt16(o + 6, Math.round(w * 32767), true)
  return o + 8
}
const readQuat = (v: DataView, o: number): Quat => {
  const x = v.getInt16(o, true) / 32767, y = v.getInt16(o + 2, true) / 32767, z = v.getInt16(o + 4, true) / 32767, w = v.getInt16(o + 6, true) / 32767
  const n = Math.hypot(x, y, z, w)
  // 全部 0（送り手が長さ 0 の回転を送った）なら回転なしとして扱う。(0,0,0,0) のままだと受け手の計算が壊れる
  if (n < 1e-6) return { x: 0, y: 0, z: 0, w: 1 }
  return { x: x / n, y: y / n, z: z / n, w: w / n }
}
const clampI16 = (n: number) => Math.max(-32768, Math.min(32767, Math.round(n)))
const finite = (n: number) => Number.isFinite(n)
/** 位置として受け付ける座標の大きさの上限（m）。姿勢と共有オブジェクトで同じ値を使う */
const MAX_COORD = 1e5
const validCoord = (p: Vec3) => finite(p.x) && finite(p.y) && finite(p.z) && Math.abs(p.x) <= MAX_COORD && Math.abs(p.y) <= MAX_COORD && Math.abs(p.z) <= MAX_COORD

const BASE_SIZE = 1 + 1 + 2 + 2 + 4 + 12 + 2 + 1 + 1 + 1 + 14 * 3
export const encodePose = (f: PoseFrame): ArrayBuffer => {
  const hasF = !!f.fingers && f.fingers.length === 10
  const hasT = !!f.trackers
  let flags = f.flags & ~(PoseFlag.Fingers | PoseFlag.Trackers)
  if (hasF) flags |= PoseFlag.Fingers
  if (hasT) flags |= PoseFlag.Trackers
  const size = BASE_SIZE + (hasF ? 10 : 0) + (hasT ? 14 * 3 : 0)
  const buf = new ArrayBuffer(size)
  const v = new DataView(buf)
  let o = 0
  v.setUint8(o++, POSE_TYPE)
  v.setUint8(o++, f.sleep)
  v.setUint16(o, f.seq & 0xffff, true); o += 2
  v.setUint16(o, flags & 0xffff, true); o += 2
  v.setUint32(o, f.time >>> 0, true); o += 4
  v.setFloat32(o, f.root.x, true); v.setFloat32(o + 4, f.root.y, true); v.setFloat32(o + 8, f.root.z, true); o += 12
  v.setInt16(o, clampI16((normAngle(f.yaw) / Math.PI) * 32767), true); o += 2
  v.setUint8(o++, Math.max(0, Math.min(255, Math.round(f.speed * 25))))
  v.setInt8(o++, Math.max(-127, Math.min(127, Math.round(f.moveX * 127))))
  v.setInt8(o++, Math.max(-127, Math.min(127, Math.round(f.moveZ * 127))))
  for (const t of [f.head, f.left, f.right]) o = writeQuat(v, writeVecMm(v, o, t.p), t.q)
  if (hasF) for (const c of f.fingers!) v.setUint8(o++, Math.max(0, Math.min(255, Math.round(c * 255))))
  if (hasT) for (const t of f.trackers!) o = writeQuat(v, writeVecMm(v, o, t.p), t.q)
  return buf
}

/** 壊れたデータ・範囲外の値なら null */
export const decodePose = (buf: ArrayBuffer): PoseFrame | null => {
  if (buf.byteLength < BASE_SIZE || buf.byteLength > 256) return null
  const v = new DataView(buf)
  let o = 0
  if (v.getUint8(o++) !== POSE_TYPE) return null
  const sleep = v.getUint8(o++)
  if (sleep > 5) return null
  const seq = v.getUint16(o, true); o += 2
  const flags = v.getUint16(o, true); o += 2
  const time = v.getUint32(o, true); o += 4
  const root = { x: v.getFloat32(o, true), y: v.getFloat32(o + 4, true), z: v.getFloat32(o + 8, true) }; o += 12
  if (!validCoord(root)) return null
  const yaw = (v.getInt16(o, true) / 32767) * Math.PI; o += 2
  const speed = v.getUint8(o++) / 25
  const moveX = v.getInt8(o++) / 127
  const moveZ = v.getInt8(o++) / 127
  const pts: TrackedPoint[] = []
  for (let i = 0; i < 3; i++) {
    const p = readVecMm(v, o); o += 6
    const q = readQuat(v, o); o += 8
    pts.push({ p, q })
  }
  const hasF = (flags & PoseFlag.Fingers) !== 0
  const hasT = (flags & PoseFlag.Trackers) !== 0
  if (buf.byteLength !== BASE_SIZE + (hasF ? 10 : 0) + (hasT ? 42 : 0)) return null
  let fingers: number[] | undefined
  if (hasF) {
    fingers = []
    for (let i = 0; i < 10; i++) fingers.push(v.getUint8(o++) / 255)
  }
  let trackers: [TrackedPoint, TrackedPoint, TrackedPoint] | undefined
  if (hasT) {
    const t: TrackedPoint[] = []
    for (let i = 0; i < 3; i++) {
      const p = readVecMm(v, o); o += 6
      const q = readQuat(v, o); o += 8
      t.push({ p, q })
    }
    trackers = t as [TrackedPoint, TrackedPoint, TrackedPoint]
  }
  return { seq, time, flags, sleep, root, yaw, speed, moveX, moveZ, head: pts[0], left: pts[1], right: pts[2], fingers, trackers }
}

const normAngle = (a: number) => {
  let r = a % (Math.PI * 2)
  if (r > Math.PI) r -= Math.PI * 2
  if (r < -Math.PI) r += Math.PI * 2
  return r
}

// ---------- 共有オブジェクトの位置（つかんでいる物・物理演算の物） ----------

export interface ObjectPose {
  /** オブジェクト ID の 32 ビットハッシュ（objectHash） */
  hash: number
  p: Vec3
  q: Quat
  /** 速度（受け手の予測用） */
  vel: Vec3
}

export const objectHash = (id: string) => {
  // FNV-1a
  let h = 0x811c9dc5
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

const OBJ_SIZE = 4 + 12 + 8 + 6
export const encodeObjects = (time: number, list: ObjectPose[]): ArrayBuffer => {
  const n = Math.min(list.length, 32)
  const buf = new ArrayBuffer(1 + 1 + 4 + n * OBJ_SIZE)
  const v = new DataView(buf)
  v.setUint8(0, OBJECT_TYPE)
  v.setUint8(1, n)
  v.setUint32(2, time >>> 0, true)
  let o = 6
  for (let i = 0; i < n; i++) {
    const it = list[i]
    v.setUint32(o, it.hash >>> 0, true); o += 4
    v.setFloat32(o, it.p.x, true); v.setFloat32(o + 4, it.p.y, true); v.setFloat32(o + 8, it.p.z, true); o += 12
    o = writeQuat(v, o, it.q)
    v.setInt16(o, clampI16(it.vel.x * 100), true); v.setInt16(o + 2, clampI16(it.vel.y * 100), true); v.setInt16(o + 4, clampI16(it.vel.z * 100), true); o += 6
  }
  return buf
}
export const decodeObjects = (buf: ArrayBuffer): { time: number; list: ObjectPose[] } | null => {
  if (buf.byteLength < 6) return null
  const v = new DataView(buf)
  if (v.getUint8(0) !== OBJECT_TYPE) return null
  const n = v.getUint8(1)
  if (n > 32 || buf.byteLength !== 6 + n * OBJ_SIZE) return null
  const time = v.getUint32(2, true)
  const list: ObjectPose[] = []
  let o = 6
  for (let i = 0; i < n; i++) {
    const hash = v.getUint32(o, true); o += 4
    const p = { x: v.getFloat32(o, true), y: v.getFloat32(o + 4, true), z: v.getFloat32(o + 8, true) }; o += 12
    if (!validCoord(p)) return null
    const q = readQuat(v, o); o += 8
    const vel = { x: v.getInt16(o, true) / 100, y: v.getInt16(o + 2, true) / 100, z: v.getInt16(o + 4, true) / 100 }; o += 6
    list.push({ hash, p, q, vel })
  }
  return { time, list }
}

export const binaryType = (buf: ArrayBuffer) => (buf.byteLength > 0 ? new DataView(buf).getUint8(0) : 0)
export const BINARY_POSE = POSE_TYPE
export const BINARY_OBJECTS = OBJECT_TYPE
/** 中継で送る声（Opus）: [3][連番 u16][Opus のデータ] */
export const BINARY_VOICE = 3
/** 中継でつながっている相手への画面共有の映像（WebCodecs で符号化した断片） */
export const BINARY_SCREEN = 4
/** 画面共有の映像の断片 1 つの大きさの上限（ヘッダーを含む） */
export const SCREEN_FRAGMENT_BYTES = 16 * 1024

/** 中継（WebSocket は文字列）のためにバイナリを文字列にする */
export const binToStr = (buf: ArrayBuffer) => {
  const b = new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i])
  return btoa(s)
}
export const strToBin = (s: string): ArrayBuffer | null => {
  try {
    const d = atob(s)
    const out = new Uint8Array(d.length)
    for (let i = 0; i < d.length; i++) out[i] = d.charCodeAt(i)
    return out.buffer
  } catch {
    return null
  }
}
