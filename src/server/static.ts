/**
 * Static SPA hosting (replaces Next's static file serving, `redirects()` in next.config.ts and the page routing).
 *
 *  - `/dev` and `/dev/*` redirect to `/` in production (the dev page is a development tool)
 *  - `dist/client` is served as static files; Vite's hashed bundle lives under `/static/` and is cached for a year
 *    (immutable), everything else from `public/` gets a short cache, `index.html` is never cached
 *  - any other GET/HEAD navigation (not `/api`, not `/uploads`, no file extension or `Accept: text/html`) falls back to `index.html`
 *    so client-side routes and deep links work
 */
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { serveStatic } from '@hono/node-server/serve-static';
import type { Context, MiddlewareHandler } from 'hono';
import { apiNotFound } from './http';
import { STATIC_ASSET_PREFIX } from './middleware/auth';

const HASHED_CACHE = 'public, max-age=31536000, immutable';
const PUBLIC_FILE_CACHE = 'public, max-age=3600';
const HTML_CACHE = 'no-cache';

/** Where `vite build` put the client (override with CLIENT_DIR). */
export function clientDir(): string {
  return process.env.CLIENT_DIR ? path.resolve(process.env.CLIENT_DIR) : path.resolve(process.cwd(), 'dist/client');
}

/** `/dev` and `/dev/*` -> `/` in production (307, like Next's non-permanent redirect). */
export const redirectDevPages: MiddlewareHandler = async (c, next) => {
  const { pathname } = new URL(c.req.url);
  if (process.env.NODE_ENV === 'production' && (pathname === '/dev' || pathname.startsWith('/dev/'))) {
    return c.redirect('/', 307);
  }
  return next();
};

function cacheControlFor(root: string, filePath: string): string {
  if (filePath.endsWith(`${path.sep}index.html`)) return HTML_CACHE;
  if (filePath.startsWith(path.join(root, STATIC_ASSET_PREFIX))) return HASHED_CACHE;
  return PUBLIC_FILE_CACHE;
}

// One serveStatic handler per client dir (the dir only changes in tests). `onFound` runs after the response object has been
// built, so the Cache-Control header is applied to the returned response below instead of through `c.header()`.
const fileHandlers = new Map<string, MiddlewareHandler>();
const foundPaths = new WeakMap<Context, string>();
function fileHandler(root: string): MiddlewareHandler {
  let handler = fileHandlers.get(root);
  if (!handler) {
    handler = serveStatic({ root, index: 'index.html', onFound: (filePath, c) => { foundPaths.set(c, filePath); } });
    fileHandlers.set(root, handler);
  }
  return handler;
}

/** Serves files from dist/client (GET/HEAD); anything that is not a file continues down the chain. */
export const serveClientFiles: MiddlewareHandler = async (c, next) => {
  const root = clientDir();
  if (!existsSync(root)) return next();
  const res = await fileHandler(root)(c, next);
  const filePath = foundPaths.get(c);
  if (res && filePath) res.headers.set('Cache-Control', cacheControlFor(root, filePath));
  return res;
};

const hasFileExtension = (p: string) => /\.[a-z0-9]{1,8}$/i.test(p.split('/').pop() ?? '');

let cachedIndex: { dir: string; html: string } | null = null;
async function readIndexHtml(): Promise<string | null> {
  const dir = clientDir();
  if (cachedIndex?.dir === dir) return cachedIndex.html;
  try {
    const html = await readFile(path.join(dir, 'index.html'), 'utf8');
    cachedIndex = { dir, html };
    return html;
  } catch {
    return null;
  }
}

/** SPA fallback: unmatched page navigations get index.html (no-cache). Unknown files and API paths stay 404. */
export async function spaFallback(c: Context): Promise<Response> {
  const { pathname } = new URL(c.req.url);
  const isPageRequest = !hasFileExtension(pathname) || (c.req.header('accept') ?? '').includes('text/html');
  const reserved = pathname === '/api' || pathname.startsWith('/api/') || pathname.startsWith('/uploads/') || pathname.startsWith(STATIC_ASSET_PREFIX);
  if ((c.req.method !== 'GET' && c.req.method !== 'HEAD') || reserved || !isPageRequest) return await apiNotFound(c);
  const html = await readIndexHtml();
  if (html === null) return c.text('Client not built (run `pnpm build:client`)', 404);
  c.header('Cache-Control', HTML_CACHE);
  return c.html(html);
}
