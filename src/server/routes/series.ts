/** `/api/series/**` (series CRUD, status transitions, events, standings, membership lookups). Thin handlers over `src/lib/series`. */
import { Hono, type Context } from 'hono';
import { db } from '../../../lib/db';
import { logger } from '@/lib/logger';
import {
  SeriesError, addSeriesEvent, createSeries, deleteSeries, getSeriesById, getSeriesStandings, getSeriesSummary, findSeriesForMatch,
  findSeriesForTournament, listSeriesEventDetails, listSeriesSummaries, removeSeriesEvent, transitionSeriesStatus, updateSeries, updateSeriesEvent,
  validateEventOrder, validatePointsMultiplier, validateSeriesBody, validateSeriesDates, validateSeriesGameId, validateSeriesStatusTransition,
  type AddSeriesEventInput, type CreateSeriesInput, type SeriesStatus, type UpdateSeriesEventInput, type UpdateSeriesInput,
} from '@/lib/series';
import { jsonError } from '../http';

const VALID_STATUSES = ['created', 'active', 'complete', 'cancelled'];

/** Run a handler; domain errors keep their status, everything else is logged and answered with `failure`. */
async function guard(c: Context, label: string, failure: string, fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof SeriesError) return jsonError(c, error.message, error.status);
    logger.error(`${label}:`, error);
    return jsonError(c, failure);
  }
}

/** Parses a JSON object body; null for invalid JSON or non-object bodies. */
async function readJsonObject(c: Context): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await c.req.json();
    if (body === null || typeof body !== 'object' || Array.isArray(body)) return null;
    return body as Record<string, unknown>;
  } catch {
    return null;
  }
}

