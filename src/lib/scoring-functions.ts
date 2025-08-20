import { getDbInstance } from './database-init';
import { 
  MatchScore, 
  ScoringConfig, 
  MatchFormat, 
  ModeDataJsonWithScoring
} from '@/shared/types';

/**
 * Get match format configuration by combining match format + mode scoring config
 * For multi-map matches, this overrides maxRounds with the actual number of maps
 */
export async function getMatchFormatConfig(
  gameId: string, 
  modeId: string, 
  matchFormat: MatchFormat,
  matchId?: string
): Promise<ScoringConfig> {
  try {
    // Load mode data from JSON files (since we store config in data files, not database)
    const fs = await import('fs');
    const path = await import('path');
    
    const modesPath = path.join(process.cwd(), 'data', 'games', gameId, 'modes.json');
    
    if (!fs.existsSync(modesPath)) {
      throw new Error(`Modes file not found for game: ${gameId}`);
    }

    const modesData: ModeDataJsonWithScoring[] = JSON.parse(fs.readFileSync(modesPath, 'utf8'));
    const modeData = modesData.find(mode => mode.id === modeId);
    
    if (!modeData) {
      throw new Error(`Mode not found: ${modeId} in game: ${gameId}`);
    }

    // Get format variant
    const formatVariant = modeData.formatVariants[matchFormat];
    if (!formatVariant) {
      throw new Error(`Format "${matchFormat}" not supported for mode "${modeData.name}"`);
    }

    // If this is for a specific match, override maxRounds with the actual number of maps
    let adjustedFormatVariant = { ...formatVariant };
    if (matchId) {
      try {
        const db = await getDbInstance();
        const matchQuery = `SELECT maps FROM matches WHERE id = ?`;
        const matchRow = await db.get<{ maps?: string }>(matchQuery, [matchId]);
        
        if (matchRow && matchRow.maps) {
          const maps = JSON.parse(matchRow.maps);
          if (maps.length > 0) {
            // For multi-map matches, treat each map as a "round" but these are actually separate games
            // The maxRounds in the context of individual map scoring should be based on the mode
            // but for match-level scoring, it should be the number of maps
            console.log(`Overriding maxRounds from ${formatVariant.maxRounds} to ${maps.length} based on ${maps.length} maps in match`);
            adjustedFormatVariant = {
              ...formatVariant,
              maxRounds: maps.length,
              description: `${formatVariant.description} (${maps.length} maps)`
            };
          }
        }
      } catch (dbError) {
        console.warn('Could not fetch match data for configuration adjustment:', dbError);
        // Fall back to original format variant
      }
    }

    // Build scoring configuration
    const config: ScoringConfig = {
      format: matchFormat,
      scoringType: modeData.scoringType,
      scoringTiming: modeData.scoringTiming,
      formatVariant: adjustedFormatVariant,
      validation: {
        // Extract validation rules from format variant
        minRounds: adjustedFormatVariant.maxRounds ? 1 : undefined,
        maxRounds: adjustedFormatVariant.maxRounds as number | undefined,
        targetPoints: adjustedFormatVariant.maxPoints as number | undefined,
        targetEliminations: adjustedFormatVariant.targetEliminations as number | undefined,
        timeLimit: adjustedFormatVariant.timeLimit as number | undefined,
      }
    };

    return config;
  } catch (error) {
    console.error('Error getting match format config:', error);
    throw new Error(`Failed to load scoring configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
        const insertQuery = `
          INSERT INTO match_games (
            id, match_id, round, participant1_id, participant2_id,
            map_id, status, created_at, updated_at
          ) VALUES (?, ?, ?, 'team1', 'team2', ?, 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `;
        
        await db.run(insertQuery, [gameId, matchId, i + 1, mapId]);
        console.log(`Created match game ${gameId} for map ${mapId}`);
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
  const db = await getDbInstance();
  
  try {
    const query = `
      SELECT mg.*, gm.name as map_name
      FROM match_games mg
      LEFT JOIN game_maps gm ON mg.map_id = gm.id
      WHERE mg.match_id = ?
      ORDER BY mg.round ASC
    `;
    
    const games = await db.all(query, [matchId]);
    return games || [];
  } catch (error) {
    console.error('Error in getMatchGames:', error);
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
 * Save match score with format-aware JSON structure
 */
export async function saveMatchScore(
  matchGameId: string,
  matchScore: MatchScore,
  isFinal: boolean = true
): Promise<void> {
  console.log('saveMatchScore - Starting with matchGameId:', matchGameId);
  console.log('saveMatchScore - MatchScore:', JSON.stringify(matchScore, null, 2));
  
  const db = await getDbInstance();
  console.log('saveMatchScore - Database instance obtained');
  
  try {
    // First, ensure the match_games entry exists
    console.log('saveMatchScore - Calling ensureMatchGameExists');
    await ensureMatchGameExists(matchGameId, matchScore.matchId);
    console.log('saveMatchScore - ensureMatchGameExists completed');
    
    // Serialize the match score as JSON
    const scoreData = JSON.stringify(matchScore);
    console.log('saveMatchScore - Score data serialized');
    
    // Update the match_games table with score data and winner
    const status = isFinal ? 'completed' : 'ongoing';
    const query = isFinal 
      ? `UPDATE match_games 
         SET score_data = ?, 
             winner_id = ?,
             status = ?,
             completed_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      : `UPDATE match_games 
         SET score_data = ?, 
             winner_id = ?,
             status = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`;

    // For progress saves, don't set a winner unless the match is actually complete
    const winnerId = isFinal ? (matchScore.winner === 'team1' ? 'team1' : 
                               matchScore.winner === 'team2' ? 'team2' : null) : null;

    console.log('saveMatchScore - About to run UPDATE query with winnerId:', winnerId, 'status:', status, 'isFinal:', isFinal);
    await db.run(query, [scoreData, winnerId, status, matchGameId]);
    console.log(`Saved match score for game ${matchGameId}`);
    console.log('saveMatchScore - UPDATE query completed');

    // Only update match status to complete for final saves
    if (isFinal) {
      console.log('saveMatchScore - Calling updateMatchStatusIfComplete');
      await updateMatchStatusIfComplete(matchGameId);
      console.log('saveMatchScore - updateMatchStatusIfComplete completed');
    } else {
      console.log('saveMatchScore - Skipping updateMatchStatusIfComplete (progress save)');
    }
    
  } catch (error) {
    console.error('Error in saveMatchScore:', error);
    throw error;
  }
}

/**
 * Get match score for displaying format-specific scores
 */
export async function getMatchScore(matchGameId: string): Promise<MatchScore | null> {
  const db = await getDbInstance();
  
  try {
    const query = `
      SELECT score_data, winner_id, completed_at
      FROM match_games
      WHERE id = ?
    `;

    const row = await db.get<{ score_data?: string; winner_id?: string; completed_at?: string }>(query, [matchGameId]);
    
    if (!row || !row.score_data) {
      return null;
    }
    
    try {
      const matchScore: MatchScore = JSON.parse(row.score_data);
      return matchScore;
    } catch (parseErr) {
      console.error('Error parsing score data:', parseErr);
      throw new Error('Invalid score data format');
    }
  } catch (error) {
    console.error('Error in getMatchScore:', error);
    throw error;
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
    if (statusResult.total > 0 && statusResult.completed === statusResult.total) {
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