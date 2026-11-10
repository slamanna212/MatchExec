/** Fixed-window rate limiter (Hono port of src/lib/rate-limit.ts). */
import type { Context, MiddlewareHandler } from 'hono';
import { getConnInfo } from '@hono/node-server/conninfo';
import { HttpError } from '../http';

interface Window { count: number; resetAt: number }

const store = new Map<string, Window>();

/** Expired windows are swept at most this often, so keys that never come back (spoofed or one-off clients) do not pile up. */
const SWEEP_INTERVAL_MS = 60_000;
let lastSweep = 0;

function sweepExpired(now: number): void {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  for (const [key, w] of store) if (now >= w.resetAt) store.delete(key);
}

/** Throws HttpError(429) when `key` exceeded `max` requests in `windowMs`; otherwise records the hit. */
export function checkRateLimit(key: string, max: number, windowMs: number, now = Date.now()): void {
  sweepExpired(now);
  const w = store.get(key);
  if (!w || now >= w.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  w.count++;
  if (w.count > max) {
    const retryAfter = Math.ceil((w.resetAt - now) / 1000);
    throw HttpError.tooManyRequests(`Too many requests — try again in ${retryAfter}s`);
  }
}

/**
 * Give back one hit recorded by `checkRateLimit` (never below zero, never into a new window). For requests that were
 * turned away before doing anything a limiter exists to stop, so a typo does not use up the allowance.
 */
export function refundRateLimit(key: string, now = Date.now()): void {
  const w = store.get(key);
  if (w && now < w.resetAt && w.count > 0) w.count--;
}

/**
 * Number of reverse proxies in front of the server whose `X-Forwarded-For` entries are trusted (`TRUST_PROXY`).
 * Unset/`false`/`0` -> 0 (the header is ignored: any client can write it); `true` -> 1; a number -> that many hops.
 */
export function trustedProxyHops(env: Record<string, string | undefined> = process.env): number {
  const raw = (env.TRUST_PROXY ?? '').trim().toLowerCase();
  if (raw === '' || raw === 'false' || raw === '0') return 0;
  if (raw === 'true') return 1;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function socketAddress(c: Context): string | undefined {
  try {
    return getConnInfo(c).remote.address;
  } catch {
    return undefined; // app.request() in tests has no Node socket
  }
}

/**
 * Client IP for rate limiting. Without `TRUST_PROXY` this is the TCP peer address, never a header a client controls.
 * Behind N trusted proxies it is the N-th `X-Forwarded-For` entry from the right (each proxy appends the address it saw),
 * so entries a client prepended itself are skipped.
 */
export function clientIp(c: Context, env: Record<string, string | undefined> = process.env): string {
  const hops = trustedProxyHops(env);
  if (hops > 0) {
    const chain = (c.req.header('x-forwarded-for') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const ip = chain[chain.length - hops] ?? chain[0];
    if (ip) return ip;
  }
  return socketAddress(c) ?? 'unknown';
}

/** Client identifier namespaced by `prefix`. */
export function clientKey(c: Context, prefix: string): string {
  return `${prefix}:${clientIp(c)}`;
}

export function rateLimit(prefix: string, max: number, windowMs: number): MiddlewareHandler {
  return async (c, next) => {
    checkRateLimit(clientKey(c, prefix), max, windowMs);
    await next();
  };
}

export function resetRateLimits(): void {
  store.clear();
  lastSweep = 0;
}

/** Number of live windows (tests). */
export function rateLimitStoreSize(): number {
  return store.size;
}
