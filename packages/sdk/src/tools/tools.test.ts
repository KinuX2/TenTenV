// SDK の道具（コードの検査・マニフェスト・パッケージ）のテスト
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { zipSync } from 'fflate'
import { checkManifest, domainAllowed } from './manifest'
import { packWorld, sha256, unpackWorld } from './pack'
import { scanCode } from './scan'

test('危険なコードを見つける', () => {
  const rules = (code: string, relaxed: string[] = []) => scanCode('a.js', code, relaxed).map((f) => f.rule)
  assert.deepEqual(rules('const x = eval("1")'), ['no-eval'])
  assert.deepEqual(rules('new Function("return 1")'), ['no-new-function'])
  assert.deepEqual(rules('fetch("https://x")'), ['no-network-without-permission'])
  assert.deepEqual(rules('localStorage.setItem("a","b")'), ['no-storage-access'])
  assert.deepEqual(rules('el.innerHTML = s'), ['no-dangerous-dom'])
  assert.deepEqual(rules('Object.prototype.foo = 1'), ['no-prototype-pollution'])
  assert.deepEqual(rules('window.fetch = f'), ['no-sensitive-api-override'])
  // 許可したルールは見逃す
  assert.deepEqual(rules('fetch("https://x")', ['no-network-without-permission']), [])
  // 似ているが安全なもの
  assert.deepEqual(rules('obj.eval(1); loader.fetchThing(); el.innerHTML === s; x.retrieval()'), [])
})

test('許可ドメインの判定', () => {
  assert.equal(domainAllowed('https://cdn.example.com/a.mp4', ['cdn.example.com']), true)
  assert.equal(domainAllowed('https://a.b.example.com/x', ['*.example.com']), true)
  assert.equal(domainAllowed('https://example.com/x', ['*.example.com']), true)
  assert.equal(domainAllowed('https://evil-example.com/x', ['*.example.com']), false)
  assert.equal(domainAllowed('http://cdn.example.com/a.mp4', ['cdn.example.com']), false)
  assert.equal(domainAllowed('not a url', ['example.com']), false)
})

const makeDist = (code: string) => {
  const dir = mkdtempSync(join(tmpdir(), 'ttv-pack-'))
  writeFileSync(join(dir, 'world.js'), code)
  mkdirSync(join(dir, 'sub'))
  writeFileSync(join(dir, 'sub', 'tex.png'), new Uint8Array([1, 2, 3]))
  return dir
}

test('パッケージを作って開ける', () => {
  const dir = makeDist('var __ttvWorld = 1')
  const r = packWorld(dir, { name: 'テスト', tags: ['a'] })
  assert.equal(r.findings.length, 0)
  assert.equal(checkManifest(r.manifest), null)
  assert.ok(r.manifest.files['sub/tex.png'])
  const u = unpackWorld(r.zip, { maxBytes: 1e6 })
  assert.equal(u.manifest.name, 'テスト')
  assert.equal(u.files.get('world.js')!.length, 18)
})

test('改ざん・危険なコード・大きすぎるパッケージを拒否する', () => {
  const dir = makeDist('eval("x")')
  const r = packWorld(dir, { name: 'bad' })
  assert.ok(r.findings.length > 0)
  assert.throws(() => unpackWorld(r.zip, { maxBytes: 1e6 }), /検査/)
  // ハッシュの改ざん
  const ok = packWorld(makeDist('var a=1'), { name: 'ok' })
  const m = { ...ok.manifest, files: { ...ok.manifest.files, 'world.js': sha256('other') } }
  const zip = zipSync({ 'world.js': new TextEncoder().encode('var a=1'), 'sub/tex.png': new Uint8Array([1, 2, 3]), 'world.json': new TextEncoder().encode(JSON.stringify(m)) })
  assert.throws(() => unpackWorld(zip, { maxBytes: 1e6 }), /ハッシュ/)
  // 大きすぎる
  assert.throws(() => unpackWorld(ok.zip, { maxBytes: 5 }), /大きすぎ/)
  // ../ を含むファイル名
  assert.notEqual(checkManifest({ ...ok.manifest, files: { '../x.js': sha256('a'), 'world.js': sha256('b') } }), null)
})
