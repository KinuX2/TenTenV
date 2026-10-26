// ネイティブアドオン（OpenXR）をビルドして bin/ に置く
//
//   npm run build:native
//
// 必要なもの: Visual Studio 2022 Build Tools（C++ によるデスクトップ開発）、CMake 3.15 以上。
// Electron 用にビルドする（--runtime electron）。Node 単体の smoke test も同じ .node を読める（N-API）。

import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fetchOpenXR } from './fetch-openxr.mjs'

const require = createRequire(import.meta.url)
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const nativeDir = join(root, 'native')
const cmakeJs = require.resolve('cmake-js/bin/cmake-js')
const electronVersion = JSON.parse(readFileSync(require.resolve('electron/package.json'), 'utf8')).version

await fetchOpenXR()

const generator = process.env.TENTENV_CMAKE_GENERATOR ?? 'Visual Studio 17 2022'
execFileSync(
  process.execPath,
  [cmakeJs, 'compile', '--directory', nativeDir, '--config', 'Release', '--arch', 'x64', '--runtime', 'electron', '--runtime-version', electronVersion, '-G', generator, '-A', 'x64'],
  { stdio: 'inherit', cwd: root },
)

const out = join(nativeDir, 'build', 'Release')
const bin = join(root, 'bin')
mkdirSync(bin, { recursive: true })
for (const f of ['tentenv_xr.node', 'openxr_loader.dll']) copyFileSync(join(out, f), join(bin, f))
if (!existsSync(join(bin, 'tentenv_xr.node'))) throw new Error('build output missing')
console.log(`\n[build-native] OK -> ${join(bin, 'tentenv_xr.node')} (electron ${electronVersion})`)
