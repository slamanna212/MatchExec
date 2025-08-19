import { NextRequest, NextResponse } from 'next/server';
import { MatchScore } from '@/shared/types';
import { saveMatchScore } from '../../../../../../../lib/scoring-functions';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ matchId: string; gameId: string }> }
) {
  try {
    console.log('POST /api/matches/[matchId]/games/[gameId]/score - Starting');
    
    const { gameId } = await params;
    console.log('POST - Extracted gameId:', gameId);
    
    const scoreData: MatchScore = await request.json();
    console.log('POST - Received score data:', JSON.stringify(scoreData, null, 2));

    // Validate the score data
    if (!scoreData.matchId || !scoreData.gameId || !scoreData.winner || !scoreData.scoringType) {
      console.log('POST - Validation failed, missing required fields');
      return NextResponse.json(
        { error: 'Invalid score data: missing required fields' },
        { status: 400 }
      );
    }

    console.log('POST - Validation passed, calling saveMatchScore');
    
    // Check if this is a final save or progress save
    const { searchParams } = new URL(request.url);
    const isFinal = searchParams.get('final') === 'true';
    console.log('POST - isFinal parameter:', isFinal);
    
    // Save the match score
    await saveMatchScore(gameId, scoreData, isFinal);
    console.log('POST - saveMatchScore completed successfully');

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