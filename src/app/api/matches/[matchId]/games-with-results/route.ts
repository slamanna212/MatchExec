import type {NextResponse,  NextRequest} from 'next/server';
import { getMatchGamesWithResults } from '../../../../../lib/scoring-functions';
import { logger } from '@/lib/logger';
import { apiError, apiOk } from '@/lib/api-response';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ matchId: string }> }
): Promise<NextResponse> {
  try {
    const { matchId } = await params;
    
    if (!matchId) {
      return apiError('Match ID is required', 400);
    }

    const games = await getMatchGamesWithResults(matchId);

    return apiOk({ games });
  } catch (error) {
    logger.error('Error fetching match games with results:', error);
    return apiError('Failed to fetch match games with results');
  }
}