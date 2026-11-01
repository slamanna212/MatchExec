/** Read-side scoring: who is winning / won a match, overall scores, per-game results and the position spread. */
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Executor } from '../../../lib/db';
import {
  gameModes, games, matchGamePlacements, matchGames, matchParticipants, matchTeams, matches, tournamentMatches, tournaments,
} from '../../../lib/db/schema';
import { logger } from '../logger';
import { cleanMapId } from '../utils/map-utils';
import { calculatePointsFromConfig, parsePositionScoringConfig } from '../scoring/position';
import { pickTopEntry, winnerByWins, winnerEntityTypeFor, type WinnerEntityType } from '../scoring/winners';
import type { PositionScoringConfig } from '@/shared/types';
import { lookupMaps, legacyFieldsFromPlacements, type PlacementView } from './games';

export type { WinnerEntityType };

// ─── Position spread ─────────────────────────────────────────────────────────

/**
 * Resolve a match's position points spread through the 3-level override chain: the match's own
 * `position_scoring_override`, then its tournament's, then the game's `scoring_config`, then the default spread.
 */
export async function resolvePositionScoringConfig(ex: Executor, matchId: string): Promise<PositionScoringConfig> {
  const [row] = await ex
    .select({
      match_override: matches.position_scoring_override,
      tournament_override: tournaments.position_scoring_override,
      game_config: games.scoring_config,
    })
    .from(matches)
    .leftJoin(tournaments, eq(matches.tournament_id, tournaments.id))
    .leftJoin(games, eq(matches.game_id, games.id))
    .where(eq(matches.id, matchId));
  return parsePositionScoringConfig(row?.match_override ?? row?.tournament_override ?? row?.game_config ?? null);
}

export async function getPointsForPositionByMatchId(ex: Executor, position: number, matchId: string): Promise<number> {
  const config = await resolvePositionScoringConfig(ex, matchId);
  return config.pointsPerPosition[position.toString()] ?? 0;
}

/** participantId -> points for a (participantId -> 1-based position) map, using the match's spread. */
export async function calculatePositionPoints(
  ex: Executor,
  positionResults: Record<string, number>,
  matchGameId: string,
): Promise<Record<string, number>> {
  const [game] = await ex.select({ match_id: matchGames.match_id }).from(matchGames).where(eq(matchGames.id, matchGameId));
  const config = game ? await resolvePositionScoringConfig(ex, game.match_id) : parsePositionScoringConfig(null);
  return calculatePointsFromConfig(positionResults, config);
}

// ─── Winner entity / rescore guard ───────────────────────────────────────────

/** Which ID space `matches.winner_team` is in for this match (see `winnerEntityTypeFor`). `type` is null with no winner. */
export async function resolveWinnerEntity(ex: Executor, matchId: string): Promise<{ type: WinnerEntityType | null; id: string | null }> {
  const [row] = await ex
    .select({ winner_team: matches.winner_team, tournament_id: matches.tournament_id, scoring_type: gameModes.scoring_type })
    .from(matches)
    .leftJoin(gameModes, and(eq(gameModes.id, matches.mode_id), eq(gameModes.game_id, matches.game_id)))
    .where(eq(matches.id, matchId));
  if (!row?.winner_team) return { type: null, id: null };
  return { type: winnerEntityTypeFor(row), id: row.winner_team };
}

/**
 * Why a completed tournament match can no longer be rescored, or null if it can. Once the bracket has consumed a
 * match's result (a later match was generated with either of its teams, or the tournament finished), changing
 * winner_team would leave the bracket inconsistent. A "later" match is one inserted after this one
 * (`tournament_matches.created_at`): bracket rows are only ever inserted.
 */
export async function getTournamentRescoreBlocker(ex: Executor, matchId: string): Promise<string | null> {
  const [row] = await ex
    .select({ tournament_status: tournaments.status, tournament_id: tournaments.id })
    .from(matches).innerJoin(tournaments, eq(tournaments.id, matches.tournament_id)).where(eq(matches.id, matchId));
  if (!row) return null; // standalone match
  if (row.tournament_status === 'complete') return 'The tournament is complete; its match results can no longer be rescored';

  const [tm] = await ex.select().from(tournamentMatches).where(eq(tournamentMatches.match_id, matchId));
  const teams = [tm?.team1_id, tm?.team2_id].filter((t): t is string => !!t);
  if (!tm || teams.length === 0) return null;

  const later = await ex.select({ match_id: tournamentMatches.match_id }).from(tournamentMatches)
    .where(and(
      eq(tournamentMatches.tournament_id, tm.tournament_id),
      // Compared inside SQL: a JS Date round trip would truncate Postgres' microseconds and make the row itself look "later".
      sql`${tournamentMatches.created_at} > (select tm0.created_at from tournament_matches tm0 where tm0.match_id = ${matchId})`,
      sql`(${tournamentMatches.team1_id} IN (${sql.join(teams.map((t) => sql`${t}`), sql`, `)}) OR ${tournamentMatches.team2_id} IN (${sql.join(teams.map((t) => sql`${t}`), sql`, `)}))`,
    )).limit(1);
  return later.length > 0 ? 'The bracket has already advanced past this match; it can no longer be rescored' : null;
}

