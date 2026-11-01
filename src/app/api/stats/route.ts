import type { NextResponse } from 'next/server';
import { getDbInstance } from '../../../lib/database-init';
import { logger } from '@/lib/logger';
import { apiError, apiOk } from '@/lib/api-response';
import { db as pgDb } from '../../../../lib/db';
import { getTournamentCounts } from '@/lib/tournaments';

export async function GET(): Promise<NextResponse> {
  try {
    const db = await getDbInstance();

    // TODO(stats): the match counts still read the legacy SQLite database until the stats / feed domain is ported (item 8).
    const row = await db.get<{
      totalMatches: number;
      matchParticipants: number;
    }>(`
      SELECT
        (SELECT COUNT(*) FROM matches) as totalMatches,
        (SELECT COUNT(*) FROM match_participants) as matchParticipants
    `);
    const tournaments = await getTournamentCounts(pgDb);

    return apiOk({
      totalMatches: row?.totalMatches || 0,
      totalTournaments: tournaments.tournaments,
      totalSignups: (row?.matchParticipants || 0) + tournaments.participants,
    });
  } catch (error) {
    logger.error('Error fetching stats:', error);
    return apiError('Failed to fetch stats');
  }
}
