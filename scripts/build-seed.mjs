// 標準のワールド（ホーム・DJ ラウンジ）をビルドして、親サーバーの seed フォルダへ入れる
// 親サーバーは初回起動時にここの .ttvw を登録する
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
const seed = join(root, 'apps', 'server', 'seed')
mkdirSync(seed, { recursive: true })
const worlds = [
  ['home', 'home.ttvw'],
  ['dj-lounge', 'dj-lounge.ttvw'],
]
const ifMissing = process.argv.includes('--if-missing')
for (const [dir, out] of worlds) {
  if (ifMissing && existsSync(join(seed, out))) continue
  const cwd = join(root, 'worlds', dir)
  console.log(`\n== ${dir} ==`)
  const r = spawnSync(process.execPath, [join(root, 'packages', 'sdk', 'bin', 'ttv-world.mjs'), 'pack', '-o', join(seed, out)], { cwd, stdio: 'inherit' })
  if (r.status !== 0) {
    console.error(`${dir} のビルドに失敗しました`)
    process.exit(1)
  }
}
console.log('\nseed:', readdirSync(seed).join(', '))