// ─── Totals ──────────────────────────────────────────────────────────────────

const completedGameIds = (ex: Executor, matchId: string) =>
  ex.select({ id: matchGames.id }).from(matchGames).where(and(eq(matchGames.match_id, matchId), eq(matchGames.status, 'completed')));

/** Participant point totals across completed games, highest first. FFA wins (no points_awarded) count as 1 point. */
export async function getParticipantPointTotals(
  ex: Executor,
  matchId: string,
): Promise<Array<{ entity_id: string; username: string | null; total_pts: number; races: number }>> {
  const total = sql<number>`sum(coalesce(${matchGamePlacements.points_awarded}, case when ${matchGamePlacements.is_winner} then 1 else 0 end))`.mapWith(Number);
  return ex
    .select({ entity_id: matchGamePlacements.entity_id, username: matchParticipants.username, total_pts: total, races: sql<number>`count(*)`.mapWith(Number) })
    .from(matchGamePlacements)
    .innerJoin(matchGames, eq(matchGames.id, matchGamePlacements.match_game_id))
    .leftJoin(matchParticipants, eq(matchParticipants.id, matchGamePlacements.entity_id))
    .where(and(eq(matchGames.match_id, matchId), eq(matchGames.status, 'completed'), eq(matchGamePlacements.entity_type, 'participant')))
    .groupBy(matchGamePlacements.entity_id, matchParticipants.username)
    .orderBy(desc(total), asc(matchGamePlacements.entity_id));
}

export interface TeamWins { teamId: string; teamName: string; teamOrder: number; wins: number }

/** Win counts for every non-reserve team (completed games only) plus how many completed games produced team placements. */
export async function getTeamWins(ex: Executor, matchId: string): Promise<{ teams: TeamWins[]; gamesWithPlacements: number }> {
  const wins = sql<number>`count(${matchGamePlacements.id}) filter (where ${matchGamePlacements.is_winner})`.mapWith(Number);
  const rows = await ex
    .select({ teamId: matchTeams.id, teamName: matchTeams.team_name, teamOrder: matchTeams.team_order, wins })
    .from(matchTeams)
    .leftJoin(matchGamePlacements, and(
      eq(matchGamePlacements.entity_id, matchTeams.id), eq(matchGamePlacements.entity_type, 'team'),
      inArray(matchGamePlacements.match_game_id, completedGameIds(ex, matchId)),
    ))
    .where(and(eq(matchTeams.match_id, matchId), eq(matchTeams.is_reserve, false)))
    .groupBy(matchTeams.id)
    .orderBy(asc(matchTeams.team_order));
  const [total] = await ex
    .select({ total: sql<number>`count(distinct ${matchGamePlacements.match_game_id})`.mapWith(Number) })
    .from(matchGamePlacements)
    .innerJoin(matchGames, eq(matchGames.id, matchGamePlacements.match_game_id))
    .where(and(eq(matchGames.match_id, matchId), eq(matchGames.status, 'completed'), eq(matchGamePlacements.entity_type, 'team')));
  return { teams: rows, gamesWithPlacements: total?.total ?? 0 };
}

/** tournament_teams.id for slot 1 (blue / team1) or 2 (red / team2) of a tournament match. */
async function getTournamentTeamId(ex: Executor, matchId: string, slot: 1 | 2): Promise<string | null> {
  const [row] = await ex
    .select({ red: matches.red_team_id, blue: matches.blue_team_id, team1: tournamentMatches.team1_id, team2: tournamentMatches.team2_id })
    .from(matches).leftJoin(tournamentMatches, eq(tournamentMatches.match_id, matches.id)).where(eq(matches.id, matchId));
  // insertMatch stores blue_team_id = team1 and red_team_id = team2 (team1 is blue / team_order 0).
  return slot === 1 ? (row?.team1 ?? row?.blue ?? null) : (row?.team2 ?? row?.red ?? null);
}

