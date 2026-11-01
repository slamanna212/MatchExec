/**
 * `series_events`: add / list / edit / remove.
 *
 * Race handling (plan 1.3): every mutation runs in one transaction that first takes `SELECT ... FOR UPDATE` on the
 * series row. Concurrent adds therefore compute `MAX(event_order)+1` one after the other, a reorder's park-and-swap is
 * never observed half done, and a status change (the series starting) cannot slip between the status check and the
 * write. The unique indexes stay as the backstop and are mapped to 409s.
 */
import { and, asc, eq, ne, sql } from 'drizzle-orm';
import type { Executor } from '../../../lib/db';
import { uniqueViolationConstraint } from '../../../lib/db/errors';
import { matches, seriesEvents, tournaments } from '../../../lib/db/schema';
import { logger } from '../logger';
import { SeriesError, lockSeries, newSeriesEventId, toDateOrNull } from './series';

export type SeriesEventRow = typeof seriesEvents.$inferSelect;

export interface AddSeriesEventInput {
  event_type: 'match' | 'tournament';
  match_id?: string;
  tournament_id?: string;
  event_order?: number;
  /** ISO date string. */
  event_date?: string;
  points_multiplier?: number;
}

export interface UpdateSeriesEventInput {
  points_multiplier?: number;
  event_order?: number;
  /** null clears the date. */
  event_date?: string | null;
}

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
    await lockEditableSeries(tx, seriesId);

    const targetError = await checkSeriesEventTarget(tx, seriesId, input);
    if (targetError) throw new SeriesError(targetError.error, targetError.status);

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

/**
 * Removes a series event (404 when the series or event doesn't exist, 409 when the series is complete / cancelled).
 */
export async function removeSeriesEvent(ex: Executor, seriesId: string, eventId: string): Promise<void> {
  await ex.transaction(async (tx) => {
    await lockEditableSeries(tx, seriesId);
    const rows = await tx.delete(seriesEvents).where(and(eq(seriesEvents.id, eventId), eq(seriesEvents.series_id, seriesId))).returning({ id: seriesEvents.id });
    if (rows.length === 0) throw new SeriesError('Event not found in this series', 404);
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
  options: { requireSeriesStatus?: string } = {},
): Promise<UpdateSeriesEventResult> {
  return ex.transaction(async (tx) => {
    const locked = await lockSeries(tx, seriesId);
    if (!locked) throw new SeriesError('Series not found', 404);
    if (options.requireSeriesStatus && locked.status !== options.requireSeriesStatus) {
      throw new SeriesError(`Events can only be edited before the series starts (series is ${locked.status})`, 409);
    }

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

    const [updated] = await tx.select().from(seriesEvents).where(eq(seriesEvents.id, eventId));
    return { event: updated, swappedWith };
  });
}
