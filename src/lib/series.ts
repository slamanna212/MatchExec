import { getDbInstance } from './database-init';
import { logger } from './logger';

function genId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`; // NOSONAR
}

export interface SeriesRow {
  id: string;
  name: string;
  description?: string;
  status: 'created' | 'active' | 'complete' | 'cancelled';
  scoring_config?: string;
  start_date?: string;
  end_date?: string;
  event_image_url?: string;
  game_id?: string;
  guild_id?: string;
  channel_id?: string;
  announcements: boolean;
  player_notifications: boolean;
  livestream_link?: string;
  created_at: string;
  updated_at: string;
}

export interface SeriesEventRow {
  id: string;
  series_id: string;
  event_type: 'match' | 'tournament';
  match_id?: string;
  tournament_id?: string;
  event_order: number;
  event_date?: string;
  points_multiplier: number;
}

export interface CreateSeriesInput {
  name: string;
  description?: string;
  scoring_config?: Record<string, unknown>;
  start_date?: string;
  end_date?: string;
  event_image_url?: string;
  game_id?: string;
  guild_id?: string;
  channel_id?: string;
  announcements?: boolean;
  player_notifications?: boolean;
  livestream_link?: string;
}

export interface AddSeriesEventInput {
  event_type: 'match' | 'tournament';
  match_id?: string;
  tournament_id?: string;
  event_order?: number;
  event_date?: string;
  points_multiplier?: number;
}

export async function createSeries(input: CreateSeriesInput): Promise<string> {
  const db = await getDbInstance();
  const id = genId('series');

  await db.run(`
    INSERT INTO series (
      id, name, description, status, scoring_config,
      start_date, end_date, event_image_url, game_id,
      guild_id, channel_id, announcements, player_notifications,
      livestream_link, created_at, updated_at
    ) VALUES (?, ?, ?, 'created', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `, [
    id, input.name, input.description ?? null,
    input.scoring_config ? JSON.stringify(input.scoring_config) : null,
    input.start_date ?? null, input.end_date ?? null,
    input.event_image_url ?? null, input.game_id ?? null,
    input.guild_id ?? null, input.channel_id ?? null,
    input.announcements !== false ? 1 : 0,
    input.player_notifications !== false ? 1 : 0,
    input.livestream_link ?? null,
  ]);

  logger.debug(`Series created: ${id}`);
  return id;
}

type SeriesDbRow = Omit<SeriesRow, 'announcements' | 'player_notifications'> & {
  announcements: number;
  player_notifications: number;
};

function toSeriesRow(r: SeriesDbRow): SeriesRow {
  return { ...r, announcements: Boolean(r.announcements), player_notifications: Boolean(r.player_notifications) };
}

export async function getSeriesById(seriesId: string): Promise<SeriesRow | null> {
  const db = await getDbInstance();
  const row = await db.get<SeriesDbRow>('SELECT * FROM series WHERE id = ?', [seriesId]);
  if (!row) return null;
  return toSeriesRow(row);
}

export async function listSeries(status?: string): Promise<SeriesRow[]> {
  const db = await getDbInstance();
  const rows = status
    ? await db.all<SeriesDbRow>('SELECT * FROM series WHERE status = ? ORDER BY created_at DESC', [status])
    : await db.all<SeriesDbRow>('SELECT * FROM series ORDER BY created_at DESC');
  return rows.map(toSeriesRow);
}

export async function updateSeries(seriesId: string, updates: Partial<CreateSeriesInput> & { status?: string }): Promise<void> {
  const db = await getDbInstance();
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }
  if (updates.description !== undefined) { fields.push('description = ?'); values.push(updates.description); }
  if (updates.status !== undefined) { fields.push('status = ?'); values.push(updates.status); }
  if (updates.scoring_config !== undefined) { fields.push('scoring_config = ?'); values.push(JSON.stringify(updates.scoring_config)); }
  if (updates.start_date !== undefined) { fields.push('start_date = ?'); values.push(updates.start_date); }
  if (updates.end_date !== undefined) { fields.push('end_date = ?'); values.push(updates.end_date); }
  if (updates.event_image_url !== undefined) { fields.push('event_image_url = ?'); values.push(updates.event_image_url); }
  if (updates.game_id !== undefined) { fields.push('game_id = ?'); values.push(updates.game_id); }
  if (updates.livestream_link !== undefined) { fields.push('livestream_link = ?'); values.push(updates.livestream_link); }
  if (updates.announcements !== undefined) { fields.push('announcements = ?'); values.push(updates.announcements ? 1 : 0); }
  if (updates.player_notifications !== undefined) { fields.push('player_notifications = ?'); values.push(updates.player_notifications ? 1 : 0); }

  if (fields.length === 0) return;

  fields.push('updated_at = CURRENT_TIMESTAMP');
  values.push(seriesId);

  await db.run(`UPDATE series SET ${fields.join(', ')} WHERE id = ?`, values);
}

export async function deleteSeries(seriesId: string): Promise<void> {
  const db = await getDbInstance();
  await db.run('DELETE FROM series WHERE id = ?', [seriesId]);
}

export async function addSeriesEvent(seriesId: string, input: AddSeriesEventInput): Promise<string> {
  const db = await getDbInstance();
  const id = genId('sevt');

  const maxOrderRow = await db.get<{ max_order: number | null }>(
    'SELECT MAX(event_order) as max_order FROM series_events WHERE series_id = ?', [seriesId]
  );
  const eventOrder = input.event_order ?? (maxOrderRow?.max_order ?? 0) + 1;

  await db.run(`
    INSERT INTO series_events (id, series_id, event_type, match_id, tournament_id, event_order, event_date, points_multiplier)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id, seriesId, input.event_type,
    input.match_id ?? null, input.tournament_id ?? null,
    eventOrder, input.event_date ?? null,
    input.points_multiplier ?? 1.0,
  ]);

  return id;
}

