// 悪用・取り違え・起動失敗を防ぐ検査（IP の取り方・同時アップロード・容量・非公開ワールド・設定の値）
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { request, type IncomingMessage, type ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Writable } from 'node:stream'
import { after, before, describe, test } from 'node:test'
import { zipSync } from 'fflate'
import { api, buildWorldZip, startServer, testUser, type TestServer } from './helpers'
import { defaultConfig, loadConfig, mergeConfig } from '../src/config'
import { serveClient } from '../src/files'
import { clientIp } from '../src/http'
import { buildManifest, sha256, unpackWorld } from '../src/sdk'
import { worldDir } from '../src/routes/worlds'

const fakeReq = (xff: string | undefined, remote = '10.0.0.1') => ({ headers: xff === undefined ? {} : { 'x-forwarded-for': xff }, socket: { remoteAddress: remote } }) as unknown as IncomingMessage

describe('守りの検査', () => {
  let srv: TestServer
  before(async () => {
    srv = await startServer()
  })
  after(() => srv.close())

  test('X-Forwarded-For は右端（プロキシが足したもの）を使う', () => {
    assert.equal(clientIp(fakeReq('1.2.3.4, 5.6.7.8'), true), '5.6.7.8')
    assert.equal(clientIp(fakeReq('9.9.9.9'), true), '9.9.9.9')
    // 利用者が左側を毎回変えても、同じ IP として数える
    assert.equal(clientIp(fakeReq(`${Math.random()}, 5.6.7.8`), true), '5.6.7.8')
    assert.equal(clientIp(fakeReq('1.2.3.4'), false), '10.0.0.1')
    assert.equal(clientIp(fakeReq(undefined), true), '10.0.0.1')
  })

  test('同時に上げた共有ファイルも上限で止まる', async () => {
    const owner = await testUser(srv, '同時アップロード')
    const w = (await api(srv, 'POST', '/api/worlds', { token: owner.token, raw: buildWorldZip() })).data
    const inst = (await api(srv, 'POST', '/api/instances', { token: owner.token, body: { worldId: w.id, access: 'public' } })).data
    // 上限（200 個）の 1 つ手前まで DB に直接入れる
    for (let i = 0; i < 199; i++) {
      srv.app.db.run(
        "INSERT INTO instance_files (id, instance_id, file_name, content_type, file_size, description, meta, locked, uploaded_by, created_at) VALUES (?, ?, 'f', 'text/plain', 1, NULL, '{}', 0, ?, ?)",
        `fill${i}`,
        inst.id,
        owner.me.id,
        Date.now(),
      )
    }
    // 1 つ目の本文を送り切る前に 2 つ目を送り終える
    const url = new URL(`${srv.url}/api/instances/${inst.id}/files?name=a.txt`)
    const first = new Promise<number>((resolve, reject) => {
      const req = request(url, { method: 'POST', headers: { authorization: `Bearer ${owner.token}`, 'content-length': 4 } }, (res) => {
        res.resume()
        resolve(res.statusCode ?? 0)
      })
      req.on('error', reject)
      req.write('ab')
      setTimeout(async () => {
        const second = await api(srv, 'POST', `/api/instances/${inst.id}/files?name=b.txt`, { token: owner.token, raw: new Uint8Array([1, 2]) })
        assert.equal(second.status, 200, JSON.stringify(second.data))
        req.end('cd')
      }, 100)
    })
    assert.equal(await first, 409)
    assert.equal(srv.app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM instance_files WHERE instance_id = ?', inst.id)!.n, 200)
  })

  test('マニフェストの maxCapacity が数でなくても部屋を作れる', async () => {
    const owner = await testUser(srv, '定員')
    const w = (await api(srv, 'POST', '/api/worlds', { token: owner.token, raw: buildWorldZip() })).data
    const create = () => api(srv, 'POST', '/api/instances', { token: owner.token, body: { worldId: w.id, access: 'public' } })
    for (const [value, capacity] of [['"x"', 16], ['{}', 16], ['2.5', 2], ['-3', 1], ['1000', 40]] as const) {
      srv.app.db.run("UPDATE worlds SET manifest = json_set(manifest, '$.maxCapacity', json(?)) WHERE id = ?", value, w.id)
      const r = await create()
      assert.equal(r.status, 200, `${value}: ${JSON.stringify(r.data)}`)
      assert.equal(r.data.capacity, capacity, value)
      await api(srv, 'DELETE', `/api/instances/${r.data.id}`, { token: owner.token })
    }
  })

  test('非公開ワールドの永続データは見られる人だけが読める', async () => {
    const author = await testUser(srv, '非公開の制作者')
    const other = await testUser(srv, '部外者')
    const w = (await api(srv, 'POST', '/api/worlds', { token: author.token, raw: buildWorldZip() })).data
    const base = `/api/storage/${w.id}`
    assert.equal((await api(srv, 'PUT', `${base}/shared/secret`, { token: author.token, body: { value: 'ひみつ' } })).status, 204)
    assert.equal((await api(srv, 'PUT', `${base}/player/note`, { token: author.token, body: { value: 1 } })).status, 204)
    assert.equal((await api(srv, 'PATCH', `/api/worlds/${w.id}`, { token: author.token, body: { visibility: 'private' } })).status, 200)
    for (const path of [`${base}/shared`, `${base}/shared/secret`, `${base}/player?userId=${author.me.id}`, `${base}/player/note?userId=${author.me.id}`]) {
      assert.equal((await api(srv, 'GET', path, { token: other.token })).status, 404, path)
    }
    assert.deepEqual((await api(srv, 'GET', `${base}/shared/secret`, { token: author.token })).data, { value: 'ひみつ' })
    // 管理者は見られる
    srv.app.config.admins.push(other.me.id)
    try {
      assert.equal((await api(srv, 'GET', `${base}/shared`, { token: other.token })).status, 200)
    } finally {
      srv.app.config.admins.pop()
    }
  })

  test('配信するファイルが読めなくてもサーバーは落ちない', async () => {
    // index.html という名前のフォルダ: stat は通るが、読むとエラーになる
    const root = join(srv.app.config.dataDir, 'client-broken')
    mkdirSync(join(root, 'index.html'), { recursive: true })
    const res = new (class extends Writable {
      writeHead() {
        return this
      }
      override _write(_c: unknown, _e: string, cb: () => void) {
        cb()
      }
    })()
    const closed = new Promise<void>((r) => res.on('close', () => r()))
    serveClient(root, { method: 'GET' } as IncomingMessage, res as unknown as ServerResponse, '/')
    // error を聞いていなければ、ここでプロセスごと落ちる
    await closed
    assert.equal(res.destroyed, true)
  })

  test('壊れた seed のワールドは飛ばして起動する', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ttv-seed-test-'))
    try {
      const enc = new TextEncoder()
      const files: Record<string, Uint8Array> = { 'world.js': enc.encode('export default function World() { return null }\n'), 'assets/sound.mp3': new Uint8Array(16) }
      const hashes = Object.fromEntries(Object.entries(files).map(([k, v]) => [k, sha256(v)]))
      // サムネイルが画像でない（unpackWorld は通るが storePackage で弾かれる）
      const manifest = { ...buildManifest({ name: '壊れた seed', maxCapacity: 8 }, hashes), thumbnail: 'assets/sound.mp3' }
      const bad = zipSync({ ...files, 'world.json': enc.encode(JSON.stringify(manifest)) })
      unpackWorld(bad, { maxBytes: 1024 * 1024 })
      writeFileSync(join(dir, 'bad.ttvw'), bad)
      writeFileSync(join(dir, 'good.ttvw'), buildWorldZip({ name: '正しい seed' }))
      const s = await startServer({ seedDir: dir })
      try {
        const names = s.app.db.all<{ name: string }>('SELECT name FROM worlds').map((r) => r.name)
        assert.deepEqual(names, ['正しい seed'])
      } finally {
        await s.close()
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('アップロード容量（制作者・古い版）', () => {
  const world = (code: string) => buildWorldZip({ code: `export default function World() { return null }\n// ${code}\n` })
  const bytesOf = (zip: Uint8Array) => unpackWorld(zip, { maxBytes: 1024 * 1024 }).totalBytes

  test('管理者が他人のワールドを更新したときは制作者の容量で数える', async () => {
    const small = world('a')
    // 管理者自身の容量なら収まり（0 - 小 + 大）、制作者の容量では収まらない（小 - 小 + 大）大きさ
    const big = buildWorldZip({ code: `export default function World() { return null }\n// ${'x'.repeat(2000)}\n` })
    const s = await startServer({ limits: { uploadBytes: bytesOf(small) + 1000 } })
    try {
      const author = await testUser(s, '制作者')
      const admin = await testUser(s, '管理者')
      s.app.config.admins.push(admin.me.id)
      const w = (await api(s, 'POST', '/api/worlds', { token: author.token, raw: small })).data
      // 管理者の容量は空だが、制作者の容量を超えるので断る
      const r = await api(s, 'PUT', `/api/worlds/${w.id}`, { token: admin.token, raw: big })
      assert.equal(r.status, 413, JSON.stringify(r.data))
      // 収まるものは管理者でも更新でき、管理者の使用量は増えない
      assert.equal((await api(s, 'PUT', `/api/worlds/${w.id}`, { token: admin.token, raw: world('b') })).status, 200)
      assert.equal((await api(s, 'GET', '/api/me/upload-quota', { token: admin.token })).data.usedBytes, 0)
    } finally {
      await s.close()
    }
  })

  test('古い版は容量の残りに収まる分だけ残す', async () => {
    const W = bytesOf(world('v1'))
    // 現在版 1 つと古い版 1 つ分の余裕
    const s = await startServer({ limits: { uploadBytes: Math.floor(W * 2.5) } })
    try {
      const author = await testUser(s, '何度も更新する人')
      const w = (await api(s, 'POST', '/api/worlds', { token: author.token, raw: world('v1') })).data
      for (const v of ['v2', 'v3', 'v4']) assert.equal((await api(s, 'PUT', `/api/worlds/${w.id}`, { token: author.token, raw: world(v) })).status, 200)
      const kept = [1, 2, 3, 4].filter((v) => existsSync(worldDir(s.app, w.id, v)))
      assert.deepEqual(kept, [3, 4])
      assert.equal((await api(s, 'GET', `/api/worlds/${w.id}/export?version=3`, { token: author.token })).status, 200)
      assert.equal((await api(s, 'GET', `/api/worlds/${w.id}/export?version=2`, { token: author.token })).status, 404)
      assert.deepEqual(
        s.app.db.all<{ version: number }>('SELECT version FROM world_versions WHERE world_id = ? ORDER BY version', w.id).map((r) => r.version),
        [3, 4],
      )
    } finally {
      await s.close()
    }
  })
})

describe('設定の読み込み', () => {
  test('0・負の数・小数の上限は無視する', () => {
    const base = defaultConfig('/tmp/x')
    const c = mergeConfig(base, { port: 70000, limits: { uploadBytes: 0, worldBytes: -1, avatarBytes: 1.5, maxInstanceCapacity: 10 }, rateLimits: { authPerMinute: 0, uploadsPerMinute: 5 } })
    assert.equal(c.port, base.port)
    assert.equal(c.limits.uploadBytes, base.limits.uploadBytes)
    assert.equal(c.limits.worldBytes, base.limits.worldBytes)
    assert.equal(c.limits.avatarBytes, base.limits.avatarBytes)
    assert.equal(c.limits.maxInstanceCapacity, 10)
    assert.equal(c.rateLimits.authPerMinute, base.rateLimits.authPerMinute)
    assert.equal(c.rateLimits.uploadsPerMinute, 5)
  })

  test('publicUrl は origin にそろえ、不正な値は出どころを示す', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ttv-config-test-'))
    try {
      const data = join(dir, 'data')
      mkdirSync(data)
      const file = join(dir, 'server.config.json')
      writeFileSync(file, JSON.stringify({ publicUrl: 'https://example.com/ttv/?q=1#x' }))
      assert.equal(loadConfig({ TTV_CONFIG: file, TTV_DATA: data }).publicUrl, 'https://example.com')
      assert.equal(loadConfig({ TTV_CONFIG: file, TTV_DATA: data, TTV_PUBLIC_URL: 'https://vr.example.com/' }).publicUrl, 'https://vr.example.com')
      writeFileSync(file, JSON.stringify({ publicUrl: 'ftp://example.com' }))
      assert.throws(() => loadConfig({ TTV_CONFIG: file, TTV_DATA: data }), /server\.config\.json の publicUrl/)
      assert.throws(() => loadConfig({ TTV_CONFIG: file, TTV_DATA: data, TTV_PUBLIC_URL: 'nope' }), /TTV_PUBLIC_URL/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
