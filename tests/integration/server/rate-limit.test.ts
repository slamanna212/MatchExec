// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { onError } from '../../../src/server/http';
import {
  checkRateLimit, clientIp, clientKey, rateLimit, rateLimitStoreSize, refundRateLimit, resetRateLimits, trustedProxyHops,
} from '../../../src/server/middleware/rate-limit';

beforeEach(() => {
  resetRateLimits();
  delete process.env.TRUST_PROXY;
});
afterEach(() => {
  delete process.env.TRUST_PROXY;
});

describe('rate limiting', () => {
  it('checkRateLimit throws 429 after max hits and resets after the window', () => {
    checkRateLimit('k', 2, 1000, 0);
    checkRateLimit('k', 2, 1000, 1);
    expect(() => checkRateLimit('k', 2, 1000, 2)).toThrow(/Too many requests/);
    expect(() => checkRateLimit('k', 2, 1000, 1001)).not.toThrow();
  });

  it('refundRateLimit gives one hit back, never below zero and never into a new window', () => {
    checkRateLimit('r', 2, 1000, 0);
    checkRateLimit('r', 2, 1000, 1);
    refundRateLimit('r', 2); // 2 hits -> 1
    expect(() => checkRateLimit('r', 2, 1000, 3)).not.toThrow(); // the refunded slot is usable again
    expect(() => checkRateLimit('r', 2, 1000, 4)).toThrow(/Too many requests/);

    refundRateLimit('unknown-key'); // no window: nothing to do
    checkRateLimit('w', 1, 1000, 0);
    refundRateLimit('w', 5000); // window already over: do not touch the next one
    checkRateLimit('w', 1, 1000, 5001); // opens a fresh window (count 1)
    expect(() => checkRateLimit('w', 1, 1000, 5002)).toThrow(/Too many requests/);
  });

  it('middleware returns a 429 JSON error keyed by client IP', async () => {
    process.env.TRUST_PROXY = 'true';
    const a = new Hono();
    a.onError(onError);
    a.use('*', rateLimit('t', 1, 60_000));
    a.get('/', (c) => c.json({ ok: true }));
    const h = { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' };
    expect((await a.request('/', { headers: h })).status).toBe(200); // keyed by 5.6.7.8 (the hop the proxy appended)
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

  it('clientKey ignores x-forwarded-for unless TRUST_PROXY is set (a client could write any address)', async () => {
    const app = new Hono();
    app.get('/', (c) => c.json({ a: clientKey(c, 'p') }));
    expect((await (await app.request('/', { headers: { 'x-forwarded-for': '10.0.0.1' } })).json()).a).toBe('p:unknown');
    expect((await (await app.request('/')).json()).a).toBe('p:unknown');
  });

  it('with TRUST_PROXY the N-th x-forwarded-for entry from the right is used, so spoofed leading entries are skipped', async () => {
    const app = new Hono();
    app.get('/', (c) => c.json({ ip: clientIp(c) }));
    const ip = async (xff?: string) => (await (await app.request('/', xff ? { headers: { 'x-forwarded-for': xff } } : {})).json()).ip;

    process.env.TRUST_PROXY = 'true';
    expect(await ip('10.0.0.1')).toBe('10.0.0.1');
    expect(await ip(' 6.6.6.6 , 10.0.0.3')).toBe('10.0.0.3');
    expect(await ip()).toBe('unknown');

    process.env.TRUST_PROXY = '2';
    expect(await ip('6.6.6.6, 10.0.0.4, 10.0.0.5')).toBe('10.0.0.4');
    expect(await ip('10.0.0.6')).toBe('10.0.0.6'); // shorter chain than the hop count: the only entry
  });

  it('trustedProxyHops parses TRUST_PROXY', () => {
    expect(trustedProxyHops({})).toBe(0);
    expect(trustedProxyHops({ TRUST_PROXY: 'false' })).toBe(0);
    expect(trustedProxyHops({ TRUST_PROXY: '0' })).toBe(0);
    expect(trustedProxyHops({ TRUST_PROXY: 'TRUE' })).toBe(1);
    expect(trustedProxyHops({ TRUST_PROXY: '3' })).toBe(3);
    expect(trustedProxyHops({ TRUST_PROXY: 'nonsense' })).toBe(0);
  });

  it('expired windows are swept so one-off keys do not accumulate', () => {
    for (let i = 0; i < 50; i++) checkRateLimit(`once-${i}`, 5, 1000, 0);
    expect(rateLimitStoreSize()).toBe(50);
    checkRateLimit('later', 5, 1000, 120_000); // past the windows and the sweep interval
    expect(rateLimitStoreSize()).toBe(1);
  });
});
