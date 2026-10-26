#!/usr/bin/env node
// TenTenV ワールド制作 CLI（TypeScript の本体を tsx で動かす）
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
let tsx
try {
  tsx = require.resolve('tsx/cli')
} catch {
  console.error('tsx が見つかりません。npm install を実行してください')
  process.exit(1)
}
const r = spawnSync(process.execPath, [tsx, join(here, '..', 'src', 'cli.ts'), ...process.argv.slice(2)], { stdio: 'inherit' })
process.exit(r.status ?? 1)
