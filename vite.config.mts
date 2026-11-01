import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const root = path.dirname(fileURLToPath(import.meta.url));

// Dev: Vite serves the SPA on 3000 (HMR) and proxies /api and /uploads to the Hono server on 3001.
// Production: `vite build` emits dist/client, which the Hono server serves (see src/server/app.ts).
const apiTarget = process.env.VITE_API_TARGET ?? 'http://127.0.0.1:3001';

export default defineConfig({
  root: path.resolve(root, 'src/client'),
  publicDir: path.resolve(root, 'public'),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@/shared': path.resolve(root, 'shared'),
      '@/lib': path.resolve(root, 'src/lib'),
      '@': path.resolve(root, 'src'),
      '@lib': path.resolve(root, 'lib'),
    },
  },
  server: {
    port: 3000,
    host: true, // replaces Next's allowedDevOrigins: reachable from LAN hostnames
    allowedHosts: true,
    proxy: {
      '/api': { target: apiTarget, changeOrigin: false },
      '/uploads': { target: apiTarget, changeOrigin: false },
    },
  },
  build: {
    outDir: path.resolve(root, 'dist/client'),
    emptyOutDir: true,
    // public/assets/** (game images, audio) is served at /assets/... and is not hashed, so Vite's hashed bundle goes to /static/ instead.
    assetsDir: 'static',
    sourcemap: false,
  },
});
