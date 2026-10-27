// 親サーバーとの WebSocket（/ws）でやり取りするメッセージ。すべて JSON
import type { AccessLevel, InstanceInfo, NotificationEntry, UserSummary } from './models'

/** P2P 接続の相手。peerId は接続ごと（同じユーザーでも入り直すと変わる） */
export interface PeerDescriptor {
  peerId: string
  user: UserSummary
  /** インスタンスに入った時刻（サーバー時計 ms）。ホストの順番に使う */
  joinedAt: number
  /** ホストを引き受けられる度合い（0 = 辞退）。端末の自己申告 */
  hostScore: number
  ticket: string
  /** どちらかがブロックしている相手。P2P 接続を張らず、互いに見えない */
  hidden?: boolean
}

export interface TicketPayload {
  v: 1
  /** 発行した親サーバーの serverId */
  sid: string
  iid: string
  uid: string
  pid: string
  name: string
  role: 'owner' | 'moderator' | 'member'
  /** 発行時刻・有効期限（UNIX ms） */
  iat: number
  exp: number
}

export type ClientSignal =
  | { t: 'hello'; token: string; protocol: number }
  | { t: 'ping'; id: number; c: number }
  | { t: 'join'; instanceId: string; hostScore: number; queue?: boolean }
  | { t: 'leave' }
  | { t: 'signal'; to: string; data: SignalData }
  /** P2P が使えない相手へ中継してもらう。to が '*' なら自分以外の全員 */
  | { t: 'relay'; to: string; ch: 'r' | 'u'; data: string }
  | { t: 'status'; status: string; statusText?: string }
  /** P2P が張れなかった相手を伝える（サーバーは中継を許可する） */
  | { t: 'p2pfail'; peerId: string }
  | { t: 'kick'; peerId: string; reason: string }
  | { t: 'renew' }

export type SignalData =
  | { kind: 'offer' | 'answer'; sdp: string }
  | { kind: 'ice'; candidate: string; sdpMid: string | null; sdpMLineIndex: number | null }
  | { kind: 'restart' }

export type ServerSignal =
  | { t: 'welcome'; userId: string; serverTime: number }
  | { t: 'pong'; id: number; c: number; s: number }
  | {
      t: 'joined'
      instance: InstanceInfo
      peerId: string
      ticket: string
      peers: PeerDescriptor[]
    }
  | { t: 'queued'; instanceId: string; position: number }
  | { t: 'peer-joined'; peer: PeerDescriptor }
  | { t: 'peer-left'; peerId: string }
  | { t: 'signal'; from: string; data: SignalData }
  | { t: 'relay'; from: string; ch: 'r' | 'u'; data: string }
  | { t: 'ticket'; ticket: string }
  | { t: 'notify'; notification: NotificationEntry }
  | { t: 'friend-status'; user: UserSummary; online: boolean; location: { instanceId: string; worldName: string; access: AccessLevel } | null }
  | { t: 'kicked'; reason: string }
  | { t: 'error'; code: string; message: string }

/** 参加チケット: base64url(JSON) + "." + base64url(Ed25519 署名) */
export const splitTicket = (ticket: string) => {
  const i = ticket.indexOf('.')
  if (i < 0) return null
  return { body: ticket.slice(0, i), sig: ticket.slice(i + 1) }
}

export const b64urlEncode = (bytes: Uint8Array) => {
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
export const b64urlDecode = (str: string) => {
  const s = atob(str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4))
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}
export const decodeTicketPayload = (ticket: string): TicketPayload | null => {
  const p = splitTicket(ticket)
  if (!p) return null
  try {
    return JSON.parse(new TextDecoder().decode(b64urlDecode(p.body))) as TicketPayload
  } catch {
    return null
  }
}
