import { getDbInstance } from './database-init';
import { logger } from './logger';
import { determineMatchWinner } from './scoring-functions';
import { withTransaction } from './transaction';
import { db as pgDb } from '../../lib/db';
import { gameExists } from './games';

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

export type UpdateSeriesInput = {
  [K in keyof CreateSeriesInput]?: CreateSeriesInput[K] | null;
} & { status?: string };

const NULLABLE_TEXT_COLUMNS = [
  'description', 'start_date', 'end_date', 'event_image_url', 'game_id',
  'guild_id', 'channel_id', 'livestream_link',
] as const;

/**
 * Updates a series. `undefined` leaves a field untouched; an explicit `null`
 * clears nullable columns (description, dates, links, ids, scoring_config).
 */
export async function updateSeries(seriesId: string, updates: UpdateSeriesInput): Promise<void> {
  const db = await getDbInstance();
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.name !== undefined && updates.name !== null) { fields.push('name = ?'); values.push(updates.name); }
  if (updates.status !== undefined) { fields.push('status = ?'); values.push(updates.status); }
  if (updates.scoring_config !== undefined) {
    fields.push('scoring_config = ?');
    values.push(updates.scoring_config === null ? null : JSON.stringify(updates.scoring_config));
  }
  for (const col of NULLABLE_TEXT_COLUMNS) {
    const v = updates[col];
    if (v !== undefined) { fields.push(`${col} = ?`); values.push(v); }
  }
  if (updates.announcements !== undefined && updates.announcements !== null) { fields.push('announcements = ?'); values.push(updates.announcements ? 1 : 0); }
  if (updates.player_notifications !== undefined && updates.player_notifications !== null) { fields.push('player_notifications = ?'); values.push(updates.player_notifications ? 1 : 0); }

  if (fields.length === 0) return;

  fields.push('updated_at = CURRENT_TIMESTAMP');
  values.push(seriesId);

  await db.run(`UPDATE series SET ${fields.join(', ')} WHERE id = ?`, values);
}

/**
 * Atomically moves a series from `from` to `to`. Returns false when the
 * series was no longer in `from` (concurrent transition).
 */
export async function transitionSeriesStatus(seriesId: string, from: string, to: string): Promise<boolean> {
  const db = await getDbInstance();
  const result = await db.run(
    'UPDATE series SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = ?',
    [to, seriesId, from]
  );
  return (result?.changes ?? 0) > 0;
}

