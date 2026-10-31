import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import {
  createSessionToken, verifySessionToken, verifyPassword, sanitizeNext, isPublicPath, authGate,
  SESSION_COOKIE, INTERNAL_TOKEN_HEADER, getInternalToken, timingSafeEqualStr,
} from '@/lib/auth';

const req = (path: string, headers: Record<string, string> = {}) =>
  new NextRequest(new URL(path, 'http://localhost:3000'), { headers });

describe('auth', () => {
  const saved = { ...process.env };
  beforeEach(() => { process.env.ADMIN_PASSWORD = 'hunter2'; delete process.env.AUTH_SECRET; });
  afterEach(() => { process.env = { ...saved }; });

  it('signs and verifies tokens', async () => {
    expect(await verifySessionToken(await createSessionToken())).toBe(true);
  });

  it('rejects expired tokens', async () => {
    const t = await createSessionToken(Date.now() - 10_000, 5);
    expect(await verifySessionToken(t)).toBe(false);
  });

  it('rejects tampered tokens and wrong secrets', async () => {
    const t = await createSessionToken();
    const [iat, exp, sig] = t.split('.');
    expect(await verifySessionToken(`${iat}.${Number(exp) + 1000000}.${sig}`)).toBe(false);
    expect(await verifySessionToken(`${iat}.${exp}.${sig.replace(/.$/, c => (c === 'a' ? 'b' : 'a'))}`)).toBe(false);
    expect(await verifySessionToken('garbage')).toBe(false);
    expect(await verifySessionToken(undefined)).toBe(false);
    process.env.AUTH_SECRET = 'other';
    expect(await verifySessionToken(t)).toBe(false);
  });

  it('verifies password', async () => {
    expect(await verifyPassword('hunter2')).toBe(true);
    expect(await verifyPassword('nope')).toBe(false);
    expect(timingSafeEqualStr('a', 'ab')).toBe(false);
  });

  it('guards against open redirects', () => {
    expect(sanitizeNext('/matches?x=1')).toBe('/matches?x=1');
    expect(sanitizeNext('//evil.com')).toBe('/');
    expect(sanitizeNext('https://evil.com')).toBe('/');
    expect(sanitizeNext('/\\evil.com')).toBe('/');
    expect(sanitizeNext(null)).toBe('/');
    expect(sanitizeNext('/login')).toBe('/');
  });

  it('allow-lists public paths', () => {
    expect(isPublicPath('/login')).toBe(true);
    expect(isPublicPath('/api/health/ready')).toBe(true);
    expect(isPublicPath('/api/matches')).toBe(false);
    expect(isPublicPath('/api/healthz-evil')).toBe(false);
  });

  it('is a no-op when disabled', async () => {
    delete process.env.ADMIN_PASSWORD;
    expect(await authGate(req('/api/matches'))).toBeNull();
    expect(await authGate(req('/matches'))).toBeNull();
  });

  it('blocks unauthenticated requests when enabled', async () => {
    const api = await authGate(req('/api/matches'));
    expect(api?.status).toBe(401);
    expect(await api?.json()).toEqual({ error: 'Unauthorized' });
    const page = await authGate(req('/matches?a=1'));
    expect(page?.status).toBe(307);
    expect(page?.headers.get('location')).toContain('/login?next=%2Fmatches%3Fa%3D1');
    expect(await authGate(req('/login'))).toBeNull();
    expect(await authGate(req('/api/health'))).toBeNull();
  });

  it('allows valid session cookie and internal token', async () => {
    const t = await createSessionToken();
    const withCookie = req('/api/matches');
    withCookie.cookies.set(SESSION_COOKIE, t);
    expect(await authGate(withCookie)).toBeNull();
    expect(await authGate(req('/api/matches', { [INTERNAL_TOKEN_HEADER]: await getInternalToken() }))).toBeNull();
    expect((await authGate(req('/api/matches', { [INTERNAL_TOKEN_HEADER]: 'bad' })))?.status).toBe(401);
  });
});
