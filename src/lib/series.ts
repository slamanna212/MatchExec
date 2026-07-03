import { getDbInstance } from './database-init';
import { logger } from './logger';
import { determineMatchWinner } from './scoring-functions';

type Db = Awaited<ReturnType<typeof getDbInstance>>;

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

const SERIES_STATUS_ORDER: Record<string, number> = {
  created: 0,
  active: 1,
  complete: 2,
};

/**
 * Validates a series status transition. created → active → complete is the
 * only forward path; cancelled is reachable from created/active but not from
 * a terminal state. Returns null when the transition is legal, else an
 * error message describing why it isn't.
 */
export function validateSeriesStatusTransition(current: string, next: string): string | null {
  if (current === next) return null;

  if (next === 'cancelled') {
    if (current === 'complete' || current === 'cancelled') {
      return `Cannot cancel a series that is already ${current}`;
    }
    return null;
  }

  if (current === 'cancelled' || current === 'complete') {
    return `Cannot transition a ${current} series`;
  }

  const currentOrder = SERIES_STATUS_ORDER[current];
  const nextOrder = SERIES_STATUS_ORDER[next];
  if (currentOrder === undefined || nextOrder === undefined) {
    return `Invalid status: ${next}`;
  }
  if (nextOrder !== currentOrder + 1) {
    return `Cannot move from "${current}" directly to "${next}"`;
  }
  return null;
}

const ADD_EVENT_MAX_ATTEMPTS = 5;

/**
 * Adds a series event. When event_order isn't explicitly given, it's
 * computed as MAX(event_order)+1 — a SELECT-then-INSERT that isn't atomic,
 * so two concurrent calls can compute the same order and race for the
 * UNIQUE(series_id, event_order) slot. The loser retries with a freshly
 * computed order instead of surfacing a raw constraint-violation 500.
 * An explicitly-requested event_order that conflicts is a real error and is
 * not retried.
 */
export async function addSeriesEvent(seriesId: string, input: AddSeriesEventInput): Promise<string> {
  const db = await getDbInstance();

  for (let attempt = 0; attempt < ADD_EVENT_MAX_ATTEMPTS; attempt++) {
    const maxOrderRow = await db.get<{ max_order: number | null }>(
      'SELECT MAX(event_order) as max_order FROM series_events WHERE series_id = ?', [seriesId]
    );
    const eventOrder = input.event_order ?? (maxOrderRow?.max_order ?? 0) + 1;
    const id = genId('sevt');

    try {
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
    } catch (err) {
      const isOrderConflict = err instanceof Error && /UNIQUE constraint failed.*event_order/i.test(err.message);
      const canRetry = isOrderConflict && input.event_order === undefined && attempt < ADD_EVENT_MAX_ATTEMPTS - 1;
      if (!canRetry) throw err;
      logger.debug(`addSeriesEvent: event_order ${eventOrder} taken by a concurrent insert, retrying (attempt ${attempt + 1})`);
    }
  }

  throw new Error('Failed to add series event: event_order kept conflicting with concurrent inserts');
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

export interface SeriesScoringConfig {
  match_win_points?: number;
  match_loss_points?: number;
  tournament_position_points?: number[];
  /** Position-mode match events use their own points_awarded spread instead of match_win_points/match_loss_points. Defaults to true. */
  position_event_use_event_spread?: boolean;
}

function parseScoringConfig(raw?: string): SeriesScoringConfig {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as SeriesScoringConfig;
  } catch {
    return {};
  }
}

type AddPoints = (userId: string, username: string, points: number, eventId: string) => void;

/**
 * Score a 'match' series event. Position-mode matches (by default) use their
 * own points_awarded spread from match_game_placements — the same points a
 * player earned in the match itself. Normal and FFA matches (and Position
 * matches with position_event_use_event_spread=false) use a binary
 * match_win_points/match_loss_points award based on the match's overall
 * winner (ties: nobody is credited a win, everyone gets the loss points).
 */
async function scoreMatchEvent(
  db: Db,
  event: SeriesEventRow,
  config: SeriesScoringConfig,
  addPoints: AddPoints
): Promise<void> {
  if (!event.match_id) return;

  const match = await db.get<{ scoring_type: string }>(
    `SELECT COALESCE(gm.scoring_type, 'Normal') as scoring_type
     FROM matches m
     LEFT JOIN game_modes gm ON gm.id = m.mode_id AND gm.game_id = m.game_id
     WHERE m.id = ?`,
    [event.match_id]
  );
  const scoringType = match?.scoring_type ?? 'Normal';

  const participants = await db.all<{ id: string; user_id: string; username: string; team_id: string | null }>(
    `SELECT id, user_id, username, team_id FROM match_participants WHERE match_id = ?`,
    [event.match_id]
  );
  if (participants.length === 0) return;

  const useEventSpread = scoringType === 'Position' && config.position_event_use_event_spread !== false;

  if (useEventSpread) {
    const rows = await db.all<{ entity_id: string; total_pts: number }>(
      `SELECT mgp.entity_id, SUM(mgp.points_awarded) as total_pts
       FROM match_game_placements mgp
       JOIN match_games mg ON mg.id = mgp.match_game_id
       WHERE mg.match_id = ? AND mg.status = 'completed' AND mgp.entity_type = 'participant'
       GROUP BY mgp.entity_id`,
      [event.match_id]
    );
    const byParticipant = new Map(rows.map(r => [r.entity_id, r.total_pts]));
    for (const p of participants) {
      const pts = (byParticipant.get(p.id) ?? 0) * event.points_multiplier;
      addPoints(p.user_id, p.username, pts, event.id);
    }
    return;
  }

  const winnerEntityId = await determineMatchWinner(db, event.match_id);
  const winPts = config.match_win_points ?? 0;
  const lossPts = config.match_loss_points ?? 0;

  for (const p of participants) {
    const isWinner = winnerEntityId !== null && (
      scoringType === 'Normal' ? p.team_id === winnerEntityId : p.id === winnerEntityId
    );
    addPoints(p.user_id, p.username, (isWinner ? winPts : lossPts) * event.points_multiplier, event.id);
  }
}

