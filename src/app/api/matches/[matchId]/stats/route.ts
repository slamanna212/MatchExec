import type { NextRequest } from 'next/server';
import { getDbInstance } from '@/lib/database-init';
import { logger } from '@/lib/logger';
import type { MatchPlayerStats } from '@/shared/types';
import { apiError, apiOk } from '@/lib/api-response';
import { aggregateMatchStats } from '@/lib/stats-aggregation';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ matchId: string }> }
) {
  try {
    const { matchId } = await params;
    const db = await getDbInstance();

    const stats = await db.all<MatchPlayerStats>(
      'SELECT * FROM match_player_stats WHERE match_id = ? ORDER BY created_at',
      [matchId]
    );

    return apiOk(stats || []);
  } catch (error) {
    logger.error('Error fetching match stats:', error);
    return apiError('Failed to fetch match stats');
  }
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ matchId: string }> }
) {
  try {
    const { matchId } = await params;
    const db = await getDbInstance();
    const count = await aggregateMatchStats(db, matchId);
    if (count === 0) return apiOk({ message: 'No approved stats to aggregate' });
    return apiOk({ success: true, participantsAggregated: count });
  } catch (error) {
    logger.error('Error aggregating match stats:', error);
    return apiError('Failed to aggregate match stats');
  }
}
