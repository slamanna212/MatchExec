import type { NextRequest, NextResponse } from 'next/server';
import { saveMatchResult, getMatchResult, getGameResult, getScoringTypeForGame } from '../../../../../../../lib/scoring-functions';
import { getDbInstance } from '../../../../../../../lib/database-init';
import type { MatchResult } from '@/shared/types';
import type { SaveResultBody } from '@/lib/types/scoring';
import { logger } from '@/lib/logger';
import { apiError, apiOk } from '@/lib/api-response';

type Db = Awaited<ReturnType<typeof getDbInstance>>;
type ResultBody = (SaveResultBody | MatchResult) & { rescore?: boolean; draw?: boolean };

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ matchId: string; gameId: string }> }
): Promise<NextResponse> {
  try {
    const { gameId } = await params;

    // Return typed GameResult if placements exist, else fall back to legacy MatchResult
    const typed = await getGameResult(gameId);
    if (typed) return apiOk(typed);

    const result = await getMatchResult(gameId);
    if (!result) return apiError('No result found for this game', 404);
    return apiOk(result);
  } catch (error) {
    logger.error('Error getting match result:', error);
    return apiError(error instanceof Error ? error.message : 'Failed to get match result');
  }
}

/** Thrown by validators; carries the HTTP status to return. */
class ValidationError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

async function loadTeam(db: Db, matchId: string, teamId: string, field: string) {
  const team = await db.get<{ id: string; team_name: string; team_order: number; is_reserve: number }>(
    `SELECT id, team_name, team_order, is_reserve FROM match_teams WHERE id = ? AND match_id = ?`,
    [teamId, matchId]
  );
  if (!team) throw new ValidationError(`${field} is not a team of this match`);
  if (team.is_reserve) throw new ValidationError(`${field} refers to the reserve team`);
  return team;
}

async function assertParticipantsInMatch(db: Db, matchId: string, ids: string[], field: string): Promise<void> {
  if (ids.length === 0) return;
  const rows = await db.all<{ id: string }>(
    `SELECT id FROM match_participants WHERE match_id = ? AND id IN (${ids.map(() => '?').join(',')})`,
    [matchId, ...ids]
  );
  const found = new Set(rows.map(r => r.id));
  const missing = ids.filter(id => !found.has(id));
  if (missing.length > 0) {
    throw new ValidationError(`${field} contains participants that are not part of this match`);
  }
}

function validateOptionalNumber(value: unknown, field: string): void {
  if (value !== undefined && value !== null && (typeof value !== 'number' || !Number.isFinite(value))) {
    throw new ValidationError(`${field} must be a number`);
  }
}

/**
 * Validate a result body against the DB and normalise it to a MatchResult.
 * Returns the result plus a human-readable success message.
 */
