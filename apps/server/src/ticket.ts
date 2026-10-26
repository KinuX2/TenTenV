// 参加チケット: base64url(JSON の TicketPayload) + "." + base64url(Ed25519 署名)
// 署名の対象は前半の base64url 文字列そのもの（ASCII のバイト列）。
// verifyTicket は WebCrypto だけで書いてあるので、ブラウザ（クライアント）でも同じ処理を使える
import { b64urlDecode, b64urlEncode, splitTicket, type TicketPayload } from '@tentenv/protocol'

export interface VerifyOptions {
  /** 現在時刻（UNIX ms） */
  now?: number
  /** 期待する発行元の serverId */
  serverId?: string
  /** 期待するインスタンス ID */
  instanceId?: string
}

const keyCache = new Map<string, Promise<CryptoKey>>()

const importKey = (publicKeyB64url: string) => {
  let k = keyCache.get(publicKeyB64url)
  if (!k) {
    k = crypto.subtle.importKey('spki', b64urlDecode(publicKeyB64url) as BufferSource, { name: 'Ed25519' }, false, ['verify'])
    keyCache.set(publicKeyB64url, k)
    k.catch(() => keyCache.delete(publicKeyB64url))
  }
  return k
}

const isPayload = (p: unknown): p is TicketPayload => {
  if (!p || typeof p !== 'object') return false
  const x = p as Record<string, unknown>
  return (
    x.v === 1 &&
    typeof x.sid === 'string' &&
    typeof x.iid === 'string' &&
    typeof x.uid === 'string' &&
    typeof x.pid === 'string' &&
    typeof x.name === 'string' &&
    (x.role === 'owner' || x.role === 'moderator' || x.role === 'member') &&
    typeof x.iat === 'number' &&
    typeof x.exp === 'number'
  )
}

/** 署名・形・有効期限を確かめ、正しければ中身を返す。だめなら null */
export const verifyTicket = async (ticket: string, publicKeyB64url: string, opts: VerifyOptions = {}): Promise<TicketPayload | null> => {
  if (typeof ticket !== 'string' || ticket.length > 4096) return null
  const parts = splitTicket(ticket)
  if (!parts || !parts.body || !parts.sig) return null
  try {
    const key = await importKey(publicKeyB64url)
    const ok = await crypto.subtle.verify('Ed25519', key, b64urlDecode(parts.sig) as BufferSource, new TextEncoder().encode(parts.body))
    if (!ok) return null
    const payload: unknown = JSON.parse(new TextDecoder().decode(b64urlDecode(parts.body)))
    if (!isPayload(payload)) return null
    const now = opts.now ?? Date.now()
    if (payload.exp <= now || payload.iat > now + 5 * 60_000) return null
    if (opts.serverId !== undefined && payload.sid !== opts.serverId) return null
    if (opts.instanceId !== undefined && payload.iid !== opts.instanceId) return null
    return payload
  } catch {
    return null
  }
}

/** チケットを作る（署名関数は呼び出し側から渡す。サーバーでは node:crypto を使う） */
export const encodeTicket = (payload: TicketPayload, sign: (data: Uint8Array) => Uint8Array) => {
  const body = b64urlEncode(new TextEncoder().encode(JSON.stringify(payload)))
  return `${body}.${b64urlEncode(sign(new TextEncoder().encode(body)))}`
}
