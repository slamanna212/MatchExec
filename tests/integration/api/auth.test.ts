import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createMockRequest, parseResponse } from '../../utils/api-helpers';
import { POST as login } from '@/app/api/auth/login/route';
import { POST as logout } from '@/app/api/auth/logout/route';
import { GET as status } from '@/app/api/auth/status/route';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth';

describe('Auth API', () => {
  const saved = { ...process.env };
  beforeEach(() => { process.env.ADMIN_PASSWORD = 'hunter2'; });
  afterEach(() => { process.env = { ...saved }; });

  it('rejects a wrong password', async () => {
    const res = await login(createMockRequest('POST', '/api/auth/login', { password: 'bad' }, { 'x-forwarded-for': '10.0.0.1' }) as any);
    const { status: code, data } = await parseResponse(res);
    expect(code).toBe(401);
    expect(data.error).toBeDefined();
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('sets a valid session cookie on success', async () => {
    const res = await login(createMockRequest('POST', '/api/auth/login', { password: 'hunter2' }, { 'x-forwarded-for': '10.0.0.2' }) as any);
    expect(res.status).toBe(200);
    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toContain(`${SESSION_COOKIE}=`);
    expect(cookie.toLowerCase()).toContain('httponly');
    expect(cookie.toLowerCase()).toContain('samesite=lax');
    const token = cookie.split(`${SESSION_COOKIE}=`)[1].split(';')[0];
    expect(await verifySessionToken(token)).toBe(true);
  });

  it('rate limits repeated attempts', async () => {
    let last = 0;
    for (let i = 0; i < 12; i++) {
      const res = await login(createMockRequest('POST', '/api/auth/login', { password: 'bad' }, { 'x-forwarded-for': '10.0.0.3' }) as any);
      last = res.status;
    }
    expect(last).toBe(429);
  });

  it('logout clears the cookie', async () => {
    const res = await logout(createMockRequest('POST', '/api/auth/logout') as any);
    expect(res.headers.get('set-cookie')).toMatch(/Max-Age=0/i);
  });

  it('status reports enabled/authenticated', async () => {
    const res = await status(createMockRequest('GET', '/api/auth/status') as any);
    expect((await parseResponse(res)).data).toEqual({ enabled: true, authenticated: false });
    delete process.env.ADMIN_PASSWORD;
    const res2 = await status(createMockRequest('GET', '/api/auth/status') as any);
    expect((await parseResponse(res2)).data).toEqual({ enabled: false, authenticated: true });
  });
});