export async function deleteSeries(seriesId: string): Promise<void> {
  const db = await getDbInstance();
  // Foreign keys are off app-wide, so cascade manually.
  await withTransaction(db, async () => {
    await db.run('DELETE FROM series_events WHERE series_id = ?', [seriesId]);
    await db.run('DELETE FROM series WHERE id = ?', [seriesId]);
  });
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

/**
 * Removes a series event. When seriesId is given the event must belong to
 * that series; returns false if nothing was deleted.
 */
export async function removeSeriesEvent(eventId: string, seriesId?: string): Promise<boolean> {
  const db = await getDbInstance();
  const result = seriesId
    ? await db.run('DELETE FROM series_events WHERE id = ? AND series_id = ?', [eventId, seriesId])
    : await db.run('DELETE FROM series_events WHERE id = ?', [eventId]);
  return (result?.changes ?? 0) > 0;
}

export interface UpdateSeriesEventInput {
  points_multiplier?: number;
  event_order?: number;
  /** null clears the date. */
  event_date?: string | null;
}

export type UpdateSeriesEventResult =
  | { event: SeriesEventRow; swappedWith?: string }
  | { error: string; status: 404 | 409 };

/**
 * Edits an event's multiplier, order and/or date. Moving an event to an order another event
 * already holds swaps the two (orders are unique per series, and "move here" is what a reorder
 * means). When `requireSeriesStatus` is given it is re-checked inside the transaction, so a
 * concurrent status change (e.g. the series starting) can't let an edit through.
 */
export async function updateSeriesEvent(
  seriesId: string,
  eventId: string,
  updates: UpdateSeriesEventInput,
  options: { requireSeriesStatus?: string } = {}
): Promise<UpdateSeriesEventResult> {
  const db = await getDbInstance();

  return withTransaction(db, async () => {
    if (options.requireSeriesStatus) {
      const current = await db.get<{ status: string }>('SELECT status FROM series WHERE id = ?', [seriesId]);
      if (current?.status !== options.requireSeriesStatus) {
        return {
          error: `Events can only be edited before the series starts (series is ${current?.status ?? 'missing'})`,
          status: 409 as const,
        };
      }
    }
    const event = await db.get<SeriesEventRow>(
      'SELECT * FROM series_events WHERE id = ? AND series_id = ?', [eventId, seriesId]
    );
    if (!event) return { error: 'Event not found in this series', status: 404 as const };

    let swappedWith: string | undefined;
    if (updates.event_order !== undefined && updates.event_order !== event.event_order) {
      const occupant = await db.get<{ id: string }>(
        'SELECT id FROM series_events WHERE series_id = ? AND event_order = ?', [seriesId, updates.event_order]
      );
      if (occupant) {
        // park the occupant on a value no real event uses (orders are positive) while we swap
        await db.run('UPDATE series_events SET event_order = -1 WHERE id = ?', [occupant.id]);
        await db.run('UPDATE series_events SET event_order = ? WHERE id = ?', [updates.event_order, eventId]);
        await db.run('UPDATE series_events SET event_order = ? WHERE id = ?', [event.event_order, occupant.id]);
        swappedWith = occupant.id;
      } else {
        await db.run('UPDATE series_events SET event_order = ? WHERE id = ?', [updates.event_order, eventId]);
      }
    }
    if (updates.points_multiplier !== undefined) {
      await db.run('UPDATE series_events SET points_multiplier = ? WHERE id = ?', [updates.points_multiplier, eventId]);
    }
    if (updates.event_date !== undefined) {
      await db.run('UPDATE series_events SET event_date = ? WHERE id = ?', [updates.event_date, eventId]);
    }

    const updated = await db.get<SeriesEventRow>('SELECT * FROM series_events WHERE id = ?', [eventId]);
    return { event: updated as SeriesEventRow, swappedWith };
  });
}

export function validatePointsMultiplier(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > 10) {
    return 'points_multiplier must be a number greater than 0 and at most 10';
  }
  return null;
}

export function validateEventOrder(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    return 'event_order must be a positive integer';
  }
  return null;
}

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Validates the shape of a scoring_config object. Returns an error message or null. */
export function validateScoringConfig(config: unknown): string | null {
  if (config === null || typeof config !== 'object' || Array.isArray(config)) {
    return 'scoring_config must be an object';
  }
  const c = config as Record<string, unknown>;
  for (const key of ['match_win_points', 'match_loss_points']) {
    if (c[key] !== undefined && !isFiniteNumber(c[key])) return `scoring_config.${key} must be a number`;
  }
  if (c.tournament_position_points !== undefined) {
    const arr = c.tournament_position_points;
    if (!Array.isArray(arr) || !arr.every(isFiniteNumber)) {
      return 'scoring_config.tournament_position_points must be an array of numbers';
    }
  }
  if (c.position_event_use_event_spread !== undefined && typeof c.position_event_use_event_spread !== 'boolean') {
    return 'scoring_config.position_event_use_event_spread must be a boolean';
  }
  return null;
}

export type SeriesEventCheck = { error: string; status: 400 | 404 | 409 } | null;

/**
 * Validates that the target of a new event exists, is consistent with
 * event_type, and isn't already part of the series.
 */
