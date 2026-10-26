import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: { port: 5190, strictPort: true, host: true },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 6000,
    // uikit registers component classes by name at runtime.
    minify: false,
  },
  optimizeDeps: { exclude: ['@dimforge/rapier3d-compat'] },
})
