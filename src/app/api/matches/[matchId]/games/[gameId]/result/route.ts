import type { NextRequest, NextResponse } from 'next/server';
import { saveMatchResult, getMatchResult, getGameResult, getTeamName } from '../../../../../../../lib/scoring-functions';
import type { MatchResult } from '@/shared/types';
import type { SaveResultBody } from '@/lib/types/scoring';
import { logger } from '@/lib/logger';
import { apiError, apiOk } from '@/lib/api-response';

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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ matchId: string; gameId: string }> }
): Promise<NextResponse> {
  try {
    const { matchId, gameId } = await params;
    const body = await request.json() as (SaveResultBody | MatchResult);

    // New type-tagged format
    if ('type' in body) {
      const typed = body as SaveResultBody;
      if (typed.matchId !== matchId) return apiError('Match ID mismatch', 400);
      if (typed.gameId !== gameId) return apiError('Game ID mismatch', 400);

      if (typed.type === 'Normal') {
        if (!typed.winner && !typed.winnerTeamId) {
          return apiError('winner or winnerTeamId is required for Normal mode', 400);
        }
        const winner = typed.winner ?? 'team1';
        const legacyResult: MatchResult = {
          matchId, gameId, winner,
          winnerTeamId: typed.winnerTeamId,
          loserTeamId: typed.loserTeamId,
          winnerScore: typed.winnerScore,
          loserScore: typed.loserScore,
          isFfaMode: false, completedAt: new Date()
        };
        await saveMatchResult(gameId, legacyResult);
        const teamName = typed.winnerTeamId ? await getTeamName(typed.winnerTeamId) : null;
        const label = teamName ?? (winner === 'team1' ? 'Blue Team' : 'Red Team');
        return apiOk({ success: true, message: `${label} wins!` });
      }

      if (typed.type === 'FFA') {
        if (!typed.winnerParticipantId) return apiError('winnerParticipantId is required for FFA mode', 400);
        const legacyResult: MatchResult = {
          matchId, gameId, winner: 'team1',
          participantWinnerId: typed.winnerParticipantId,
          isFfaMode: true, completedAt: new Date()
        };
        await saveMatchResult(gameId, legacyResult);
        return apiOk({ success: true, message: 'FFA result saved' });
      }

      if (typed.type === 'Position') {
        if (!typed.positionResults || Object.keys(typed.positionResults).length === 0) {
          return apiError('positionResults is required for Position mode', 400);
        }
        const legacyResult: MatchResult = {
          matchId, gameId, winner: 'team1',
          isFfaMode: false, isPositionMode: true,
          positionResults: typed.positionResults, completedAt: new Date()
        };
        await saveMatchResult(gameId, legacyResult);
        return apiOk({ success: true, message: 'Position result saved' });
      }

      return apiError('Unknown result type', 400);
    }

    // Legacy format (no type field)
    const result = body as MatchResult;
    if (!result.isFfaMode && !result.isPositionMode) {
      if (!result.winner || !['team1', 'team2'].includes(result.winner)) {
        return apiError('Invalid winner. Must be "team1" or "team2"', 400);
      }
    }
    if (result.gameId !== gameId) return apiError('Game ID mismatch', 400);
    if (result.matchId !== matchId) return apiError('Match ID mismatch', 400);

    await saveMatchResult(gameId, result);

    const winnerLabel = result.isFfaMode
      ? 'FFA result saved'
      : result.isPositionMode
        ? 'Position result saved'
        : `${result.winner === 'team1' ? 'Blue Team' : 'Red Team'} wins!`;

    return apiOk({ success: true, message: winnerLabel });
  } catch (error) {
    logger.error('Error saving match result:', error);
    return apiError(error instanceof Error ? error.message : 'Failed to save match result');
  }
}
