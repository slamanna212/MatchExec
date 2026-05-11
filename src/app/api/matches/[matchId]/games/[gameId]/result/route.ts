import type { NextRequest, NextResponse } from 'next/server';
import { saveMatchResult, getMatchResult } from '../../../../../../../lib/scoring-functions';
import type { MatchResult } from '@/shared/types';
import { logger } from '@/lib/logger';
import { apiError, apiOk } from '@/lib/api-response';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ matchId: string; gameId: string }> }
): Promise<NextResponse> {
  try {
    const { gameId } = await params;
    const result = await getMatchResult(gameId);
    
    if (!result) {
      return apiError('No result found for this game', 404);
    }

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
    const result: MatchResult = await request.json();

    // Validate the result
    if (!result.winner || !['team1', 'team2'].includes(result.winner)) {
      return apiError('Invalid winner. Must be "team1" or "team2"', 400);
    }

    if (result.gameId !== gameId) {
      return apiError('Game ID mismatch', 400);
    }

    if (result.matchId !== matchId) {
      return apiError('Match ID mismatch', 400);
    }

    // Save the result
    await saveMatchResult(gameId, result);

    return apiOk({
      success: true,
      message: `${result.winner === 'team1' ? 'Blue Team' : 'Red Team'} wins!`
    });

  } catch (error) {
    logger.error('Error saving match result:', error);
    return apiError(error instanceof Error ? error.message : 'Failed to save match result');
  }
}