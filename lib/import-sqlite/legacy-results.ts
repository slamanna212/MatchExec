/**
 * Source-side result computation for the import verification (plan 5.3 step 7).
 *
 * This is a faithful, synchronous port of the v0.8.2 logic (git: `b13f70c~1:src/lib/scoring-functions.ts`,
 * `series.ts`, `tournament-standings.ts`, `app/api/tournaments/[id]/standings/route.ts`) that runs on the SQLite copy,
 * INCLUDING its use of the legacy columns (match_games.winner_id / is_ffa_mode, match_participants.team_assignment).
 * The target side calls the new Drizzle domain functions inside the import transaction; the two must agree for every
 * series, tournament and match that is compared. Do not "improve" this file: its job is to be the old behaviour.
 */
import type { DatabaseSync } from 'node:sqlite';

type Row = Record<string, unknown>;
const all = (db: DatabaseSync, sql: string, ...params: Array<string | number | null>): Row[] => db.prepare(sql).all(...params) as Row[];
const get = (db: DatabaseSync, sql: string, ...params: Array<string | number | null>): Row | undefined => db.prepare(sql).get(...params) as Row | undefined;
const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));
const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

// ─── Matches ─────────────────────────────────────────────────────────────────

function scoringTypeOf(db: DatabaseSync, matchId: string): string {
  return str(get(db, `SELECT gm.scoring_type FROM matches m LEFT JOIN game_modes gm ON gm.id = m.mode_id AND gm.game_id = m.game_id WHERE m.id = ?`, matchId)?.scoring_type) ?? 'Normal';
}

function getMatchTeamId(db: DatabaseSync, matchId: string, slot: 1 | 2): string | null {
  const r = get(db, `SELECT m.red_team_id, m.blue_team_id, tm.team1_id, tm.team2_id FROM matches m LEFT JOIN tournament_matches tm ON m.id = tm.match_id WHERE m.id = ?`, matchId);
  if (slot === 1) return str(r?.team1_id) || str(r?.blue_team_id) || null;
  return str(r?.team2_id) || str(r?.red_team_id) || null;
}

function legacyColumnWinner(db: DatabaseSync, matchId: string): { total: number; t1: number; t2: number } {
  const r = get(db, `SELECT COUNT(*) as total_normal_games,
      SUM(CASE WHEN mg.winner_id = 'team1' THEN 1 ELSE 0 END) as team1_wins,
      SUM(CASE WHEN mg.winner_id = 'team2' THEN 1 ELSE 0 END) as team2_wins
    FROM match_games mg WHERE mg.match_id = ? AND mg.status = 'completed'
      AND (mg.is_ffa_mode = 0 OR mg.is_ffa_mode IS NULL) AND mg.winner_id IS NOT NULL`, matchId);
  return { total: num(r?.total_normal_games), t1: num(r?.team1_wins), t2: num(r?.team2_wins) };
}

export function participantPointTotals(db: DatabaseSync, matchId: string): Array<{ entity_id: string; total_pts: number }> {
  return all(db, `SELECT mgp.entity_id, SUM(COALESCE(mgp.points_awarded, mgp.is_winner)) as total_pts
     FROM match_games mg JOIN match_game_placements mgp ON mgp.match_game_id = mg.id
     WHERE mg.match_id = ? AND mg.status = 'completed' AND mgp.entity_type = 'participant'
     GROUP BY mgp.entity_id ORDER BY total_pts DESC`, matchId).map((r) => ({ entity_id: String(r.entity_id), total_pts: num(r.total_pts) }));
}

