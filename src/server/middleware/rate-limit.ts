/** Fixed-window rate limiter (Hono port of src/lib/rate-limit.ts). */
import type { Context, MiddlewareHandler } from 'hono';
import { HttpError } from '../http';

interface Window { count: number; resetAt: number }

const store = new Map<string, Window>();

/** Throws HttpError(429) when `key` exceeded `max` requests in `windowMs`; otherwise records the hit. */
export function checkRateLimit(key: string, max: number, windowMs: number, now = Date.now()): void {
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

/** Client identifier (first X-Forwarded-For hop) namespaced by `prefix`. */
export function clientKey(c: Context, prefix: string): string {
  const forwarded = c.req.header('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0].trim() : 'unknown';
  return `${prefix}:${ip}`;
}

export function rateLimit(prefix: string, max: number, windowMs: number): MiddlewareHandler {
  return async (c, next) => {
    checkRateLimit(clientKey(c, prefix), max, windowMs);
    await next();
  };
}

export function resetRateLimits(): void {
  store.clear();
}