export async function checkSeriesEventTarget(seriesId: string, input: AddSeriesEventInput): Promise<SeriesEventCheck> {
  const db = await getDbInstance();
  if (input.event_type === 'match') {
    if (input.tournament_id) return { error: 'tournament_id must not be set for match events', status: 400 };
    const m = await db.get<{ id: string; tournament_id: string | null }>('SELECT id, tournament_id FROM matches WHERE id = ?', [input.match_id]);
    if (!m) return { error: 'Match not found', status: 400 };
    const dup = await db.get<{ id: string }>('SELECT id FROM series_events WHERE series_id = ? AND match_id = ?', [seriesId, input.match_id]);
    if (dup) return { error: 'Match is already part of this series', status: 409 };
    if (m.tournament_id) {
      const viaTournament = await db.get<{ id: string }>(
        'SELECT id FROM series_events WHERE series_id = ? AND tournament_id = ?', [seriesId, m.tournament_id]
      );
      if (viaTournament) {
        return { error: 'This match belongs to a tournament that is already part of this series; adding it would count it twice', status: 409 };
      }
    }
  } else {
    if (input.match_id) return { error: 'match_id must not be set for tournament events', status: 400 };
    const t = await db.get<{ id: string }>('SELECT id FROM tournaments WHERE id = ?', [input.tournament_id]);
    if (!t) return { error: 'Tournament not found', status: 400 };
    const dup = await db.get<{ id: string }>('SELECT id FROM series_events WHERE series_id = ? AND tournament_id = ?', [seriesId, input.tournament_id]);
    if (dup) return { error: 'Tournament is already part of this series', status: 409 };
    const viaMatch = await db.get<{ id: string }>(
      `SELECT se.id FROM series_events se JOIN matches m ON m.id = se.match_id
       WHERE se.series_id = ? AND m.tournament_id = ?`, [seriesId, input.tournament_id]
    );
    if (viaMatch) {
      return { error: 'One of this tournament\'s matches is already part of this series; adding the tournament would count it twice', status: 409 };
    }
  }
  return null;
}

export interface SeriesScoringConfig {
  match_win_points?: number;
  match_loss_points?: number;
  tournament_position_points?: number[];
  /** Position-mode match events use their own points_awarded spread instead of match_win_points/match_loss_points. Defaults to true. */
  position_event_use_event_spread?: boolean;
}

function parseScoringConfig(raw?: string | null): SeriesScoringConfig {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (validateScoringConfig(parsed) !== null) return {};
    return parsed as SeriesScoringConfig;
  } catch {
    return {};
  }
}

type AddPoints = (playerKey: string, username: string, points: number, eventId: string) => void;

/** Stable player identity across matches: Discord id when known, else user id. */
function playerKey(p: { discord_user_id?: string | null; user_id: string }): string {
  return p.discord_user_id ?? p.user_id;
}

/**
 * Standard competition ranking over a descending-sorted list of totals:
 * tied entries share the rank (index) of the first tied entry.
 */
function tieAwareRanks(totals: number[]): number[] {
  const ranks: number[] = [];
  totals.forEach((t, i) => {
    ranks.push(i > 0 && t === totals[i - 1] ? ranks[i - 1] : i);
  });
  return ranks;
}

interface MatchEventInfo {
  status: string;
  scoring_type: string;
  tournament_id: string | null;
  winner_team: string | null;
  team1_id: string | null;
  team2_id: string | null;
}

/**
 * Score a 'match' series event. Only completed matches contribute.
 *
 * - Position matches (by default) use their own points_awarded spread from
 *   match_game_placements. This is the only mode the
 *   position_event_use_event_spread toggle applies to.
 * - Tournament matches resolve the winner via tournament_teams membership
 *   (matches.winner_team is a tournament_teams.id).
 * - Normal standalone matches compare match_teams ids; reserves and
 *   unassigned players earn nothing.
 * - Normal/FFA/Position-without-spread award match_win_points to the winner
 *   and match_loss_points to the other participants. Ties award no wins.
 */