/** v0.8.2 determineMatchWinner. */
export function determineMatchWinner(db: DatabaseSync, matchId: string): string | null {
  const scoringType = scoringTypeOf(db, matchId);
  if (scoringType === 'FFA' || scoringType === 'Position') {
    const totals = participantPointTotals(db, matchId);
    if (totals.length === 0) return null;
    if (totals.length > 1 && totals[0].total_pts === totals[1].total_pts) return null;
    return totals[0].entity_id;
  }
  const tournamentId = str(get(db, `SELECT tournament_id FROM matches WHERE id = ?`, matchId)?.tournament_id);
  if (tournamentId) {
    const w = legacyColumnWinner(db, matchId);
    if (w.total === 0) return null;
    if (w.t1 > w.t2) return getMatchTeamId(db, matchId, 1);
    if (w.t2 > w.t1) return getMatchTeamId(db, matchId, 2);
    return null;
  }
  const placementsTotal = num(get(db, `SELECT COUNT(DISTINCT mgp.match_game_id) as total FROM match_game_placements mgp
     JOIN match_games mg ON mg.id = mgp.match_game_id WHERE mg.match_id = ? AND mg.status = 'completed' AND mgp.entity_type = 'team'`, matchId)?.total);
  const teamWins = all(db, `SELECT mt.id as team_id, SUM(CASE WHEN mgp.is_winner = 1 THEN 1 ELSE 0 END) as wins
     FROM match_teams mt LEFT JOIN match_game_placements mgp ON mgp.entity_id = mt.id AND mgp.entity_type = 'team'
       AND mgp.match_game_id IN (SELECT id FROM match_games WHERE match_id = ? AND status = 'completed')
     WHERE mt.match_id = ? AND mt.is_reserve = 0 GROUP BY mt.id`, matchId, matchId).map((r) => ({ id: String(r.team_id), wins: num(r.wins) }));
  if (teamWins.length > 0 && placementsTotal > 0) {
    const sorted = [...teamWins].sort((a, b) => b.wins - a.wins);
    const isTie = sorted.length > 1 && sorted[0].wins === sorted[1].wins;
    if (isTie || sorted[0].wins === 0) return null;
    return sorted[0].id;
  }
  const w = legacyColumnWinner(db, matchId);
  if (w.total === 0) return null;
  if (w.t1 > w.t2) return getMatchTeamId(db, matchId, 1);
  if (w.t2 > w.t1) return getMatchTeamId(db, matchId, 2);
  return null;
}

export interface OverallDigest { scoringType: string; teamWins: Record<string, number>; totalGames: number; overallWinnerTeamId: string | null }

/** v0.8.2 getOverallMatchScore, reduced to the comparable fields. */
export function overallMatchScore(db: DatabaseSync, matchId: string): OverallDigest {
  const scoringType = scoringTypeOf(db, matchId);
  if (scoringType !== 'Normal') return { scoringType, teamWins: {}, totalGames: 0, overallWinnerTeamId: null };
  const rows = all(db, `SELECT mt.id as team_id, SUM(CASE WHEN mgp.is_winner = 1 THEN 1 ELSE 0 END) as wins
     FROM match_teams mt LEFT JOIN match_game_placements mgp ON mgp.entity_id = mt.id AND mgp.entity_type = 'team'
       AND mgp.match_game_id IN (SELECT id FROM match_games WHERE match_id = ? AND status = 'completed')
     WHERE mt.match_id = ? AND mt.is_reserve = 0 GROUP BY mt.id`, matchId, matchId);
  const total = num(get(db, `SELECT COUNT(DISTINCT mgp.match_game_id) as total FROM match_game_placements mgp
     JOIN match_games mg ON mg.id = mgp.match_game_id WHERE mg.match_id = ? AND mg.status = 'completed' AND mgp.entity_type = 'team'`, matchId)?.total);
  if (rows.length > 0 && total > 0) {
    const teamWins: Record<string, number> = {};
    for (const r of rows) teamWins[String(r.team_id)] = num(r.wins);
    const sorted = Object.entries(teamWins).sort((a, b) => b[1] - a[1]);
    const isTie = sorted.length > 1 && sorted[0][1] === sorted[1][1];
    return { scoringType, teamWins, totalGames: total, overallWinnerTeamId: !isTie && sorted[0][1] > 0 ? sorted[0][0] : null };
  }
  const w = legacyColumnWinner(db, matchId);
  // no games at all -> nothing to compare (the new code reports an empty team list); legacy-only results stay visible
  return { scoringType, teamWins: w.total === 0 ? {} : { team1: w.t1, team2: w.t2 }, totalGames: w.total, overallWinnerTeamId: null };
}

// ─── Tournaments ─────────────────────────────────────────────────────────────

export interface CumulativeDigest { player_key: string; rank: number; total_points: number; matches_played: number; best_position: number | null; first_places: number }

