/** Standings and read models for tournaments: cumulative-points leaderboard, bracket win/loss table, bracket match list. */
import { and, asc, eq, or, sql } from 'drizzle-orm';
import type { Executor } from '../../../lib/db';
import { matchGamePlacements, matchGames, matchParticipants, matches, tournamentMatches, tournamentTeams } from '../../../lib/db/schema';
import { determineMatchWinner } from '../matches';

export interface CumulativeStandingRow {
  rank: number;
  /** A participant row id for this player (stable key is `player_key`). */
  participant_id: string;
  player_key: string;
  username: string;
  discord_user_id: string | null;
  user_id: string | null;
  total_points: number;
  matches_played: number;
  best_position: number | null;
  first_places: number;
}

/**
 * Competition ranking (1, 1, 3) for rows already sorted by points: equal totals share a rank. Pure.
 */
export function assignRanks<T extends { total_points: number }>(rows: T[]): Array<T & { rank: number }> {
  let lastPoints: number | null = null;
  let lastRank = 0;
  return rows.map((r, idx) => {
    const rank = lastPoints !== null && r.total_points === lastPoints ? lastRank : idx + 1;
    lastPoints = r.total_points;
    lastRank = rank;
    return { ...r, rank };
  });
}

/**
 * Cumulative-points standings, aggregated per player across every match of the tournament. The stable key is
 * COALESCE(discord_user_id, user_id, participant id) because match_participants.id differs for the same player in each
 * match. Equal point totals share a rank. Players without any placement sort after those with one (NULLS LAST).
 */
export async function getCumulativeStandings(ex: Executor, tournamentId: string): Promise<CumulativeStandingRow[]> {
  const mp = matchParticipants;
  const mgp = matchGamePlacements;
  const playerKey = sql<string>`coalesce(${mp.discord_user_id}, ${mp.user_id}, ${mp.id})`;
  const totalPoints = sql<number>`coalesce(sum(${mgp.points_awarded}), 0)`.mapWith(Number);
  const firstPlaces = sql<number>`coalesce(sum(case when ${mgp.position} = 1 then 1 else 0 end), 0)`.mapWith(Number);
  const bestPosition = sql<number | null>`min(${mgp.position})`.mapWith((v) => (v === null ? null : Number(v)));
  const username = sql<string>`max(${mp.username})`;

  const rows = await ex
    .select({
      player_key: playerKey,
      participant_id: sql<string>`min(${mp.id})`,
      username,
      discord_user_id: sql<string | null>`max(${mp.discord_user_id})`,
      user_id: sql<string | null>`max(${mp.user_id})`,
      total_points: totalPoints,
      matches_played: sql<number>`count(distinct ${mgp.match_game_id})`.mapWith(Number),
      best_position: bestPosition,
      first_places: firstPlaces,
    })
    .from(mp)
    .innerJoin(matches, and(eq(mp.match_id, matches.id), eq(matches.tournament_id, tournamentId)))
    .leftJoin(matchGames, and(eq(matchGames.match_id, matches.id), eq(matchGames.status, 'completed')))
    .leftJoin(mgp, and(eq(mgp.match_game_id, matchGames.id), eq(mgp.entity_id, mp.id), eq(mgp.entity_type, 'participant')))
    .groupBy(playerKey)
    .orderBy(sql`${totalPoints} desc`, sql`${firstPlaces} desc`, sql`${bestPosition} asc nulls last`, sql`${username} asc`, sql`${playerKey} asc`);

  return assignRanks(rows) as CumulativeStandingRow[];
}

export interface LeaderboardBreakdownRow {
  match_id: string;
  match_name: string;
  match_game_id: string | null;
  round: number | null;
  participant_id: string;
  username: string;
  position: number | null;
  points_awarded: number | null;
}

