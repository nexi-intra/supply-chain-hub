import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vite";

import { resolve } from 'path'

const projectRoot = process.env.PROJECT_ROOT || import.meta.dirname

// https://vite.dev/config/
export default defineConfig({
  // Relative base so the built app also works from file:// (Electron).
  base: './',
  // Fixed port so electron:dev's ELECTRON_START_URL stays in sync.
  // host: true so the server is reachable through Codespaces port forwarding.
  server: {
    host: true,
    port: 5000,
    allowedHosts: ['.trycloudflare.com', '.app.github.dev'],
    // electron-builder writes/locks binaries under release/ (and briefly at the
    // project root); watching them crashes Vite with EBUSY mid-build.
    watch: {
      ignored: ['**/release/**', '**/*.exe', '**/*.zip', '**/*.asar'],
    },
  },
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': resolve(projectRoot, 'src')
    }
  },
});