/**
 * The winner of a match by scoring_type, as a value for `matches.winner_team` (see resolveWinnerEntity for the ID space):
 * Normal standalone -> the match_teams.id with the most game wins; tournament -> the tournament_teams.id of the winning
 * slot (tournament matches are always 1v1: team_order 0 = slot 1, 1 = slot 2); FFA/Position -> the participant with the
 * highest cumulative points. A tie for the top yields null.
 */
export async function determineMatchWinner(ex: Executor, matchId: string): Promise<string | null> {
  const [match] = await ex
    .select({ tournament_id: matches.tournament_id, scoring_type: gameModes.scoring_type })
    .from(matches).leftJoin(gameModes, and(eq(gameModes.id, matches.mode_id), eq(gameModes.game_id, matches.game_id)))
    .where(eq(matches.id, matchId));
  const scoringType = match?.scoring_type ?? 'Normal';

  if (scoringType === 'FFA' || scoringType === 'Position') {
    const totals = await getParticipantPointTotals(ex, matchId);
    return pickTopEntry(totals, (t) => t.total_pts)?.entity_id ?? null;
  }

  const { teams, gamesWithPlacements } = await getTeamWins(ex, matchId);
  if (teams.length === 0 || gamesWithPlacements === 0) return null;
  const winnerId = winnerByWins(teams);
  if (!winnerId) return null;

  if (match?.tournament_id) {
    const order = teams.find((t) => t.teamId === winnerId)?.teamOrder;
    if (order === 0) return getTournamentTeamId(ex, matchId, 1);
    if (order === 1) return getTournamentTeamId(ex, matchId, 2);
    return null;
  }
  return winnerId;
}

// ─── Overall scores (API) ────────────────────────────────────────────────────

export async function getOverallPositionScore(ex: Executor, matchId: string): Promise<{
  participantScores: Record<string, { username: string; totalPoints: number; races: number }>;
  winner: string | null;
}> {
  try {
    const rows = await getParticipantPointTotals(ex, matchId);
    const participantScores: Record<string, { username: string; totalPoints: number; races: number }> = {};
    for (const row of rows) {
      participantScores[row.entity_id] = { username: row.username || 'Unknown', totalPoints: row.total_pts, races: row.races };
    }
    return { participantScores, winner: pickTopEntry(rows, (r) => r.total_pts)?.entity_id ?? null };
  } catch (error) {
    logger.error('Error getting overall position score:', error);
    return { participantScores: {}, winner: null };
  }
}

export interface OverallMatchScore {
  team1Wins: number;
  team2Wins: number;
  totalNormalGames: number;
  overallWinner: 'team1' | 'team2' | 'tie' | null;
  overallWinnerTeamId: string | null;
  scoringType: string;
  teamScores: Array<{ teamId: string; teamName: string; teamOrder: number; wins: number }>;
}

const emptyScore = (scoringType: string): OverallMatchScore => ({
  team1Wins: 0, team2Wins: 0, totalNormalGames: 0, overallWinner: null, overallWinnerTeamId: null, scoringType, teamScores: [],
});

/**
 * Overall match score by scoring_type. Normal: per-team win counts (N-team aware via `teamScores`; team1Wins/team2Wins
 * mirror the first two teams by team_order). FFA/Position: no overall winner here (use getOverallPositionScore).
 */
export async function getOverallMatchScore(ex: Executor, matchId: string): Promise<OverallMatchScore> {
  try {
    const [mode] = await ex.select({ scoring_type: gameModes.scoring_type })
      .from(matches).leftJoin(gameModes, and(eq(gameModes.id, matches.mode_id), eq(gameModes.game_id, matches.game_id)))
      .where(eq(matches.id, matchId));
    const scoringType = mode?.scoring_type ?? 'Normal';
    if (scoringType !== 'Normal') return emptyScore(scoringType);

    const { teams: teamScores, gamesWithPlacements } = await getTeamWins(ex, matchId);
    if (teamScores.length === 0 || gamesWithPlacements === 0) return emptyScore(scoringType);

    const sorted = [...teamScores].sort((a, b) => b.wins - a.wins);
    const isTie = sorted.length > 1 && sorted[0].wins === sorted[1].wins;
    const overallWinnerTeamId = !isTie && sorted[0]?.wins > 0 ? sorted[0].teamId : null;
    const team1 = teamScores.find((t) => t.teamOrder === 0);
    const team2 = teamScores.find((t) => t.teamOrder === 1);
    let overallWinner: OverallMatchScore['overallWinner'];
    if (isTie) overallWinner = 'tie';
    else if (overallWinnerTeamId && team1?.teamId === overallWinnerTeamId) overallWinner = 'team1';
    else if (overallWinnerTeamId && team2?.teamId === overallWinnerTeamId) overallWinner = 'team2';
    else overallWinner = overallWinnerTeamId ? null : 'tie'; // a 3rd+ team won: not representable in the legacy label

    return {
      team1Wins: team1?.wins ?? 0, team2Wins: team2?.wins ?? 0, totalNormalGames: gamesWithPlacements,
      overallWinner, overallWinnerTeamId, scoringType, teamScores,
    };
  } catch (error) {
    logger.error('Error getting overall match score:', error);
    return emptyScore('Normal');
  }
}