export async function listSeriesEvents(seriesId: string): Promise<SeriesEventRow[]> {
  const db = await getDbInstance();
  return db.all<SeriesEventRow>(
    'SELECT * FROM series_events WHERE series_id = ? ORDER BY event_order ASC', [seriesId]
  );
}

export async function removeSeriesEvent(eventId: string): Promise<void> {
  const db = await getDbInstance();
  await db.run('DELETE FROM series_events WHERE id = ?', [eventId]);
}

/**
 * Compute cumulative standings for a series from match_game_placements across all events.
 */
export async function getSeriesStandings(seriesId: string): Promise<Array<{
  rank: number;
  username: string;
  user_id: string;
  total_points: number;
  events_played: number;
}>> {
  const db = await getDbInstance();

  const rows = await db.all<{
    user_id: string;
    username: string;
    total_points: number;
    events_played: number;
  }>(`
    SELECT
      mp.user_id,
      mp.username,
      COALESCE(SUM(mgp.points_awarded * se.points_multiplier), 0) as total_points,
      COUNT(DISTINCT se.id) as events_played
    FROM series_events se
    JOIN matches m ON m.id = se.match_id AND se.event_type = 'match'
    JOIN match_participants mp ON mp.match_id = m.id
    LEFT JOIN match_game_placements mgp
      ON mgp.entity_id = mp.id AND mgp.entity_type = 'participant'
    LEFT JOIN match_games mg ON mg.id = mgp.match_game_id AND mg.match_id = m.id
    WHERE se.series_id = ?
    GROUP BY mp.user_id, mp.username
    UNION ALL
    SELECT
      mp.user_id,
      mp.username,
      COALESCE(SUM(mgp.points_awarded * se.points_multiplier), 0) as total_points,
      COUNT(DISTINCT se.id) as events_played
    FROM series_events se
    JOIN matches m ON m.tournament_id = se.tournament_id AND se.event_type = 'tournament'
    JOIN match_participants mp ON mp.match_id = m.id
    LEFT JOIN match_game_placements mgp
      ON mgp.entity_id = mp.id AND mgp.entity_type = 'participant'
    LEFT JOIN match_games mg ON mg.id = mgp.match_game_id AND mg.match_id = m.id
    WHERE se.series_id = ?
    GROUP BY mp.user_id, mp.username
  `, [seriesId, seriesId]);

  // Aggregate across the UNION (same player may appear from both match and tournament branches)
  const aggregated = new Map<string, { username: string; total_points: number; events_played: number }>();
  for (const row of rows) {
    const existing = aggregated.get(row.user_id);
    if (existing) {
      existing.total_points += row.total_points;
      existing.events_played += row.events_played;
    } else {
      aggregated.set(row.user_id, { username: row.username, total_points: row.total_points, events_played: row.events_played });
    }
  }

  return Array.from(aggregated.entries())
    .map(([id, data]) => ({ user_id: id, ...data }))
    .sort((a, b) => b.total_points - a.total_points || a.username.localeCompare(b.username))
    .map((entry, idx) => ({ rank: idx + 1, ...entry }));
}