/** Per-match, per-game placement of every participant (the leaderboard's breakdown table). */
export async function getLeaderboardBreakdown(ex: Executor, tournamentId: string): Promise<LeaderboardBreakdownRow[]> {
  return ex
    .select({
      match_id: matches.id, match_name: matches.name, match_game_id: matchGames.id, round: matchGames.round,
      participant_id: matchParticipants.id, username: matchParticipants.username,
      position: matchGamePlacements.position, points_awarded: matchGamePlacements.points_awarded,
    })
    .from(matches)
    .innerJoin(matchParticipants, eq(matchParticipants.match_id, matches.id))
    .leftJoin(matchGames, and(eq(matchGames.match_id, matches.id), eq(matchGames.status, 'completed')))
    .leftJoin(matchGamePlacements, and(
      eq(matchGamePlacements.match_game_id, matchGames.id), eq(matchGamePlacements.entity_id, matchParticipants.id), eq(matchGamePlacements.entity_type, 'participant'),
    ))
    .where(eq(matches.tournament_id, tournamentId))
    .orderBy(asc(matches.created_at), asc(matches.id), asc(matchGames.round), sql`${matchGamePlacements.position} asc nulls last`, asc(matchParticipants.username), asc(matchParticipants.id));
}

export interface BracketStandingRow {
  team_id: string;
  team_name: string;
  matches_played: number;
  wins: number;
  losses: number;
}

/** Win/loss table of an elimination tournament's teams (complete matches only; a draw counts as neither). */
export async function getBracketStandings(ex: Executor, tournamentId: string): Promise<BracketStandingRow[]> {
  const wins = sql<number>`coalesce(sum(case when ${matches.winner_team} = ${tournamentTeams.id} then 1 else 0 end), 0)`.mapWith(Number);
  const losses = sql<number>`coalesce(sum(case when ${matches.winner_team} is not null and ${matches.winner_team} <> ${tournamentTeams.id} then 1 else 0 end), 0)`.mapWith(Number);
  return ex
    .select({
      team_id: tournamentTeams.id,
      team_name: tournamentTeams.team_name,
      matches_played: sql<number>`count(${matches.id})`.mapWith(Number),
      wins,
      losses,
    })
    .from(tournamentTeams)
    .leftJoin(matches, and(
      eq(matches.tournament_id, tournamentTeams.tournament_id),
      or(eq(matches.red_team_id, tournamentTeams.id), eq(matches.blue_team_id, tournamentTeams.id)),
      eq(matches.status, 'complete'),
    ))
    .where(eq(tournamentTeams.tournament_id, tournamentId))
    .groupBy(tournamentTeams.id, tournamentTeams.team_name)
    .orderBy(sql`${wins} desc`, sql`${losses} asc`, asc(tournamentTeams.team_name), asc(tournamentTeams.id));
}

export interface BracketMatchDto {
  id: string;
  round: number;
  bracket_type: 'winners' | 'losers' | 'final';
  team1?: { id: string; name: string };
  team2?: { id: string; name: string };
  winner?: string;
  status: 'pending' | 'ongoing' | 'complete';
  rawStatus: string;
  match_order: number;
}

export function bracketStatusOf(status: string): BracketMatchDto['status'] {
  if (status === 'battle') return 'ongoing';
  if (status === 'complete') return 'complete';
  return 'pending';
}

/** The tournament's matches shaped for the bracket view. Completed matches without a stored winner derive one from game wins. */
export async function listBracketMatches(ex: Executor, tournamentId: string): Promise<BracketMatchDto[]> {
  const rows = await ex
    .select({
      id: matches.id, status: matches.status, tournament_round: matches.tournament_round, tournament_bracket_type: matches.tournament_bracket_type,
      team1_name: matches.team1_name, team2_name: matches.team2_name, winner_team: matches.winner_team,
      team1_id: tournamentMatches.team1_id, team2_id: tournamentMatches.team2_id, match_order: tournamentMatches.match_order,
    })
    .from(matches).leftJoin(tournamentMatches, eq(matches.id, tournamentMatches.match_id))
    .where(eq(matches.tournament_id, tournamentId))
    .orderBy(asc(matches.tournament_round), asc(tournamentMatches.match_order), asc(matches.id));

  const out: BracketMatchDto[] = [];
  for (const row of rows) {
    let winner = row.winner_team;
    if (!winner && row.status === 'complete') winner = await determineMatchWinner(ex, row.id);
    out.push({
      id: row.id,
      round: row.tournament_round as number,
      bracket_type: row.tournament_bracket_type as BracketMatchDto['bracket_type'],
      team1: row.team1_id ? { id: row.team1_id, name: row.team1_name || 'Team 1' } : undefined,
      team2: row.team2_id ? { id: row.team2_id, name: row.team2_name || 'Team 2' } : undefined,
      winner: winner || undefined,
      status: bracketStatusOf(row.status),
      rawStatus: row.status,
      match_order: row.match_order as number,
    });
  }
  return out;
}
