import { NextRequest, NextResponse } from 'next/server';
import { getMatchGamesWithResults } from '../../../../../lib/scoring-functions';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ matchId: string }> }
) {
  try {
    const { matchId } = await params;
    
    if (!matchId) {
      return NextResponse.json(
        { error: 'Match ID is required' },
        { status: 400 }
      );
    }

    const games = await getMatchGamesWithResults(matchId);
    
    return NextResponse.json({ games });
  } catch (error) {
    console.error('Error fetching match games with results:', error);
    return NextResponse.json(
      { error: 'Failed to fetch match games with results' },
      { status: 500 }
    );
  }
}