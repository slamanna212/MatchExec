// @vitest-environment node
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setupPgTestFile } from '../../utils/pg-test-db';
import { app } from '../../../src/server/app';
import { isStaticAssetPath } from '../../../src/server/middleware/auth';

setupPgTestFile({ seed: true });

const html = { accept: 'text/html' };
const INLINE = "document.documentElement.dataset.x='1';";
const INLINE_HASH = `'sha256-${createHash('sha256').update(INLINE).digest('base64')}'`;
let dir: string;
let savedClientDir: string | undefined;
const saved: Record<string, string | undefined> = {};

beforeAll(() => {
  savedClientDir = process.env.CLIENT_DIR;
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'matchexec-client-'));
  fs.mkdirSync(path.join(dir, 'static'));
  fs.mkdirSync(path.join(dir, 'assets', 'games'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><title>MatchExec</title><script>${INLINE}</script><div id="root"></div><script type="module" src="/static/index-abc123.js"></script>`);
  fs.writeFileSync(path.join(dir, 'static', 'big-abc123.js'), 'console.log("matchexec");\n'.repeat(400));
  fs.writeFileSync(path.join(dir, 'static', 'index-abc123.js'), 'console.log(1)');
  fs.writeFileSync(path.join(dir, 'assets', 'games', 'icon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  fs.writeFileSync(path.join(dir, 'manifest.json'), '{}');
  process.env.CLIENT_DIR = dir;
});
afterAll(() => {
  if (savedClientDir === undefined) delete process.env.CLIENT_DIR; else process.env.CLIENT_DIR = savedClientDir;
  fs.rmSync(dir, { recursive: true, force: true });
});
beforeEach(() => {
  for (const k of ['NODE_ENV', 'ADMIN_PASSWORD']) saved[k] = process.env[k];
  // A completed welcome flow, so pages are not redirected to /welcome
});
afterEach(() => {
  for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
});

const done = { ...html, cookie: 'welcome_flow_completed=true' };

describe('static SPA hosting', () => {
  it('serves index.html at / with no-cache', async () => {
    const res = await app.request('/', { headers: done });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(res.headers.get('cache-control')).toBe('no-cache');
    expect(await res.text()).toContain('<div id="root">');
  });

  it('falls back to index.html (no-cache) for client-side routes and deep links', async () => {
    for (const p of ['/matches', '/tournaments/xyz', '/matches/abc/stats/def', '/settings/ui']) {
      const res = await app.request(p, { headers: done });
      expect(res.status, p).toBe(200);
      expect(res.headers.get('cache-control'), p).toBe('no-cache');
      expect(await res.text(), p).toContain('<div id="root">');
    }
  });

  it('serves hashed bundle files from /static/ as immutable', async () => {
    const res = await app.request('/static/index-abc123.js');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(await res.text()).toBe('console.log(1)');
  });

  it('serves unhashed public files with a one-day cache that may be served stale while revalidating', async () => {
    const res = await app.request('/assets/games/icon.svg');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, max-age=86400, stale-while-revalidate=604800');
  });

  it('sends a Content-Security-Policy with the inline script hash on the HTML document (index and SPA fallback)', async () => {
    for (const p of ['/', '/index.html', '/matches/abc']) {
      const res = await app.request(p, { headers: done });
      const csp = res.headers.get('content-security-policy');
      expect(csp, p).toContain(`script-src 'self' ${INLINE_HASH}`);
      expect(csp, p).toContain("frame-ancestors 'none'");
      expect(csp, p).toContain("object-src 'none'");
      expect(csp, p).not.toMatch(/script-src[^;]*unsafe-inline/);
    }
    // Not on other files
    expect((await app.request('/static/index-abc123.js')).headers.get('content-security-policy')).toBeNull();
  });

  it('sends the baseline security headers on pages and API responses, without HSTS or CORP', async () => {
    for (const res of [await app.request('/', { headers: done }), await app.request('/api/health')]) {
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
      expect(res.headers.get('x-frame-options')).toBe('DENY');
      expect(res.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
      expect(res.headers.get('strict-transport-security')).toBeNull();
      expect(res.headers.get('cross-origin-resource-policy')).toBeNull();
    }
  });

  it('gzips compressible responses when the client accepts it, and leaves small ones alone', async () => {
    const big = await app.request('/static/big-abc123.js', { headers: { 'accept-encoding': 'gzip, deflate, br' } });
    expect(big.headers.get('content-encoding')).toBe('gzip');
    expect(big.headers.get('vary')).toMatch(/accept-encoding/i);
    const plain = await app.request('/static/big-abc123.js');
    expect(plain.headers.get('content-encoding')).toBeNull();
    const small = await app.request('/static/index-abc123.js', { headers: { 'accept-encoding': 'gzip' } });
    expect(small.headers.get('content-encoding')).toBeNull();
  });

  it('does not fall back to HTML for missing files, /static/, /uploads/ or /api/', async () => {
    expect((await app.request('/static/missing.js')).status).toBe(404);
    expect((await app.request('/nope.png', { headers: { accept: 'image/png' } })).status).toBe(404);
    const api = await app.request('/api/nope', { headers: done });
    expect(api.status).toBe(404);
    expect(await api.json()).toEqual({ error: 'Not found' });
    expect((await app.request('/uploads/events/missing.png', { headers: done })).status).toBe(404);
  });

  it('redirects /dev and /dev/* to / in production only', async () => {
    process.env.NODE_ENV = 'production';
    for (const p of ['/dev', '/dev/anything']) {
      const res = await app.request(p, { headers: done });
      expect(res.status, p).toBe(307);
      expect(new URL(res.headers.get('location')!, 'http://x').pathname, p).toBe('/');
    }
    process.env.NODE_ENV = 'test';
    expect((await app.request('/dev', { headers: done })).status).toBe(200);
  });

  it('redirects HTML navigations to /welcome until the welcome flow is complete, but never static files', async () => {
    const res = await app.request('/matches', { headers: { ...html, cookie: 'welcome_flow_completed=false' } });
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get('location')!, 'http://x').pathname).toBe('/welcome');
    const asset = await app.request('/static/index-abc123.js', { headers: { cookie: 'welcome_flow_completed=false' } });
    expect(asset.status).toBe(200);
  });
});

describe('auth gate and static files', () => {
  beforeEach(() => { process.env.ADMIN_PASSWORD = 'hunter2'; });

  it('exempts the bundle, manifest and image files but not pages or API paths', () => {
    expect(isStaticAssetPath('/static/index-abc.js')).toBe(true);
    expect(isStaticAssetPath('/manifest.json')).toBe(true);
    expect(isStaticAssetPath('/assets/games/icon.svg')).toBe(true);
    expect(isStaticAssetPath('/favicon.ico')).toBe(true);
    expect(isStaticAssetPath('/matches')).toBe(false);
    expect(isStaticAssetPath('/api/static/x.js')).toBe(false);
    expect(isStaticAssetPath('/api/foo.png')).toBe(false);
  });

  it('serves the SPA shell at /login and its bundle without a session, redirects other pages to /login', async () => {
    expect((await app.request('/login', { headers: html })).status).toBe(200);
    expect((await app.request('/static/index-abc123.js')).status).toBe(200);
    const res = await app.request('/matches', { headers: html });
    expect(res.status).toBe(302);
    expect(new URL(res.headers.get('location')!).pathname).toBe('/login');
    expect((await app.request('/api/matches')).status).toBe(401);
  });
});
