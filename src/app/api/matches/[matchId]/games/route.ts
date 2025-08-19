import { NextRequest, NextResponse } from 'next/server';
import { getMatchGames } from '../../../../../lib/scoring-functions';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ matchId: string }> }
) {
  try {
    const { matchId } = await params;
    
    const matchGames = await getMatchGames(matchId);
    
    return NextResponse.json({
      success: true,
      games: matchGames
    });

  } catch (error) {
    console.error('Error getting match games:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get match games' },
      { status: 500 }
    );
  }
}