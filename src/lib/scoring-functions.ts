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
        
        // Check if there's a temporary note-only entry (Round 0) for this map
        const noteEntry = await db.get(`
          SELECT notes FROM match_games 
          WHERE match_id = ? AND map_id = ? AND round = 0
          LIMIT 1
        `, [matchId, mapId]) as { notes: string } | undefined;
        
        const existingNote = noteEntry ? noteEntry.notes : '';
        
        const insertQuery = `
          INSERT INTO match_games (
            id, match_id, round, participant1_id, participant2_id,
            map_id, notes, status, created_at, updated_at
          ) VALUES (?, ?, ?, 'team1', 'team2', ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `;
        
        await db.run(insertQuery, [gameId, matchId, i + 1, mapId, existingNote, status]);
        console.log(`Created match game ${gameId} for map ${mapId} with status ${status} and note: ${existingNote}`);
        
        // Clean up the temporary Round 0 entry if it exists
        if (noteEntry) {
          await db.run(`
            DELETE FROM match_games 
            WHERE match_id = ? AND map_id = ? AND round = 0
          `, [matchId, mapId]);
          console.log(`Cleaned up temporary note entry for ${mapId}`);
        }
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
    
    // First get the match games
    const gamesQuery = `
      SELECT mg.*
      FROM match_games mg
      WHERE mg.match_id = ?
      ORDER BY mg.round ASC
    `;
    
    console.log('getMatchGames: Executing games query...');
    const games = await db.all<Record<string, unknown>>(gamesQuery, [matchId]);
    console.log(`getMatchGames: Query completed, found ${games?.length || 0} games`);
    
    // Now enrich each game with map data by stripping timestamps
    for (const game of games) {
      const cleanMapId = String(game.map_id || '').replace(/-\d+-[a-zA-Z0-9]+$/, '');
      
      const mapQuery = `
        SELECT gm.name, gm.image_url, gm.mode_id, gm.game_id, gamemode.scoring_type as mode_scoring_type
        FROM game_maps gm
        LEFT JOIN game_modes gamemode ON gm.mode_id = gamemode.id AND gm.game_id = gamemode.game_id
        WHERE gm.id = ?
        LIMIT 1
      `;
      
      const mapData = await db.get(mapQuery, [cleanMapId]) as {
        name: string;
        image_url?: string;
        mode_id?: string;
        game_id: string;
        mode_scoring_type?: string;
      } | undefined;
      if (mapData) {
        game.map_name = mapData.name;
        game.image_url = mapData.image_url;
        game.mode_id = mapData.mode_id;
        game.game_id = mapData.game_id;
        game.mode_scoring_type = mapData.mode_scoring_type;
      }
    }
    
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
 * Save match result - handles both team-based and FFA scoring
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
    
    // Handle FFA vs Normal scoring differently
    if (result.isFfaMode && result.participantWinnerId) {
      // FFA Mode: Save individual participant winner, don't count toward team wins
      const query = `UPDATE match_games 
                     SET participant_winner_id = ?,
                         is_ffa_mode = 1,
                         status = 'completed',
                         completed_at = CURRENT_TIMESTAMP,
                         updated_at = CURRENT_TIMESTAMP
                     WHERE id = ?`;

      await db.run(query, [result.participantWinnerId, matchGameId]);
      console.log(`Saved FFA match result for game ${matchGameId}: participant ${result.participantWinnerId} wins`);
    } else {
      // Normal Mode: Save team winner
      const query = `UPDATE match_games 
                     SET winner_id = ?,
                         is_ffa_mode = 0,
                         status = 'completed',
                         completed_at = CURRENT_TIMESTAMP,
                         updated_at = CURRENT_TIMESTAMP
                     WHERE id = ?`;

      await db.run(query, [result.winner, matchGameId]);
      console.log(`Saved team match result for game ${matchGameId}: ${result.winner} wins`);
    }

    // Queue Discord score notification
    await queueScoreNotification(matchGameId, result);

    // Set the next pending map to 'ongoing' if it exists
    const hasNextMap = await setNextMapToOngoing(result.matchId);

    // Update match status to complete if all games are done
    const isMatchComplete = await updateMatchStatusIfComplete(matchGameId);

    // Queue voice announcements based on match state
    await queueVoiceAnnouncementForScore(result.matchId, hasNextMap, isMatchComplete);
    
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
      SELECT mg.match_id, mg.winner_id, mg.participant_winner_id, mg.is_ffa_mode, mg.completed_at
      FROM match_games mg
      WHERE mg.id = ?
    `;

    const row = await db.get<{ 
      match_id?: string; 
      winner_id?: string; 
      participant_winner_id?: string;
      is_ffa_mode?: number;
      completed_at?: string 
    }>(query, [matchGameId]);
    
    if (!row) {
      return null;
    }
    
    const isFfaMode = Boolean(row.is_ffa_mode);
    
    // For FFA modes, require participant_winner_id; for normal modes, require winner_id
    if (isFfaMode && !row.participant_winner_id) {
      return null;
    }
    if (!isFfaMode && !row.winner_id) {
      return null;
    }
    
    return {
      matchId: row.match_id!,
      gameId: matchGameId,
      winner: row.winner_id as 'team1' | 'team2',
      participantWinnerId: row.participant_winner_id,
      isFfaMode,
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
async function setNextMapToOngoing(matchId: string): Promise<boolean> {
  const db = await getDbInstance();
  
  try {
    // Find the first pending map and set it to ongoing
    const nextMapQuery = `
      SELECT mg.id, mg.map_id, gm.name as map_name 
      FROM match_games mg
      LEFT JOIN game_maps gm ON mg.map_id = gm.id
      WHERE mg.match_id = ? AND mg.status = 'pending' 
      ORDER BY mg.round ASC 
      LIMIT 1
    `;
    
    const nextMap = await db.get<{ id: string; map_id?: string; map_name?: string }>(nextMapQuery, [matchId]);
    
    if (nextMap) {
      const updateQuery = `
        UPDATE match_games 
        SET status = 'ongoing', updated_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `;
      
      await db.run(updateQuery, [nextMap.id]);
      console.log(`Set next map ${nextMap.id} to ongoing status`);

      // Queue map code PMs for the new map if map codes are supported
      try {
        await queueMapCodePMsForNext(matchId, nextMap.map_name);
      } catch (mapCodeError) {
        console.error('Error queuing map code PMs for next map:', mapCodeError);
        // Don't throw - this is a non-critical operation
      }

      return true; // There is a next map
    } else {
      console.log('No pending maps found to set as ongoing');
      return false; // No next map
    }
  } catch (error) {
    console.error('Error setting next map to ongoing:', error);
    // Don't throw - this is a non-critical operation
    return false;
  }
}

// Queue map code PMs for the next map
async function queueMapCodePMsForNext(matchId: string, mapName?: string): Promise<void> {
  console.log('🔍 queueMapCodePMsForNext called with:', matchId, mapName);
  
  if (!mapName) {
    console.log('No map name available for map code PMs');
    return;
  }

  const db = await getDbInstance();
  
  try {
    // Check if map codes are supported and get the map code
    const matchData = await db.get<{
      map_codes?: string;
      map_codes_supported?: number;
    }>(`
      SELECT m.map_codes, g.map_codes_supported
      FROM matches m
      LEFT JOIN games g ON m.game_id = g.id
      WHERE m.id = ?
    `, [matchId]);

    console.log('🔍 matchData:', matchData);
    
    if (matchData?.map_codes_supported) {
      const mapCodes = matchData.map_codes ? JSON.parse(matchData.map_codes) : {};
      const cleanMapName = mapName.replace(/-\d+$/, '');
      
      // Try exact match first
      let mapCode = mapCodes[cleanMapName];
      
      // If exact match fails, try case-insensitive and normalized lookup
      if (!mapCode) {
        const normalizedCleanName = cleanMapName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const mapCodeKey = Object.keys(mapCodes).find(key => 
          key.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') === normalizedCleanName
        );
        if (mapCodeKey) {
          mapCode = mapCodes[mapCodeKey];
        }
      }
      
      console.log('🔍 mapCodes:', mapCodes);
      console.log('🔍 cleanMapName:', cleanMapName);
      console.log('🔍 mapCode:', mapCode);
      
      if (mapCode) {
        // Generate unique ID for the queue entry
        const queueId = `map_codes_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Get the actual map name from database instead of using potentially raw mapName
        let displayMapName = mapName; // Fallback to passed mapName
        try {
          // Clean the map name (remove timestamp suffix if present)
          const cleanMapName = mapName.replace(/-\d+$/, '');
          
          // Get actual map name from database  
          const mapNameData = await db.get<{ name: string }>(`
            SELECT name FROM game_maps 
            WHERE game_id = (SELECT game_id FROM matches WHERE id = ?) 
              AND (id = ? OR LOWER(name) LIKE LOWER(?))
            LIMIT 1
          `, [matchId, cleanMapName, `%${cleanMapName}%`]);
          
          if (mapNameData) {
            displayMapName = mapNameData.name;
          }
        } catch (error) {
          console.error('Error fetching map name for PM queue:', error);
          // Keep original mapName as fallback
        }

        // Add to map code PM queue
        await db.run(`
          INSERT INTO discord_map_code_queue (id, match_id, map_name, map_code, status)
          VALUES (?, ?, ?, ?, 'pending')
        `, [queueId, matchId, displayMapName, mapCode]);
        
        console.log('📱 Map code PMs queued for next map:', mapName, 'in match:', matchId);
      } else {
        console.log('No map code found for map:', mapName);
      }
    }
  } catch (error) {
    console.error('Error queuing map code PMs for next map:', error);
    throw error;
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

    // Handle FFA vs team mode differently
    let winningTeamName: string;
    let winningPlayers: string[];
    
    if (result.isFfaMode && result.participantWinnerId) {
      // FFA Mode: Get the individual winner's name
      const participantQuery = `
        SELECT username
        FROM match_participants
        WHERE match_id = ? AND id = ?
      `;
      const participant = await db.get<{ username: string }>(participantQuery, [gameData.match_id, result.participantWinnerId]);
      
      if (participant) {
        winningTeamName = participant.username;
        winningPlayers = [participant.username];
      } else {
        winningTeamName = 'Unknown Player';
        winningPlayers = ['Unknown Player'];
      }
    } else {
      // Team Mode: Get winning team players
      winningTeamName = result.winner === 'team1' ? 'Blue Team' : 'Red Team';
      const teamAssignment = result.winner === 'team1' ? 'blue' : 'red';
      
      const playersQuery = `
        SELECT username
        FROM match_participants
        WHERE match_id = ? AND team_assignment = ?
        ORDER BY username ASC
      `;

      const players = await db.all<{ username: string }>(playersQuery, [gameData.match_id, teamAssignment]);
      winningPlayers = players.map(p => p.username);
    }

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
async function updateMatchStatusIfComplete(matchGameId: string): Promise<boolean> {
  const db = await getDbInstance();
  
  try {
    // Get the match ID for this game
    const matchQuery = `
      SELECT match_id FROM match_games WHERE id = ?
    `;
    
    const matchRow = await db.get<{ match_id?: string }>(matchQuery, [matchGameId]);
    const matchId = matchRow?.match_id;

    if (!matchId) return false;

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
      
      // Queue match winner notification
      await queueMatchWinnerNotification(matchId);
      
      // Queue Discord deletion for match announcements and events
      await queueDiscordDeletion(matchId);
      
      return true; // Match is now complete
    }
    
    return false; // Match is not complete yet
  } catch (error) {
    console.error('Error updating match status:', error);
    // Don't throw - this is a non-critical operation
    return false;
  }
}

