import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const root = path.dirname(fileURLToPath(import.meta.url));

// Dev: Vite serves the SPA on 3000 (HMR) and proxies /api and /uploads to the Hono server on 3001.
// Production: `vite build` emits dist/client, which the Hono server serves (see src/server/app.ts).
const apiTarget = process.env.VITE_API_TARGET ?? 'http://127.0.0.1:3001';

/**
 * Dev only: Vite serves the HTML, so the server's HTML-navigation middleware (welcome-flow redirect, auth gate -> /login)
 * would never run. For HTML navigations ask the Hono server about the same path and relay a redirect if it answers one;
 * otherwise fall through to Vite. In production Hono serves the HTML itself, so this plugin does not exist there.
 */
function serverNavigationGate(): Plugin {
  return {
    name: 'matchexec-server-navigation-gate',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? '/';
        const pathname = url.split('?')[0];
        const isNav =
          (req.method === 'GET' || req.method === 'HEAD') &&
          (req.headers.accept ?? '').includes('text/html') &&
          !pathname.startsWith('/api/') && !pathname.startsWith('/@') && !pathname.startsWith('/uploads/') &&
          !/\.[a-z0-9]{1,8}$/i.test(pathname.split('/').pop() ?? '');
        if (!isNav) return next();
        try {
          const upstream = await fetch(new URL(url, apiTarget), {
            redirect: 'manual',
            headers: { accept: 'text/html', cookie: req.headers.cookie ?? '' },
          });
          if (upstream.status >= 300 && upstream.status < 400) {
            const location = upstream.headers.get('location');
            const target = location ? new URL(location, apiTarget) : null;
            res.statusCode = upstream.status;
            if (target) res.setHeader('location', target.pathname + target.search);
            const cookies = upstream.headers.getSetCookie();
            if (cookies.length) res.setHeader('set-cookie', cookies);
            return res.end();
          }
          const cookies = upstream.headers.getSetCookie();
          if (cookies.length) res.setHeader('set-cookie', cookies);
        } catch {
          // API server not up yet: just serve the SPA.
        }
        next();
      });
    },
  };
}

export default defineConfig({
  root: path.resolve(root, 'src/client'),
  publicDir: path.resolve(root, 'public'),
  plugins: [react(), tailwindcss(), serverNavigationGate()],
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
