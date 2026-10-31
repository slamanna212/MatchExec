// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setupPgTestFile } from '../../utils/pg-test-db';
import { appRequest } from '../../utils/app-request';
import { SESSION_COOKIE, verifySessionToken } from '../../../src/server/middleware/auth';
import { resetRateLimits } from '../../../src/server/middleware/rate-limit';

setupPgTestFile();

const ENV_KEYS = ['ADMIN_PASSWORD', 'AUTH_SECRET', 'AUTH_SESSION_DAYS'] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
  resetRateLimits();
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
  }
});

const login = (password: unknown, headers: Record<string, string> = {}) =>
  appRequest('/api/auth/login', { method: 'POST', json: { password }, headers });
const tokenFrom = (setCookie: string) => setCookie.split(`${SESSION_COOKIE}=`)[1].split(';')[0];

describe('auth routes', () => {
  it('login is a no-op when auth is disabled', async () => {
    const res = await login('anything');
    expect(res.status).toBe(200);
    expect(res.data).toEqual({ success: true, enabled: false });
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  describe('with ADMIN_PASSWORD set', () => {
    beforeEach(() => { process.env.ADMIN_PASSWORD = 'hunter2'; });

    it('rejects a wrong or non-string password with 401', async () => {
      expect((await login('nope')).status).toBe(401);
      const res = await login(123);
      expect(res.status).toBe(401);
      expect(res.data).toEqual({ error: 'Invalid password' });
    });

    it('rejects an invalid body with 400', async () => {
      const res = await appRequest('/api/auth/login', { method: 'POST', body: 'not json', headers: { 'content-type': 'application/json' } });
      expect(res.status).toBe(400);
      expect(res.data).toEqual({ error: 'Invalid request body' });
    });

    it('sets a valid HttpOnly session cookie on success', async () => {
      const res = await login('hunter2');
      expect(res.status).toBe(200);
      expect(res.data).toEqual({ success: true });
      const cookie = res.headers.get('set-cookie')!;
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Lax');
      expect(cookie).not.toContain('Secure');
      expect(await verifySessionToken(tokenFrom(cookie))).toBe(true);
    });

    it('marks the cookie Secure behind an https proxy', async () => {
      const res = await login('hunter2', { 'x-forwarded-proto': 'https' });
      expect(res.headers.get('set-cookie')).toContain('Secure');
    });

    it('rate limits repeated attempts per client', async () => {
      for (let i = 0; i < 10; i++) expect((await login('bad', { 'x-forwarded-for': '1.1.1.1' })).status).toBe(401);
      const limited = await login('bad', { 'x-forwarded-for': '1.1.1.1' });
      expect(limited.status).toBe(429);
      expect((await login('bad', { 'x-forwarded-for': '2.2.2.2' })).status).toBe(401);
    });

    it('status reports enabled/authenticated', async () => {
      expect((await appRequest('/api/auth/status')).data).toEqual({ enabled: true, authenticated: false });
      const cookie = (await login('hunter2')).headers.get('set-cookie')!;
      const res = await appRequest('/api/auth/status', { headers: { cookie: `${SESSION_COOKIE}=${tokenFrom(cookie)}` } });
      expect(res.data).toEqual({ enabled: true, authenticated: true });
    });
  });

  it('status is always authenticated when auth is disabled', async () => {
    expect((await appRequest('/api/auth/status')).data).toEqual({ enabled: false, authenticated: true });
  });

  it('logout clears the cookie', async () => {
    const res = await appRequest('/api/auth/logout', { method: 'POST' });
    expect(res.data).toEqual({ success: true });
    expect(res.headers.get('set-cookie')).toMatch(/Max-Age=0/);
  });
});
