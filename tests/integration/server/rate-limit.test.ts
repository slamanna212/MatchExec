// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { onError } from '../../../src/server/http';
import { checkRateLimit, clientKey, rateLimit, resetRateLimits } from '../../../src/server/middleware/rate-limit';

beforeEach(() => resetRateLimits());

describe('rate limiting', () => {
  it('checkRateLimit throws 429 after max hits and resets after the window', () => {
    checkRateLimit('k', 2, 1000, 0);
    checkRateLimit('k', 2, 1000, 1);
    expect(() => checkRateLimit('k', 2, 1000, 2)).toThrow(/Too many requests/);
    expect(() => checkRateLimit('k', 2, 1000, 1001)).not.toThrow();
  });

  it('middleware returns a 429 JSON error keyed by client IP', async () => {
    const a = new Hono();
    a.onError(onError);
    a.use('*', rateLimit('t', 1, 60_000));
    a.get('/', (c) => c.json({ ok: true }));
    const h = { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' };
    expect((await a.request('/', { headers: h })).status).toBe(200);
    const blocked = await a.request('/', { headers: h });
    expect(blocked.status).toBe(429);
    expect((await blocked.json()).error).toMatch(/Too many requests/);
    expect((await a.request('/', { headers: { 'x-forwarded-for': '9.9.9.9' } })).status).toBe(200);
  });

  const hit = (key: string, max: number, windowMs = 60_000, now = 0): boolean => {
    try { checkRateLimit(key, max, windowMs, now); return true; } catch { return false; }
  };

  it('allows the first request and requests up to the limit', () => {
    expect(hit('a', 3)).toBe(true);
    expect(hit('a', 3)).toBe(true);
    expect(hit('a', 3)).toBe(true);
  });

  it('blocks the request that exceeds the limit; limit=1 blocks the second request', () => {
    expect(hit('b', 1)).toBe(true);
    expect(hit('b', 1)).toBe(false);
  });

  it('429 error message describes the wait time', () => {
    for (let i = 0; i < 3; i++) checkRateLimit('c', 3, 60_000, 0);
    expect(() => checkRateLimit('c', 3, 60_000, 10_000)).toThrow(/try again in 50s/i);
  });

  it('distinct keys do not share counters and special characters are fine', () => {
    expect(hit('x', 1)).toBe(true);
    expect(hit('y', 1)).toBe(true);
    expect(hit('weird:key/with spaces:é', 1)).toBe(true);
    expect(hit('x', 1)).toBe(false);
  });

  it('first request after window expiry starts a fresh counter', () => {
    expect(hit('d', 1, 1000, 0)).toBe(true);
    expect(hit('d', 1, 1000, 500)).toBe(false);
    expect(hit('d', 1, 1000, 1000)).toBe(true);
    expect(hit('d', 1, 1000, 1001)).toBe(false);
  });

  it('a large max never blocks within the window', () => {
    for (let i = 0; i < 500; i++) expect(hit('big', 1_000_000)).toBe(true);
  });

  it('burst of 10 requests with max=5: first 5 pass, next 5 are blocked', () => {
    const results = Array.from({ length: 10 }, () => hit('burst', 5));
    expect(results).toEqual([true, true, true, true, true, false, false, false, false, false]);
  });

  it('clientKey uses the first x-forwarded-for hop, "unknown" without the header, and the prefix', async () => {
    const app = new Hono();
    app.get('/', (c) => c.json({
      a: clientKey(c, 'p'),
    }));
    expect((await (await app.request('/', { headers: { 'x-forwarded-for': '10.0.0.1' } })).json()).a).toBe('p:10.0.0.1');
    expect((await (await app.request('/', { headers: { 'x-forwarded-for': ' 10.0.0.2 , 10.0.0.3' } })).json()).a).toBe('p:10.0.0.2');
    expect((await (await app.request('/')).json()).a).toBe('p:unknown');
  });
});
