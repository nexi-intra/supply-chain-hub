/// <reference types="vitest" />
import { defineConfig } from 'vite'

// Separat fra vite.config.ts (som styrer selve app-builden) for at holde
// test-opsætningen simpel og uafhængig af Electron/base-path-indstillinger.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
