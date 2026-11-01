/**
 * Series standings, computed on demand: each event's outcome is converted to points via `series.scoring_config`,
 * multiplied by the event's `points_multiplier`, and summed per player (Discord id when known, else user id).
 * Only completed matches and tournaments contribute (and count towards `events_played`).
 */
import { and, asc, desc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import type { Executor } from '../../../lib/db';
import {
  gameModes, matchGamePlacements, matchGames, matchParticipants, matchTeams, matches, tournamentMatches, tournamentTeamMembers, tournaments,
} from '../../../lib/db/schema';
import { determineMatchWinner } from '../matches/scoreboard';
import { listSeriesEvents, type SeriesEventRow } from './events';
import { getSeriesById } from './series';
import { parseScoringConfig, type SeriesScoringConfig } from './validation';

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

type AddPoints = (playerKey: string, username: string, points: number, eventId: string) => void;

/** Stable player identity across matches: Discord id when known, else user id. */
function playerKey(p: { discord_user_id?: string | null; user_id: string }): string {
  return p.discord_user_id ?? p.user_id;
}

/** Standard competition ranking over a descending-sorted list of totals: tied entries share the rank (index) of the first tied entry. */
export function tieAwareRanks(totals: number[]): number[] {
  const ranks: number[] = [];
  totals.forEach((t, i) => {
    ranks.push(i > 0 && t === totals[i - 1] ? ranks[i - 1] : i);
  });
  return ranks;
}

/**
 * Score a 'match' series event. Only completed matches contribute.
 *
 * - Position matches (by default) use their own points_awarded spread from match_game_placements. This is the only mode
 *   the position_event_use_event_spread toggle applies to.
 * - Tournament matches resolve the winner via tournament_teams membership (matches.winner_team is a tournament_teams.id).
 * - Normal standalone matches compare match_teams ids; reserves and unassigned players earn nothing.
 * - Normal/FFA/Position-without-spread award match_win_points to the winner and match_loss_points to the other
 *   participants. Ties award no wins.
 */
async function scoreMatchEvent(ex: Executor, event: SeriesEventRow, config: SeriesScoringConfig, addPoints: AddPoints): Promise<void> {
  if (!event.match_id) return;
  const matchId = event.match_id;

  const [match] = await ex
    .select({
      status: matches.status,
      scoring_type: gameModes.scoring_type,
      tournament_id: matches.tournament_id,
      winner_team: matches.winner_team,
      tm_team1: tournamentMatches.team1_id,
      tm_team2: tournamentMatches.team2_id,
      blue_team_id: matches.blue_team_id,
      red_team_id: matches.red_team_id,
    })
    .from(matches)
    .leftJoin(gameModes, and(eq(gameModes.id, matches.mode_id), eq(gameModes.game_id, matches.game_id)))
    .leftJoin(tournamentMatches, eq(tournamentMatches.match_id, matches.id))
    .where(eq(matches.id, matchId));
  if (match?.status !== 'complete') return;
  const scoringType = match.scoring_type ?? 'Normal';
  const team1 = match.tm_team1 ?? match.blue_team_id;
  const team2 = match.tm_team2 ?? match.red_team_id;

  const participants = await ex
    .select({
      id: matchParticipants.id, user_id: matchParticipants.user_id, discord_user_id: matchParticipants.discord_user_id,
      username: matchParticipants.username, team_id: matchParticipants.team_id, is_reserve: matchTeams.is_reserve,
    })
    .from(matchParticipants)
    .leftJoin(matchTeams, eq(matchTeams.id, matchParticipants.team_id))
    .where(eq(matchParticipants.match_id, matchId))
    .orderBy(asc(matchParticipants.joined_at), asc(matchParticipants.id));
  if (participants.length === 0) return;

  const mult = event.points_multiplier;
  const winPts = config.match_win_points ?? 0;
  const lossPts = config.match_loss_points ?? 0;

  const participantTotals = async (expr: SQL<number>) => {
    const rows = await ex
      .select({ entity_id: matchGamePlacements.entity_id, total_pts: expr })
      .from(matchGamePlacements)
      .innerJoin(matchGames, eq(matchGames.id, matchGamePlacements.match_game_id))
      .where(and(eq(matchGames.match_id, matchId), eq(matchGames.status, 'completed'), eq(matchGamePlacements.entity_type, 'participant')))
      .groupBy(matchGamePlacements.entity_id);
    return rows.map((r) => ({ entity_id: r.entity_id, total_pts: r.total_pts ?? 0 }));
  };

  if (scoringType === 'Position' && config.position_event_use_event_spread !== false) {
    const rows = await participantTotals(sql<number>`sum(${matchGamePlacements.points_awarded})`.mapWith(Number));
    const byParticipant = new Map(rows.map((r) => [r.entity_id, r.total_pts]));
    for (const p of participants) {
      addPoints(playerKey(p), p.username, (byParticipant.get(p.id) ?? 0) * mult, event.id);
    }
    return;
  }

  if (scoringType === 'FFA' || scoringType === 'Position') {
    const rows = await participantTotals(
      sql<number>`sum(coalesce(${matchGamePlacements.points_awarded}, case when ${matchGamePlacements.is_winner} then 1 else 0 end))`.mapWith(Number),
    );
    const best = rows.reduce((max, r) => Math.max(max, r.total_pts), -Infinity);
    const leaders = rows.filter((r) => r.total_pts === best);
    // A tie for first means nobody is credited with the win.
    const winnerId = leaders.length === 1 && best > 0 ? leaders[0].entity_id : null;
    for (const p of participants) {
      addPoints(playerKey(p), p.username, (p.id === winnerId ? winPts : lossPts) * mult, event.id);
    }
    return;
  }

  if (match.tournament_id) {
    // Tournament match: winner_team is a tournament_teams.id, so credit by tournament team membership instead of match_teams.
    const winnerTeam = match.winner_team ?? await determineMatchWinner(ex, matchId);
    const teamIds = [team1, team2].filter((t): t is string => !!t);
    const members = teamIds.length === 0 ? [] : await ex
      .select({ team_id: tournamentTeamMembers.team_id, user_id: tournamentTeamMembers.user_id, discord_user_id: tournamentTeamMembers.discord_user_id })
      .from(tournamentTeamMembers).where(inArray(tournamentTeamMembers.team_id, teamIds)).orderBy(asc(tournamentTeamMembers.id));
    for (const p of participants) {
      const member = members.find((m) => m.user_id === p.user_id || (m.discord_user_id && m.discord_user_id === p.discord_user_id));
      if (!member) continue; // not on either team
      const isWinner = winnerTeam !== null && member.team_id === winnerTeam;
      addPoints(playerKey(p), p.username, (isWinner ? winPts : lossPts) * mult, event.id);
    }
    return;
  }

  const winnerEntityId = await determineMatchWinner(ex, matchId);
  for (const p of participants) {
    if (p.is_reserve === true) continue;
    if (!p.team_id) continue; // unassigned
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
 * Resolve bracket-tournament placings as an ordered list of team-id groups (index 0 = champion, 1 = runner-up,
 * 2 = third place, ...). Groups with several teams are tied for that placing.
 *
 * Single elimination: champion = winner of the highest winners-bracket round; runner-up = its loser; semifinal losers
 * share 3rd. Double elimination: champion = winner of the 'final' bracket match (latest round if there's a reset);
 * runner-up = its loser; 3rd = loser of the last losers-bracket match.
 */
export function resolveBracketPlacings(bracket: BracketMatch[], format: string): string[][] {
  const done = bracket.filter((m) => m.status === 'complete' && m.winner_team);
  const maxBy = (list: BracketMatch[]) => list.reduce<BracketMatch | null>((best, m) => (!best || m.round > best.round ? m : best), null);

  let finalMatch: BracketMatch | null;
  if (format === 'double-elimination') {
    finalMatch = maxBy(done.filter((m) => m.bracket_type === 'final'));
  } else {
    finalMatch = maxBy(done.filter((m) => m.bracket_type === 'winners' || m.bracket_type === 'final'));
  }
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

/**
 * Score a 'tournament' series event via tournament_position_points. Only completed tournaments contribute.
 *
 * cumulative-points: players are ranked by total points (grouped on discord_user_id/user_id); ties share the higher
 * placing's points. Bracket formats: see resolveBracketPlacings - champion, runner-up and third place receive
 * tournament_position_points[0..2].
 */
async function scoreTournamentEvent(ex: Executor, event: SeriesEventRow, config: SeriesScoringConfig, addPoints: AddPoints): Promise<void> {
  if (!event.tournament_id) return;
  const tournamentId = event.tournament_id;
  const positionPoints = config.tournament_position_points ?? [];
  const mult = event.points_multiplier;

  const [tournament] = await ex.select({ format: tournaments.format, status: tournaments.status }).from(tournaments).where(eq(tournaments.id, tournamentId));
  if (tournament?.status !== 'complete') return;

  if (tournament.format === 'cumulative-points') {
    const key = sql<string>`coalesce(${matchParticipants.discord_user_id}, ${matchParticipants.user_id})`;
    const username = sql<string>`max(${matchParticipants.username})`;
    const totalPoints = sql<number>`coalesce(sum(${matchGamePlacements.points_awarded}), 0)`.mapWith(Number);
    const rows = await ex
      .select({ player_key: key, username, total_points: totalPoints })
      .from(matchParticipants)
      .innerJoin(matches, and(eq(matchParticipants.match_id, matches.id), eq(matches.tournament_id, tournamentId)))
      .leftJoin(matchGames, and(eq(matchGames.match_id, matches.id), eq(matchGames.status, 'completed')))
      .leftJoin(matchGamePlacements, and(
        eq(matchGamePlacements.match_game_id, matchGames.id),
        eq(matchGamePlacements.entity_id, matchParticipants.id),
        eq(matchGamePlacements.entity_type, 'participant'),
      ))
      .groupBy(key)
      .orderBy(desc(totalPoints), asc(username));
    const ranks = tieAwareRanks(rows.map((r) => r.total_points));
    rows.forEach((r, idx) => {
      addPoints(r.player_key, r.username, (positionPoints[ranks[idx]] ?? 0) * mult, event.id);
    });
    return;
  }

  const bracketRows = await ex
    .select({
      match_round: matches.tournament_round, tm_round: tournamentMatches.round,
      match_bracket: matches.tournament_bracket_type, tm_bracket: tournamentMatches.bracket_type,
      status: matches.status, winner_team: matches.winner_team,
      tm_team1: tournamentMatches.team1_id, tm_team2: tournamentMatches.team2_id,
      blue_team_id: matches.blue_team_id, red_team_id: matches.red_team_id,
    })
    .from(matches)
    .leftJoin(tournamentMatches, eq(tournamentMatches.match_id, matches.id))
    .where(eq(matches.tournament_id, tournamentId));
  const bracket: BracketMatch[] = bracketRows.map((r) => ({
    round: r.match_round ?? r.tm_round ?? 1,
    bracket_type: r.match_bracket ?? r.tm_bracket ?? 'winners',
    status: r.status,
    winner_team: r.winner_team,
    team1_id: r.tm_team1 ?? r.blue_team_id,
    team2_id: r.tm_team2 ?? r.red_team_id,
  }));
  const placings = resolveBracketPlacings(bracket, tournament.format);
  if (placings.length === 0) return;

  const allTeams = [...new Set(placings.flat())];
  const members = await ex
    .select({
      team_id: tournamentTeamMembers.team_id, user_id: tournamentTeamMembers.user_id,
      discord_user_id: tournamentTeamMembers.discord_user_id, username: tournamentTeamMembers.username,
    })
    .from(tournamentTeamMembers).where(inArray(tournamentTeamMembers.team_id, allTeams)).orderBy(asc(tournamentTeamMembers.id));

  for (let i = 0; i < placings.length; i++) {
    const pts = (positionPoints[i] ?? 0) * mult;
    for (const teamId of placings[i]) {
      for (const mem of members.filter((m) => m.team_id === teamId)) addPoints(playerKey(mem), mem.username, pts, event.id);
    }
  }
}

export async function getSeriesStandings(ex: Executor, seriesId: string): Promise<SeriesStandingRow[]> {
  const row = await getSeriesById(ex, seriesId);
  const config = parseScoringConfig(row?.scoring_config);
  const events = await listSeriesEvents(ex, seriesId);

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
      await scoreMatchEvent(ex, event, config, addPoints);
    } else if (event.event_type === 'tournament') {
      await scoreTournamentEvent(ex, event, config, addPoints);
    }
  }

  const sorted = Array.from(totals.entries())
    .map(([user_id, data]) => ({
      user_id,
      username: data.username,
      total_points: data.total_points,
      events_played: data.per_event.size,
      events: events.map((ev) => ({ series_event_id: ev.id, points: data.per_event.get(ev.id) ?? null })),
    }))
    .sort((a, b) => b.total_points - a.total_points || a.username.localeCompare(b.username));
  // Players tied on points share a rank (same convention as tournament standings).
  const ranks = tieAwareRanks(sorted.map((e) => e.total_points));
  return sorted.map((entry, idx) => ({ rank: ranks[idx] + 1, ...entry }));
}
