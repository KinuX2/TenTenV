// 参加チケットの検証（親サーバーの Ed25519 署名）。親サーバーが止まっていても、手元の公開鍵で確かめられる
import { b64urlDecode, decodeTicketPayload, splitTicket, type TicketPayload } from '@tentenv/protocol'

const keys = new Map<string, Promise<CryptoKey | null>>()
let unsupportedWarned = false

const importKey = (spki: string) => {
  let p = keys.get(spki)
  if (!p) {
    p = crypto.subtle.importKey('spki', b64urlDecode(spki), { name: 'Ed25519' }, false, ['verify']).catch(() => null)
    keys.set(spki, p)
  }
  return p
}

/** 正しければ中身を、そうでなければ null を返す */
export const verifyTicket = async (ticket: string, publicKey: string): Promise<TicketPayload | null> => {
  const parts = splitTicket(ticket)
  const payload = decodeTicketPayload(ticket)
  if (!parts || !payload) return null
  const key = await importKey(publicKey)
  if (!key) {
    // Ed25519 に対応していない古いブラウザ: 相手の一覧は親サーバーから受け取っているので、それを信じる
    if (!unsupportedWarned) console.warn('[ticket] このブラウザは Ed25519 の検証に対応していません')
    unsupportedWarned = true
    return payload
  }
  try {
    const ok = await crypto.subtle.verify({ name: 'Ed25519' }, key, b64urlDecode(parts.sig), new TextEncoder().encode(parts.body))
    return ok ? payload : null
  } catch {
    return null
  }
}
