import type {NextResponse,  NextRequest} from 'next/server';
import { getOverallMatchScore } from '../../../../../lib/scoring-functions';
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

    const score = await getOverallMatchScore(matchId);

    return apiOk(score);
  } catch (error) {
    logger.error('Error fetching overall match score:', error);
    return apiError('Failed to fetch overall match score');
  }
}