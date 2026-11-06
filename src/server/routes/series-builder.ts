/**
 * `/api/series/:id/...` event builder routes: create match / tournament / planned events, round-robin and race-calendar
 * generators, batches and entrant withdrawal (see docs/series-plan.md section 4, "C (builder)"). Thin handlers over
 * `src/lib/series`; mounted from `series.ts` before the `/:seriesId` routes.
 */
import { Hono } from 'hono';
import { db } from '../../../lib/db';
import {
  SeriesError, commitRaceCalendar, commitRoundRobin, createSeriesMatchEvent, createSeriesPlannedEvent, createSeriesTournamentEvent,
  deleteBatch, getEntrant, getSeriesById, getSeriesEventDto, listSeriesEventDtos, previewRaceCalendar, previewRoundRobin,
  regenerateBatch, validateCreateMatchBody, validateCreatePlannedBody, validateCreateTournamentBody, validateFixtures,
  validateRaceCalendarConfig, validateRoundRobinConfig, validateWithdrawBody, withdrawEntrant,
} from '@/lib/series';
import type {
  CreateSeriesMatchInput, CreateSeriesPlannedEventInput, CreateSeriesTournamentInput, GeneratedFixture, RaceCalendarConfig, RoundRobinConfig,
} from '../../../shared/series-types';
import { jsonError } from '../http';
import { guard, readJsonObject } from './series-helpers';

async function requireSeries(seriesId: string): Promise<void> {
  if (!(await getSeriesById(db, seriesId))) throw new SeriesError('Series not found', 404);
}

async function eventDto(seriesId: string, eventId: string) {
  const event = await getSeriesEventDto(db, seriesId, eventId);
  if (!event) throw new SeriesError('Event not found in this series', 404);
  return event;
}

/** The events a generator made, in the order they were created. */
async function eventDtos(seriesId: string, ids: readonly string[]) {
  const wanted = new Set(ids);
  return (await listSeriesEventDtos(db, seriesId)).filter((e) => wanted.has(e.id));
}