/** v0.8.2 getCumulativeStandings (ordering by SQLite's username collation only affects equal-key ties, never rank). */
export function cumulativeStandings(db: DatabaseSync, tournamentId: string): CumulativeDigest[] {
  const rows = all(db, `SELECT COALESCE(mp.discord_user_id, mp.user_id, mp.id) as player_key,
      COALESCE(SUM(mgp.points_awarded), 0) as total_points,
      COUNT(DISTINCT mgp.match_game_id) as matches_played,
      MIN(mgp.position) as best_position,
      COALESCE(SUM(CASE WHEN mgp.position = 1 THEN 1 ELSE 0 END), 0) as first_places
    FROM match_participants mp
    JOIN matches m ON mp.match_id = m.id AND m.tournament_id = ?
    LEFT JOIN match_games mg ON mg.match_id = m.id AND mg.status = 'completed'
    LEFT JOIN match_game_placements mgp ON mgp.match_game_id = mg.id AND mgp.entity_id = mp.id AND mgp.entity_type = 'participant'
    GROUP BY COALESCE(mp.discord_user_id, mp.user_id, mp.id)
    ORDER BY total_points DESC, first_places DESC, best_position ASC, MAX(mp.username) ASC`, tournamentId);
  let lastPoints: number | null = null;
  let lastRank = 0;
  return rows.map((r, idx) => {
    const total = num(r.total_points);
    const rank = lastPoints !== null && total === lastPoints ? lastRank : idx + 1;
    lastPoints = total;
    lastRank = rank;
    return { player_key: String(r.player_key), rank, total_points: total, matches_played: num(r.matches_played), best_position: r.best_position === null ? null : num(r.best_position), first_places: num(r.first_places) };
  });
}

export interface BracketDigest { team_id: string; matches_played: number; wins: number; losses: number }

/** v0.8.2 GET /api/tournaments/:id/standings (bracket formats). */
export function bracketStandings(db: DatabaseSync, tournamentId: string): BracketDigest[] {
  return all(db, `SELECT tt.id as team_id,
      COUNT(CASE WHEN m.id IS NOT NULL THEN 1 END) as matches_played,
      SUM(CASE WHEN m.winner_team = tt.id THEN 1 ELSE 0 END) as wins,
      SUM(CASE WHEN m.winner_team IS NOT NULL AND m.winner_team != tt.id THEN 1 ELSE 0 END) as losses
    FROM tournament_teams tt
    LEFT JOIN matches m ON (m.tournament_id = tt.tournament_id AND (m.red_team_id = tt.id OR m.blue_team_id = tt.id) AND m.status = 'complete')
    WHERE tt.tournament_id = ? GROUP BY tt.id, tt.team_name`, tournamentId)
    .map((r) => ({ team_id: String(r.team_id), matches_played: num(r.matches_played), wins: num(r.wins), losses: num(r.losses) }));
}

// ─── Series ──────────────────────────────────────────────────────────────────

interface SeriesScoringConfig {
  match_win_points?: number;
  match_loss_points?: number;
  tournament_position_points?: number[];
  position_event_use_event_spread?: boolean;
}

export interface SeriesStandingDigest {
  user_id: string;
  rank: number;
  username: string;
  total_points: number;
  events_played: number;
  events: Array<{ series_event_id: string; points: number | null }>;
}

function parseScoringConfig(raw: unknown): SeriesScoringConfig {
  if (raw === null || raw === undefined || raw === '') return {};
  try {
    const parsed: unknown = JSON.parse(String(raw));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as SeriesScoringConfig) : {};
  } catch {
    return {};
  }
}

const playerKey = (p: Row): string => str(p.discord_user_id) ?? String(p.user_id);

function tieAwareRanks(totals: number[]): number[] {
  const ranks: number[] = [];
  totals.forEach((t, i) => ranks.push(i > 0 && t === totals[i - 1] ? ranks[i - 1] : i));
  return ranks;
}

interface BracketMatch { round: number; bracket_type: string; status: string; winner_team: string | null; team1_id: string | null; team2_id: string | null }

function loserOf(m: BracketMatch): string | null {
  if (!m.winner_team) return null;
  if (m.team1_id === m.winner_team) return m.team2_id;
  if (m.team2_id === m.winner_team) return m.team1_id;
  return null;
}

function resolveBracketPlacings(matches: BracketMatch[], format: string): string[][] {
  const done = matches.filter((m) => m.status === 'complete' && m.winner_team);
  const maxBy = (list: BracketMatch[]): BracketMatch | null => list.reduce<BracketMatch | null>((best, m) => (!best || m.round > best.round ? m : best), null);
  const finalMatch = format === 'double-elimination'
    ? maxBy(done.filter((m) => m.bracket_type === 'final'))
    : maxBy(done.filter((m) => m.bracket_type === 'winners' || m.bracket_type === 'final'));
  if (!finalMatch?.winner_team) return [];
  const placings: string[][] = [[finalMatch.winner_team]];
  const runnerUp = loserOf(finalMatch);
  if (runnerUp) placings.push([runnerUp]);
  if (format === 'double-elimination') {
    const lastLosers = maxBy(done.filter((m) => m.bracket_type === 'losers'));
    const third = lastLosers ? loserOf(lastLosers) : null;
    if (third && third !== runnerUp) placings.push([third]);
  } else {
    const semis = done.filter((m) => m.bracket_type === 'winners' && m.round === finalMatch.round - 1);
    const losers = semis.map(loserOf).filter((t): t is string => !!t);
    if (losers.length > 0) placings.push(Array.from(new Set(losers)));
  }
  return placings;
}

