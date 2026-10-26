import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { b64urlDecode, b64urlEncode, decodeTicketPayload } from '@tentenv/protocol'
import { issueTicket, loadKeys } from '../src/keys'
import { verifyTicket } from '../src/ticket'

test('参加チケット: 署名の検証・改ざん・期限・発行元', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ttv-keys-'))
  try {
    const keys = loadKeys(dir)
    assert.equal(keys.serverId.length, 22)
    // 2 回目の読み込みでも同じ鍵
    assert.equal(loadKeys(dir).publicKey, keys.publicKey)

    const t = issueTicket(keys, { iid: 'inst1', uid: 'user1', pid: 'peer1', name: 'たろう', role: 'member' })
    const p = await verifyTicket(t, keys.publicKey)
    assert.ok(p)
    assert.equal(p.uid, 'user1')
    assert.equal(p.name, 'たろう')
    assert.equal(p.sid, keys.serverId)
    assert.ok(p.exp - p.iat === 6 * 60 * 60 * 1000)
    assert.deepEqual(decodeTicketPayload(t), p)

    assert.ok(await verifyTicket(t, keys.publicKey, { serverId: keys.serverId, instanceId: 'inst1' }))
    assert.equal(await verifyTicket(t, keys.publicKey, { instanceId: 'other' }), null)
    assert.equal(await verifyTicket(t, keys.publicKey, { serverId: 'someone-else' }), null)
    assert.equal(await verifyTicket(t, keys.publicKey, { now: p.exp + 1 }), null)

    // 中身の書き換え（役割を owner にする）
    const [body, sig] = t.split('.')
    const forged = JSON.parse(new TextDecoder().decode(b64urlDecode(body)))
    forged.role = 'owner'
    const forgedTicket = b64urlEncode(new TextEncoder().encode(JSON.stringify(forged))) + '.' + sig
    assert.equal(await verifyTicket(forgedTicket, keys.publicKey), null)

    // 別のサーバーの鍵では通らない
    const other = loadKeys(join(dir, 'other'))
    assert.equal(await verifyTicket(t, other.publicKey), null)

    // 壊れた入力
    assert.equal(await verifyTicket('', keys.publicKey), null)
    assert.equal(await verifyTicket('abc', keys.publicKey), null)
    assert.equal(await verifyTicket('a.b', keys.publicKey), null)
    assert.equal(await verifyTicket(t, 'not-a-key'), null)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
