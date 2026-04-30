import type { NextRequest } from 'next/server';
import { apiError } from './api-response';

interface Window {
  count: number;
  resetAt: number;
}

const store = new Map<string, Window>();

/**
 * Simple fixed-window rate limiter. Returns a 429 response when the limit is
 * exceeded, or null when the request is allowed through.
 *
 * @param key      Identifies the limit bucket (e.g. `"restore:127.0.0.1"`)
 * @param max      Max requests allowed per window
 * @param windowMs Window duration in milliseconds
 */
export function checkRateLimit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  let w = store.get(key);

  if (!w || now >= w.resetAt) {
    w = { count: 1, resetAt: now + windowMs };
    store.set(key, w);
    return null;
  }

  w.count++;
  if (w.count > max) {
    const retryAfter = Math.ceil((w.resetAt - now) / 1000);
    return apiError(`Too many requests — try again in ${retryAfter}s`, 429);
  }

  return null;
}

/** Extract the most useful client identifier from a Next.js request. */
export function clientKey(request: NextRequest, prefix: string): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0].trim() : 'unknown';
  return `${prefix}:${ip}`;
}
