/** `GET /api/feed`: the dashboard activity feed (15 s polling consumer; ETag lets an unchanged first page answer 304). */
import { Hono } from 'hono';
import { db } from '../../../lib/db';
import { logger } from '@/lib/logger';
import { getFeedFingerprint, listFeed } from '@/lib/feed-helpers';
import { etagMatches, jsonError } from '../http';

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

    const filters = {
      eventType: c.req.query('event_type') || undefined,
      matchId: c.req.query('match_id') || undefined,
      tournamentId: c.req.query('tournament_id') || undefined,
      dateFrom: parseDate(dateFrom),
      dateTo: parseDate(dateTo),
    };
    const etagOf = (total: number, latest: Date | null | undefined) => `"${total}:${latest?.toISOString() ?? ''}"`;

    // Polling the first page: answer 304 from the cheap fingerprint before loading the page.
    if (!hasDateFilter && offset === 0 && c.req.header('if-none-match')) {
      const fp = await getFeedFingerprint(db, filters);
      const etag = etagOf(fp.total, fp.latest);
      if (etagMatches(c.req.header('if-none-match'), etag)) return c.body(null, 304, { ETag: etag });
    }

    const { events, total } = await listFeed(db, { limit, offset, ...filters });
    return c.json({ events, total, limit, offset }, 200, { ETag: etagOf(total, events[0]?.created_at) });
  } catch (error) {
    logger.error('Error fetching activity feed:', error);
    return jsonError(c, 'Failed to fetch activity feed');
  }
});
