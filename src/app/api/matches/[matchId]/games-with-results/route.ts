import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { getMatchGamesWithResults } from '../../../../../lib/scoring-functions';
import { logger } from '@/lib/logger';

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
    logger.error('Error fetching match games with results:', error);
    return NextResponse.json(
      { error: 'Failed to fetch match games with results' },
      { status: 500 }
    );
  }
}