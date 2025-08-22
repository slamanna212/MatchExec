import { getDbInstance } from './database-init';
import { 
  MatchResult, 
  MatchFormat
} from '@/shared/types';

/**
 * Get match format from database
 */
export async function getMatchFormat(matchId: string): Promise<MatchFormat> {
  const db = await getDbInstance();
  
  try {
    const query = `
      SELECT match_format FROM matches WHERE id = ?
    `;

    const row = await db.get<{ match_format?: string }>(query, [matchId]);
    return (row?.match_format as MatchFormat) || 'casual';
  } catch (error) {
    console.error('Error in getMatchFormat:', error);
    throw error;
  }
}

/**
 * Create match_games entries for all maps in a match
 */
export async function initializeMatchGames(matchId: string): Promise<void> {
  console.log('initializeMatchGames - Starting with matchId:', matchId);
  
  const db = await getDbInstance();
  
  try {
    // Get match data including maps
    const matchQuery = `SELECT maps FROM matches WHERE id = ?`;
    const matchRow = await db.get<{ maps?: string }>(matchQuery, [matchId]);
    
    if (!matchRow || !matchRow.maps) {
      console.log('initializeMatchGames - No maps found for match');
      return;
    }
    
    const maps = JSON.parse(matchRow.maps);
    console.log(`initializeMatchGames - Found ${maps.length} maps:`, maps);
    
    // Create a match_games entry for each map
    for (let i = 0; i < maps.length; i++) {
      const mapId = maps[i];
      const gameId = `${matchId}_game_${i + 1}`;
      
      // Check if this game already exists
      const existsQuery = `SELECT id FROM match_games WHERE id = ?`;
      const existingGame = await db.get(existsQuery, [gameId]);
      
      if (!existingGame) {
        // First map should be 'ongoing', rest should be 'pending'
        const status = i === 0 ? 'ongoing' : 'pending';
        
        const insertQuery = `
          INSERT INTO match_games (
            id, match_id, round, participant1_id, participant2_id,
            map_id, status, created_at, updated_at
          ) VALUES (?, ?, ?, 'team1', 'team2', ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `;
        
        await db.run(insertQuery, [gameId, matchId, i + 1, mapId, status]);
        console.log(`Created match game ${gameId} for map ${mapId} with status ${status}`);
      } else {
        console.log(`Match game ${gameId} already exists`);
      }
    }
    
    console.log('initializeMatchGames - Completed successfully');
  } catch (error) {
    console.error('Error in initializeMatchGames:', error);
    throw error;
  }
}

/**
 * Get all match games for a match with their current status
 */
export async function getMatchGames(matchId: string): Promise<Array<Record<string, unknown>>> {
  console.log(`getMatchGames: Starting for matchId: ${matchId}`);
  
  try {
    const db = await getDbInstance();
    console.log('getMatchGames: Database instance obtained');
    
    const query = `
      SELECT mg.*, gm.name as map_name, gm.mode_id, gm.game_id
      FROM match_games mg
      LEFT JOIN game_maps gm ON mg.map_id = gm.id
      WHERE mg.match_id = ?
      ORDER BY mg.round ASC
    `;
    
    console.log('getMatchGames: Executing query...');
    const games = await db.all<Record<string, unknown>>(query, [matchId]);
    console.log(`getMatchGames: Query completed, found ${games?.length || 0} games`);
    
    return games || [];
  } catch (error) {
    console.error('Error in getMatchGames:', error);
    console.error('Error details:', error instanceof Error ? error.message : 'Unknown error');
    throw error;
  }
}

/**
 * Ensure a match_games entry exists for the given match game ID
 */
async function ensureMatchGameExists(matchGameId: string, matchId: string): Promise<void> {
  console.log('ensureMatchGameExists - Starting with matchGameId:', matchGameId, 'matchId:', matchId);
  
  const db = await getDbInstance();
  console.log('ensureMatchGameExists - Database instance obtained');
  
  try {
    // Check if the match_games entry already exists
    const checkQuery = `SELECT id FROM match_games WHERE id = ?`;
    console.log('ensureMatchGameExists - Running check query');
    
    const row = await db.get<{ id: string }>(checkQuery, [matchGameId]);
    const exists = !!row;
    console.log('ensureMatchGameExists - Check query result:', exists);

    if (!exists) {
      console.log('ensureMatchGameExists - Entry does not exist, creating new entry');
      // Create the match_games entry
      const insertQuery = `
        INSERT INTO match_games (
          id, match_id, round, participant1_id, participant2_id, 
          status, created_at, updated_at
        ) VALUES (?, ?, 1, 'team1', 'team2', 'ongoing', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `;
      
      await db.run(insertQuery, [matchGameId, matchId]);
      console.log(`Created match game entry ${matchGameId} for match ${matchId}`);
    } else {
      console.log('ensureMatchGameExists - Entry already exists, skipping creation');
    }
    console.log('ensureMatchGameExists - Completed successfully');
  } catch (error) {
    console.error('Error in ensureMatchGameExists:', error);
    throw error;
  }
}

/**
 * Save match result - simplified to only track winner
 */
export async function saveMatchResult(
  matchGameId: string,
  result: MatchResult
): Promise<void> {
  console.log('saveMatchResult - Starting with matchGameId:', matchGameId);
  console.log('saveMatchResult - Result:', JSON.stringify(result, null, 2));
  
  const db = await getDbInstance();
  
  try {
    // First, ensure the match_games entry exists
    await ensureMatchGameExists(matchGameId, result.matchId);
    
    // Update the match_games table with winner
    const query = `UPDATE match_games 
                   SET winner_id = ?,
                       status = 'completed',
                       completed_at = CURRENT_TIMESTAMP,
                       updated_at = CURRENT_TIMESTAMP
                   WHERE id = ?`;

    await db.run(query, [result.winner, matchGameId]);
    console.log(`Saved match result for game ${matchGameId}: ${result.winner} wins`);

    // Queue Discord score notification
    await queueScoreNotification(matchGameId, result);

    // Set the next pending map to 'ongoing' if it exists
    await setNextMapToOngoing(result.matchId);

    // Update match status to complete if all games are done
    await updateMatchStatusIfComplete(matchGameId);
    
  } catch (error) {
    console.error('Error in saveMatchResult:', error);
    throw error;
  }
}

