/// <reference types="vitest" />
import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

// Separat fra vite.config.ts (som styrer selve app-builden) for at holde
// test-opsætningen simpel og uafhængig af Electron/base-path-indstillinger.
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})
