import type { NextRequest, NextResponse } from 'next/server';
import { getMatchTeams } from '@/lib/match-setup';
import { logger } from '@/lib/logger';
import { apiError, apiOk } from '@/lib/api-response';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ matchId: string }> }
): Promise<NextResponse> {
  try {
    const { matchId } = await params;
    if (!matchId || typeof matchId !== 'string' || matchId.length > 100) {
      return apiError('Invalid ID', 400);
    }

    const teams = await getMatchTeams(matchId);
    return apiOk({ teams });
  } catch (error) {
    logger.error('Error fetching match teams:', error);
    return apiError('Failed to fetch match teams');
  }
}
