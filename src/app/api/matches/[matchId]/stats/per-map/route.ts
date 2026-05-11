import type {NextResponse,  NextRequest } from 'next/server';
import { getDbInstance } from '@/lib/database-init';
import { logger } from '@/lib/logger';
import { apiError, apiOk } from '@/lib/api-response';

export interface PerMapStatRow {
  match_game_id: string;
  participant_id: string;
  stats_json: string;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ matchId: string }> }
): Promise<NextResponse> {
  try {
    const { matchId } = await params;
    const db = await getDbInstance();

    const rows = await db.all<PerMapStatRow>(
      `SELECT sps.match_game_id, sps.participant_id, sps.stats_json
       FROM scorecard_player_stats sps
       JOIN scorecard_submissions ss ON ss.id = sps.submission_id
       WHERE sps.match_id = ?
         AND ss.review_status IN ('approved', 'auto_approved')
         AND sps.participant_id IS NOT NULL`,
      [matchId]
    );

    return apiOk(rows ?? []);
  } catch (error) {
    logger.error('Error fetching per-map stats:', error);
    return apiError('Failed to fetch per-map stats');
  }
}
