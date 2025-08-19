import { NextRequest, NextResponse } from 'next/server';
import { MatchScore } from '@/shared/types';
import { saveMatchScore } from '../../../../../../../lib/scoring-functions';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ matchId: string; gameId: string }> }
) {
  try {
    const { gameId } = await params;
    const scoreData: MatchScore = await request.json();

    // Validate the score data
    if (!scoreData.matchId || !scoreData.gameId || !scoreData.winner || !scoreData.scoringType) {
      return NextResponse.json(
        { error: 'Invalid score data: missing required fields' },
        { status: 400 }
      );
    }

    // Save the match score
    await saveMatchScore(gameId, scoreData);

    return NextResponse.json({ 
      success: true,
      message: 'Match score saved successfully'
    });

  } catch (error) {
    console.error('Error saving match score:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save match score' },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ matchId: string; gameId: string }> }
) {
  try {
    const { getMatchScore } = await import('../../../../../../../lib/scoring-functions');
    const { gameId } = await params;

    const score = await getMatchScore(gameId);

    if (!score) {
      return NextResponse.json(
        { error: 'No score found for this game' },
        { status: 404 }
      );
    }

    return NextResponse.json(score);

  } catch (error) {
    console.error('Error getting match score:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get match score' },
      { status: 500 }
    );
  }
}