export const seriesRoutes = new Hono()
  // ── list / membership lookups / create ────────────────────────────────────
  .get('/', (c) => guard(c, 'Error listing series', 'Failed to list series', async () => {
    // Membership lookups for the "Series" row on match/tournament detail pages.
    const matchId = c.req.query('match_id');
    if (matchId) return c.json({ memberships: await findSeriesForMatch(db, matchId) });
    const tournamentId = c.req.query('tournament_id');
    if (tournamentId) return c.json({ memberships: await findSeriesForTournament(db, tournamentId) });

    // status may be repeated (?status=a&status=b) or comma-separated (?status=a,b)
    const statuses = (c.req.queries('status') ?? []).flatMap((v) => v.split(',')).map((v) => v.trim()).filter(Boolean);
    const limitParam = c.req.query('limit');
    const offsetParam = c.req.query('offset');
    const limit = limitParam ? Number.parseInt(limitParam, 10) : undefined;
    const offset = offsetParam ? Number.parseInt(offsetParam, 10) : undefined;
    if ((limit !== undefined && (!Number.isInteger(limit) || limit < 1)) || (offset !== undefined && (!Number.isInteger(offset) || offset < 0))) {
      return jsonError(c, 'limit must be a positive integer and offset a non-negative integer', 400);
    }
    return c.json({ series: await listSeriesSummaries(db, { statuses, limit, offset }) });
  }))

  .post('/', (c) => guard(c, 'Error creating series', 'Failed to create series', async () => {
    const body = await readJsonObject(c);
    if (!body) return jsonError(c, 'Invalid JSON body', 400);
    const validationError = validateSeriesBody(body, false);
    if (validationError) return jsonError(c, validationError, 400);
    const gameError = await validateSeriesGameId(db, body.game_id);
    if (gameError) return jsonError(c, gameError, 400);
    const id = await createSeries(db, { ...body, name: (body.name as string).trim() } as unknown as CreateSeriesInput);
    return c.json({ id }, 201);
  }))

  // ── one series ────────────────────────────────────────────────────────────
  .get('/:seriesId', (c) => guard(c, 'Error fetching series', 'Failed to fetch series', async () => {
    const series = await getSeriesSummary(db, c.req.param('seriesId'));
    if (!series) return jsonError(c, 'Series not found', 404);
    return c.json({ series });
  }))

  .patch('/:seriesId', (c) => guard(c, 'Error updating series', 'Failed to update series', async () => {
    const seriesId = c.req.param('seriesId');
    const series = await getSeriesById(db, seriesId);
    if (!series) return jsonError(c, 'Series not found', 404);
    const body = await readJsonObject(c);
    if (!body) return jsonError(c, 'Invalid JSON body', 400);
    const validationError = validateSeriesBody(body, true);
    if (validationError) return jsonError(c, validationError, 400);
    // A partial update can move only one end of the range, so check it against the stored value.
    const dateError = validateSeriesDates(
      body.start_date === undefined ? series.start_date : body.start_date,
      body.end_date === undefined ? series.end_date : body.end_date,
    );
    if (dateError) return jsonError(c, dateError, 400);
    const gameError = await validateSeriesGameId(db, body.game_id);
    if (gameError) return jsonError(c, gameError, 400);
    // Status changes must go through POST /transition, which validates the move is legal (e.g. can't jump from
    // 'created' straight to 'complete', can't un-complete a finished series). Silently dropping it here rather than
    // erroring keeps this endpoint usable for updating other fields in the same request.
    const { status: _status, ...editableFields } = body;
    await updateSeries(db, seriesId, {
      ...editableFields,
      ...(typeof editableFields.name === 'string' ? { name: editableFields.name.trim() } : {}),
    } as unknown as UpdateSeriesInput);
    return c.json({ success: true });
  }))

  .delete('/:seriesId', (c) => guard(c, 'Error deleting series', 'Failed to delete series', async () => {
    // Events go with the series through the FK cascade.
    if (!(await deleteSeries(db, c.req.param('seriesId')))) return jsonError(c, 'Series not found', 404);
    return c.json({ success: true });
  }))

  .post('/:seriesId/transition', (c) => guard(c, 'Error transitioning series', 'Failed to transition series', async () => {
    const seriesId = c.req.param('seriesId');
    const series = await getSeriesById(db, seriesId);
    if (!series) return jsonError(c, 'Series not found', 404);

    const body = await readJsonObject(c);
    if (!body) return jsonError(c, 'Invalid JSON body', 400);
    const newStatus = body.status;
    if (typeof newStatus !== 'string' || !VALID_STATUSES.includes(newStatus)) {
      return jsonError(c, `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`, 400);
    }

    const transitionError = validateSeriesStatusTransition(series.status, newStatus);
    if (transitionError) return jsonError(c, transitionError, 400);

    // Atomic compare-and-set so two concurrent transitions can't both win.
    const changed = await transitionSeriesStatus(db, seriesId, series.status, newStatus as SeriesStatus);
    if (!changed) return jsonError(c, 'Series status changed concurrently, please refresh and retry', 409);
    return c.json({ series: await getSeriesById(db, seriesId) });
  }))

  .get('/:seriesId/standings', (c) => guard(c, 'Error fetching series standings', 'Failed to fetch series standings', async () => {
    const seriesId = c.req.param('seriesId');
    const series = await getSeriesById(db, seriesId);
    if (!series) return jsonError(c, 'Series not found', 404);
    return c.json({ series_id: seriesId, series_name: series.name, standings: await getSeriesStandings(db, seriesId) });
  }))

  // ── events ────────────────────────────────────────────────────────────────
  .get('/:seriesId/events', (c) => guard(c, 'Error listing series events', 'Failed to list series events', async () => {
    const seriesId = c.req.param('seriesId');
    if (!(await getSeriesById(db, seriesId))) return jsonError(c, 'Series not found', 404);
    return c.json({ events: await listSeriesEventDetails(db, seriesId) });
  }))

  .post('/:seriesId/events', (c) => guard(c, 'Error adding series event', 'Failed to add series event', async () => {
    const seriesId = c.req.param('seriesId');
    const series = await getSeriesById(db, seriesId);
    if (!series) return jsonError(c, 'Series not found', 404);
    if (series.status === 'complete' || series.status === 'cancelled') {
      return jsonError(c, `Cannot modify events of a ${series.status} series`, 409);
    }

    const body = await readJsonObject(c);
    if (!body) return jsonError(c, 'Invalid JSON body', 400);
    const { event_type, match_id, tournament_id } = body;

    if (event_type !== 'match' && event_type !== 'tournament') return jsonError(c, 'event_type must be "match" or "tournament"', 400);
    if (event_type === 'match' && (typeof match_id !== 'string' || !match_id)) return jsonError(c, 'match_id is required for match events', 400);
    if (event_type === 'tournament' && (typeof tournament_id !== 'string' || !tournament_id)) return jsonError(c, 'tournament_id is required for tournament events', 400);

    if (body.points_multiplier !== undefined) {
      const err = validatePointsMultiplier(body.points_multiplier);
      if (err) return jsonError(c, err, 400);
    }
    if (body.event_order !== undefined) {
      const err = validateEventOrder(body.event_order);
      if (err) return jsonError(c, err, 400);
    }
    if (body.event_date !== undefined && body.event_date !== null && typeof body.event_date !== 'string') {
      return jsonError(c, 'event_date must be a string', 400);
    }
    if (typeof body.event_date === 'string' && Number.isNaN(Date.parse(body.event_date))) {
      return jsonError(c, 'event_date must be a valid date', 400);
    }

    const input: AddSeriesEventInput = {
      event_type,
      // a contradictory body (e.g. match event with tournament_id) is surfaced as 400 by the target check
      match_id: match_id as string | undefined,
      tournament_id: tournament_id as string | undefined,
      event_order: body.event_order as number | undefined,
      event_date: (body.event_date as string | null | undefined) ?? undefined,
      points_multiplier: body.points_multiplier as number | undefined,
    };
    const id = await addSeriesEvent(db, seriesId, input);
    return c.json({ id }, 201);
  }))

  /**
   * Edit an event's points_multiplier, event_order (swaps with the event already holding that order) and/or event_date.
   * Only allowed while the series is still 'created': once it starts, changing weights or order would silently rewrite
   * standings people have already seen.
   */
  .patch('/:seriesId/events/:eventId', (c) => guard(c, 'Error updating series event', 'Failed to update series event', async () => {
    const seriesId = c.req.param('seriesId');
    const eventId = c.req.param('eventId');
    const series = await getSeriesById(db, seriesId);
    if (!series) return jsonError(c, 'Series not found', 404);
    if (series.status !== 'created') {
      return jsonError(c, `Events can only be edited before the series starts (series is ${series.status})`, 409);
    }

    const body = await readJsonObject(c);
    if (!body) return jsonError(c, 'Invalid JSON body', 400);

    const updates: UpdateSeriesEventInput = {};
    if (body.points_multiplier !== undefined) {
      const err = validatePointsMultiplier(body.points_multiplier);
      if (err) return jsonError(c, err, 400);
      updates.points_multiplier = body.points_multiplier as number;
    }
    if (body.event_order !== undefined) {
      const err = validateEventOrder(body.event_order);
      if (err) return jsonError(c, err, 400);
      updates.event_order = body.event_order as number;
    }
    if (body.event_date !== undefined) {
      if (body.event_date !== null && (typeof body.event_date !== 'string' || Number.isNaN(Date.parse(body.event_date)))) {
        return jsonError(c, 'event_date must be a valid date or null', 400);
      }
      updates.event_date = body.event_date as string | null;
    }
    if (Object.keys(updates).length === 0) {
      return jsonError(c, 'Nothing to update: send points_multiplier, event_order and/or event_date', 400);
    }

    const result = await updateSeriesEvent(db, seriesId, eventId, updates, { requireSeriesStatus: 'created' });
    return c.json({ event: result.event, swapped_with: result.swappedWith ?? null });
  }))

  .delete('/:seriesId/events/:eventId', (c) => guard(c, 'Error removing series event', 'Failed to remove series event', async () => {
    await removeSeriesEvent(db, c.req.param('seriesId'), c.req.param('eventId'));
    return c.json({ success: true });
  }));
