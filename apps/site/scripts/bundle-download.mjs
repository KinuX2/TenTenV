// Windows 版の zip（apps/desktop で npm run package したもの）を、サイトのダウンロードに置く
import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const src = join(import.meta.dirname, '..', '..', 'desktop', 'dist', 'TenTenV-win32-x64.zip')
const dir = join(import.meta.dirname, '..', 'public', 'downloads')
if (!existsSync(src)) {
  console.error('Windows 版の zip がありません。先に npm run package -w @tentenv/desktop を実行してください')
  process.exit(1)
}
mkdirSync(dir, { recursive: true })
copyFileSync(src, join(dir, 'TenTenV-win32-x64.zip'))
console.log(`置きました: public/downloads/TenTenV-win32-x64.zip（${(statSync(src).size / 1048576).toFixed(0)} MB）`)
