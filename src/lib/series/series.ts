/** `series`: CRUD, status compare-and-set and the series row lock that serialises event changes. */
import { and, asc, count, desc, eq, inArray } from 'drizzle-orm';
import type { Executor } from '../../../lib/db';
import { gameModes, series, seriesEntrants, seriesEvents, seriesStages } from '../../../lib/db/schema';
import type {
  SeriesDiscordConfig, SeriesEntrantType, SeriesMatchDefaults, SeriesScoringConfig, SeriesScoringType,
} from '../../../shared/series-types';
import { genId } from '../matches/ids';
import { gameExists } from '../games';
import { logger } from '../logger';
import { enqueueSeriesUpdate } from '../queues/enqueue';
import { onSeriesCompleted } from './playoffs';
import { validateRosterBounds, validateSeriesStatusTransition } from './validation';

export type SeriesRow = typeof series.$inferSelect;
export type SeriesStatus = SeriesRow['status'];

/** Domain error carrying the HTTP status the API should answer with. */
export class SeriesError extends Error {
  constructor(message: string, public status: 400 | 404 | 409 = 400) {
    super(message);
    this.name = 'SeriesError';
  }
}

export const newSeriesId = (): string => genId('series');
export const newSeriesEventId = (): string => genId('sevt');

export interface CreateSeriesInput {
  name: string;
  description?: string | null;
  scoring_config?: SeriesScoringConfig | null;
  entrant_type?: SeriesEntrantType;
  roster_min?: number | null;
  roster_max?: number | null;
  scoring_type?: SeriesScoringType | null;
  /** Allowed games (all must support `scoring_type`). Empty = just `game_id`. */
  game_ids?: string[];
  game_mode_id?: string | null;
  match_defaults?: SeriesMatchDefaults | null;
  discord_config?: SeriesDiscordConfig | null;
  previous_series_id?: string | null;
  /** ISO date string. */
  start_date?: string | null;
  end_date?: string | null;
  event_image_url?: string | null;
  game_id?: string | null;
  guild_id?: string | null;
  channel_id?: string | null;
  announcements?: boolean;
  player_notifications?: boolean;
  livestream_link?: string | null;
}

/** A client-supplied date string -> Date (empty / absent -> null). */
export function toDateOrNull(value: string | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null;
  return value instanceof Date ? value : new Date(value);
}

const dedupe = (ids: string[]): string[] => [...new Set(ids)];

export async function createSeries(ex: Executor, input: CreateSeriesInput): Promise<string> {
  const id = newSeriesId();
  await ex.insert(series).values({
    id,
    name: input.name,
    description: input.description ?? null,
    status: 'created',
    scoring_config: input.scoring_config ?? null,
    entrant_type: input.entrant_type ?? 'solo',
    roster_min: input.roster_min ?? null,
    roster_max: input.roster_max ?? null,
    scoring_type: input.scoring_type ?? null,
    game_ids: dedupe(input.game_ids ?? []),
    game_mode_id: input.game_mode_id || null,
    match_defaults: input.match_defaults ?? null,
    discord_config: input.discord_config ?? null,
    previous_series_id: input.previous_series_id || null,
    start_date: toDateOrNull(input.start_date),
    end_date: toDateOrNull(input.end_date),
    event_image_url: input.event_image_url ?? null,
    game_id: input.game_id || null,
    guild_id: input.guild_id ?? null,
    channel_id: input.channel_id ?? null,
    announcements: input.announcements !== false,
    player_notifications: input.player_notifications !== false,
    livestream_link: input.livestream_link ?? null,
  });
  logger.debug(`Series created: ${id}`);
  return id;
}

export async function getSeriesById(ex: Executor, seriesId: string): Promise<SeriesRow | null> {
  const [row] = await ex.select().from(series).where(eq(series.id, seriesId));
  return row ?? null;
}

export async function listSeries(ex: Executor, status?: string): Promise<SeriesRow[]> {
  const query = ex.select().from(series).$dynamic();
  const filtered = status ? query.where(eq(series.status, status as SeriesStatus)) : query;
  return filtered.orderBy(desc(series.created_at), desc(series.id));
}

/** `SELECT ... FOR UPDATE` on the series row: serialises event add / reorder / remove and status changes. */
export async function lockSeries(ex: Executor, seriesId: string): Promise<SeriesRow | undefined> {
  const [row] = await ex.select().from(series).where(eq(series.id, seriesId)).for('update');
  return row;
}

export type UpdateSeriesInput = {
  [K in keyof CreateSeriesInput]?: CreateSeriesInput[K] | null;
} & { status?: SeriesStatus };

/**
 * Updates a series. `undefined` leaves a field untouched; an explicit `null` clears nullable columns (description,
 * dates, links, ids, scoring_config).
 */