// ─── Per-game results (API) ──────────────────────────────────────────────────

export interface GameWithResults {
  id: string;
  round: number;
  map_name: string;
  mode_scoring_type: string;
  status: string;
  winner_id?: string;
  participant_winner_id?: string;
  participant_winner_name?: string;
  is_ffa_mode: boolean;
  placements?: Array<{
    entityType: string; entityId: string; position?: number; score?: number; pointsAwarded?: number;
    isWinner: boolean; teamName?: string; username?: string;
  }>;
}

/** Match games with their placements (names resolved) plus the legacy-shaped winner fields. */
export async function getMatchGamesWithResults(ex: Executor, matchId: string): Promise<GameWithResults[]> {
  try {
    const rawGames = await ex
      .select({ id: matchGames.id, round: matchGames.round, map_id: matchGames.map_id, game_id: matches.game_id, status: matchGames.status })
      .from(matchGames).innerJoin(matches, eq(matches.id, matchGames.match_id))
      .where(and(eq(matchGames.match_id, matchId), sql`${matchGames.round} > 0`)).orderBy(asc(matchGames.round));
    if (rawGames.length === 0) return [];

    const mapLookup = await lookupMaps(ex, rawGames[0].game_id, rawGames.map((g) => g.map_id));
    const placementRows = await ex.select().from(matchGamePlacements)
      .where(inArray(matchGamePlacements.match_game_id, rawGames.map((g) => g.id)))
      .orderBy(sql`${matchGamePlacements.position} ASC NULLS LAST`, asc(matchGamePlacements.entity_id));
    const teams = await ex.select({ id: matchTeams.id, team_name: matchTeams.team_name, team_order: matchTeams.team_order })
      .from(matchTeams).where(eq(matchTeams.match_id, matchId));
    const participants = await ex.select({ id: matchParticipants.id, username: matchParticipants.username })
      .from(matchParticipants).where(eq(matchParticipants.match_id, matchId));
    const teamById = new Map(teams.map((t) => [t.id, t]));
    const participantById = new Map(participants.map((p) => [p.id, p.username]));
    const teamOrderById = new Map(teams.map((t) => [t.id, t.team_order]));

    return rawGames.map((game) => {
      const mapData = game.map_id ? mapLookup[cleanMapId(game.map_id)] : undefined;
      const rows = placementRows.filter((p) => p.match_game_id === game.id);
      const legacy = legacyFieldsFromPlacements(rows as unknown as PlacementView[], teamOrderById, mapData?.mode_scoring_type);
      return {
        id: game.id,
        round: game.round,
        status: game.status,
        map_name: mapData?.name as string,
        mode_scoring_type: mapData?.mode_scoring_type as string,
        winner_id: legacy.winner_id,
        participant_winner_id: legacy.participant_winner_id,
        participant_winner_name: legacy.participant_winner_id ? participantById.get(legacy.participant_winner_id) : undefined,
        is_ffa_mode: legacy.is_ffa_mode,
        placements: rows.length > 0
          ? rows.map((p) => ({
              entityType: p.entity_type,
              entityId: p.entity_id,
              position: p.position ?? undefined,
              score: p.score ?? undefined,
              pointsAwarded: p.points_awarded ?? undefined,
              isWinner: p.is_winner,
              teamName: p.entity_type === 'team' ? teamById.get(p.entity_id)?.team_name : undefined,
              username: p.entity_type === 'participant' ? participantById.get(p.entity_id) : undefined,
            }))
          : undefined,
      };
    });
  } catch (error) {
    logger.error('Error getting match games with results:', error);
    return [];
  }
}