export const seriesBuilderRoutes = new Hono()
  // ── create events ─────────────────────────────────────────────────────────
  .post('/:seriesId/events/match', (c) => guard(c, 'Error creating series match', 'Failed to create match', async () => {
    const seriesId = c.req.param('seriesId');
    await requireSeries(seriesId);
    const body = await readJsonObject(c);
    if (!body) return jsonError(c, 'Invalid JSON body', 400);
    const invalid = validateCreateMatchBody(body);
    if (invalid) return jsonError(c, invalid, 400);
    const created = await createSeriesMatchEvent(db, seriesId, body as unknown as CreateSeriesMatchInput);
    return c.json({ event: await eventDto(seriesId, created.event_id), match_id: created.match_id }, 201);
  }))

  .post('/:seriesId/events/tournament', (c) => guard(c, 'Error creating series tournament', 'Failed to create tournament', async () => {
    const seriesId = c.req.param('seriesId');
    await requireSeries(seriesId);
    const body = await readJsonObject(c);
    if (!body) return jsonError(c, 'Invalid JSON body', 400);
    const invalid = validateCreateTournamentBody(body);
    if (invalid) return jsonError(c, invalid, 400);
    const created = await createSeriesTournamentEvent(db, seriesId, body as unknown as CreateSeriesTournamentInput);
    return c.json({ event: await eventDto(seriesId, created.event_id), tournament_id: created.tournament_id }, 201);
  }))

  .post('/:seriesId/events/planned', (c) => guard(c, 'Error creating planned event', 'Failed to create planned event', async () => {
    const seriesId = c.req.param('seriesId');
    await requireSeries(seriesId);
    const body = await readJsonObject(c);
    if (!body) return jsonError(c, 'Invalid JSON body', 400);
    const invalid = validateCreatePlannedBody(body);
    if (invalid) return jsonError(c, invalid, 400);
    const id = await createSeriesPlannedEvent(db, seriesId, body as unknown as CreateSeriesPlannedEventInput);
    return c.json({ event: await eventDto(seriesId, id) }, 201);
  }))

  // ── generators ────────────────────────────────────────────────────────────
  .post('/:seriesId/generators/round-robin/preview', (c) => guard(c, 'Error previewing round robin', 'Failed to preview round robin', async () => {
    const seriesId = c.req.param('seriesId');
    await requireSeries(seriesId);
    const body = await readJsonObject(c);
    if (!body) return jsonError(c, 'Invalid JSON body', 400);
    const invalid = validateRoundRobinConfig({ ...body });
    if (invalid) return jsonError(c, invalid.replace(/^config\./, ''), 400);
    return c.json(await previewRoundRobin(db, seriesId, body as unknown as RoundRobinConfig));
  }))

  .post('/:seriesId/generators/round-robin', (c) => guard(c, 'Error creating round robin', 'Failed to create round robin', async () => {
    const seriesId = c.req.param('seriesId');
    await requireSeries(seriesId);
    const body = await readJsonObject(c);
    if (!body) return jsonError(c, 'Invalid JSON body', 400);
    const invalid = validateRoundRobinConfig(body.config) ?? validateFixtures(body.fixtures);
    if (invalid) return jsonError(c, invalid, 400);
    const created = await commitRoundRobin(db, seriesId, { config: body.config as RoundRobinConfig, fixtures: body.fixtures as GeneratedFixture[] | undefined });
    return c.json({ batch_id: created.batch_id, events: await eventDtos(seriesId, created.event_ids) }, 201);
  }))

  .post('/:seriesId/generators/race-calendar/preview', (c) => guard(c, 'Error previewing race calendar', 'Failed to preview race calendar', async () => {
    const seriesId = c.req.param('seriesId');
    await requireSeries(seriesId);
    const body = await readJsonObject(c);
    if (!body) return jsonError(c, 'Invalid JSON body', 400);
    const invalid = validateRaceCalendarConfig({ ...body });
    if (invalid) return jsonError(c, invalid.replace(/^config\./, ''), 400);
    return c.json(await previewRaceCalendar(db, seriesId, body as unknown as RaceCalendarConfig));
  }))

  .post('/:seriesId/generators/race-calendar', (c) => guard(c, 'Error creating race calendar', 'Failed to create race calendar', async () => {
    const seriesId = c.req.param('seriesId');
    await requireSeries(seriesId);
    const body = await readJsonObject(c);
    if (!body) return jsonError(c, 'Invalid JSON body', 400);
    const invalid = validateRaceCalendarConfig(body.config) ?? validateFixtures(body.fixtures);
    if (invalid) return jsonError(c, invalid, 400);
    const created = await commitRaceCalendar(db, seriesId, { config: body.config as RaceCalendarConfig, fixtures: body.fixtures as GeneratedFixture[] | undefined });
    return c.json({ batch_id: created.batch_id, events: await eventDtos(seriesId, created.event_ids) }, 201);
  }))

  // ── batches ───────────────────────────────────────────────────────────────
  .post('/:seriesId/batches/:batchId/regenerate', (c) => guard(c, 'Error regenerating batch', 'Failed to regenerate batch', async () => {
    const seriesId = c.req.param('seriesId');
    await requireSeries(seriesId);
    const result = await regenerateBatch(db, seriesId, c.req.param('batchId'));
    return c.json({ removed: result.removed, events: await eventDtos(seriesId, result.event_ids) });
  }))

  .delete('/:seriesId/batches/:batchId', (c) => guard(c, 'Error deleting batch', 'Failed to delete batch', async () => {
    const seriesId = c.req.param('seriesId');
    await requireSeries(seriesId);
    const result = await deleteBatch(db, seriesId, c.req.param('batchId'));
    return c.json({ success: true, removed: result.removed, kept: result.kept });
  }))

  // ── withdraw ──────────────────────────────────────────────────────────────
  .post('/:seriesId/entrants/:entrantId/withdraw', (c) => guard(c, 'Error withdrawing entrant', 'Failed to withdraw entrant', async () => {
    const seriesId = c.req.param('seriesId');
    await requireSeries(seriesId);
    const body = await readJsonObject(c);
    if (!body) return jsonError(c, 'Invalid JSON body', 400);
    const invalid = validateWithdrawBody(body);
    if (invalid) return jsonError(c, invalid, 400);
    const entrantId = c.req.param('entrantId');
    const result = await withdrawEntrant(db, seriesId, entrantId, { unplayed: body.unplayed as 'cancel' | 'forfeit' });
    return c.json({
      entrant: (await getEntrant(db, seriesId, entrantId)) ?? result.entrant,
      cancelled: result.cancelled,
      forfeited: result.forfeited,
      removed_from: result.removed_from,
    });
  }));
