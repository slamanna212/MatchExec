import { NextResponse } from 'next/server';
import { getDbInstance } from '../../../lib/database-init';
import { logger } from '@/lib/logger';

export async function GET() {
  try {
    const db = await getDbInstance();

    // Get total matches (including tournament matches)
    const matchCountResult = await db.get<{ count: number }>('SELECT COUNT(*) as count FROM matches');
    const totalMatches = matchCountResult?.count || 0;

    // Get total tournaments
    const tournamentCountResult = await db.get<{ count: number }>('SELECT COUNT(*) as count FROM tournaments');
    const totalTournaments = tournamentCountResult?.count || 0;

    // Get total signups (match participants + tournament participants)
    const matchParticipantsResult = await db.get<{ count: number }>('SELECT COUNT(*) as count FROM match_participants');
    const tournamentParticipantsResult = await db.get<{ count: number }>('SELECT COUNT(*) as count FROM tournament_participants');
    const totalSignups = (matchParticipantsResult?.count || 0) + (tournamentParticipantsResult?.count || 0);

    return NextResponse.json({
      totalMatches,
      totalTournaments,
      totalSignups
    });
  } catch (error) {
    logger.error('Error fetching stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch stats' },
      { status: 500 }
    );
  }
}