type AddPoints = (key: string, username: string, points: number, eventId: string) => void;

function scoreMatchEvent(db: DatabaseSync, event: Row, config: SeriesScoringConfig, addPoints: AddPoints): void {
  const matchId = str(event.match_id);
  if (!matchId) return;
  const match = get(db, `SELECT m.status, COALESCE(gm.scoring_type, 'Normal') as scoring_type, m.tournament_id, m.winner_team,
        COALESCE(tm.team1_id, m.blue_team_id) as team1_id, COALESCE(tm.team2_id, m.red_team_id) as team2_id
     FROM matches m LEFT JOIN game_modes gm ON gm.id = m.mode_id AND gm.game_id = m.game_id
     LEFT JOIN tournament_matches tm ON tm.match_id = m.id WHERE m.id = ?`, matchId);
  if (match?.status !== 'complete') return;
  const scoringType = String(match.scoring_type);
  const participants = all(db, `SELECT mp.id, mp.user_id, mp.discord_user_id, mp.username, mp.team_id, mp.team_assignment, mt.is_reserve
     FROM match_participants mp LEFT JOIN match_teams mt ON mt.id = mp.team_id WHERE mp.match_id = ?`, matchId);
  if (participants.length === 0) return;
  const mult = num(event.points_multiplier);
  const winPts = config.match_win_points ?? 0;
  const lossPts = config.match_loss_points ?? 0;
  const eventId = String(event.id);

  if (scoringType === 'Position' && config.position_event_use_event_spread !== false) {
    const rows = all(db, `SELECT mgp.entity_id, SUM(mgp.points_awarded) as total_pts FROM match_game_placements mgp
       JOIN match_games mg ON mg.id = mgp.match_game_id
       WHERE mg.match_id = ? AND mg.status = 'completed' AND mgp.entity_type = 'participant' GROUP BY mgp.entity_id`, matchId);
    const byParticipant = new Map(rows.map((r) => [String(r.entity_id), num(r.total_pts)]));
    for (const p of participants) addPoints(playerKey(p), String(p.username), (byParticipant.get(String(p.id)) ?? 0) * mult, eventId);
    return;
  }
  if (scoringType === 'FFA' || scoringType === 'Position') {
    const rows = all(db, `SELECT mgp.entity_id, SUM(COALESCE(mgp.points_awarded, mgp.is_winner, 0)) as total_pts FROM match_game_placements mgp
       JOIN match_games mg ON mg.id = mgp.match_game_id
       WHERE mg.match_id = ? AND mg.status = 'completed' AND mgp.entity_type = 'participant' GROUP BY mgp.entity_id`, matchId)
      .map((r) => ({ id: String(r.entity_id), pts: num(r.total_pts) }));
    const best = rows.reduce((max, r) => Math.max(max, r.pts), -Infinity);
    const leaders = rows.filter((r) => r.pts === best);
    const winnerId = leaders.length === 1 && best > 0 ? leaders[0].id : null;
    for (const p of participants) addPoints(playerKey(p), String(p.username), (String(p.id) === winnerId ? winPts : lossPts) * mult, eventId);
    return;
  }
  if (match.tournament_id) {
    const winnerTeam = str(match.winner_team) ?? determineMatchWinner(db, matchId);
    const members = all(db, `SELECT team_id, user_id, discord_user_id FROM tournament_team_members WHERE team_id IN (?, ?)`, str(match.team1_id), str(match.team2_id));
    for (const p of participants) {
      const member = members.find((m) => m.user_id === p.user_id || (m.discord_user_id && m.discord_user_id === p.discord_user_id));
      if (!member) continue;
      const isWinner = winnerTeam !== null && String(member.team_id) === winnerTeam;
      addPoints(playerKey(p), String(p.username), (isWinner ? winPts : lossPts) * mult, eventId);
    }
    return;
  }
  const winnerEntityId = determineMatchWinner(db, matchId);
  for (const p of participants) {
    if (p.is_reserve === 1 || p.team_assignment === 'reserve') continue;
    if (!p.team_id && !p.team_assignment) continue;
    const isWinner = winnerEntityId !== null && str(p.team_id) === winnerEntityId;
    addPoints(playerKey(p), String(p.username), (isWinner ? winPts : lossPts) * mult, eventId);
  }
}

