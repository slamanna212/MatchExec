/**
 * `/api/series/:id/...` event builder routes: create match / tournament / planned events, round-robin and race-calendar
 * generators, batches and entrant withdrawal (see docs/series-plan.md section 4, "C (builder)"). Thin handlers over
 * `src/lib/series`; mounted from `series.ts` before the `/:seriesId` routes.
 */
import { Hono } from 'hono';
import { db } from '../../../lib/db';
import {
  SeriesError, closeRegistration, commitRaceCalendar, commitRoundRobin, createPlannedBatch, createPlannedMatch, createSeriesMatchEvent,
  createSeriesPlannedEvent, createSeriesTournamentEvent, deleteBatch, fillPlannedMatch, generatePlannedBatch, getEntrant, getSeriesById,
  getSeriesEventDto, listBatches, listSeriesEventDtos, previewPlannedBatch, previewRaceCalendar, previewRoundRobin, regenerateBatch,
  updatePlannedBatch, updatePlannedMatch, validateCloseRegistrationBody, validateCreateMatchBody, validateCreatePlannedBody,
  validateCreatePlannedMatchBody, validateCreateTournamentBody, validateEntrantIds, validateFixtures, validateGeneratePlannedBody,
  validatePlannedBatchBody, validateRaceCalendarConfig, validateRoundRobinConfig, validateWithdrawBody, withdrawEntrant,
} from '@/lib/series';
import type {
  CloseRegistrationInput, CreatePlannedBatchInput, CreateSeriesMatchInput, CreateSeriesPlannedEventInput, CreateSeriesPlannedMatchInput,
  CreateSeriesTournamentInput, GeneratePlannedBatchInput, GeneratedFixture, RaceCalendarConfig, RoundRobinConfig,
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

/**
 * The config of a generator preview request. Commit bodies are `{ config, fixtures? }`, so a preview takes the same shape;
 * the raw config as the whole body (the original shape) is still accepted. A config itself never has a `config` key.
 */
function previewConfigOf(body: Record<string, unknown>): Record<string, unknown> {
  const inner = body.config;
  return inner !== null && typeof inner === 'object' && !Array.isArray(inner) ? (inner as Record<string, unknown>) : body;
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

  .post('/:seriesId/events/planned-match', (c) => guard(c, 'Error creating match placeholder', 'Failed to create match placeholder', async () => {
    const seriesId = c.req.param('seriesId');
    await requireSeries(seriesId);
    const body = await readJsonObject(c);
    if (!body) return jsonError(c, 'Invalid JSON body', 400);
    const invalid = validateCreatePlannedMatchBody(body);
    if (invalid) return jsonError(c, invalid, 400);
    const id = await createPlannedMatch(db, seriesId, body as unknown as CreateSeriesPlannedMatchInput);
    return c.json({ event: await eventDto(seriesId, id) }, 201);
  }))

  .patch('/:seriesId/events/:eventId/template', (c) => guard(c, 'Error updating match placeholder', 'Failed to update match placeholder', async () => {
    const seriesId = c.req.param('seriesId');
    await requireSeries(seriesId);
    const body = await readJsonObject(c);
    if (!body) return jsonError(c, 'Invalid JSON body', 400);
    const invalid = validateCreatePlannedMatchBody({ match: body.match });
    if (invalid) return jsonError(c, invalid, 400);
    const eventId = c.req.param('eventId');
    await updatePlannedMatch(db, seriesId, eventId, body.match as CreateSeriesPlannedMatchInput['match']);
    return c.json({ event: await eventDto(seriesId, eventId) });
  }))

  .post('/:seriesId/events/:eventId/fill', (c) => guard(c, 'Error filling match placeholder', 'Failed to create the match', async () => {
    const seriesId = c.req.param('seriesId');
    await requireSeries(seriesId);
    const body = await readJsonObject(c);
    if (!body) return jsonError(c, 'Invalid JSON body', 400);
    if (!Array.isArray(body.entrant_ids)) return jsonError(c, 'entrant_ids is required', 400);
    const invalid = validateEntrantIds(body.entrant_ids);
    if (invalid) return jsonError(c, invalid, 400);
    const eventId = c.req.param('eventId');
    const created = await fillPlannedMatch(db, seriesId, eventId, body.entrant_ids as string[]);
    return c.json({ event: await eventDto(seriesId, eventId), match_id: created.match_id }, 201);
  }))

  .post('/:seriesId/close-registration', (c) => guard(c, 'Error closing series registration', 'Failed to close registration', async () => {
    const seriesId = c.req.param('seriesId');
    await requireSeries(seriesId);
    const body = await readJsonObject(c);
    if (!body) return jsonError(c, 'Invalid JSON body', 400);
    const invalid = validateCloseRegistrationBody(body);
    if (invalid) return jsonError(c, invalid, 400);
    const result = await closeRegistration(db, seriesId, body as CloseRegistrationInput);
    return c.json({ ...result, series: await getSeriesById(db, seriesId) });
  }))

  // ── planned batches (round robins / race calendars generated later) ───────
  .get('/:seriesId/batches', (c) => guard(c, 'Error listing series batches', 'Failed to list schedules', async () => {
    const seriesId = c.req.param('seriesId');
    await requireSeries(seriesId);
    return c.json({ batches: await listBatches(db, seriesId) });
  }))

  .post('/:seriesId/batches', (c) => guard(c, 'Error creating planned schedule', 'Failed to create planned schedule', async () => {
    const seriesId = c.req.param('seriesId');
    await requireSeries(seriesId);
    const body = await readJsonObject(c);
    if (!body) return jsonError(c, 'Invalid JSON body', 400);
    const invalid = validatePlannedBatchBody(body);
    if (invalid) return jsonError(c, invalid, 400);
    const id = await createPlannedBatch(db, seriesId, body as unknown as CreatePlannedBatchInput);
    return c.json({ batch: (await listBatches(db, seriesId)).find((b) => b.id === id) }, 201);
  }))

  .patch('/:seriesId/batches/:batchId', (c) => guard(c, 'Error updating planned schedule', 'Failed to update planned schedule', async () => {
    const seriesId = c.req.param('seriesId');
    const batchId = c.req.param('batchId');
    await requireSeries(seriesId);
    const body = await readJsonObject(c);
    if (!body) return jsonError(c, 'Invalid JSON body', 400);
    if (body.stage_id !== undefined && body.stage_id !== null && typeof body.stage_id !== 'string') return jsonError(c, 'stage_id must be a string or null', 400);
    const batch = (await listBatches(db, seriesId)).find((b) => b.id === batchId);
    if (!batch) return jsonError(c, 'Batch not found in this series', 404);
    if (body.config !== undefined) {
      const invalid = validatePlannedBatchBody({ kind: batch.kind, config: body.config });
      if (invalid) return jsonError(c, invalid, 400);
    }
    await updatePlannedBatch(db, seriesId, batchId, {
      ...(body.config !== undefined ? { config: body.config as RoundRobinConfig | RaceCalendarConfig } : {}),
      ...(body.stage_id !== undefined ? { stage_id: body.stage_id as string | null } : {}),
    });
    return c.json({ batch: (await listBatches(db, seriesId)).find((b) => b.id === batchId) });
  }))

  .post('/:seriesId/batches/:batchId/preview', (c) => guard(c, 'Error previewing planned schedule', 'Failed to preview the schedule', async () => {
    const seriesId = c.req.param('seriesId');
    await requireSeries(seriesId);
    const body = (await readJsonObject(c)) ?? {};
    const invalid = validateGeneratePlannedBody(body);
    if (invalid) return jsonError(c, invalid, 400);
    return c.json(await previewPlannedBatch(db, seriesId, c.req.param('batchId'), body as GeneratePlannedBatchInput));
  }))

  .post('/:seriesId/batches/:batchId/generate', (c) => guard(c, 'Error generating planned schedule', 'Failed to generate the schedule', async () => {
    const seriesId = c.req.param('seriesId');
    await requireSeries(seriesId);
    const body = (await readJsonObject(c)) ?? {};
    const invalid = validateGeneratePlannedBody(body);
    if (invalid) return jsonError(c, invalid, 400);
    const { division_overrides: _ignored, ...input } = body as GeneratePlannedBatchInput;
    const created = await generatePlannedBatch(db, seriesId, c.req.param('batchId'), input);
    return c.json({ batch_id: created.batch_id, events: await eventDtos(seriesId, created.event_ids) }, 201);
  }))

  // ── generators ────────────────────────────────────────────────────────────
  .post('/:seriesId/generators/round-robin/preview', (c) => guard(c, 'Error previewing round robin', 'Failed to preview round robin', async () => {
    const seriesId = c.req.param('seriesId');
    await requireSeries(seriesId);
    const body = await readJsonObject(c);
    if (!body) return jsonError(c, 'Invalid JSON body', 400);
    const config = previewConfigOf(body);
    const invalid = validateRoundRobinConfig({ ...config });
    if (invalid) return jsonError(c, invalid.replace(/^config\./, ''), 400);
    return c.json(await previewRoundRobin(db, seriesId, config as unknown as RoundRobinConfig));
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
    const config = previewConfigOf(body);
    const invalid = validateRaceCalendarConfig({ ...config });
    if (invalid) return jsonError(c, invalid.replace(/^config\./, ''), 400);
    return c.json(await previewRaceCalendar(db, seriesId, config as unknown as RaceCalendarConfig));
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