async function scoreMatchEvent(
  db: Db,
  event: SeriesEventRow,
  config: SeriesScoringConfig,
  addPoints: AddPoints
): Promise<void> {
  if (!event.match_id) return;

  const match = await db.get<MatchEventInfo>(
    `SELECT m.status, COALESCE(gm.scoring_type, 'Normal') as scoring_type,
            m.tournament_id, m.winner_team,
            COALESCE(tm.team1_id, m.blue_team_id) as team1_id,
            COALESCE(tm.team2_id, m.red_team_id) as team2_id
     FROM matches m
     LEFT JOIN game_modes gm ON gm.id = m.mode_id AND gm.game_id = m.game_id
     LEFT JOIN tournament_matches tm ON tm.match_id = m.id
     WHERE m.id = ?`,
    [event.match_id]
  );
  if (match?.status !== 'complete') return;
  const scoringType = match.scoring_type;

  const participants = await db.all<{
    id: string; user_id: string; discord_user_id: string | null; username: string;
    team_id: string | null; team_assignment: string | null; is_reserve: number | null;
  }>(
    `SELECT mp.id, mp.user_id, mp.discord_user_id, mp.username, mp.team_id, mp.team_assignment,
            mt.is_reserve
     FROM match_participants mp
     LEFT JOIN match_teams mt ON mt.id = mp.team_id
     WHERE mp.match_id = ?`,
    [event.match_id]
  );
  if (participants.length === 0) return;

  const mult = event.points_multiplier;
  const winPts = config.match_win_points ?? 0;
  const lossPts = config.match_loss_points ?? 0;

  if (scoringType === 'Position' && config.position_event_use_event_spread !== false) {
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
      addPoints(playerKey(p), p.username, (byParticipant.get(p.id) ?? 0) * mult, event.id);
    }
    return;
  }

  if (scoringType === 'FFA' || scoringType === 'Position') {
    const rows = await db.all<{ entity_id: string; total_pts: number }>(
      `SELECT mgp.entity_id, SUM(COALESCE(mgp.points_awarded, mgp.is_winner, 0)) as total_pts
       FROM match_game_placements mgp
       JOIN match_games mg ON mg.id = mgp.match_game_id
       WHERE mg.match_id = ? AND mg.status = 'completed' AND mgp.entity_type = 'participant'
       GROUP BY mgp.entity_id`,
      [event.match_id]
    );
    const best = rows.reduce((max, r) => Math.max(max, r.total_pts), -Infinity);
    const leaders = rows.filter(r => r.total_pts === best);
    // A tie for first means nobody is credited with the win.
    const winnerId = leaders.length === 1 && best > 0 ? leaders[0].entity_id : null;
    for (const p of participants) {
      addPoints(playerKey(p), p.username, (p.id === winnerId ? winPts : lossPts) * mult, event.id);
    }
    return;
  }

  if (match.tournament_id) {
    // Tournament match: winner_team is a tournament_teams.id, so credit by
    // tournament team membership instead of match_teams.
    const winnerTeam = match.winner_team ?? await determineMatchWinner(db, event.match_id);
    const members = await db.all<{ team_id: string; user_id: string; discord_user_id: string | null }>(
      `SELECT team_id, user_id, discord_user_id FROM tournament_team_members WHERE team_id IN (?, ?)`,
      [match.team1_id, match.team2_id]
    );
    for (const p of participants) {
      const member = members.find(m =>
        m.user_id === p.user_id || (m.discord_user_id && m.discord_user_id === p.discord_user_id)
      );
      if (!member) continue; // not on either team
      const isWinner = winnerTeam !== null && member.team_id === winnerTeam;
      addPoints(playerKey(p), p.username, (isWinner ? winPts : lossPts) * mult, event.id);
    }
    return;
  }

  const winnerEntityId = await determineMatchWinner(db, event.match_id);
  for (const p of participants) {
    if (p.is_reserve === 1 || p.team_assignment === 'reserve') continue;
    if (!p.team_id && !p.team_assignment) continue; // unassigned
    const isWinner = winnerEntityId !== null && p.team_id === winnerEntityId;
    addPoints(playerKey(p), p.username, (isWinner ? winPts : lossPts) * mult, event.id);
  }
}

interface BracketMatch {
  round: number;
  bracket_type: string;
  status: string;
  winner_team: string | null;
  team1_id: string | null;
  team2_id: string | null;
}

function loserOf(m: BracketMatch): string | null {
  if (!m.winner_team) return null;
  if (m.team1_id === m.winner_team) return m.team2_id;
  if (m.team2_id === m.winner_team) return m.team1_id;
  return null;
}