/**
 * Score a 'tournament' series event via tournament_position_points.
 * cumulative-points tournaments: every participant's final rank converts
 * directly via the array. Bracket tournaments: only the champion (rank 1)
 * is unambiguous without dedicated bracket-placement logic (runner-up and
 * 3rd/4th place require walking the losers bracket / a 3rd-place match) —
 * the champion team's members get tournament_position_points[0]; everyone
 * else earns 0 for this event.
 */
async function scoreTournamentEvent(
  db: Db,
  event: SeriesEventRow,
  config: SeriesScoringConfig,
  addPoints: AddPoints
): Promise<void> {
  if (!event.tournament_id) return;
  const positionPoints = config.tournament_position_points ?? [];

  const tournament = await db.get<{ format: string }>(`SELECT format FROM tournaments WHERE id = ?`, [event.tournament_id]);
  if (!tournament) return;

  if (tournament.format === 'cumulative-points') {
    const rows = await db.all<{ user_id: string; username: string; total_points: number }>(
      `SELECT mp.user_id, mp.username, COALESCE(SUM(mgp.points_awarded), 0) as total_points
       FROM match_participants mp
       JOIN matches m ON mp.match_id = m.id AND m.tournament_id = ?
       LEFT JOIN match_games mg ON mg.match_id = m.id AND mg.status = 'completed'
       LEFT JOIN match_game_placements mgp ON mgp.match_game_id = mg.id AND mgp.entity_id = mp.id AND mgp.entity_type = 'participant'
       GROUP BY mp.user_id, mp.username
       ORDER BY total_points DESC`,
      [event.tournament_id]
    );
    rows.forEach((r, idx) => {
      addPoints(r.user_id, r.username, (positionPoints[idx] ?? 0) * event.points_multiplier, event.id);
    });
    return;
  }

  const finalMatch = await db.get<{ winner_team: string }>(
    `SELECT winner_team FROM matches
     WHERE tournament_id = ? AND tournament_bracket_type = 'final' AND status = 'complete' AND winner_team IS NOT NULL
     ORDER BY tournament_round DESC LIMIT 1`,
    [event.tournament_id]
  );
  if (!finalMatch?.winner_team) return;

  const champions = await db.all<{ user_id: string; username: string }>(
    `SELECT user_id, username FROM tournament_team_members WHERE team_id = ?`,
    [finalMatch.winner_team]
  );
  const champPoints = (positionPoints[0] ?? 0) * event.points_multiplier;
  for (const c of champions) addPoints(c.user_id, c.username, champPoints, event.id);
}

/**
 * Compute cumulative standings for a series by converting each event's
 * outcome to points via series.scoring_config.
 */
export async function getSeriesStandings(seriesId: string): Promise<Array<{
  rank: number;
  username: string;
  user_id: string;
  total_points: number;
  events_played: number;
}>> {
  const db = await getDbInstance();

  const series = await getSeriesById(seriesId);
  const config = parseScoringConfig(series?.scoring_config);
  const events = await listSeriesEvents(seriesId);

  const totals = new Map<string, { username: string; total_points: number; events_played: Set<string> }>();
  const addPoints: AddPoints = (userId, username, points, eventId) => {
    const entry = totals.get(userId) ?? { username, total_points: 0, events_played: new Set<string>() };
    entry.total_points += points;
    entry.events_played.add(eventId);
    totals.set(userId, entry);
  };

  for (const event of events) {
    if (event.event_type === 'match') {
      await scoreMatchEvent(db, event, config, addPoints);
    } else if (event.event_type === 'tournament') {
      await scoreTournamentEvent(db, event, config, addPoints);
    }
  }

  return Array.from(totals.entries())
    .map(([user_id, data]) => ({ user_id, username: data.username, total_points: data.total_points, events_played: data.events_played.size }))
    .sort((a, b) => b.total_points - a.total_points || a.username.localeCompare(b.username))
    .map((entry, idx) => ({ rank: idx + 1, ...entry }));
}
