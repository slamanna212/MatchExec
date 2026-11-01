/**
 * Validation and orchestration for `POST /api/matches/:matchId/games/:gameId/result`: turns an untrusted request body
 * (typed `SaveResultBody`, or the legacy `MatchResult` shape) into a validated MatchResult and saves it.
 */
import { and, count, eq, inArray } from 'drizzle-orm';
import { db, type Executor } from '../../../lib/db';
import { matchParticipants, matchTeams } from '../../../lib/db/schema';
import type { MatchResult } from '@/shared/types';
import type { SaveResultBody } from '../types/scoring';
import { getMatchGameInMatch, getScoringTypeForGame } from './games';
import { saveMatchResult } from './results';
import { getTournamentRescoreBlocker } from './scoreboard';
import { lockMatch } from './teams';
import { AfterCommit } from './effects';

type ResultBody = (SaveResultBody | MatchResult) & { rescore?: boolean; draw?: boolean };

/** A request problem with the HTTP status to answer with. */
export class ResultError extends Error {
  constructor(message: string, public status: 400 | 404 | 409 = 400) {
    super(message);
    this.name = 'ResultError';
  }
}

async function loadTeam(ex: Executor, matchId: string, teamId: string, field: string) {
  const [team] = await ex.select({ id: matchTeams.id, team_name: matchTeams.team_name, team_order: matchTeams.team_order, is_reserve: matchTeams.is_reserve })
    .from(matchTeams).where(and(eq(matchTeams.id, teamId), eq(matchTeams.match_id, matchId)));
  if (!team) throw new ResultError(`${field} is not a team of this match`);
  if (team.is_reserve) throw new ResultError(`${field} refers to the reserve team`);
  return team;
}

async function assertParticipantsInMatch(ex: Executor, matchId: string, ids: string[], field: string): Promise<void> {
  if (ids.length === 0) return;
  const rows = await ex.select({ id: matchParticipants.id }).from(matchParticipants)
    .where(and(eq(matchParticipants.match_id, matchId), inArray(matchParticipants.id, ids)));
  const found = new Set(rows.map((r) => r.id));
  if (ids.some((id) => !found.has(id))) throw new ResultError(`${field} contains participants that are not part of this match`);
}

function validateOptionalNumber(value: unknown, field: string): void {
  if (value !== undefined && value !== null && (typeof value !== 'number' || !Number.isFinite(value))) {
    throw new ResultError(`${field} must be a number`);
  }
}

