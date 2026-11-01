// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setupPgTestFile } from '../../utils/pg-test-db';
import { app } from '../../../src/server/app';
import {
  SESSION_COOKIE, INTERNAL_TOKEN_HEADER, createSessionToken, getInternalToken, isPublicPath, verifySessionToken,
} from '../../../src/server/middleware/auth';

setupPgTestFile();

const ENV_KEYS = ['ADMIN_PASSWORD', 'AUTH_SECRET', 'AUTH_SESSION_DAYS', 'INTERNAL_API_TOKEN'] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
  }
});

// A path no router serves: authenticated -> JSON 404, unauthenticated -> 401 (the gate runs first).
const PROTECTED = '/api/__unmounted__';

describe('auth disabled', () => {
  it('lets everything through', async () => {
    expect((await app.request(PROTECTED)).status).toBe(404);
    expect((await app.request('/some/page', { headers: { accept: 'text/html' } })).status).not.toBe(302);
  });
});

describe('auth enabled', () => {
  beforeEach(() => { process.env.ADMIN_PASSWORD = 'hunter2'; });

  it('401 JSON for protected API paths', async () => {
    const res = await app.request(PROTECTED);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
  });

  it('redirects protected pages to /login with a sanitized next', async () => {
    const res = await app.request('/matches?x=1', { headers: { accept: 'text/html' } });
    expect(res.status).toBe(302);
    const loc = new URL(res.headers.get('location')!);
    expect(loc.pathname).toBe('/login');
    expect(loc.searchParams.get('next')).toBe('/matches?x=1');
  });

  it.each(['/login', '/api/auth/login', '/api/auth/logout', '/api/auth/status', '/api/health', '/api/db-status', '/api/welcome-flow', '/api/health/deep'])(
    'exempts %s', (p) => {
      expect(isPublicPath(p)).toBe(true);
    },
  );

  it('does not exempt look-alike paths', () => {
    expect(isPublicPath('/api/healthz')).toBe(false);
    expect(isPublicPath('/api/matches')).toBe(false);
    expect(isPublicPath('/loginx')).toBe(false);
  });

  it('/api/health is reachable without a session (gate does not 401 it)', async () => {
    const res = await app.request('/api/health');
    expect(res.status).not.toBe(401);
  });

  it('accepts a valid session cookie', async () => {
    const token = await createSessionToken();
    const res = await app.request(PROTECTED, { headers: { cookie: `${SESSION_COOKIE}=${token}` } });
    expect(res.status).toBe(404);
  });

  it('rejects a tampered, expired, malformed or wrong-secret cookie', async () => {
    const token = await createSessionToken();
    const [iat, exp, sig] = token.split('.');
    const bad = [
      `${iat}.${Number(exp) + 1000}.${sig}`,
      `${iat}.${exp}.${'0'.repeat(sig.length)}`,
      'garbage',
      await createSessionToken(Date.now() - 10_000, 1), // expired
    ];
    for (const t of bad) {
      const res = await app.request(PROTECTED, { headers: { cookie: `${SESSION_COOKIE}=${t}` } });
      expect(res.status, t).toBe(401);
    }
    process.env.AUTH_SECRET = 'different';
    expect(await verifySessionToken(token)).toBe(false);
  });

  it('accepts the derived internal token and INTERNAL_API_TOKEN override', async () => {
    let res = await app.request(PROTECTED, { headers: { [INTERNAL_TOKEN_HEADER]: await getInternalToken() } });
    expect(res.status).toBe(404);
    res = await app.request(PROTECTED, { headers: { [INTERNAL_TOKEN_HEADER]: 'wrong' } });
    expect(res.status).toBe(401);
    process.env.INTERNAL_API_TOKEN = 'explicit-token';
    res = await app.request(PROTECTED, { headers: { [INTERNAL_TOKEN_HEADER]: 'explicit-token' } });
    expect(res.status).toBe(404);
  });
});