async function buildResult(
  db: Db,
  matchId: string,
  gameId: string,
  body: ResultBody
): Promise<{ result: MatchResult; message: string }> {
  const isTyped = 'type' in body && typeof body.type === 'string';
  const raw = body as unknown as Record<string, unknown>;

  let kind: 'Normal' | 'FFA' | 'Position';
  if (isTyped) {
    const t = raw.type;
    if (t !== 'Normal' && t !== 'FFA' && t !== 'Position') throw new ValidationError('Unknown result type');
    kind = t;
  } else if (raw.isPositionMode) {
    kind = 'Position';
  } else if (raw.isFfaMode) {
    kind = 'FFA';
  } else {
    kind = 'Normal';
  }

  if (raw.matchId !== undefined && raw.matchId !== matchId) throw new ValidationError('Match ID mismatch');
  if (raw.gameId !== undefined && raw.gameId !== gameId) throw new ValidationError('Game ID mismatch');
  if (isTyped && (raw.matchId === undefined || raw.gameId === undefined)) {
    throw new ValidationError(raw.matchId === undefined ? 'Match ID mismatch' : 'Game ID mismatch');
  }

  const declared = await getScoringTypeForGame(db, gameId);
  if (declared && declared !== kind) {
    throw new ValidationError(`This game uses ${declared} scoring; a ${kind} result was submitted`);
  }

  const base = { matchId, gameId, completedAt: new Date(), rescore: raw.rescore === true };

  if (kind === 'FFA') {
    const participantId = (isTyped ? raw.winnerParticipantId : raw.participantWinnerId) as string | undefined;
    if (!participantId || typeof participantId !== 'string') {
      throw new ValidationError('winnerParticipantId is required for FFA mode');
    }
    await assertParticipantsInMatch(db, matchId, [participantId], 'winnerParticipantId');
    return {
      result: { ...base, winner: 'team1', participantWinnerId: participantId, isFfaMode: true },
      message: 'FFA result saved'
    };
  }

  if (kind === 'Position') {
    const positionResults = raw.positionResults as Record<string, unknown> | undefined;
    if (!positionResults || typeof positionResults !== 'object' || Object.keys(positionResults).length === 0) {
      throw new ValidationError('positionResults is required for Position mode');
    }
    const ids = Object.keys(positionResults);
    const positions = Object.values(positionResults);
    if (!positions.every(p => typeof p === 'number' && Number.isInteger(p) && p > 0)) {
      throw new ValidationError('positionResults values must be positive integers');
    }
    if (new Set(positions).size !== positions.length) {
      throw new ValidationError('positionResults positions must be unique');
    }
    await assertParticipantsInMatch(db, matchId, ids, 'positionResults');
    return {
      result: {
        ...base, winner: 'team1', isFfaMode: false, isPositionMode: true,
        positionResults: positionResults as Record<string, number>
      },
      message: 'Position result saved'
    };
  }

  // Normal
  validateOptionalNumber(raw.winnerScore, 'winnerScore');
  validateOptionalNumber(raw.loserScore, 'loserScore');
  const winnerScore = raw.winnerScore as number | undefined;
  const loserScore = raw.loserScore as number | undefined;

  if (raw.draw === true) {
    return {
      result: { ...base, winner: 'tie', draw: true, isFfaMode: false },
      message: 'Map recorded as a draw'
    };
  }

  const winnerTeamId = raw.winnerTeamId as string | undefined;
  const loserTeamId = raw.loserTeamId as string | undefined;
  const winnerLabel = raw.winner as string | undefined;

  if (winnerTeamId !== undefined && typeof winnerTeamId !== 'string') {
    throw new ValidationError('winnerTeamId must be a string');
  }
  if (!winnerLabel && !winnerTeamId) {
    throw new ValidationError(isTyped
      ? 'winner or winnerTeamId is required for Normal mode'
      : 'Invalid winner. Must be "team1" or "team2"');
  }

  if (winnerTeamId) {
    const team = await loadTeam(db, matchId, winnerTeamId, 'winnerTeamId');
    if (loserTeamId) await loadTeam(db, matchId, loserTeamId, 'loserTeamId');
    // Derive the legacy label from team_order; never default to 'team1'.
    const label = team.team_order === 0 ? 'team1' : team.team_order === 1 ? 'team2' : 'team';
    return {
      result: { ...base, winner: label, winnerTeamId, loserTeamId, winnerScore, loserScore, isFfaMode: false },
      message: `${team.team_name} wins!`
    };
  }

  if (winnerLabel !== 'team1' && winnerLabel !== 'team2') {
    throw new ValidationError('Invalid winner. Must be "team1" or "team2"');
  }
  const teamCount = await db.get<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM match_teams WHERE match_id = ? AND is_reserve = 0`, [matchId]
  );
  let teamName: string | undefined;
  if ((teamCount?.cnt ?? 0) > 0) {
    const row = await db.get<{ team_name: string }>(
      `SELECT team_name FROM match_teams WHERE match_id = ? AND team_order = ? AND is_reserve = 0`,
      [matchId, winnerLabel === 'team1' ? 0 : 1]
    );
    if (!row) throw new ValidationError(`No team found for ${winnerLabel} in this match`);
    teamName = row.team_name;
  }
  return {
    result: { ...base, winner: winnerLabel, loserTeamId, winnerScore, loserScore, isFfaMode: false },
    message: `${teamName ?? (winnerLabel === 'team1' ? 'Blue Team' : 'Red Team')} wins!`
  };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ matchId: string; gameId: string }> }
): Promise<NextResponse> {
  try {
    const { matchId, gameId } = await params;

    let body: ResultBody;
    try {
      body = await request.json() as ResultBody;
    } catch {
      return apiError('Invalid JSON body', 400);
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return apiError('Request body must be a JSON object', 400);
    }

    // Cheap body-vs-route ID checks first (before any DB access).
    const rawBody = body as unknown as Record<string, unknown>;
    if (rawBody.matchId !== undefined && rawBody.matchId !== matchId) return apiError('Match ID mismatch', 400);
    if (rawBody.gameId !== undefined && rawBody.gameId !== gameId) return apiError('Game ID mismatch', 400);

    const db = await getDbInstance();

    const match = await db.get<{ status: string }>('SELECT status FROM matches WHERE id = ?', [matchId]);
    if (!match) return apiError('Match not found', 404);

    const game = await db.get<{ id: string; status: string }>(
      'SELECT id, status FROM match_games WHERE id = ? AND match_id = ?', [gameId, matchId]
    );
    if (!game) return apiError('Game not found for this match', 404);

    const rescore = (body as { rescore?: unknown }).rescore === true;
    if (game.status === 'completed' && !rescore) {
      return apiError('This map is already scored; pass rescore: true to correct its result', 409);
    }
    if (match.status === 'complete') {
      if (!rescore) {
        return apiError('Match is already complete; pass rescore: true to correct a result', 400);
      }
    } else if (match.status !== 'battle') {
      return apiError(`Cannot score a match in "${match.status}" status; it must be in battle`, 400);
    }

    const { result, message } = await buildResult(db, matchId, gameId, body);
    await saveMatchResult(gameId, result);
    return apiOk({ success: true, message });
  } catch (error) {
    if (error instanceof ValidationError) return apiError(error.message, error.status);
    logger.error('Error saving match result:', error);
    return apiError(error instanceof Error ? error.message : 'Failed to save match result');
  }
}