function scoreTournamentEvent(db: DatabaseSync, event: Row, config: SeriesScoringConfig, addPoints: AddPoints): void {
  const tournamentId = str(event.tournament_id);
  if (!tournamentId) return;
  const positionPoints = config.tournament_position_points ?? [];
  const mult = num(event.points_multiplier);
  const eventId = String(event.id);
  const tournament = get(db, `SELECT format, status FROM tournaments WHERE id = ?`, tournamentId);
  if (tournament?.status !== 'complete') return;

  if (tournament.format === 'cumulative-points') {
    const rows = all(db, `SELECT COALESCE(mp.discord_user_id, mp.user_id) as player_key, MAX(mp.username) as username,
        COALESCE(SUM(mgp.points_awarded), 0) as total_points
       FROM match_participants mp JOIN matches m ON mp.match_id = m.id AND m.tournament_id = ?
       LEFT JOIN match_games mg ON mg.match_id = m.id AND mg.status = 'completed'
       LEFT JOIN match_game_placements mgp ON mgp.match_game_id = mg.id AND mgp.entity_id = mp.id AND mgp.entity_type = 'participant'
       GROUP BY COALESCE(mp.discord_user_id, mp.user_id) ORDER BY total_points DESC, username ASC`, tournamentId);
    const ranks = tieAwareRanks(rows.map((r) => num(r.total_points)));
    rows.forEach((r, idx) => addPoints(String(r.player_key), String(r.username), (positionPoints[ranks[idx]] ?? 0) * mult, eventId));
    return;
  }
  const bracket = all(db, `SELECT COALESCE(m.tournament_round, tm.round, 1) as round, COALESCE(m.tournament_bracket_type, tm.bracket_type, 'winners') as bracket_type,
        m.status, m.winner_team, COALESCE(tm.team1_id, m.blue_team_id) as team1_id, COALESCE(tm.team2_id, m.red_team_id) as team2_id
     FROM matches m LEFT JOIN tournament_matches tm ON tm.match_id = m.id WHERE m.tournament_id = ?`, tournamentId)
    .map((r) => ({ round: num(r.round), bracket_type: String(r.bracket_type), status: String(r.status), winner_team: str(r.winner_team), team1_id: str(r.team1_id), team2_id: str(r.team2_id) }));
  const placings = resolveBracketPlacings(bracket, String(tournament.format));
  for (let i = 0; i < placings.length; i++) {
    const pts = (positionPoints[i] ?? 0) * mult;
    for (const teamId of placings[i]) {
      for (const mem of all(db, `SELECT user_id, discord_user_id, username FROM tournament_team_members WHERE team_id = ?`, teamId)) {
        addPoints(playerKey(mem), String(mem.username), pts, eventId);
      }
    }
  }
}

/** v0.8.2 getSeriesStandings. */
export function seriesStandings(db: DatabaseSync, seriesId: string): SeriesStandingDigest[] {
  const series = get(db, `SELECT scoring_config FROM series WHERE id = ?`, seriesId);
  const config = parseScoringConfig(series?.scoring_config);
  const events = all(db, `SELECT * FROM series_events WHERE series_id = ? ORDER BY event_order ASC`, seriesId);
  const totals = new Map<string, { username: string; total_points: number; per_event: Map<string, number> }>();
  const addPoints: AddPoints = (key, username, points, eventId) => {
    const entry = totals.get(key) ?? { username, total_points: 0, per_event: new Map<string, number>() };
    entry.username = username;
    entry.total_points += points;
    entry.per_event.set(eventId, (entry.per_event.get(eventId) ?? 0) + points);
    totals.set(key, entry);
  };
  for (const event of events) {
    if (event.event_type === 'match') scoreMatchEvent(db, event, config, addPoints);
    else if (event.event_type === 'tournament') scoreTournamentEvent(db, event, config, addPoints);
  }
  const sorted = Array.from(totals.entries())
    .map(([user_id, data]) => ({
      user_id, username: data.username, total_points: data.total_points, events_played: data.per_event.size,
      events: events.map((ev) => ({ series_event_id: String(ev.id), points: data.per_event.get(String(ev.id)) ?? null })),
    }))
    .sort((a, b) => b.total_points - a.total_points || a.username.localeCompare(b.username));
  const ranks = tieAwareRanks(sorted.map((e) => e.total_points));
  return sorted.map((entry, idx) => ({ rank: ranks[idx] + 1, ...entry }));
}
