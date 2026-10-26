// Khronos 公式の OpenXR SDK（Windows 用ローダー）を取得して native/third_party/openxr に置く
//
//   npm run fetch:openxr            既に揃っていれば何もしない
//   npm run fetch:openxr -- --force 取り直す
//
// 取得するもの: include/openxr/*.h、x64/lib/openxr_loader.lib、x64/bin/openxr_loader.dll、LICENSE（Apache-2.0）
// リポジトリにはバイナリを入れず、ビルド時にこのスクリプトで取得する（native/third_party/openxr は .gitignore 済み）。

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const OPENXR_VERSION = '1.1.65'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
export const openxrDir = join(root, 'native', 'third_party', 'openxr')
const BASE = `https://github.com/KhronosGroup/OpenXR-SDK-Source/releases/download/release-${OPENXR_VERSION}`
const LICENSE_URL = `https://raw.githubusercontent.com/KhronosGroup/OpenXR-SDK-Source/release-${OPENXR_VERSION}/LICENSE`

const required = ['include/openxr/openxr.h', 'include/openxr/openxr_platform.h', 'x64/lib/openxr_loader.lib', 'x64/bin/openxr_loader.dll', 'LICENSE']

export const openxrPresent = () => required.every((f) => existsSync(join(openxrDir, f)))

async function download(url) {
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

export async function fetchOpenXR({ force = false } = {}) {
  if (!force && openxrPresent()) {
    console.log(`[fetch-openxr] OK (already present: ${openxrDir})`)
    return
  }
  console.log(`[fetch-openxr] downloading OpenXR loader ${OPENXR_VERSION} ...`)
  const zip = join(tmpdir(), `tentenv-openxr-loader-${OPENXR_VERSION}.zip`)
  writeFileSync(zip, await download(`${BASE}/openxr_loader_windows-${OPENXR_VERSION}.zip`))
  rmSync(openxrDir, { recursive: true, force: true })
  mkdirSync(openxrDir, { recursive: true })
  // Windows 10 以降に付属の bsdtar は zip を展開できる（Git Bash の GNU tar はできないので絶対パスで呼ぶ）
  const tar = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe')
  execFileSync(tar, ['-xf', zip, '-C', openxrDir, 'include', 'x64/lib/openxr_loader.lib', 'x64/bin/openxr_loader.dll'], { stdio: 'inherit' })
  writeFileSync(join(openxrDir, 'LICENSE'), await download(LICENSE_URL))
  writeFileSync(
    join(openxrDir, 'SOURCE.txt'),
    `Khronos OpenXR SDK ${OPENXR_VERSION}\n${BASE}/openxr_loader_windows-${OPENXR_VERSION}.zip\nLicense: Apache-2.0 (see LICENSE)\n`,
  )
  rmSync(zip, { force: true })
  if (!openxrPresent()) throw new Error('OpenXR SDK の展開に失敗しました')
  console.log(`[fetch-openxr] OK -> ${openxrDir}`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await fetchOpenXR({ force: process.argv.includes('--force') })
}
