/**
 * `series_events`: add / list / edit / remove.
 *
 * Race handling (plan 1.3): every mutation runs in one transaction that first takes `SELECT ... FOR UPDATE` on the
 * series row. Concurrent adds therefore compute `MAX(event_order)+1` one after the other, a reorder's park-and-swap is
 * never observed half done, and a status change (the series starting) cannot slip between the status check and the
 * write. The unique indexes stay as the backstop and are mapped to 409s.
 */
import { and, asc, eq, isNotNull, ne, sql } from 'drizzle-orm';
import type { Executor } from '../../../lib/db';
import { uniqueViolationConstraint } from '../../../lib/db/errors';
import { deleteBlob, deleteBlobsFor } from '../../../lib/storage';
import {
  gameModes, matchTeams, matches, seriesEvents, seriesStages, tournamentTeams, tournaments,
} from '../../../lib/db/schema';
import type { SeriesEventRole } from '../../../shared/series-types';
import { MATCH_ACTION_EVENTS, removeFeedEvents } from '../feed-helpers';
import { logger } from '../logger';
import { deleteMatch } from '../matches/matches';
import { enqueueDeletion } from '../queues/enqueue';
import { deleteTournament, listTournamentMatchesIds, lockTournament } from '../tournaments/tournaments';
import { SeriesError, allowedGameIds, lockSeries, newSeriesEventId, toDateOrNull, type SeriesRow } from './series';

export type SeriesEventRow = typeof seriesEvents.$inferSelect;

export interface AddSeriesEventInput {
  event_type: 'match' | 'tournament';
  match_id?: string;
  tournament_id?: string;
  event_order?: number;
  /** ISO date string. */
  event_date?: string;
  points_multiplier?: number;
  stage_id?: string | null;
  role?: SeriesEventRole;
  week?: number | null;
  /** Default: true for `regular`, false for every other role. */
  counts_for_standings?: boolean;
}

export interface UpdateSeriesEventInput {
  points_multiplier?: number;
  event_order?: number;
  /** null clears the date. */
  event_date?: string | null;
  /** null moves the event out of its stage. */
  stage_id?: string | null;
  role?: SeriesEventRole;
  week?: number | null;
  counts_for_standings?: boolean;
}

/** Edit fields that change standings or the event order: only allowed before the series starts. */
export const STANDINGS_AFFECTING_FIELDS = ['points_multiplier', 'event_order', 'counts_for_standings', 'role'] as const;

export type UpdateSeriesEventResult = { event: SeriesEventRow; swappedWith?: string };

export type SeriesEventCheck = { error: string; status: 400 | 404 | 409 } | null;

export async function listSeriesEvents(ex: Executor, seriesId: string): Promise<SeriesEventRow[]> {
  return ex.select().from(seriesEvents).where(eq(seriesEvents.series_id, seriesId)).orderBy(asc(seriesEvents.event_order), asc(seriesEvents.id));
}

/** Validates that the target of a new event exists, is consistent with event_type, and isn't already part of the series. */
export async function checkSeriesEventTarget(ex: Executor, seriesId: string, input: AddSeriesEventInput): Promise<SeriesEventCheck> {
  if (input.event_type === 'match') {
    if (input.tournament_id) return { error: 'tournament_id must not be set for match events', status: 400 };
    const [m] = await ex.select({ id: matches.id, tournament_id: matches.tournament_id }).from(matches).where(eq(matches.id, input.match_id ?? ''));
    if (!m) return { error: 'Match not found', status: 400 };
    const [dup] = await ex.select({ id: seriesEvents.id }).from(seriesEvents)
      .where(and(eq(seriesEvents.series_id, seriesId), eq(seriesEvents.match_id, m.id)));
    if (dup) return { error: 'Match is already part of this series', status: 409 };
    if (m.tournament_id) {
      const [viaTournament] = await ex.select({ id: seriesEvents.id }).from(seriesEvents)
        .where(and(eq(seriesEvents.series_id, seriesId), eq(seriesEvents.tournament_id, m.tournament_id)));
      if (viaTournament) {
        return { error: 'This match belongs to a tournament that is already part of this series; adding it would count it twice', status: 409 };
      }
    }
  } else {
    if (input.match_id) return { error: 'match_id must not be set for tournament events', status: 400 };
    const [t] = await ex.select({ id: tournaments.id }).from(tournaments).where(eq(tournaments.id, input.tournament_id ?? ''));
    if (!t) return { error: 'Tournament not found', status: 400 };
    const [dup] = await ex.select({ id: seriesEvents.id }).from(seriesEvents)
      .where(and(eq(seriesEvents.series_id, seriesId), eq(seriesEvents.tournament_id, t.id)));
    if (dup) return { error: 'Tournament is already part of this series', status: 409 };
    const [viaMatch] = await ex.select({ id: seriesEvents.id }).from(seriesEvents)
      .innerJoin(matches, eq(matches.id, seriesEvents.match_id))
      .where(and(eq(seriesEvents.series_id, seriesId), eq(matches.tournament_id, t.id)));
    if (viaMatch) {
      return { error: 'One of this tournament\'s matches is already part of this series; adding the tournament would count it twice', status: 409 };
    }
  }
  return null;
}