/**
 * Resolve bracket-tournament placings as an ordered list of team-id groups
 * (index 0 = champion, 1 = runner-up, 2 = third place, ...). Groups with
 * several teams are tied for that placing.
 *
 * Single elimination: champion = winner of the highest winners-bracket round;
 * runner-up = its loser; semifinal losers share 3rd.
 * Double elimination: champion = winner of the 'final' bracket match (latest
 * round if there's a reset); runner-up = its loser; 3rd = loser of the last
 * losers-bracket match.
 */
function resolveBracketPlacings(matches: BracketMatch[], format: string): string[][] {
  const done = matches.filter(m => m.status === 'complete' && m.winner_team);
  const maxBy = (list: BracketMatch[]) => list.reduce<BracketMatch | null>((best, m) => (!best || m.round > best.round ? m : best), null);

  let finalMatch: BracketMatch | null;
  if (format === 'double-elimination') {
    finalMatch = maxBy(done.filter(m => m.bracket_type === 'final'));
  } else {
    finalMatch = maxBy(done.filter(m => m.bracket_type === 'winners' || m.bracket_type === 'final'));
  }
  if (!finalMatch?.winner_team) return [];

  const placings: string[][] = [[finalMatch.winner_team]];
  const runnerUp = loserOf(finalMatch);
  if (runnerUp) placings.push([runnerUp]);

  if (format === 'double-elimination') {
    const lastLosers = maxBy(done.filter(m => m.bracket_type === 'losers'));
    const third = lastLosers ? loserOf(lastLosers) : null;
    if (third && third !== runnerUp) placings.push([third]);
  } else {
    const semis = done.filter(m => m.bracket_type === 'winners' && m.round === finalMatch.round - 1);
    const losers = semis.map(loserOf).filter((t): t is string => !!t);
    if (losers.length > 0) placings.push(Array.from(new Set(losers)));
  }
  return placings;
}

/**
 * Score a 'tournament' series event via tournament_position_points. Only
 * completed tournaments contribute.
 *
 * cumulative-points: players are ranked by total points (grouped on
 * discord_user_id/user_id); ties share the higher placing's points.
 * Bracket formats: see resolveBracketPlacings — champion, runner-up and
 * third place receive tournament_position_points[0..2].
 */
async function scoreTournamentEvent(
  db: Db,
  event: SeriesEventRow,
  config: SeriesScoringConfig,
  addPoints: AddPoints
): Promise<void> {
  if (!event.tournament_id) return;
  const positionPoints = config.tournament_position_points ?? [];
  const mult = event.points_multiplier;

  const tournament = await db.get<{ format: string; status: string }>(
    `SELECT format, status FROM tournaments WHERE id = ?`, [event.tournament_id]
  );
  if (tournament?.status !== 'complete') return;

  if (tournament.format === 'cumulative-points') {
    const rows = await db.all<{ player_key: string; username: string; total_points: number }>(
      `SELECT COALESCE(mp.discord_user_id, mp.user_id) as player_key,
              MAX(mp.username) as username,
              COALESCE(SUM(mgp.points_awarded), 0) as total_points
       FROM match_participants mp
       JOIN matches m ON mp.match_id = m.id AND m.tournament_id = ?
       LEFT JOIN match_games mg ON mg.match_id = m.id AND mg.status = 'completed'
       LEFT JOIN match_game_placements mgp ON mgp.match_game_id = mg.id AND mgp.entity_id = mp.id AND mgp.entity_type = 'participant'
       GROUP BY COALESCE(mp.discord_user_id, mp.user_id)
       ORDER BY total_points DESC, username ASC`,
      [event.tournament_id]
    );
    const ranks = tieAwareRanks(rows.map(r => r.total_points));
    rows.forEach((r, idx) => {
      addPoints(r.player_key, r.username, (positionPoints[ranks[idx]] ?? 0) * mult, event.id);
    });
    return;
  }

  const bracketMatches = await db.all<BracketMatch>(
    `SELECT COALESCE(m.tournament_round, tm.round, 1) as round,
            COALESCE(m.tournament_bracket_type, tm.bracket_type, 'winners') as bracket_type,
            m.status, m.winner_team,
            COALESCE(tm.team1_id, m.blue_team_id) as team1_id,
            COALESCE(tm.team2_id, m.red_team_id) as team2_id
     FROM matches m
     LEFT JOIN tournament_matches tm ON tm.match_id = m.id
     WHERE m.tournament_id = ?`,
    [event.tournament_id]
  );
  const placings = resolveBracketPlacings(bracketMatches, tournament.format);

  for (let i = 0; i < placings.length; i++) {
    const pts = (positionPoints[i] ?? 0) * mult;
    for (const teamId of placings[i]) {
      const members = await db.all<{ user_id: string; discord_user_id: string | null; username: string }>(
        `SELECT user_id, discord_user_id, username FROM tournament_team_members WHERE team_id = ?`,
        [teamId]
      );
      for (const mem of members) addPoints(playerKey(mem), mem.username, pts, event.id);
    }
  }
}

