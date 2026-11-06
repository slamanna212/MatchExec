/** Small helpers shared by the `/api/series/**` routers (series.ts, series-entrants.ts, series-builder.ts, series-playoffs.ts). */
import type { Context } from 'hono';
import { logger } from '@/lib/logger';
import { SeriesError } from '@/lib/series';
import { jsonError } from '../http';

/** Run a handler; domain errors keep their status, everything else is logged and answered with `failure`. */
export async function guard(c: Context, label: string, failure: string, fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof SeriesError) return jsonError(c, error.message, error.status);
    logger.error(`${label}:`, error);
    return jsonError(c, failure);
  }
}

/** Parses a JSON object body; null for invalid JSON or non-object bodies. */
export async function readJsonObject(c: Context): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await c.req.json();
    if (body === null || typeof body !== 'object' || Array.isArray(body)) return null;
    return body as Record<string, unknown>;
  } catch {
    return null;
  }
}