/**
 * Get match result for a game
 */
export async function getMatchResult(matchGameId: string): Promise<MatchResult | null> {
  const db = await getDbInstance();
  
  try {
    const query = `
      SELECT mg.match_id, mg.winner_id, mg.completed_at
      FROM match_games mg
      WHERE mg.id = ?
    `;

    const row = await db.get<{ match_id?: string; winner_id?: string; completed_at?: string }>(query, [matchGameId]);
    
    if (!row || !row.winner_id) {
      return null;
    }
    
    return {
      matchId: row.match_id!,
      gameId: matchGameId,
      winner: row.winner_id as 'team1' | 'team2',
      completedAt: new Date(row.completed_at!)
    };
  } catch (error) {
    console.error('Error in getMatchResult:', error);
    throw error;
  }
}

/**
 * Set the next pending map to ongoing status
 */
async function setNextMapToOngoing(matchId: string): Promise<void> {
  const db = await getDbInstance();
  
  try {
    // Find the first pending map and set it to ongoing
    const nextMapQuery = `
      SELECT id FROM match_games 
      WHERE match_id = ? AND status = 'pending' 
      ORDER BY round ASC 
      LIMIT 1
    `;
    
    const nextMap = await db.get<{ id: string }>(nextMapQuery, [matchId]);
    
    if (nextMap) {
      const updateQuery = `
        UPDATE match_games 
        SET status = 'ongoing', updated_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `;
      
      await db.run(updateQuery, [nextMap.id]);
      console.log(`Set next map ${nextMap.id} to ongoing status`);
    } else {
      console.log('No pending maps found to set as ongoing');
    }
  } catch (error) {
    console.error('Error setting next map to ongoing:', error);
    // Don't throw - this is a non-critical operation
  }
}

/**
 * Queue a Discord score notification for this game result
 */
async function queueScoreNotification(matchGameId: string, result: MatchResult): Promise<void> {
  const db = await getDbInstance();
  
  try {
    // Get match and game data
    const gameDataQuery = `
      SELECT mg.match_id, mg.round, mg.map_id,
             m.name as match_name, m.game_id,
             gm.name as map_name
      FROM match_games mg
      JOIN matches m ON mg.match_id = m.id
      LEFT JOIN game_maps gm ON mg.map_id = gm.id
      WHERE mg.id = ?
    `;

    const gameData = await db.get<{
      match_id: string;
      round: number;
      map_id?: string;
      match_name: string;
      game_id: string;
      map_name?: string;
    }>(gameDataQuery, [matchGameId]);

    if (!gameData) {
      console.warn('No game data found for score notification');
      return;
    }

    // Get winning team players
    const winningTeamName = result.winner === 'team1' ? 'Blue Team' : 'Red Team';
    const teamAssignment = result.winner === 'team1' ? 'blue' : 'red';
    
    const playersQuery = `
      SELECT username
      FROM match_participants
      WHERE match_id = ? AND team_assignment = ?
      ORDER BY username ASC
    `;

    const players = await db.all<{ username: string }>(playersQuery, [gameData.match_id, teamAssignment]);
    const winningPlayers = players.map(p => p.username);

    // Generate unique notification ID
    const notificationId = `score_notification_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

    // Insert into score notification queue
    const insertQuery = `
      INSERT INTO discord_score_notification_queue (
        id, match_id, game_id, map_id, game_number, winner,
        winning_team_name, winning_players, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `;

    await db.run(insertQuery, [
      notificationId,
      gameData.match_id,
      gameData.game_id,
      gameData.map_id || 'unknown',
      gameData.round,
      result.winner,
      winningTeamName,
      JSON.stringify(winningPlayers)
    ]);

    console.log(`✅ Queued score notification: ${winningTeamName} wins game ${gameData.round}`);
  } catch (error) {
    console.error('Error queueing score notification:', error);
    // Don't throw - this is not critical for the main scoring flow
  }
}

/**
 * Update match status to complete if all games are scored
 */
async function updateMatchStatusIfComplete(matchGameId: string): Promise<void> {
  const db = await getDbInstance();
  
  try {
    // Get the match ID for this game
    const matchQuery = `
      SELECT match_id FROM match_games WHERE id = ?
    `;
    
    const matchRow = await db.get<{ match_id?: string }>(matchQuery, [matchGameId]);
    const matchId = matchRow?.match_id;

    if (!matchId) return;

    // Check if all games in this match are completed
    const statusQuery = `
      SELECT COUNT(*) as total, 
             SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
      FROM match_games 
      WHERE match_id = ?
    `;

    const statusResult = await db.get<{ total: number; completed: number }>(statusQuery, [matchId]);

    // If all games are completed, mark match as complete
    if (statusResult && statusResult.total > 0 && statusResult.completed === statusResult.total) {
      const updateMatchQuery = `
        UPDATE matches 
        SET status = 'complete', end_date = CURRENT_TIMESTAMP 
        WHERE id = ?
      `;
      
      await db.run(updateMatchQuery, [matchId]);
      console.log(`Match ${matchId} marked as complete`);
    }
  } catch (error) {
    console.error('Error updating match status:', error);
    // Don't throw - this is a non-critical operation
  }
}