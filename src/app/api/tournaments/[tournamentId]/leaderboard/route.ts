import type { NextRequest, NextResponse } from 'next/server';
import { getDbInstance } from '../../../../../lib/database-init';
import { logger } from '@/lib/logger';
import { apiError, apiOk } from '@/lib/api-response';
import { getCumulativeStandings } from '@/lib/tournament-standings';

/**
 * GET /api/tournaments/[tournamentId]/leaderboard
 * Returns per-match breakdown and cumulative standings for cumulative-points tournaments.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ tournamentId: string }> }
): Promise<NextResponse> {
  try {
    const { tournamentId } = await params;
    const db = await getDbInstance();

    const tournament = await db.get<{ format: string; name: string }>(
      'SELECT format, name FROM tournaments WHERE id = ?',
      [tournamentId]
    );
    if (!tournament) return apiError('Tournament not found', 404);
    if (tournament.format !== 'cumulative-points') {
      return apiError('Leaderboard is only available for cumulative-points tournaments', 400);
    }

    // Per-player totals, aggregated across matches by a stable player key (tie-aware ranks)
    const totals = (await getCumulativeStandings(db, tournamentId)).map(r => ({
      rank: r.rank,
      participant_id: r.participant_id,
      player_key: r.player_key,
      username: r.username,
      total_points: r.total_points,
      matches_played: r.matches_played,
    }));

    // Per-match breakdown
    const matchBreakdown = await db.all<{
      match_id: string;
      match_name: string;
      match_game_id: string;
      round: number;
      participant_id: string;
      username: string;
      position: number | null;
      points_awarded: number | null;
    }>(`
      SELECT
        m.id as match_id,
        m.name as match_name,
        mg.id as match_game_id,
        mg.round,
        mp.id as participant_id,
        mp.username,
        mgp.position,
        mgp.points_awarded
      FROM matches m
      JOIN match_participants mp ON mp.match_id = m.id
      LEFT JOIN match_games mg ON mg.match_id = m.id AND mg.status = 'completed'
      LEFT JOIN match_game_placements mgp
        ON mgp.match_game_id = mg.id
        AND mgp.entity_id = mp.id
        AND mgp.entity_type = 'participant'
      WHERE m.tournament_id = ?
      ORDER BY m.created_at ASC, mg.round ASC, mgp.position ASC, mp.username ASC
    `, [tournamentId]);

    return apiOk({
      tournament_id: tournamentId,
      tournament_name: tournament.name,
      leaderboard: totals,
      match_breakdown: matchBreakdown,
    });
  } catch (error) {
    logger.error('Error fetching tournament leaderboard:', error);
    return apiError('Failed to fetch tournament leaderboard');
  }
}
