/** `series`: CRUD, status compare-and-set and the series row lock that serialises event changes. */
import { and, desc, eq } from 'drizzle-orm';
import type { Executor } from '../../../lib/db';
import { series } from '../../../lib/db/schema';
import { genId } from '../matches/ids';
import { gameExists } from '../games';
import { logger } from '../logger';

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
  scoring_config?: Record<string, unknown> | null;
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

export async function createSeries(ex: Executor, input: CreateSeriesInput): Promise<string> {
  const id = newSeriesId();
  await ex.insert(series).values({
    id,
    name: input.name,
    description: input.description ?? null,
    status: 'created',
    scoring_config: input.scoring_config ?? null,
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
