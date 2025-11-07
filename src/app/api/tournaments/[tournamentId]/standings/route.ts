import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { getDbInstance } from '../../../../../lib/database-init';
import { logger } from '@/lib/logger';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tournamentId: string }> }
) {
  try {
    const { tournamentId } = await params;
    const db = await getDbInstance();

    // Get all teams with their match statistics
    const standings = await db.all<{
      team_id: string;
      team_name: string;
      matches_played: number;
      wins: number;
      losses: number;
    }>(`
      SELECT
        tt.id as team_id,
        tt.team_name,
        COUNT(CASE WHEN m.id IS NOT NULL THEN 1 END) as matches_played,
        SUM(CASE WHEN m.winner_team = tt.id THEN 1 ELSE 0 END) as wins,
        SUM(CASE WHEN m.winner_team IS NOT NULL AND m.winner_team != tt.id THEN 1 ELSE 0 END) as losses
      FROM tournament_teams tt
      LEFT JOIN matches m ON (
        m.tournament_id = tt.tournament_id
        AND (m.red_team_id = tt.id OR m.blue_team_id = tt.id)
        AND m.status = 'complete'
      )
      WHERE tt.tournament_id = ?
      GROUP BY tt.id, tt.team_name
      ORDER BY wins DESC, losses ASC, tt.team_name ASC
    `, [tournamentId]);

    return NextResponse.json({ standings });
  } catch (error) {
    logger.error('Error fetching tournament standings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tournament standings' },
      { status: 500 }
    );
  }
}