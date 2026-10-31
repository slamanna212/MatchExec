import type {NextResponse,  NextRequest} from 'next/server';
import { getDbInstance } from '../../../../../lib/database-init';
import { logger } from '@/lib/logger';
import { apiError, apiOk } from '@/lib/api-response';
import { getCumulativeStandings } from '@/lib/tournament-standings';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tournamentId: string }> }
): Promise<NextResponse> {
  try {
    const { tournamentId } = await params;
    const db = await getDbInstance();

    const tournament = await db.get<{ format: string }>(
      'SELECT format FROM tournaments WHERE id = ?',
      [tournamentId]
    );
    if (!tournament) return apiError('Tournament not found', 404);

    if (tournament.format === 'cumulative-points') {
      return apiOk({ standings: await getCumulativeStandings(db, tournamentId) });
    }

    // Bracket (single/double-elimination) standings
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

    return apiOk({ standings });
  } catch (error) {
    logger.error('Error fetching tournament standings:', error);
    return apiError('Failed to fetch tournament standings');
  }
}
