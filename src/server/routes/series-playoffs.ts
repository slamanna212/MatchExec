/**
 * `/api/series/:id/...` playoff routes: seed preview, seeding a planned event, stage completion (see docs/series-plan.md
 * section 4, "E (playoffs)"). Thin handlers over `src/lib/series/playoffs.ts`; mounted from `series.ts`.
 */
import { Hono } from 'hono';
import { db } from '../../../lib/db';
import { completeStage, getSeedPreview, seedPlayoffEvent } from '@/lib/series';
import { jsonError } from '../http';
import { guard } from './series-helpers';

/** The optional JSON body of the seed route: `{}` and an empty body both mean "use the computed qualifiers". Returns an error message for a bad body. */
function parseSeedBody(text: string): { entrant_ids?: string[]; force?: boolean } | string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return 'Invalid JSON body';
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return 'Invalid JSON body';
  const { entrant_ids: ids, force } = parsed as Record<string, unknown>;
  if (force !== undefined && typeof force !== 'boolean') return 'force must be a boolean';
  if (ids === undefined || ids === null) return { force };
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string' || id === '')) return 'entrant_ids must be an array of entrant ids';
  return { entrant_ids: ids as string[], force };
}

export const seriesPlayoffsRoutes = new Hono()
  .get('/:seriesId/events/:eventId/seed-preview', (c) => guard(c, 'Error previewing playoff seeding', 'Failed to preview seeding', async () => {
    return c.json(await getSeedPreview(db, c.req.param('seriesId'), c.req.param('eventId')));
  }))

  .post('/:seriesId/events/:eventId/seed', (c) => guard(c, 'Error seeding playoff event', 'Failed to seed playoff event', async () => {
    const body = parseSeedBody((await c.req.text()).trim() || '{}');
    if (typeof body === 'string') return jsonError(c, body, 400);
    const result = await seedPlayoffEvent(db, c.req.param('seriesId'), c.req.param('eventId'), body);
    return c.json(result, 201);
  }))

  .post('/:seriesId/stages/:stageId/complete', (c) => guard(c, 'Error completing stage', 'Failed to complete stage', async () => {
    return c.json(await completeStage(db, c.req.param('seriesId'), c.req.param('stageId')));
  }));
