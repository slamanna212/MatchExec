import type {NextResponse,  NextRequest} from 'next/server';
import { getDbInstance } from '../../../../../lib/database-init';
import { logger } from '@/lib/logger';
import { apiError, apiOk } from '@/lib/api-response';

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
      return apiOk({ standings: await getCumulativeStandings(tournamentId) });
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

async function getCumulativeStandings(tournamentId: string) {
  const db = await getDbInstance();

  // Sum points_awarded from match_game_placements for all matches in this tournament
  const rows = await db.all<{
    participant_id: string;
    username: string;
    total_points: number;
    matches_played: number;
    best_position: number | null;
  }>(`
    SELECT
      mp.id as participant_id,
      mp.username,
      COALESCE(SUM(mgp.points_awarded), 0) as total_points,
      COUNT(DISTINCT mg.id) as matches_played,
      MIN(mgp.position) as best_position
    FROM match_participants mp
    JOIN matches m ON mp.match_id = m.id AND m.tournament_id = ?
    LEFT JOIN match_games mg ON mg.match_id = m.id AND mg.status = 'completed'
    LEFT JOIN match_game_placements mgp ON mgp.match_game_id = mg.id AND mgp.entity_id = mp.id AND mgp.entity_type = 'participant'
    GROUP BY mp.id, mp.username
    ORDER BY total_points DESC, best_position ASC, mp.username ASC
  `, [tournamentId]);

  return rows.map((r, idx) => ({
    rank: idx + 1,
    participant_id: r.participant_id,
    username: r.username,
    total_points: r.total_points,
    matches_played: r.matches_played,
    best_position: r.best_position,
  }));
}
