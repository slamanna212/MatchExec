import { NextRequest, NextResponse } from 'next/server';
import { getOverallMatchScore } from '../../../../../lib/scoring-functions';

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

    const score = await getOverallMatchScore(matchId);
    
    return NextResponse.json(score);
  } catch (error) {
    console.error('Error fetching overall match score:', error);
    return NextResponse.json(
      { error: 'Failed to fetch overall match score' },
      { status: 500 }
    );
  }
}