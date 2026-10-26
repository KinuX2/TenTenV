// R3F + @react-three/xr の自己テストページ（selftest/r3f-entry.js）を 1 つの JS にまとめる
//
//   npm run build:selftest   → selftest/r3f.bundle.js

import { build } from 'esbuild'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

export async function buildSelftest() {
  await build({
    entryPoints: [join(root, 'selftest', 'r3f-entry.js')],
    outfile: join(root, 'selftest', 'r3f.bundle.js'),
    bundle: true,
    format: 'esm',
    target: 'es2022',
    minify: true,
    sourcemap: false,
    define: { 'process.env.NODE_ENV': '"production"' },
    logLevel: 'warning',
  })
  console.log('[build-selftest] OK -> selftest/r3f.bundle.js')
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await buildSelftest()
