import { NextResponse } from 'next/server';
import { getDbInstance } from '../../../lib/database-init';
import { logger } from '@/lib/logger';

export async function GET() {
  try {
    const db = await getDbInstance();

    const row = await db.get<{
      totalMatches: number;
      totalTournaments: number;
      matchParticipants: number;
      tournamentParticipants: number;
    }>(`
      SELECT
        (SELECT COUNT(*) FROM matches) as totalMatches,
        (SELECT COUNT(*) FROM tournaments) as totalTournaments,
        (SELECT COUNT(*) FROM match_participants) as matchParticipants,
        (SELECT COUNT(*) FROM tournament_participants) as tournamentParticipants
    `);

    return NextResponse.json({
      totalMatches: row?.totalMatches || 0,
      totalTournaments: row?.totalTournaments || 0,
      totalSignups: (row?.matchParticipants || 0) + (row?.tournamentParticipants || 0),
    });
  } catch (error) {
    logger.error('Error fetching stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch stats' },
      { status: 500 }
    );
  }
}
