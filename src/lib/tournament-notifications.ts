import { getDbInstance } from './database-init';
import { logger } from '@/lib/logger';
import { db as pgDb } from '../../lib/db';
import { enqueueMatchWinner } from './discord-queues';

/**
 * Queue a Discord tournament winner notification using the existing match winner queue
 */
export async function queueTournamentWinnerNotification(
  tournamentId: string,
  winnerId: string,
  // Cumulative-points tournaments may end in a tie (no single winning team): the
  // caller supplies the display name and player mentions instead of a team id.
  override?: { winningTeamName: string; winningPlayers: string[] }
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
      logger.error('Tournament not found for winner notification:', tournamentId);
      return false;
    }

    let winningTeamName: string;
    let winningPlayerLabels: string[];

    if (override) {
      winningTeamName = override.winningTeamName;
      winningPlayerLabels = override.winningPlayers;
    } else {
      // Get winning team data
      const winningTeam = await db.get<{ team_name: string }>(`
        SELECT team_name
        FROM tournament_teams
        WHERE id = ?
      `, [winnerId]);

      if (!winningTeam) {
        logger.error('Winning team not found:', winnerId);
        return false;
      }

      // Get winning team members
      const winningPlayers = await db.all<{ username: string; discord_user_id?: string | null }>(`
        SELECT username, discord_user_id
        FROM tournament_team_members
        WHERE team_id = ?
        ORDER BY username
      `, [winnerId]);

      winningTeamName = winningTeam.team_name;
      winningPlayerLabels = winningPlayers.map(p => p.discord_user_id ? `<@${p.discord_user_id}>` : p.username);
    }

    // Get total participant count
    const participantCount = await db.get<{ total: number }>(`
      SELECT COUNT(DISTINCT ttm.user_id) as total
      FROM tournament_teams tt
      JOIN tournament_team_members ttm ON tt.id = ttm.team_id
      WHERE tt.tournament_id = ?
    `, [tournamentId]);

    // Reuses the match winner queue with tournament data: the tournament id goes in match_id and the special
    // `winner = 'tournament'` marker identifies it. team1_score = total participants, team2_score = 1 for double
    // elimination, total_maps = 1. (TODO(tournaments): runs on the Postgres pool, not the SQLite tournament tx, until ported)
    await enqueueMatchWinner(pgDb, {
      matchId: tournamentId,
      matchName: `🏆 ${tournamentData.tournament_name}`,
      gameId: tournamentData.game_id,
      winner: 'tournament',
      winningTeamName,
      winningPlayers: winningPlayerLabels,
      team1Score: participantCount?.total || 0,
      team2Score: tournamentData.format === 'double-elimination' ? 1 : 0,
      totalMaps: 1,
    });

    logger.debug('🏆 Tournament winner notification queued for tournament:', tournamentId);
    return true;
  } catch (error) {
    logger.error('❌ Error queuing tournament winner notification:', error);
    return false;
  }
}