/** Validate a result body against the DB and normalise it to a MatchResult plus a human-readable success message. */
export async function buildResult(ex: Executor, matchId: string, gameId: string, body: ResultBody): Promise<{ result: MatchResult; message: string }> {
  const isTyped = 'type' in body && typeof body.type === 'string';
  const raw = body as unknown as Record<string, unknown>;

  let kind: 'Normal' | 'FFA' | 'Position';
  if (isTyped) {
    const t = raw.type;
    if (t !== 'Normal' && t !== 'FFA' && t !== 'Position') throw new ResultError('Unknown result type');
    kind = t;
  } else if (raw.isPositionMode) kind = 'Position';
  else if (raw.isFfaMode) kind = 'FFA';
  else kind = 'Normal';

  if (raw.matchId !== undefined && raw.matchId !== matchId) throw new ResultError('Match ID mismatch');
  if (raw.gameId !== undefined && raw.gameId !== gameId) throw new ResultError('Game ID mismatch');
  if (isTyped && (raw.matchId === undefined || raw.gameId === undefined)) {
    throw new ResultError(raw.matchId === undefined ? 'Match ID mismatch' : 'Game ID mismatch');
  }

  const declared = await getScoringTypeForGame(ex, gameId);
  if (declared && declared !== kind) throw new ResultError(`This game uses ${declared} scoring; a ${kind} result was submitted`);

  const base = { matchId, gameId, completedAt: new Date(), rescore: raw.rescore === true };

  if (kind === 'FFA') {
    const participantId = (isTyped ? raw.winnerParticipantId : raw.participantWinnerId) as string | undefined;
    if (!participantId || typeof participantId !== 'string') throw new ResultError('winnerParticipantId is required for FFA mode');
    await assertParticipantsInMatch(ex, matchId, [participantId], 'winnerParticipantId');
    return { result: { ...base, winner: 'team1', participantWinnerId: participantId, isFfaMode: true }, message: 'FFA result saved' };
  }

  if (kind === 'Position') {
    const positionResults = raw.positionResults as Record<string, unknown> | undefined;
    if (!positionResults || typeof positionResults !== 'object' || Object.keys(positionResults).length === 0) {
      throw new ResultError('positionResults is required for Position mode');
    }
    const ids = Object.keys(positionResults);
    const positions = Object.values(positionResults);
    if (!positions.every((p) => typeof p === 'number' && Number.isInteger(p) && p > 0)) throw new ResultError('positionResults values must be positive integers');
    if (new Set(positions).size !== positions.length) throw new ResultError('positionResults positions must be unique');
    // Unique positive integers that are all <= N means exactly 1..N, so someone finished 1st.
    if (!positions.every((p) => (p as number) <= positions.length)) throw new ResultError(`positionResults positions must run 1 to ${positions.length} with no gaps`);
    await assertParticipantsInMatch(ex, matchId, ids, 'positionResults');
    return {
      result: { ...base, winner: 'team1', isFfaMode: false, isPositionMode: true, positionResults: positionResults as Record<string, number> },
      message: 'Position result saved',
    };
  }

  // Normal
  validateOptionalNumber(raw.winnerScore, 'winnerScore');
  validateOptionalNumber(raw.loserScore, 'loserScore');
  const winnerScore = raw.winnerScore as number | undefined;
  const loserScore = raw.loserScore as number | undefined;

  if (raw.draw === true) return { result: { ...base, winner: 'tie', draw: true, isFfaMode: false }, message: 'Map recorded as a draw' };

  const winnerTeamId = raw.winnerTeamId as string | undefined;
  const loserTeamId = raw.loserTeamId as string | undefined;
  const winnerLabel = raw.winner as string | undefined;
  if (winnerTeamId !== undefined && typeof winnerTeamId !== 'string') throw new ResultError('winnerTeamId must be a string');
  if (!winnerLabel && !winnerTeamId) {
    throw new ResultError(isTyped ? 'winner or winnerTeamId is required for Normal mode' : 'Invalid winner. Must be "team1" or "team2"');
  }

  if (winnerTeamId) {
    const team = await loadTeam(ex, matchId, winnerTeamId, 'winnerTeamId');
    if (loserTeamId) await loadTeam(ex, matchId, loserTeamId, 'loserTeamId');
    const label = team.team_order === 0 ? 'team1' : team.team_order === 1 ? 'team2' : 'team'; // never default to 'team1'
    return { result: { ...base, winner: label, winnerTeamId, loserTeamId, winnerScore, loserScore, isFfaMode: false }, message: `${team.team_name} wins!` };
  }

  if (winnerLabel !== 'team1' && winnerLabel !== 'team2') throw new ResultError('Invalid winner. Must be "team1" or "team2"');
  const [teamCount] = await ex.select({ cnt: count() }).from(matchTeams).where(and(eq(matchTeams.match_id, matchId), eq(matchTeams.is_reserve, false)));
  let teamName: string | undefined;
  if ((teamCount?.cnt ?? 0) > 0) {
    const [row] = await ex.select({ team_name: matchTeams.team_name }).from(matchTeams)
      .where(and(eq(matchTeams.match_id, matchId), eq(matchTeams.team_order, winnerLabel === 'team1' ? 0 : 1), eq(matchTeams.is_reserve, false)));
    if (!row) throw new ResultError(`No team found for ${winnerLabel} in this match`);
    teamName = row.team_name;
  }
  return {
    result: { ...base, winner: winnerLabel, loserTeamId, winnerScore, loserScore, isFfaMode: false },
    message: `${teamName ?? (winnerLabel === 'team1' ? 'Blue Team' : 'Red Team')} wins!`,
  };
}

/**
 * Validate and save a game result. The status checks run under the match row lock together with the save, so a
 * concurrent transition (cancel, complete) can't slip between the check and the write.
 * Throws ResultError (400/404/409) or GameAlreadyScoredError.
 */
export async function submitGameResult(matchId: string, gameId: string, body: ResultBody): Promise<string> {
  const after = new AfterCommit();
  const message = await db.transaction(async (tx) => {
    const match = await lockMatch(tx, matchId);
    if (!match) throw new ResultError('Match not found', 404);
    const game = await getMatchGameInMatch(tx, matchId, gameId);
    if (!game) throw new ResultError('Game not found for this match', 404);

    const rescore = (body as { rescore?: unknown }).rescore === true;
    if (game.status === 'completed' && !rescore) throw new ResultError('This map is already scored; pass rescore: true to correct its result', 409);
    if (match.status === 'complete') {
      if (!rescore) throw new ResultError('Match is already complete; pass rescore: true to correct a result', 400);
      const blocker = await getTournamentRescoreBlocker(tx, matchId);
      if (blocker) throw new ResultError(blocker, 409);
    } else if (match.status !== 'battle') {
      throw new ResultError(`Cannot score a match in "${match.status}" status; it must be in battle`, 400);
    }

    const { result, message } = await buildResult(tx, matchId, gameId, body);
    await saveMatchResult(tx, gameId, result, after);
    return message;
  });
  await after.run(); // activity-feed writes, after the commit
  return message;
}