export async function updateSeries(ex: Executor, seriesId: string, updates: UpdateSeriesInput): Promise<void> {
  const set: Partial<typeof series.$inferInsert> = {};

  if (updates.name !== undefined && updates.name !== null) set.name = updates.name;
  if (updates.status !== undefined) set.status = updates.status;
  if (updates.scoring_config !== undefined) set.scoring_config = updates.scoring_config;
  if (updates.entrant_type !== undefined && updates.entrant_type !== null) set.entrant_type = updates.entrant_type;
  if (updates.roster_min !== undefined) set.roster_min = updates.roster_min;
  if (updates.roster_max !== undefined) set.roster_max = updates.roster_max;
  if (updates.scoring_type !== undefined) set.scoring_type = updates.scoring_type;
  if (updates.game_ids !== undefined) set.game_ids = dedupe(updates.game_ids ?? []);
  if (updates.game_mode_id !== undefined) set.game_mode_id = updates.game_mode_id || null;
  if (updates.match_defaults !== undefined) set.match_defaults = updates.match_defaults;
  if (updates.discord_config !== undefined) set.discord_config = updates.discord_config;
  if (updates.previous_series_id !== undefined) set.previous_series_id = updates.previous_series_id || null;
  if (updates.description !== undefined) set.description = updates.description;
  if (updates.start_date !== undefined) set.start_date = toDateOrNull(updates.start_date);
  if (updates.end_date !== undefined) set.end_date = toDateOrNull(updates.end_date);
  if (updates.event_image_url !== undefined) set.event_image_url = updates.event_image_url;
  if (updates.game_id !== undefined) set.game_id = updates.game_id || null;
  if (updates.guild_id !== undefined) set.guild_id = updates.guild_id;
  if (updates.channel_id !== undefined) set.channel_id = updates.channel_id;
  if (updates.livestream_link !== undefined) set.livestream_link = updates.livestream_link;
  if (updates.announcements !== undefined && updates.announcements !== null) set.announcements = updates.announcements;
  if (updates.player_notifications !== undefined && updates.player_notifications !== null) set.player_notifications = updates.player_notifications;

  if (Object.keys(set).length === 0) return;
  await ex.update(series).set(set).where(eq(series.id, seriesId));
}

/** Atomically moves a series from `from` to `to`. Returns false when the series was no longer in `from` (concurrent transition). */
export async function transitionSeriesStatus(ex: Executor, seriesId: string, from: SeriesStatus, to: SeriesStatus): Promise<boolean> {
  const rows = await ex.update(series).set({ status: to }).where(and(eq(series.id, seriesId), eq(series.status, from))).returning({ id: series.id });
  return rows.length > 0;
}

/** Delete a series; its events go with it through the FK cascade. */
export async function deleteSeries(ex: Executor, seriesId: string): Promise<boolean> {
  const rows = await ex.delete(series).where(eq(series.id, seriesId)).returning({ id: series.id });
  return rows.length > 0;
}

/** game_id, when given, must be an existing game. Returns an error message or null. */
export async function validateSeriesGameId(ex: Executor, gameId: unknown): Promise<string | null> {
  if (gameId === undefined || gameId === null || gameId === '') return null;
  if (typeof gameId !== 'string') return 'game_id must be a string';
  return (await gameExists(ex, gameId)) ? null : 'game_id does not match an existing game';
}

// ─── setup validation (games / scoring type / roster) ────────────────────────

/** The fields of a series that must be mutually consistent. */
export interface SeriesSetup {
  entrant_type: SeriesEntrantType;
  roster_min: number | null;
  roster_max: number | null;
  scoring_type: SeriesScoringType | null;
  game_id: string | null;
  game_ids: string[];
  game_mode_id: string | null;
  previous_series_id: string | null;
}

/** The games a series may run: `game_ids` when set, else just `game_id`; null = unrestricted (legacy series without a game). */
export function allowedGameIds(s: { game_id: string | null; game_ids: string[] }): string[] | null {
  if (s.game_ids.length > 0) return s.game_ids;
  return s.game_id ? [s.game_id] : null;
}

/**
 * Checks a series' setup as a whole (create, or an update merged onto the stored row): roster bounds, `game_id` /
 * `game_ids` exist and agree, every allowed game has a mode of the series' scoring type, `game_mode_id` is one of
 * those modes, and `previous_series_id` is another existing series. Returns an error message or null.
 */