/**
 * Compute cumulative standings for a series by converting each event's
 * outcome to points via series.scoring_config. Only completed matches and
 * tournaments contribute (and count towards events_played).
 */
export interface SeriesStandingEventPoints {
  series_event_id: string;
  /** Points for this event after the multiplier; null when the player didn't take part. */
  points: number | null;
}

export interface SeriesStandingRow {
  rank: number;
  username: string;
  user_id: string;
  total_points: number;
  events_played: number;
  /** One entry per series event, in event_order. */
  events: SeriesStandingEventPoints[];
}

export async function getSeriesStandings(seriesId: string): Promise<SeriesStandingRow[]> {
  const db = await getDbInstance();

  const series = await getSeriesById(seriesId);
  const config = parseScoringConfig(series?.scoring_config);
  const events = await listSeriesEvents(seriesId);

  const totals = new Map<string, { username: string; total_points: number; per_event: Map<string, number> }>();
  const addPoints: AddPoints = (key, username, points, eventId) => {
    const entry = totals.get(key) ?? { username, total_points: 0, per_event: new Map<string, number>() };
    entry.username = username; // events are scored in order, so the latest name wins
    entry.total_points += points;
    entry.per_event.set(eventId, (entry.per_event.get(eventId) ?? 0) + points);
    totals.set(key, entry);
  };

  for (const event of events) {
    if (event.event_type === 'match') {
      await scoreMatchEvent(db, event, config, addPoints);
    } else if (event.event_type === 'tournament') {
      await scoreTournamentEvent(db, event, config, addPoints);
    }
  }

  const sorted = Array.from(totals.entries())
    .map(([user_id, data]) => ({
      user_id,
      username: data.username,
      total_points: data.total_points,
      events_played: data.per_event.size,
      events: events.map(ev => ({ series_event_id: ev.id, points: data.per_event.get(ev.id) ?? null })),
    }))
    .sort((a, b) => b.total_points - a.total_points || a.username.localeCompare(b.username));
  // Players tied on points share a rank (same convention as tournament standings).
  const ranks = tieAwareRanks(sorted.map(e => e.total_points));
  return sorted.map((entry, idx) => ({ rank: ranks[idx] + 1, ...entry }));
}

/** Parses a JSON object body; returns null for invalid JSON or non-object bodies. */
export async function readJsonObject(request: { json(): Promise<unknown> }): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json();
    if (body === null || typeof body !== 'object' || Array.isArray(body)) return null;
    return body as Record<string, unknown>;
  } catch {
    return null;
  }
}

const NULLABLE_STRING_FIELDS = [
  'description', 'start_date', 'end_date', 'event_image_url', 'game_id',
  'guild_id', 'channel_id', 'livestream_link',
] as const;

