import { NextRequest, NextResponse } from 'next/server';
import { saveMatchResult, getMatchResult } from '../../../../../../../lib/scoring-functions';
import { MatchResult } from '@/shared/types';
import { logger } from '@/lib/logger';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ matchId: string; gameId: string }> }
) {
  try {
    const { gameId } = await params;
    const result = await getMatchResult(gameId);
    
    if (!result) {
      return NextResponse.json(
        { error: 'No result found for this game' },
        { status: 404 }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    logger.error('Error getting match result:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get match result' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ matchId: string; gameId: string }> }
) {
  try {
    const { matchId, gameId } = await params;
    const result: MatchResult = await request.json();

    // Validate the result
    if (!result.winner || !['team1', 'team2'].includes(result.winner)) {
      return NextResponse.json(
        { error: 'Invalid winner. Must be "team1" or "team2"' },
        { status: 400 }
      );
    }

    if (result.gameId !== gameId) {
      return NextResponse.json(
        { error: 'Game ID mismatch' },
        { status: 400 }
      );
    }

    if (result.matchId !== matchId) {
      return NextResponse.json(
        { error: 'Match ID mismatch' },
        { status: 400 }
      );
    }

    // Save the result
    await saveMatchResult(gameId, result);

    return NextResponse.json({
      success: true,
      message: `${result.winner === 'team1' ? 'Blue Team' : 'Red Team'} wins!`
    });

  } catch (error) {
    logger.error('Error saving match result:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save match result' },
      { status: 500 }
    );
  }
}