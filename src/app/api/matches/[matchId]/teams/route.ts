import type { NextRequest, NextResponse } from 'next/server';
import { getDbInstance } from '@/lib/database-init';
import { getMatchTeams, createMatchTeams } from '@/lib/match-setup';
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

    let teams = await getMatchTeams(matchId);

    // Safety net: a match in assign/battle with no real teams (e.g. created by a
    // path that skipped the assign transition), or a Normal match missing its
    // Reserve row, gets its teams created lazily (createMatchTeams is idempotent).
    const hasActive = teams.some(t => !t.is_reserve);
    const hasReserve = teams.some(t => t.is_reserve);
    if (!hasActive || !hasReserve) {
      const db = await getDbInstance();
      const match = await db.get<{ status: string; scoring_type: string | null }>(
        `SELECT m.status, gm.scoring_type FROM matches m
         LEFT JOIN game_modes gm ON gm.id = m.mode_id AND gm.game_id = m.game_id
         WHERE m.id = ?`,
        [matchId]
      );
      if (match && (match.status === 'assign' || match.status === 'battle')) {
        const isNormal = (match.scoring_type ?? 'Normal') === 'Normal';
        if (!hasActive || isNormal) {
          await createMatchTeams(matchId);
          teams = await getMatchTeams(matchId);
        }
      }
    }

    return apiOk({ teams });
  } catch (error) {
    logger.error('Error fetching match teams:', error);
    return apiError('Failed to fetch match teams');
  }
}
