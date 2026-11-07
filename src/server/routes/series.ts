/** `/api/series/**` (series CRUD, status transitions, events, standings, membership lookups). Thin handlers over `src/lib/series`. */
import { Hono } from 'hono';
import { db } from '../../../lib/db';
import {
  STANDINGS_AFFECTING_FIELDS, addSeriesEvent, createSeriesChecked, deleteSeries, editSeries, getSeriesById, getSeriesEventDto,
  getSeriesStandingsResponse, getSeriesSummary, findSeriesForMatch, findSeriesForTournament, listSeriesEventDtos, listSeriesSummaries,
  removeSeriesEvent, transitionSeries, updateSeriesEvent, validateEventOrder, validatePlacementFields, validatePointsMultiplier,
  validateSeriesBody, validateSeriesDates, SERIES_STATUSES,
  type AddSeriesEventInput, type CreateSeriesInput, type SeriesStatus, type UpdateSeriesEventInput, type UpdateSeriesInput,
} from '@/lib/series';
import { jsonError } from '../http';
import { guard, readJsonObject } from './series-helpers';
import { seriesBuilderRoutes } from './series-builder';
import { seriesEntrantsRoutes } from './series-entrants';
import { seriesPlayoffsRoutes } from './series-playoffs';

const VALID_STATUSES: readonly string[] = SERIES_STATUSES;

/** Series states in which an event's placement (stage / week / date) may still be moved around. */
const PLACEMENT_EDITABLE = ['created', 'registration', 'active'];
const STANDINGS_EDITABLE = ['created', 'registration'];

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
    // game / scoring-type / roster consistency is checked by the domain (400)
    const id = await createSeriesChecked(db, { ...body, name: (body.name as string).trim() } as unknown as CreateSeriesInput);
    return c.json({ id }, 201);
  }))

  // ── entrants / stages / player search (before the /:seriesId routes), builder and playoff routers ──
  .route('/', seriesEntrantsRoutes)
  .route('/', seriesBuilderRoutes)
  .route('/', seriesPlayoffsRoutes)

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
    // Same rule as matches: once it is over, a series' details are fixed.
    if (series.status === 'complete' || series.status === 'cancelled') {
      return jsonError(c, `A ${series.status} series cannot be edited`, 403);
    }
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
    // Status changes must go through POST /transition, which validates the move is legal (e.g. can't jump from
    // 'created' straight to 'complete', can't un-complete a finished series). Silently dropping it here rather than
    // erroring keeps this endpoint usable for updating other fields in the same request.
    const { status: _status, ...editableFields } = body;
    await editSeries(db, seriesId, {
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
    if (!(await getSeriesById(db, seriesId))) return jsonError(c, 'Series not found', 404);

    const body = await readJsonObject(c);
    if (!body) return jsonError(c, 'Invalid JSON body', 400);
    // `newStatus` matches the match / tournament transition routes; `status` is the original name and still works.
    const newStatus = body.newStatus ?? body.status;
    if (typeof newStatus !== 'string' || !VALID_STATUSES.includes(newStatus)) {
      return jsonError(c, `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`, 400);
    }

    // Validated and applied under the series row lock; follow-up work (Discord posts) commits with the change.
    return c.json({ series: await transitionSeries(db, seriesId, newStatus as SeriesStatus) });
  }))

  .get('/:seriesId/standings', (c) => guard(c, 'Error fetching series standings', 'Failed to fetch series standings', async () => {
    const view = c.req.query('view') ?? 'entrant';
    if (view !== 'entrant' && view !== 'individual') return jsonError(c, 'view must be "entrant" or "individual"', 400);
    // scope: 'season' (default) or a stage id of this series (404 otherwise, from the domain)
    const standings = await getSeriesStandingsResponse(db, c.req.param('seriesId'), { scope: c.req.query('scope') || 'season', view });
    if (!standings) return jsonError(c, 'Series not found', 404);
    return c.json(standings);
  }))

  // ── events ────────────────────────────────────────────────────────────────
  .get('/:seriesId/events', (c) => guard(c, 'Error listing series events', 'Failed to list series events', async () => {
    const seriesId = c.req.param('seriesId');
    if (!(await getSeriesById(db, seriesId))) return jsonError(c, 'Series not found', 404);
    return c.json({ events: await listSeriesEventDtos(db, seriesId) });
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

    const placementError = validatePlacementFields(body);
    if (placementError) return jsonError(c, placementError, 400);

    const input: AddSeriesEventInput = {
      event_type,
      // a contradictory body (e.g. match event with tournament_id) is surfaced as 400 by the target check
      match_id: match_id as string | undefined,
      tournament_id: tournament_id as string | undefined,
      event_order: body.event_order as number | undefined,
      event_date: (body.event_date as string | null | undefined) ?? undefined,
      points_multiplier: body.points_multiplier as number | undefined,
      stage_id: body.stage_id as string | null | undefined,
      role: body.role as AddSeriesEventInput['role'],
      week: body.week as number | null | undefined,
      counts_for_standings: body.counts_for_standings as boolean | undefined,
    };
    const id = await addSeriesEvent(db, seriesId, input);
    return c.json({ id }, 201);
  }))

  /**
   * Edit an event: stage_id / week / event_date (placement) while the series is created, in registration or active;
   * points_multiplier, event_order (swaps with the event already holding that order), role and counts_for_standings
   * only before the series starts, because changing weights, order or what counts would silently rewrite standings
   * people have already seen.
   */
  .patch('/:seriesId/events/:eventId', (c) => guard(c, 'Error updating series event', 'Failed to update series event', async () => {
    const seriesId = c.req.param('seriesId');
    const eventId = c.req.param('eventId');
    const series = await getSeriesById(db, seriesId);
    if (!series) return jsonError(c, 'Series not found', 404);
    const lockedMessage = `Events can only be edited before the series starts (series is ${series.status})`;
    if (!PLACEMENT_EDITABLE.includes(series.status)) return jsonError(c, lockedMessage, 409);

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
    const placementError = validatePlacementFields(body);
    if (placementError) return jsonError(c, placementError, 400);
    if (body.stage_id !== undefined) updates.stage_id = body.stage_id as string | null;
    if (body.role !== undefined) updates.role = body.role as UpdateSeriesEventInput['role'];
    if (body.week !== undefined) updates.week = body.week as number | null;
    if (body.counts_for_standings !== undefined) updates.counts_for_standings = body.counts_for_standings as boolean;
    if (Object.keys(updates).length === 0) {
      return jsonError(c, 'Nothing to update: send points_multiplier, event_order, event_date, stage_id, role, week and/or counts_for_standings', 400);
    }

    const affectsStandings = STANDINGS_AFFECTING_FIELDS.some((f) => updates[f] !== undefined);
    if (affectsStandings && !STANDINGS_EDITABLE.includes(series.status)) return jsonError(c, lockedMessage, 409);

    // re-checked under the series row lock, so a concurrent status change cannot let an edit through
    const result = await updateSeriesEvent(db, seriesId, eventId, updates, {
      requireSeriesStatus: affectsStandings ? STANDINGS_EDITABLE : PLACEMENT_EDITABLE,
    });
    return c.json({ event: await getSeriesEventDto(db, seriesId, eventId), swapped_with: result.swappedWith ?? null });
  }))

  .delete('/:seriesId/events/:eventId', (c) => guard(c, 'Error removing series event', 'Failed to remove series event', async () => {
    const result = await removeSeriesEvent(db, c.req.param('seriesId'), c.req.param('eventId'));
    return c.json({ success: true, deleted_target: result.deleted_target });
  }));
