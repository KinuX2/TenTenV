// サーバーの Ed25519 鍵。初回起動時に作り、keys/ に保存する
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign, type KeyObject } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { b64urlEncode, type TicketPayload } from '@tentenv/protocol'
import { encodeTicket } from './ticket'

export interface ServerKeys {
  privateKey: KeyObject
  /** SPKI DER の base64url */
  publicKey: string
  serverId: string
}

export const loadKeys = (dir: string): ServerKeys => {
  mkdirSync(dir, { recursive: true })
  const file = join(dir, 'ed25519.pem')
  if (!existsSync(file)) {
    const { privateKey } = generateKeyPairSync('ed25519')
    writeFileSync(file, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 })
  }
  const privateKey = createPrivateKey(readFileSync(file))
  const der = createPublicKey(privateKey).export({ type: 'spki', format: 'der' })
  const pub = b64urlEncode(new Uint8Array(der))
  writeFileSync(join(dir, 'ed25519.pub'), pub + '\n')
  const serverId = b64urlEncode(new Uint8Array(createHash('sha256').update(der).digest())).slice(0, 22)
  return { privateKey, publicKey: pub, serverId }
}

export const TICKET_TTL = 6 * 60 * 60 * 1000

export const issueTicket = (keys: ServerKeys, p: Omit<TicketPayload, 'v' | 'sid' | 'iat' | 'exp'>) => {
  const now = Date.now()
  const payload: TicketPayload = { v: 1, sid: keys.serverId, iid: p.iid, uid: p.uid, pid: p.pid, name: p.name, role: p.role, iat: now, exp: now + TICKET_TTL }
  return encodeTicket(payload, (data) => new Uint8Array(sign(null, data, keys.privateKey)))
}
