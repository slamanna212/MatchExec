/** `GET /api/feed`: the dashboard activity feed (15 s polling consumer; ETag lets an unchanged first page answer 304). */
import { Hono } from 'hono';
import { db } from '../../../lib/db';
import { logger } from '@/lib/logger';
import { listFeed } from '@/lib/feed-helpers';
import { jsonError } from '../http';

function positiveInt(raw: string | undefined, fallback: number, max?: number, min = 0): number {
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < min) return fallback;
  return max === undefined ? n : Math.min(n, max);
}

function parseDate(raw: string | undefined): Date | undefined {
  if (!raw) return undefined;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export const feed = new Hono().get('/', async (c) => {
  try {
    const limit = positiveInt(c.req.query('limit'), 20, 100, 1);
    const offset = positiveInt(c.req.query('offset'), 0);
    const dateFrom = c.req.query('date_from');
    const dateTo = c.req.query('date_to');
    const hasDateFilter = !!(dateFrom || dateTo);

    const { events, total } = await listFeed(db, {
      limit,
      offset,
      eventType: c.req.query('event_type') || undefined,
      matchId: c.req.query('match_id') || undefined,
      tournamentId: c.req.query('tournament_id') || undefined,
      dateFrom: parseDate(dateFrom),
      dateTo: parseDate(dateTo),
    });

    const etag = `"${total}:${events[0]?.created_at.toISOString() ?? ''}"`;
    if (!hasDateFilter && offset === 0 && c.req.header('if-none-match') === etag) {
      return c.body(null, 304, { ETag: etag });
    }
    return c.json({ events, total, limit, offset }, 200, { ETag: etag });
  } catch (error) {
    logger.error('Error fetching activity feed:', error);
    return jsonError(c, 'Failed to fetch activity feed');
  }
});