/** The stage must belong to the series. */
async function assertStageInSeries(tx: Executor, seriesId: string, stageId: string | null | undefined): Promise<void> {
  if (!stageId) return;
  const [row] = await tx.select({ id: seriesStages.id }).from(seriesStages).where(and(eq(seriesStages.id, stageId), eq(seriesStages.series_id, seriesId)));
  if (!row) throw new SeriesError('stage_id does not match a stage of this series', 400);
}

/**
 * When the series has a scoring type, the attached match / tournament must be of an allowed game and (when it has a
 * mode) of that scoring type. Legacy series (no scoring type) accept anything.
 */
export async function checkSeriesEventScoring(ex: Executor, series: Pick<SeriesRow, 'scoring_type' | 'game_id' | 'game_ids'>, input: AddSeriesEventInput): Promise<SeriesEventCheck> {
  if (!series.scoring_type) return null;
  let gameId: string | null = null;
  let modeId: string | null = null;
  if (input.event_type === 'match') {
    const [m] = await ex.select({ game_id: matches.game_id, mode_id: matches.mode_id }).from(matches).where(eq(matches.id, input.match_id ?? ''));
    gameId = m?.game_id ?? null;
    modeId = m?.mode_id ?? null;
  } else {
    const [t] = await ex.select({ game_id: tournaments.game_id, mode_id: tournaments.game_mode_id }).from(tournaments).where(eq(tournaments.id, input.tournament_id ?? ''));
    gameId = t?.game_id ?? null;
    modeId = t?.mode_id ?? null;
  }
  if (!gameId) return null; // an unknown target is reported by the target check
  const allowed = allowedGameIds(series);
  if (allowed && !allowed.includes(gameId)) return { error: `Game ${gameId} is not one of this series' games`, status: 400 };
  if (modeId) {
    const [mode] = await ex.select({ scoring_type: gameModes.scoring_type }).from(gameModes).where(and(eq(gameModes.id, modeId), eq(gameModes.game_id, gameId)));
    if (mode && mode.scoring_type !== series.scoring_type) {
      return { error: `This series only takes ${series.scoring_type} events, but the ${input.event_type} is ${mode.scoring_type}`, status: 400 };
    }
  }
  return null;
}

/** Locks the series and refuses (409) when it can no longer change its events. Returns the locked row. */
async function lockEditableSeries(tx: Executor, seriesId: string) {
  const row = await lockSeries(tx, seriesId);
  if (!row) throw new SeriesError('Series not found', 404);
  if (row.status === 'complete' || row.status === 'cancelled') {
    throw new SeriesError(`Cannot modify events of a ${row.status} series`, 409);
  }
  return row;
}

/**
 * Adds a series event. When `event_order` isn't given it is `MAX(event_order)+1`, computed under the series row lock so
 * concurrent adds never pick the same slot. Throws `SeriesError` (404 unknown series, 409 locked / duplicate target /
 * order taken, 400 bad target).
 */
