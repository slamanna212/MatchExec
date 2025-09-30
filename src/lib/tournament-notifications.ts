import { getDbInstance } from './database-init';

/**
 * Queue a Discord tournament winner notification using the existing match winner queue
 */
export async function queueTournamentWinnerNotification(
  tournamentId: string,
  winnerId: string
): Promise<boolean> {
  try {
    const db = await getDbInstance();

    // Get tournament and winner data
    const tournamentData = await db.get<{
      tournament_name: string;
      game_id: string;
      format: string;
    }>(`
      SELECT
        t.name as tournament_name,
        t.game_id,
        t.format
      FROM tournaments t
      WHERE t.id = ?
    `, [tournamentId]);

    if (!tournamentData) {
      console.error('Tournament not found for winner notification:', tournamentId);
      return false;
    }

    // Get winning team data
    const winningTeam = await db.get<{ team_name: string }>(`
      SELECT team_name
      FROM tournament_teams
      WHERE id = ?
    `, [winnerId]);

    if (!winningTeam) {
      console.error('Winning team not found:', winnerId);
      return false;
    }

    // Get winning team members
    const winningPlayers = await db.all<{ username: string; discord_user_id?: string | null }>(`
      SELECT username, discord_user_id
      FROM tournament_team_members
      WHERE team_id = ?
      ORDER BY username
    `, [winnerId]);

    // Get total participant count
    const participantCount = await db.get<{ total: number }>(`
      SELECT COUNT(DISTINCT ttm.user_id) as total
      FROM tournament_teams tt
      JOIN tournament_team_members ttm ON tt.id = ttm.team_id
      WHERE tt.tournament_id = ?
    `, [tournamentId]);

    // Generate unique ID for the queue entry
    const queueId = `tournament_winner_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Use the existing discord_match_winner_queue table but with tournament data
    // We'll use match_id to store the tournament ID and add special markers to identify it as a tournament
    await db.run(`
      INSERT INTO discord_match_winner_queue (
        id, match_id, match_name, game_id, winner, winning_team_name, winning_players,
        team1_score, team2_score, total_maps, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP)
    `, [
      queueId,
      tournamentId, // Store tournament ID in match_id field
      `🏆 ${tournamentData.tournament_name}`, // Add trophy emoji to identify as tournament
      tournamentData.game_id,
      'tournament', // Special marker to identify this as a tournament winner
      winningTeam.team_name,
      JSON.stringify(winningPlayers.map(p => p.discord_user_id ? `<@${p.discord_user_id}>` : p.username)),
      participantCount?.total || 0, // Use team1_score for total participants
      tournamentData.format === 'double-elimination' ? 1 : 0, // Use team2_score to store format info
      1 // total_maps = 1 to indicate tournament (vs multiple maps in match)
    ]);

    console.log('🏆 Tournament winner notification queued for tournament:', tournamentId);
    return true;
  } catch (error) {
    console.error('❌ Error queuing tournament winner notification:', error);
    return false;
  }
}