/**
 * Queue voice announcements based on scoring results
 */
async function queueVoiceAnnouncementForScore(
  matchId: string, 
  hasNextMap: boolean, 
  isMatchComplete: boolean
): Promise<void> {
  try {
    const db = await getDbInstance();
    
    // Get match voice channel assignments
    const match = await db.get<{
      blue_team_voice_channel?: string;
      red_team_voice_channel?: string;
    }>(`
      SELECT blue_team_voice_channel, red_team_voice_channel
      FROM matches WHERE id = ?
    `, [matchId]);

    if (!match) {
      console.warn('Match not found for voice announcement:', matchId);
      return;
    }

    // Skip if no voice channels are configured
    if (!match.blue_team_voice_channel && !match.red_team_voice_channel) {
      console.log('📢 No voice channels configured for match:', matchId);
      return;
    }

    let announcementType: 'nextround' | 'finish';
    
    if (isMatchComplete) {
      // Match is complete - play finish announcements
      announcementType = 'finish';
    } else if (hasNextMap) {
      // There's another map - play nextround announcements
      announcementType = 'nextround';
    } else {
      // No more maps but match not complete - shouldn't happen, but skip
      console.warn('No next map but match not complete for:', matchId);
      return;
    }

    // Determine which team should go first (alternating)
    const lastAlternation = await db.get<{ last_first_team: string }>(`
      SELECT last_first_team FROM match_voice_alternation WHERE match_id = ?
    `, [matchId]);

    const firstTeam = !lastAlternation || lastAlternation.last_first_team === 'red' ? 'blue' : 'red';

    // Generate unique announcement ID
    const announcementId = `voice_announcement_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    
    // Add to voice announcement queue
    await db.run(`
      INSERT INTO discord_voice_announcement_queue (
        id, match_id, announcement_type, blue_team_voice_channel, red_team_voice_channel, 
        first_team, status
      ) VALUES (?, ?, ?, ?, ?, ?, 'pending')
    `, [
      announcementId,
      matchId, 
      announcementType, 
      match.blue_team_voice_channel,
      match.red_team_voice_channel,
      firstTeam
    ]);
    
    console.log(`🔊 Voice announcement queued for match ${matchId}: ${announcementType}, starting with ${firstTeam} team`);
  } catch (error) {
    console.error('❌ Error queuing voice announcement for score:', error);
    // Don't throw - this is not critical for the main scoring flow
  }
}

/**
 * Get overall match score (team wins for Normal modes only, excluding FFA)
 */
export async function getOverallMatchScore(matchId: string): Promise<{
  team1Wins: number;
  team2Wins: number;
  totalNormalGames: number;
  overallWinner: 'team1' | 'team2' | 'tie' | null;
}> {
  const db = await getDbInstance();
  
  try {
    const query = `
      SELECT 
        COUNT(*) as total_normal_games,
        SUM(CASE WHEN mg.winner_id = 'team1' THEN 1 ELSE 0 END) as team1_wins,
        SUM(CASE WHEN mg.winner_id = 'team2' THEN 1 ELSE 0 END) as team2_wins
      FROM match_games mg
      WHERE mg.match_id = ? 
        AND mg.status = 'completed'
        AND (mg.is_ffa_mode = 0 OR mg.is_ffa_mode IS NULL)
        AND mg.winner_id IS NOT NULL
    `;

    const result = await db.get<{
      total_normal_games: number;
      team1_wins: number;
      team2_wins: number;
    }>(query, [matchId]);

    const team1Wins = result?.team1_wins || 0;
    const team2Wins = result?.team2_wins || 0;
    const totalNormalGames = result?.total_normal_games || 0;

    let overallWinner: 'team1' | 'team2' | 'tie' | null = null;
    if (totalNormalGames > 0) {
      if (team1Wins > team2Wins) {
        overallWinner = 'team1';
      } else if (team2Wins > team1Wins) {
        overallWinner = 'team2';
      } else {
        overallWinner = 'tie';
      }
    }

    return {
      team1Wins,
      team2Wins,
      totalNormalGames,
      overallWinner
    };
  } catch (error) {
    console.error('Error getting overall match score:', error);
    return {
      team1Wins: 0,
      team2Wins: 0,
      totalNormalGames: 0,
      overallWinner: null
    };
  }
}

/**
 * Get match games with FFA results and participants
 */
export async function getMatchGamesWithResults(matchId: string): Promise<Array<{
  id: string;
  round: number;
  map_name: string;
  mode_scoring_type: string;
  status: string;
  winner_id?: string;
  participant_winner_id?: string;
  participant_winner_name?: string;
  is_ffa_mode: boolean;
}>> {
  const db = await getDbInstance();
  
  try {
    const query = `
      SELECT 
        mg.id,
        mg.round,
        mg.winner_id,
        mg.participant_winner_id,
        mg.is_ffa_mode,
        mg.status,
        gm.name as map_name,
        gamemode.scoring_type as mode_scoring_type,
        mp.username as participant_winner_name
      FROM match_games mg
      LEFT JOIN game_maps gm ON mg.map_id = gm.id
      LEFT JOIN game_modes gamemode ON gm.mode_id = gamemode.id AND gm.game_id = gamemode.game_id
      LEFT JOIN match_participants mp ON mg.participant_winner_id = mp.id
      WHERE mg.match_id = ?
      ORDER BY mg.round ASC
    `;

    const games = await db.all<{
      id: string;
      round: number;
      map_name: string;
      mode_scoring_type: string;
      status: string;
      winner_id?: string;
      participant_winner_id?: string;
      participant_winner_name?: string;
      is_ffa_mode: number;
    }>(query, [matchId]);

    return games.map(game => ({
      ...game,
      is_ffa_mode: Boolean(game.is_ffa_mode)
    }));
  } catch (error) {
    console.error('Error getting match games with results:', error);
    return [];
  }
}

/**
 * Queue match winner notification when match completes
 */
async function queueMatchWinnerNotification(matchId: string): Promise<void> {
  try {
    const db = await getDbInstance();
    
    // Get match data and final scores
    const matchData = await db.get<{
      name: string;
      game_id: string;
    }>(`
      SELECT name, game_id FROM matches WHERE id = ?
    `, [matchId]);

    if (!matchData) {
      console.warn('Match not found for winner notification:', matchId);
      return;
    }

    // Get overall match score
    const scoreData = await getOverallMatchScore(matchId);
    
    if (scoreData.totalNormalGames === 0) {
      console.warn('No completed normal games found for match winner notification:', matchId);
      return;
    }

    // Determine winner and winning team data
    const winner: 'team1' | 'team2' | 'tie' = scoreData.overallWinner || 'tie';
    let winningTeamName: string;
    let winningPlayers: string[] = [];

    if (winner === 'tie') {
      winningTeamName = 'Match Tied';
    } else {
      winningTeamName = winner === 'team1' ? 'Blue Team' : 'Red Team';
      const teamAssignment = winner === 'team1' ? 'blue' : 'red';
      
      // Get winning team players
      const players = await db.all<{ username: string }>(`
        SELECT username
        FROM match_participants
        WHERE match_id = ? AND team_assignment = ?
        ORDER BY username ASC
      `, [matchId, teamAssignment]);
      
      winningPlayers = players.map(p => p.username);
    }

    // Generate unique notification ID
    const notificationId = `match_winner_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

    // Insert into match winner notification queue
    await db.run(`
      INSERT INTO discord_match_winner_queue (
        id, match_id, match_name, game_id, winner, winning_team_name, 
        winning_players, team1_score, team2_score, total_maps, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `, [
      notificationId,
      matchId,
      matchData.name,
      matchData.game_id,
      winner,
      winningTeamName,
      JSON.stringify(winningPlayers),
      scoreData.team1Wins,
      scoreData.team2Wins,
      scoreData.totalNormalGames
    ]);

    console.log(`🏆 Match winner notification queued: ${winningTeamName} wins ${matchData.name} (${scoreData.team1Wins}-${scoreData.team2Wins})`);
  } catch (error) {
    console.error('❌ Error queuing match winner notification:', error);
    // Don't throw - this is not critical for the main scoring flow
  }
}

/**
 * Queue Discord deletion for match announcements and events when match completes
 */
async function queueDiscordDeletion(matchId: string): Promise<void> {
  try {
    const db = await getDbInstance();
    
    // Generate unique deletion ID
    const deletionId = `completion_deletion_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    
    // Insert into Discord deletion queue
    await db.run(`
      INSERT INTO discord_deletion_queue (id, match_id, status)
      VALUES (?, ?, 'pending')
    `, [deletionId, matchId]);
    
    console.log(`🗑️ Discord deletion queued for completed match: ${matchId}`);
  } catch (error) {
    console.error('❌ Error queuing Discord deletion for completed match:', error);
    // Don't throw - this is not critical for the main scoring flow
  }
}