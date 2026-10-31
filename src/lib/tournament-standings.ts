import type { Database } from '../../lib/database/connection';

export interface CumulativeStandingRow {
  rank: number;
  /** A participant row id for this player (stable key is `player_key`). */
  participant_id: string;
  player_key: string;
  username: string;
  discord_user_id: string | null;
  user_id: string | null;
  total_points: number;
  matches_played: number;
  best_position: number | null;
  first_places: number;
}

/**
 * Cumulative-points standings, aggregated per player across every match of the
 * tournament. The stable key is COALESCE(discord_user_id, user_id, participant id)
 * because match_participants.id differs for the same player in each match.
 * Equal point totals share a rank (competition ranking: 1, 1, 3).
 */
export async function getCumulativeStandings(db: Database, tournamentId: string): Promise<CumulativeStandingRow[]> {
  const rows = await db.all<Omit<CumulativeStandingRow, 'rank'>>(`
    SELECT
      COALESCE(mp.discord_user_id, mp.user_id, mp.id) as player_key,
      MIN(mp.id) as participant_id,
      MAX(mp.username) as username,
      MAX(mp.discord_user_id) as discord_user_id,
      MAX(mp.user_id) as user_id,
      COALESCE(SUM(mgp.points_awarded), 0) as total_points,
      COUNT(DISTINCT mgp.match_game_id) as matches_played,
      MIN(mgp.position) as best_position,
      COALESCE(SUM(CASE WHEN mgp.position = 1 THEN 1 ELSE 0 END), 0) as first_places
    FROM match_participants mp
    JOIN matches m ON mp.match_id = m.id AND m.tournament_id = ?
    LEFT JOIN match_games mg ON mg.match_id = m.id AND mg.status = 'completed'
    LEFT JOIN match_game_placements mgp
      ON mgp.match_game_id = mg.id AND mgp.entity_id = mp.id AND mgp.entity_type = 'participant'
    GROUP BY COALESCE(mp.discord_user_id, mp.user_id, mp.id)
    ORDER BY total_points DESC, first_places DESC, best_position ASC, username ASC
  `, [tournamentId]);

  let lastPoints: number | null = null;
  let lastRank = 0;
  return rows.map((r, idx) => {
    const rank = lastPoints !== null && r.total_points === lastPoints ? lastRank : idx + 1;
    lastPoints = r.total_points;
    lastRank = rank;
    return { rank, ...r };
  });
}
