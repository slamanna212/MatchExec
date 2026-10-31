/**
 * L5 — Rate Limit Integration
 *
 * Tests checkRateLimit() in-process burst behaviour. The rate limiter uses an
 * in-memory store (Map) keyed by bucket, so tests must use unique keys to
 * avoid cross-test interference.
 */

import { describe, it, expect } from 'vitest';
import { checkRateLimit, clientKey } from '@/lib/rate-limit';
import { createMockRequest } from '../../utils/api-helpers';

describe('Rate Limit Integration (L5)', () => {
  // ─── Basic allow / deny ───────────────────────────────────────────────────

  it('allows first request within limit', () => {
    const result = checkRateLimit(`burst-test-${Date.now()}-a`, 3, 60_000);
    expect(result).toBeNull();
  });

  it('allows up to max requests', () => {
    const key = `burst-allow-${Date.now()}`;
    for (let i = 0; i < 5; i++) {
      const result = checkRateLimit(key, 5, 60_000);
      expect(result).toBeNull();
    }
  });

  it('returns 429 on the (max+1)th request', () => {
    const key = `burst-deny-${Date.now()}`;
    const max = 3;
    for (let i = 0; i < max; i++) {
      checkRateLimit(key, max, 60_000);
    }
    const result = checkRateLimit(key, max, 60_000);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(429);
  });

  it('429 response body mentions retry time', async () => {
    const key = `burst-body-${Date.now()}`;
    const max = 1;
    checkRateLimit(key, max, 60_000);
    const result = checkRateLimit(key, max, 60_000);
    expect(result).not.toBeNull();
    const body = await result!.json() as { error: string };
    expect(body.error).toMatch(/try again/i);
  });

  it('separate keys are independent buckets', () => {
    const key1 = `indep-a-${Date.now()}`;
    const key2 = `indep-b-${Date.now()}`;
    const max = 1;

    checkRateLimit(key1, max, 60_000); // exhausts key1
    const resultKey1 = checkRateLimit(key1, max, 60_000); // over limit
    const resultKey2 = checkRateLimit(key2, max, 60_000); // fresh bucket

    expect(resultKey1!.status).toBe(429);
    expect(resultKey2).toBeNull();
  });

  it('resets window after windowMs elapses', async () => {
    const key = `reset-${Date.now()}`;
    const max = 1;
    checkRateLimit(key, max, 1); // 1ms window

    // Wait for the window to expire
    await new Promise(r => setTimeout(r, 10));

    const result = checkRateLimit(key, max, 1);
    expect(result).toBeNull(); // fresh window
  });

  // ─── clientKey helper ─────────────────────────────────────────────────────

  it('clientKey uses x-forwarded-for header', () => {
    const req = createMockRequest('GET', '/api/test');
    req.headers.set('x-forwarded-for', '1.2.3.4');
    const key = clientKey(req as unknown as Parameters<typeof clientKey>[0], 'restore');
    expect(key).toBe('restore:1.2.3.4');
  });

  it('clientKey trims first IP from comma-separated list', () => {
    const req = createMockRequest('GET', '/api/test');
    req.headers.set('x-forwarded-for', '10.0.0.1, 10.0.0.2, 10.0.0.3');
    const key = clientKey(req as unknown as Parameters<typeof clientKey>[0], 'backup');
    expect(key).toBe('backup:10.0.0.1');
  });

  it('clientKey uses "unknown" when no forwarded header', () => {
    const req = createMockRequest('GET', '/api/test');
    const key = clientKey(req as unknown as Parameters<typeof clientKey>[0], 'test');
    expect(key).toBe('test:unknown');
  });

  it('clientKey includes the given prefix', () => {
    const req = createMockRequest('GET', '/api/test');
    req.headers.set('x-forwarded-for', '5.5.5.5');
    expect(clientKey(req as unknown as Parameters<typeof clientKey>[0], 'myprefix')).toMatch(/^myprefix:/);
  });

  // ─── Burst: rapid-fire requests ───────────────────────────────────────────

  it('burst of 10 requests: first 5 pass, next 5 are 429 (max=5)', () => {
    const key = `burst-10-${Date.now()}`;
    const max = 5;
    const results: Array<number | null> = [];

    for (let i = 0; i < 10; i++) {
      const r = checkRateLimit(key, max, 60_000);
      results.push(r === null ? null : r.status);
    }

    const passes = results.filter(r => r === null).length;
    const blocks = results.filter(r => r === 429).length;

    expect(passes).toBe(max);
    expect(blocks).toBe(10 - max);
  });
});