export async function validateSeriesSetup(ex: Executor, setup: SeriesSetup, seriesId?: string): Promise<string | null> {
  const rosterError = validateRosterBounds(setup.entrant_type, setup.roster_min, setup.roster_max);
  if (rosterError) return rosterError;

  const gameIds = dedupe(setup.game_ids);
  if (gameIds.length > 0 && setup.game_id && !gameIds.includes(setup.game_id)) {
    return 'game_id must be one of game_ids when game_ids is set';
  }
  const gameError = await validateSeriesGameId(ex, setup.game_id);
  if (gameError) return gameError;

  const allowed = allowedGameIds({ game_id: setup.game_id, game_ids: gameIds });
  if (allowed) {
    const found = await ex.select({ id: gameModes.game_id }).from(gameModes).where(inArray(gameModes.game_id, allowed)).groupBy(gameModes.game_id);
    const known = new Set(found.map((r) => r.id));
    // a game without any mode is still a game; only an unknown id is an error here
    for (const id of gameIds) {
      if (!known.has(id) && !(await gameExists(ex, id))) return `game_ids contains an unknown game: ${id}`;
    }
    if (setup.scoring_type) {
      const withType = await ex.select({ id: gameModes.game_id }).from(gameModes)
        .where(and(inArray(gameModes.game_id, allowed), eq(gameModes.scoring_type, setup.scoring_type))).groupBy(gameModes.game_id);
      const ok = new Set(withType.map((r) => r.id));
      const missing = allowed.filter((g) => !ok.has(g));
      if (missing.length > 0) return `Game ${missing.join(', ')} has no ${setup.scoring_type} mode, so it cannot be part of a ${setup.scoring_type} series`;
    }
  }

  if (setup.game_mode_id) {
    const conditions = [eq(gameModes.id, setup.game_mode_id)];
    if (allowed) conditions.push(inArray(gameModes.game_id, allowed));
    const modes = await ex.select({ scoring_type: gameModes.scoring_type }).from(gameModes).where(and(...conditions));
    if (modes.length === 0) return 'game_mode_id does not match a mode of the series\' games';
    if (setup.scoring_type && !modes.some((m) => m.scoring_type === setup.scoring_type)) {
      return `game_mode_id is not a ${setup.scoring_type} mode`;
    }
  }

  if (setup.previous_series_id) {
    if (seriesId && setup.previous_series_id === seriesId) return 'previous_series_id must not point at the series itself';
    if (!(await getSeriesById(ex, setup.previous_series_id))) return 'previous_series_id does not match an existing series';
  }
  return null;
}

/** The setup fields of a stored row (what an update body is merged onto). */
export function setupOf(row: SeriesRow): SeriesSetup {
  return {
    entrant_type: row.entrant_type,
    roster_min: row.roster_min,
    roster_max: row.roster_max,
    scoring_type: row.scoring_type,
    game_id: row.game_id,
    game_ids: row.game_ids,
    game_mode_id: row.game_mode_id,
    previous_series_id: row.previous_series_id,
  };
}

/** Setup of a series about to be created from a create body (defaults applied). */
export function setupOfInput(input: CreateSeriesInput): SeriesSetup {
  return {
    entrant_type: input.entrant_type ?? 'solo',
    roster_min: input.roster_min ?? null,
    roster_max: input.roster_max ?? null,
    scoring_type: input.scoring_type ?? null,
    game_id: input.game_id || null,
    game_ids: input.game_ids ?? [],
    game_mode_id: input.game_mode_id || null,
    previous_series_id: input.previous_series_id || null,
  };
}

/** Creates a series after validating its setup. Throws `SeriesError(400)` when the setup is inconsistent. */
export async function createSeriesChecked(ex: Executor, input: CreateSeriesInput): Promise<string> {
  const error = await validateSeriesSetup(ex, setupOfInput(input));
  if (error) throw new SeriesError(error, 400);
  return createSeries(ex, input);
}

/**
 * Edits a series: merges the update onto the stored row, validates the whole setup and refuses changes that would
 * invalidate existing data (409): `entrant_type` once entrants exist, `scoring_type` once events exist. Runs under the
 * series row lock. Throws `SeriesError` (404 unknown series, 400 inconsistent setup, 409 conflict).
 */
