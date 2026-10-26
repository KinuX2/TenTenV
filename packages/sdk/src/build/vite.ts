// ワールドのビルド設定。vite.config.ts で `export default defineWorldConfig()` と書く
//
// ワールドは 1 つの world.js（IIFE）になり、React・three.js・R3F・Rapier・drei・SDK は同梱せず、
// クライアントが window.__TTV__ に用意したものを使う（バージョンをそろえ、ファイルを小さくするため）
import react from '@vitejs/plugin-react'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Plugin, UserConfig } from 'vite'

/** クライアントと共有するモジュールと、その受け取り先 */
export const SHARED_MODULES: Record<string, string> = {
  react: '__TTV__.react',
  'react/jsx-runtime': '__TTV__.jsx',
  'react/jsx-dev-runtime': '__TTV__.jsx',
  'react-dom': '__TTV__.reactDom',
  three: '__TTV__.three',
  '@react-three/fiber': '__TTV__.fiber',
  '@react-three/drei': '__TTV__.drei',
  '@react-three/rapier': '__TTV__.rapier',
  '@tentenv/sdk': '__TTV__.sdk',
}

export interface WorldBuildOptions {
  /** ワールドの入口（既定: src/index.tsx）。World を default か名前付き World で export する */
  entry?: string
  /** 追加の Vite 設定 */
  vite?: UserConfig
}

/** ビルド後に、ワールドの入口の形を world.js に書き足す */
const finalize = (): Plugin => ({
  name: 'tentenv-world-finalize',
  apply: 'build',
  closeBundle() {
    const file = resolve('dist', 'world.js')
    if (!existsSync(file)) return
    const code = readFileSync(file, 'utf8')
    if (code.includes('__ttvRegister')) return
    // IIFE の戻り値（export の一覧）をクライアントへ渡す
    writeFileSync(file, `${code}\n;(function(){var m=typeof __ttvWorld!=="undefined"?__ttvWorld:null;if(window.__ttvRegister&&m)window.__ttvRegister(m)})();\n`)
  },
})

export const defineWorldConfig = (opts: WorldBuildOptions = {}): UserConfig => {
  const entry = opts.entry ?? 'src/index.tsx'
  const base: UserConfig = {
    plugins: [react({ jsxRuntime: 'automatic' }), finalize()],
    publicDir: 'public',
    base: './',
    define: {
      'process.env.NODE_ENV': JSON.stringify('production'),
    },
    build: {
      target: 'es2022',
      outDir: 'dist',
      emptyOutDir: true,
      assetsDir: '',
      copyPublicDir: true,
      sourcemap: false,
      minify: true,
      cssCodeSplit: false,
      lib: {
        entry: resolve(entry),
        name: '__ttvWorld',
        formats: ['iife'],
        fileName: () => 'world.js',
      },
      rollupOptions: {
        external: Object.keys(SHARED_MODULES),
        output: {
          globals: SHARED_MODULES,
        },
      },
    },
  }
  const extra = opts.vite ?? {}
  return {
    ...base,
    ...extra,
    plugins: [...(base.plugins ?? []), ...(extra.plugins ?? [])],
    build: { ...base.build, ...extra.build, lib: base.build!.lib, rollupOptions: { ...base.build!.rollupOptions, ...extra.build?.rollupOptions } },
  }
}
