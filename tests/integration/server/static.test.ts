// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setupPgTestFile } from '../../utils/pg-test-db';
import { app } from '../../../src/server/app';
import { isStaticAssetPath } from '../../../src/server/middleware/auth';

setupPgTestFile({ seed: true });

const html = { accept: 'text/html' };
let dir: string;
let savedClientDir: string | undefined;
const saved: Record<string, string | undefined> = {};

beforeAll(() => {
  savedClientDir = process.env.CLIENT_DIR;
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'matchexec-client-'));
  fs.mkdirSync(path.join(dir, 'static'));
  fs.mkdirSync(path.join(dir, 'assets', 'games'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>MatchExec</title><div id="root"></div>');
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

  it('serves unhashed public files with a short cache', async () => {
    const res = await app.request('/assets/games/icon.svg');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, max-age=3600');
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