export async function editSeries(ex: Executor, seriesId: string, updates: UpdateSeriesInput): Promise<void> {
  await ex.transaction(async (tx) => {
    const row = await lockSeries(tx, seriesId);
    if (!row) throw new SeriesError('Series not found', 404);

    const pick = <K extends keyof SeriesSetup>(key: K): SeriesSetup[K] => {
      const v = (updates as Record<string, unknown>)[key];
      return (v === undefined ? row[key as keyof SeriesRow] : v) as SeriesSetup[K];
    };
    const merged: SeriesSetup = {
      entrant_type: (updates.entrant_type ?? row.entrant_type),
      roster_min: pick('roster_min'),
      roster_max: pick('roster_max'),
      scoring_type: pick('scoring_type'),
      game_id: pick('game_id') || null,
      game_ids: updates.game_ids === undefined ? row.game_ids : (updates.game_ids ?? []),
      game_mode_id: pick('game_mode_id') || null,
      previous_series_id: pick('previous_series_id') || null,
    };
    // Only re-validate the setup when a setup field is part of the update, so an unrelated edit (a rename) of a
    // legacy series can never be refused because of how it was configured before.
    const touchesSetup = (Object.keys(merged) as Array<keyof SeriesSetup>).some((k) => (updates as Record<string, unknown>)[k] !== undefined);
    if (touchesSetup) {
      const error = await validateSeriesSetup(tx, merged, seriesId);
      if (error) throw new SeriesError(error, 400);
    }

    if (merged.entrant_type !== row.entrant_type) {
      const [{ n }] = await tx.select({ n: count() }).from(seriesEntrants).where(eq(seriesEntrants.series_id, seriesId));
      if (n > 0) throw new SeriesError('entrant_type cannot be changed once the series has entrants', 409);
    }
    if (merged.scoring_type !== row.scoring_type) {
      const [{ n }] = await tx.select({ n: count() }).from(seriesEvents).where(eq(seriesEvents.series_id, seriesId));
      if (n > 0) throw new SeriesError('scoring_type cannot be changed once the series has events', 409);
    }
    await updateSeries(tx, seriesId, updates);
  });
}

// ─── status transitions ──────────────────────────────────────────────────────

/**
 * Runs inside the transition transaction, after the status changed (never for a no-op). Follow-up work that must commit
 * with the status change belongs here:
 *  - `registration`: enqueue `registration_open` (Discord work package),
 *  - `active`: start the first stage (when none is running yet),
 *  - `complete`: finish the stage that is still running, then enqueue `champion` (`onSeriesCompleted`, playoffs.ts).
 */
export async function afterSeriesTransition(_tx: Executor, _series: SeriesRow, _from: SeriesStatus, _to: SeriesStatus): Promise<void> {
  await enqueueRegistrationOpen(_tx, _series, _to);
  await syncStagesWithSeriesStatus(_tx, _series.id, _to);
  if (_to === 'complete') await onSeriesCompleted(_tx, _series.id);
}

/**
 * Stages follow the season: the first stage starts with the series (later ones start when the previous stage is
 * completed, see `completeStage`), and a finished series leaves no stage running. Written directly (not through
 * `updateStage`) because the series row is already locked and, for `complete`, no longer editable.
 */
async function syncStagesWithSeriesStatus(tx: Executor, seriesId: string, to: SeriesStatus): Promise<void> {
  if (to === 'active') {
    const stages = await tx.select({ id: seriesStages.id, status: seriesStages.status }).from(seriesStages)
      .where(eq(seriesStages.series_id, seriesId)).orderBy(asc(seriesStages.stage_order));
    if (stages.length === 0 || stages.some((s) => s.status === 'active')) return;
    const first = stages.find((s) => s.status === 'upcoming');
    if (first) await tx.update(seriesStages).set({ status: 'active' }).where(eq(seriesStages.id, first.id));
  } else if (to === 'complete') {
    await tx.update(seriesStages).set({ status: 'complete' })
      .where(and(eq(seriesStages.series_id, seriesId), eq(seriesStages.status, 'active')));
  }
}

/** `registration_open` post (announcement channels): only when the series announces and registration posts are not switched off. */
async function enqueueRegistrationOpen(tx: Executor, row: SeriesRow, to: SeriesStatus): Promise<void> {
  if (to !== 'registration' || !row.announcements || row.discord_config?.registration_posts === false) return;
  await enqueueSeriesUpdate(tx, { seriesId: row.id, kind: 'registration_open', dedupeKey: 'registration' });
}

/**
 * Moves a series to `to` under the series row lock (legal moves: created -> registration -> active -> complete,
 * created -> active, and cancelled from any non-terminal state). Returns the updated row. Throws `SeriesError` (404
 * unknown series, 400 illegal move).
 */
export async function transitionSeries(ex: Executor, seriesId: string, to: SeriesStatus): Promise<SeriesRow> {
  return ex.transaction(async (tx) => {
    const row = await lockSeries(tx, seriesId);
    if (!row) throw new SeriesError('Series not found', 404);
    const error = validateSeriesStatusTransition(row.status, to);
    if (error) throw new SeriesError(error, 400);
    if (row.status === to) return row;
    if (!(await transitionSeriesStatus(tx, seriesId, row.status, to))) {
      throw new SeriesError('Series status changed concurrently, please refresh and retry', 409);
    }
    const updated = (await getSeriesById(tx, seriesId))!;
    await afterSeriesTransition(tx, updated, row.status, to);
    return updated;
  });
}
