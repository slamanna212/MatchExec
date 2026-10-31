// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { onError } from '../../../src/server/http';
import { checkRateLimit, rateLimit, resetRateLimits } from '../../../src/server/middleware/rate-limit';

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
});