export async function addSeriesEvent(ex: Executor, seriesId: string, input: AddSeriesEventInput): Promise<string> {
  return ex.transaction(async (tx) => {
    const series = await lockEditableSeries(tx, seriesId);

    const targetError = await checkSeriesEventTarget(tx, seriesId, input);
    if (targetError) throw new SeriesError(targetError.error, targetError.status);
    const scoringError = await checkSeriesEventScoring(tx, series, input);
    if (scoringError) throw new SeriesError(scoringError.error, scoringError.status);
    await assertStageInSeries(tx, seriesId, input.stage_id);
    const role = input.role ?? 'regular';

    let eventOrder = input.event_order;
    if (eventOrder === undefined) {
      const [row] = await tx.select({ max_order: sql<number | null>`max(${seriesEvents.event_order})`.mapWith((v) => (v === null ? null : Number(v))) })
        .from(seriesEvents).where(eq(seriesEvents.series_id, seriesId));
      eventOrder = (row?.max_order ?? 0) + 1;
    }
    const id = newSeriesEventId();

    try {
      await tx.insert(seriesEvents).values({
        id,
        series_id: seriesId,
        event_type: input.event_type,
        match_id: input.match_id ?? null,
        tournament_id: input.tournament_id ?? null,
        event_order: eventOrder,
        event_date: toDateOrNull(input.event_date),
        points_multiplier: input.points_multiplier ?? 1.0,
        stage_id: input.stage_id ?? null,
        role,
        week: input.week ?? null,
        counts_for_standings: input.counts_for_standings ?? role === 'regular',
        status: 'live',
      });
    } catch (err) {
      const constraint = uniqueViolationConstraint(err);
      if (constraint === null) throw err;
      if (/event_order/.test(constraint)) throw new SeriesError('event_order is already used in this series', 409);
      if (/match|tournament/.test(constraint)) throw new SeriesError('Event is already part of this series', 409);
      throw err;
    }
    logger.debug(`Series event ${id} added to ${seriesId} at order ${eventOrder}`);
    return id;
  });
}

/** A series-created target has teams pre-assigned to entrants; an attached one never does. */
export async function isSeriesCreatedEvent(ex: Executor, event: Pick<SeriesEventRow, 'match_id' | 'tournament_id'>): Promise<boolean> {
  if (event.match_id) {
    const [row] = await ex.select({ id: matchTeams.id }).from(matchTeams)
      .where(and(eq(matchTeams.match_id, event.match_id), isNotNull(matchTeams.series_entrant_id))).limit(1);
    return !!row;
  }
  if (event.tournament_id) {
    const [row] = await ex.select({ id: tournamentTeams.id }).from(tournamentTeams)
      .where(and(eq(tournamentTeams.tournament_id, event.tournament_id), isNotNull(tournamentTeams.series_entrant_id))).limit(1);
    return !!row;
  }
  return false;
}

const UNSTARTED_MATCH = ['created', 'gather', 'assign'];
const UNSTARTED_TOURNAMENT = ['created', 'gather', 'assign'];

/** Deletes a not-yet-started match the way the match DELETE route does (Discord cleanup queued in the same tx). */
async function deleteUnstartedMatch(tx: Executor, matchId: string): Promise<boolean> {
  const [m] = await tx.select({ status: matches.status, tournament_id: matches.tournament_id, event_image_url: matches.event_image_url })
    .from(matches).where(eq(matches.id, matchId)).for('update');
  if (!m || m.tournament_id || !UNSTARTED_MATCH.includes(m.status)) return false;
  await enqueueDeletion(tx, matchId);
  await removeFeedEvents(tx, matchId, MATCH_ACTION_EVENTS);
  await deleteMatch(tx, matchId);
  await deleteBlobsFor(tx, { type: 'match', id: matchId });
  if (m.event_image_url) await deleteBlob(tx, m.event_image_url);
  return true;
}

/** Deletes a not-yet-started tournament (and its matches) like the tournament DELETE route. */
async function deleteUnstartedTournament(tx: Executor, tournamentId: string): Promise<boolean> {
  const t = await lockTournament(tx, tournamentId);
  if (!t || !UNSTARTED_TOURNAMENT.includes(t.status)) return false;
  const matchIds = await listTournamentMatchesIds(tx, tournamentId);
  for (const matchId of matchIds) {
    await enqueueDeletion(tx, matchId);
    await removeFeedEvents(tx, matchId, MATCH_ACTION_EVENTS);
  }
  await enqueueDeletion(tx, tournamentId);
  await deleteTournament(tx, tournamentId);
  for (const matchId of matchIds) await deleteBlobsFor(tx, { type: 'match', id: matchId });
  if (t.event_image_url) await deleteBlob(tx, t.event_image_url);
  return true;
}

/**
 * Removes a series event (404 when the series or event doesn't exist, 409 when the series is complete / cancelled).
 * When the event was created by the series (its teams are linked to entrants) and its match / tournament has not
 * started (`created` / `gather` / `assign`), the match / tournament is deleted with it. Attached events and started
 * ones only lose the series link. Planned events (no target) are simply removed. Returns whether a target was deleted.
 */
