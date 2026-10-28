import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'

// 公式サイト: ドキュメントだけのページ（静的なファイルとして書き出す）
export default defineConfig({
  plugins: [react()],
  server: { port: 5200, strictPort: true, host: true, fs: { allow: [resolve(import.meta.dirname, '../..')] } },
  build: { target: 'es2022' },
})
