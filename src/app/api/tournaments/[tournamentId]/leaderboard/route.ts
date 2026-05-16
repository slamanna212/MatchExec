import type { NextRequest, NextResponse } from 'next/server';
import { getDbInstance } from '../../../../../lib/database-init';
import { logger } from '@/lib/logger';
import { apiError, apiOk } from '@/lib/api-response';

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

    // Per-participant totals
    const totals = await db.all<{
      participant_id: string;
      username: string;
      total_points: number;
      matches_played: number;
    }>(`
      SELECT
        mp.id as participant_id,
        mp.username,
        COALESCE(SUM(mgp.points_awarded), 0) as total_points,
        COUNT(DISTINCT mg.match_id) as matches_played
      FROM match_participants mp
      JOIN matches m ON mp.match_id = m.id AND m.tournament_id = ?
      LEFT JOIN match_game_placements mgp
        ON mgp.entity_id = mp.id AND mgp.entity_type = 'participant'
      LEFT JOIN match_games mg ON mg.id = mgp.match_game_id AND mg.match_id = m.id
      GROUP BY mp.id, mp.username
      ORDER BY total_points DESC, mp.username ASC
    `, [tournamentId]);

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
      LEFT JOIN match_games mg ON mg.match_id = m.id AND mg.status = 'complete'
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
      leaderboard: totals.map((r, idx) => ({ rank: idx + 1, ...r })),
      match_breakdown: matchBreakdown,
    });
  } catch (error) {
    logger.error('Error fetching tournament leaderboard:', error);
    return apiError('Failed to fetch tournament leaderboard');
  }
}