export async function removeSeriesEvent(ex: Executor, seriesId: string, eventId: string): Promise<{ deleted_target: boolean }> {
  return ex.transaction(async (tx) => {
    await lockEditableSeries(tx, seriesId);
    const [event] = await tx.select().from(seriesEvents).where(and(eq(seriesEvents.id, eventId), eq(seriesEvents.series_id, seriesId)));
    if (!event) throw new SeriesError('Event not found in this series', 404);
    const seriesCreated = await isSeriesCreatedEvent(tx, event);
    await tx.delete(seriesEvents).where(eq(seriesEvents.id, eventId));
    let deletedTarget = false;
    if (seriesCreated && event.tournament_id) deletedTarget = await deleteUnstartedTournament(tx, event.tournament_id);
    else if (seriesCreated && event.match_id) deletedTarget = await deleteUnstartedMatch(tx, event.match_id);
    return { deleted_target: deletedTarget };
  });
}

/**
 * Edits an event's multiplier, order and/or date. Moving an event to an order another event already holds swaps the
 * two (orders are unique per series, and "move here" is what a reorder means). `requireSeriesStatus` is re-checked
 * under the series row lock, so a concurrent status change (e.g. the series starting) can't let an edit through.
 * Throws `SeriesError` (404 unknown series / event, 409 wrong series status).
 */
export async function updateSeriesEvent(
  ex: Executor,
  seriesId: string,
  eventId: string,
  updates: UpdateSeriesEventInput,
  options: { requireSeriesStatus?: string | string[] } = {},
): Promise<UpdateSeriesEventResult> {
  return ex.transaction(async (tx) => {
    const locked = await lockSeries(tx, seriesId);
    if (!locked) throw new SeriesError('Series not found', 404);
    const required = options.requireSeriesStatus === undefined ? null : [options.requireSeriesStatus].flat();
    if (required && !required.includes(locked.status)) {
      throw new SeriesError(
        required.includes('active')
          ? `Events cannot be edited in a ${locked.status} series`
          : `Events can only be edited before the series starts (series is ${locked.status})`,
        409,
      );
    }
    if (updates.stage_id !== undefined) await assertStageInSeries(tx, seriesId, updates.stage_id);

    const [event] = await tx.select().from(seriesEvents).where(and(eq(seriesEvents.id, eventId), eq(seriesEvents.series_id, seriesId)));
    if (!event) throw new SeriesError('Event not found in this series', 404);

    let swappedWith: string | undefined;
    if (updates.event_order !== undefined && updates.event_order !== event.event_order) {
      const [occupant] = await tx.select({ id: seriesEvents.id }).from(seriesEvents)
        .where(and(eq(seriesEvents.series_id, seriesId), eq(seriesEvents.event_order, updates.event_order), ne(seriesEvents.id, eventId)));
      const setOrder = (id: string, order: number) => tx.update(seriesEvents).set({ event_order: order }).where(eq(seriesEvents.id, id));
      if (occupant) {
        // park the occupant on a value no real event uses (orders are positive) while we swap
        await setOrder(occupant.id, -1);
        await setOrder(eventId, updates.event_order);
        await setOrder(occupant.id, event.event_order);
        swappedWith = occupant.id;
      } else {
        await setOrder(eventId, updates.event_order);
      }
    }
    if (updates.points_multiplier !== undefined) {
      await tx.update(seriesEvents).set({ points_multiplier: updates.points_multiplier }).where(eq(seriesEvents.id, eventId));
    }
    if (updates.event_date !== undefined) {
      await tx.update(seriesEvents).set({ event_date: toDateOrNull(updates.event_date) }).where(eq(seriesEvents.id, eventId));
    }
    const placement: Partial<typeof seriesEvents.$inferInsert> = {};
    if (updates.stage_id !== undefined) placement.stage_id = updates.stage_id;
    if (updates.role !== undefined) placement.role = updates.role;
    if (updates.week !== undefined) placement.week = updates.week;
    if (updates.counts_for_standings !== undefined) placement.counts_for_standings = updates.counts_for_standings;
    if (Object.keys(placement).length > 0) await tx.update(seriesEvents).set(placement).where(eq(seriesEvents.id, eventId));

    const [updated] = await tx.select().from(seriesEvents).where(eq(seriesEvents.id, eventId));
    return { event: updated, swappedWith };
  });
}
