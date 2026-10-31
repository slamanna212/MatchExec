import { describe, it, expect, vi, afterEach } from 'vitest';
import { checkRateLimit } from '../../../src/lib/rate-limit';

// The module-level store persists across tests. Each test uses a unique key
// to avoid cross-test contamination.
let keyCounter = 0;
function uniqueKey(prefix = 'test'): string {
  return `${prefix}:${Date.now()}:${++keyCounter}`;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('checkRateLimit', () => {
  it('allows first request', () => {
    const result = checkRateLimit(uniqueKey(), 5, 60_000);
    expect(result).toBeNull();
  });

  it('allows requests up to the limit', () => {
    const key = uniqueKey();
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit(key, 5, 60_000)).toBeNull();
    }
  });

  it('blocks the request that exceeds the limit', () => {
    const key = uniqueKey();
    for (let i = 0; i < 5; i++) {
      checkRateLimit(key, 5, 60_000);
    }
    const result = checkRateLimit(key, 5, 60_000);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(429);
  });

  it('returns a response body describing the wait time on 429', async () => {
    const key = uniqueKey();
    for (let i = 0; i < 3; i++) checkRateLimit(key, 3, 60_000);
    const res = checkRateLimit(key, 3, 60_000)!;
    const body = await res.json();
    expect(body.error).toMatch(/try again/i);
  });

  it('allows again after the window resets', () => {
    vi.useFakeTimers();
    const key = uniqueKey();
    const windowMs = 5_000;
    for (let i = 0; i < 3; i++) checkRateLimit(key, 3, windowMs);
    // Window not expired yet → still blocked
    expect(checkRateLimit(key, 3, windowMs)).not.toBeNull();
    // Advance past window
    vi.advanceTimersByTime(windowMs + 1);
    expect(checkRateLimit(key, 3, windowMs)).toBeNull();
  });

  it('distinct keys do not share counters', () => {
    const keyA = uniqueKey('a');
    const keyB = uniqueKey('b');
    for (let i = 0; i < 3; i++) checkRateLimit(keyA, 3, 60_000);
    // keyA is exhausted, keyB is fresh
    expect(checkRateLimit(keyA, 3, 60_000)).not.toBeNull();
    expect(checkRateLimit(keyB, 3, 60_000)).toBeNull();
  });

  it('limit=1 blocks on the second request', () => {
    const key = uniqueKey();
    expect(checkRateLimit(key, 1, 60_000)).toBeNull();
    expect(checkRateLimit(key, 1, 60_000)).not.toBeNull();
  });

  it('special-character key is handled without error', () => {
    const key = 'restore:127.0.0.1:!@#$%';
    expect(() => checkRateLimit(key, 10, 60_000)).not.toThrow();
  });

  it('concurrent calls in same tick count accurately', () => {
    vi.useFakeTimers();
    const key = uniqueKey();
    const results = [
      checkRateLimit(key, 3, 60_000),
      checkRateLimit(key, 3, 60_000),
      checkRateLimit(key, 3, 60_000),
      checkRateLimit(key, 3, 60_000), // this one should be blocked
    ];
    const blocked = results.filter(r => r !== null);
    expect(blocked.length).toBe(1);
  });

  it('large max limit never blocks within window', () => {
    const key = uniqueKey();
    for (let i = 0; i < 1000; i++) {
      expect(checkRateLimit(key, 10_000, 60_000)).toBeNull();
    }
  });

  it('first request after window expiry starts a fresh counter', () => {
    vi.useFakeTimers();
    const key = uniqueKey();
    const windowMs = 3_000;
    checkRateLimit(key, 2, windowMs);
    checkRateLimit(key, 2, windowMs);
    // Blocked
    expect(checkRateLimit(key, 2, windowMs)).not.toBeNull();
    // Advance past window
    vi.advanceTimersByTime(windowMs + 1);
    // Fresh window: should allow 2 again
    expect(checkRateLimit(key, 2, windowMs)).toBeNull();
    expect(checkRateLimit(key, 2, windowMs)).toBeNull();
    expect(checkRateLimit(key, 2, windowMs)).not.toBeNull();
  });
});