/** Each date must be parseable, and the end must not be before the start. Null/undefined are fine. */
export function validateSeriesDates(start: unknown, end: unknown): string | null {
  const parse = (v: unknown): number | null => (typeof v === 'string' && v !== '' ? Date.parse(v) : null);
  const s = parse(start);
  const e = parse(end);
  if (s !== null && Number.isNaN(s)) return 'start_date must be a valid date';
  if (e !== null && Number.isNaN(e)) return 'end_date must be a valid date';
  if (s !== null && e !== null && e < s) return 'end_date must not be before start_date';
  return null;
}

/** game_id, when given, must be an existing game. Returns an error message or null. */
export async function validateSeriesGameId(gameId: unknown): Promise<string | null> {
  if (gameId === undefined || gameId === null || gameId === '') return null;
  if (typeof gameId !== 'string') return 'game_id must be a string';
  return (await gameExists(pgDb, gameId)) ? null : 'game_id does not match an existing game';
}

/**
 * Validates a series create/update body. Returns an error message or null.
 * For updates (`partial`), name may be omitted but must be a non-empty string
 * when present; nullable fields accept null.
 */
export function validateSeriesBody(body: Record<string, unknown>, partial: boolean): string | null {
  if (body.name !== undefined || !partial) {
    if (typeof body.name !== 'string' || body.name.trim().length === 0) return 'name must be a non-empty string';
  }
  for (const f of NULLABLE_STRING_FIELDS) {
    const v = body[f];
    if (v !== undefined && v !== null && typeof v !== 'string') return `${f} must be a string`;
  }
  for (const f of ['announcements', 'player_notifications'] as const) {
    if (body[f] !== undefined && typeof body[f] !== 'boolean') return `${f} must be a boolean`;
  }
  const dateError = validateSeriesDates(body.start_date, body.end_date);
  if (dateError) return dateError;
  if (body.scoring_config !== undefined && !(partial && body.scoring_config === null)) {
    const err = validateScoringConfig(body.scoring_config);
    if (err) return err;
  }
  return null;
}

/**
 * Explicit child-row cleanup for a match. Foreign keys are off app-wide, so
 * ON DELETE CASCADE/SET NULL never fires; call this inside a transaction
 * before deleting the match row itself.
 */
export async function deleteMatchDependents(db: Db, matchId: string): Promise<void> {
  await db.run(
    'DELETE FROM match_game_placements WHERE match_game_id IN (SELECT id FROM match_games WHERE match_id = ?)',
    [matchId]
  );
  await db.run('DELETE FROM match_games WHERE match_id = ?', [matchId]);
  await db.run('DELETE FROM match_participants WHERE match_id = ?', [matchId]);
  await db.run('DELETE FROM match_player_stats WHERE match_id = ?', [matchId]);
  await db.run('DELETE FROM match_teams WHERE match_id = ?', [matchId]);
  await db.run('DELETE FROM tournament_matches WHERE match_id = ?', [matchId]);
  await db.run('DELETE FROM series_events WHERE match_id = ?', [matchId]);
}

/**
 * SQL column expressions yielding a JSON array of `{ id, name }` for every
 * series an entity belongs to, for list endpoints (cards link back to the
 * series). A match also inherits the series its tournament is part of.
 * Always '[]' (never NULL) when there are none — parse with parseSeriesRefs.
 */
export const MATCH_SERIES_JSON_SQL = `(
  SELECT json_group_array(json_object('id', s.id, 'name', s.name))
  FROM series s
  WHERE s.id IN (
    SELECT se.series_id FROM series_events se
    WHERE se.match_id = m.id
       OR (m.tournament_id IS NOT NULL AND se.tournament_id = m.tournament_id)
  )
)`;

export const TOURNAMENT_SERIES_JSON_SQL = `(
  SELECT json_group_array(json_object('id', s.id, 'name', s.name))
  FROM series s
  WHERE s.id IN (SELECT se.series_id FROM series_events se WHERE se.tournament_id = t.id)
)`;

export function parseSeriesRefs(raw: unknown): Array<{ id: string; name: string }> {
  if (typeof raw !== 'string' || raw === '') return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(s => s && typeof s.id === 'string') : [];
  } catch {
    return [];
  }
}
