// 自己テストをまとめて走らせる（HMD 無しで、疑似 HMD を使って WebXR の経路を確かめる）
//
//   npm run selftest                       three（native / ipc ブリッジ）と r3f（@react-three/xr）の 3 本
//   npm run selftest -- three              一部だけ（three / three-ipc / r3f）
//   npm run selftest -- --real three       疑似 HMD ではなく本物の OpenXR ランタイムで（HMD が必要）
//
// 結果は test/output/selftest-*.json と、終了直前のウィンドウの画像 selftest-*.png に残る。

import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildSelftest } from './build-selftest.mjs'

const require = createRequire(import.meta.url)
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const electron = require('electron')
const args = process.argv.slice(2)
const real = args.includes('--real')
const ALL = {
  three: { page: 'three', bridge: 'native' },
  'three-ipc': { page: 'three', bridge: 'ipc' },
  r3f: { page: 'r3f', bridge: 'native' },
}
const picked = args.filter((a) => ALL[a])
const runs = (picked.length ? picked : Object.keys(ALL)).map((k) => ({ key: k, ...ALL[k] }))

if (!existsSync(join(root, 'bin', 'tentenv_xr.node'))) {
  console.error('[selftest] bin/tentenv_xr.node がありません。先に npm run build:native を実行してください')
  process.exit(1)
}
if (runs.some((r) => r.page === 'r3f')) await buildSelftest()

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

function run({ key, page, bridge }) {
  return new Promise((resolve) => {
    const argv = [root, '--selftest', page, '--bridge', bridge, '--scale', '0.5']
    if (real) argv.push('--selftest-real')
    console.log(`\n[selftest] ${key}: ${electron} ${argv.slice(1).join(' ')}`)
    const p = spawn(electron, argv, { env, stdio: ['ignore', 'pipe', 'pipe'] })
    const relay = (d) => {
      for (const line of d.toString().split(/\r?\n/)) {
        if (/\[selftest\]|\[TenTenV|\[xr\]|\[tentenv\]|error/i.test(line) && !/RESULT \{/.test(line)) console.log('   ', line.slice(0, 400))
      }
    }
    p.stdout.on('data', relay)
    p.stderr.on('data', relay)
    p.on('exit', (code) => {
      const file = join(root, 'test', 'output', `selftest-${page}-${bridge}${real ? '-real' : ''}.json`)
      let result = null
      try {
        result = JSON.parse(readFileSync(file, 'utf8'))
      } catch {}
      resolve({ key, code, result })
    })
  })
}

const results = []
for (const r of runs) results.push(await run(r))
console.log('\n[selftest] summary')
let ok = true
for (const { key, code, result } of results) {
  const pass = code === 0 && result && result.ok
  ok &&= pass
  const n = result?.stats?.native
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${key.padEnd(10)} exit=${code} frames=${result?.xrFrames ?? '-'} submits=${n?.submits ?? '-'} sample=${n ? JSON.stringify(n.sampleLeft) : '-'}`)
  for (const f of result?.failures ?? []) console.log('        - ' + f)
}
process.exit(ok ? 0 : 1)
