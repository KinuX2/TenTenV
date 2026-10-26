// WebSocket で受け取るメッセージ（ClientSignal）の厳密な検査。
// 形が違う・知らない種類・長すぎる文字列はすべて拒否し、検査済みの新しいオブジェクトだけを返す
import { LIMITS, PEER_MESSAGE_LIMIT, type ClientSignal, type OnlineStatus, type SignalData } from '@tentenv/protocol'

export const ID_RE = /^[A-Za-z0-9_-]{1,64}$/
export const MAX_SDP = 64 * 1024
/** 中継データ（base64）の上限 */
export const MAX_RELAY_DATA = Math.ceil((PEER_MESSAGE_LIMIT * 4) / 3) + 16
export const STATUSES: readonly OnlineStatus[] = ['online', 'joinme', 'askme', 'busy', 'offline']

export type Parsed = { ok: true; msg: ClientSignal } | { ok: false; error: string }

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v)
const isStr = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isInt = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max
const isId = (v: unknown): v is string => typeof v === 'string' && ID_RE.test(v)

class Bad extends Error {}
const need = (cond: boolean, what: string): void => {
  if (!cond) throw new Bad(what)
}

const signalData = (d: unknown): SignalData => {
  need(isObj(d), 'data がありません')
  const x = d as Obj
  switch (x.kind) {
    case 'offer':
    case 'answer':
      need(isStr(x.sdp, MAX_SDP), 'sdp が正しくありません')
      return { kind: x.kind, sdp: x.sdp as string }
    case 'ice':
      need(isStr(x.candidate, 4096), 'candidate が正しくありません')
      need(x.sdpMid === null || isStr(x.sdpMid, 64), 'sdpMid が正しくありません')
      need(x.sdpMLineIndex === null || isInt(x.sdpMLineIndex, 0, 1024), 'sdpMLineIndex が正しくありません')
      return { kind: 'ice', candidate: x.candidate as string, sdpMid: x.sdpMid as string | null, sdpMLineIndex: x.sdpMLineIndex as number | null }
    case 'restart':
      return { kind: 'restart' }
    default:
      throw new Bad('data.kind が正しくありません')
  }
}

const build = (m: Obj): ClientSignal => {
  switch (m.t) {
    case 'hello':
      need(isStr(m.token, 256), 'token が正しくありません')
      need(isInt(m.protocol, 0, 1_000_000), 'protocol が正しくありません')
      return { t: 'hello', token: m.token as string, protocol: m.protocol as number }
    case 'ping':
      need(isNum(m.id) && Math.abs(m.id as number) <= Number.MAX_SAFE_INTEGER, 'id が正しくありません')
      need(isNum(m.c), 'c が正しくありません')
      return { t: 'ping', id: m.id as number, c: m.c as number }
    case 'join': {
      need(isId(m.instanceId), 'instanceId が正しくありません')
      need(isNum(m.hostScore) && (m.hostScore as number) >= 0 && (m.hostScore as number) <= 1_000_000, 'hostScore が正しくありません')
      need(m.queue === undefined || typeof m.queue === 'boolean', 'queue が正しくありません')
      need(m.relayOnly === undefined || typeof m.relayOnly === 'boolean', 'relayOnly が正しくありません')
      const out: ClientSignal = { t: 'join', instanceId: m.instanceId as string, hostScore: m.hostScore as number }
      if (m.queue !== undefined) out.queue = m.queue as boolean
      if (m.relayOnly !== undefined) out.relayOnly = m.relayOnly as boolean
      return out
    }
    case 'leave':
      return { t: 'leave' }
    case 'signal':
      need(isId(m.to), 'to が正しくありません')
      return { t: 'signal', to: m.to as string, data: signalData(m.data) }
    case 'relay':
      need(m.to === '*' || isId(m.to), 'to が正しくありません')
      need(m.ch === 'r' || m.ch === 'u', 'ch が正しくありません')
      need(isStr(m.data, MAX_RELAY_DATA), 'data が正しくありません')
      return { t: 'relay', to: m.to as string, ch: m.ch as 'r' | 'u', data: m.data as string }
    case 'status':
      need(typeof m.status === 'string' && STATUSES.includes(m.status as OnlineStatus), 'status が正しくありません')
      need(m.statusText === undefined || isStr(m.statusText, LIMITS.statusText), 'statusText が正しくありません')
      return m.statusText === undefined ? { t: 'status', status: m.status as string } : { t: 'status', status: m.status as string, statusText: m.statusText as string }
    case 'p2pfail':
      need(isId(m.peerId), 'peerId が正しくありません')
      return { t: 'p2pfail', peerId: m.peerId as string }
    case 'kick':
      need(isId(m.peerId), 'peerId が正しくありません')
      need(isStr(m.reason, 200), 'reason が正しくありません')
      return { t: 'kick', peerId: m.peerId as string, reason: m.reason as string }
    case 'renew':
      return { t: 'renew' }
    default:
      throw new Bad('知らない種類のメッセージです')
  }
}

export const parseClientSignal = (text: string): Parsed => {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, error: 'JSON を読めません' }
  }
  if (!isObj(raw) || typeof raw.t !== 'string') return { ok: false, error: 'メッセージの形が正しくありません' }
  try {
    return { ok: true, msg: build(raw) }
  } catch (e) {
    if (e instanceof Bad) return { ok: false, error: e.message }
    throw e
  }
}
