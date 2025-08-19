import { getDbInstance } from './database-init';
import { 
  MatchScore, 
  ScoringConfig, 
  MatchFormat, 
  ModeDataJsonWithScoring,
  FormatVariant 
} from '@/shared/types';

/**
 * Get match format configuration by combining match format + mode scoring config
 */
export async function getMatchFormatConfig(
  gameId: string, 
  modeId: string, 
  matchFormat: MatchFormat
): Promise<ScoringConfig> {
  try {
    // Load mode data from JSON files (since we store config in data files, not database)
    const fs = require('fs');
    const path = require('path');
    
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

    // Build scoring configuration
    const config: ScoringConfig = {
      format: matchFormat,
      scoringType: modeData.scoringType,
      scoringTiming: modeData.scoringTiming,
      formatVariant,
      validation: {
        // Extract validation rules from format variant
        minRounds: formatVariant.maxRounds ? 1 : undefined,
        maxRounds: formatVariant.maxRounds as number | undefined,
        targetPoints: formatVariant.maxPoints as number | undefined,
        targetEliminations: formatVariant.targetEliminations as number | undefined,
        timeLimit: formatVariant.timeLimit as number | undefined,
      }
    };

    return config;
  } catch (error) {
    console.error('Error getting match format config:', error);
    throw new Error(`Failed to load scoring configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Save match score with format-aware JSON structure
 */
export async function saveMatchScore(
  matchGameId: string,
  matchScore: MatchScore
): Promise<void> {
  const db = await getDbInstance();
  
  try {
    // Serialize the match score as JSON
    const scoreData = JSON.stringify(matchScore);
    
    // Update the match_games table with score data and winner
    const query = `
      UPDATE match_games 
      SET score_data = ?, 
          winner_id = ?,
          status = 'completed',
          completed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;

    // For now, we'll use simple winner logic (can be enhanced later)
    const winnerId = matchScore.winner === 'team1' ? 'team1' : 
                     matchScore.winner === 'team2' ? 'team2' : null;

    await new Promise<void>((resolve, reject) => {
      db.run(query, [scoreData, winnerId, matchGameId], function(err) {
        if (err) {
          console.error('Error saving match score:', err);
          reject(new Error(`Failed to save match score: ${err.message}`));
        } else {
          console.log(`Saved match score for game ${matchGameId}`);
          resolve();
        }
      });
    });

    // Update match status to complete if all games are complete
    await updateMatchStatusIfComplete(matchGameId);
    
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

    return new Promise<MatchScore | null>((resolve, reject) => {
      db.get(query, [matchGameId], (err, row: any) => {
        if (err) {
          console.error('Error getting match score:', err);
          reject(new Error(`Failed to get match score: ${err.message}`));
        } else if (!row || !row.score_data) {
          resolve(null);
        } else {
          try {
            const matchScore: MatchScore = JSON.parse(row.score_data);
            resolve(matchScore);
          } catch (parseErr) {
            console.error('Error parsing score data:', parseErr);
            reject(new Error('Invalid score data format'));
          }
        }
      });
    });
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
    
    const matchId = await new Promise<string>((resolve, reject) => {
      db.get(matchQuery, [matchGameId], (err, row: any) => {
        if (err) reject(err);
        else resolve(row?.match_id);
      });
    });

    if (!matchId) return;

    // Check if all games in this match are completed
    const statusQuery = `
      SELECT COUNT(*) as total, 
             SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
      FROM match_games 
      WHERE match_id = ?
    `;

    const statusResult = await new Promise<{total: number, completed: number}>((resolve, reject) => {
      db.get(statusQuery, [matchId], (err, row: any) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    // If all games are completed, mark match as complete
    if (statusResult.total > 0 && statusResult.completed === statusResult.total) {
      const updateMatchQuery = `
        UPDATE matches 
        SET status = 'complete', end_date = CURRENT_TIMESTAMP 
        WHERE id = ?
      `;
      
      await new Promise<void>((resolve, reject) => {
        db.run(updateMatchQuery, [matchId], function(err) {
          if (err) {
            console.error('Error updating match status:', err);
            reject(err);
          } else {
            console.log(`Match ${matchId} marked as complete`);
            resolve();
          }
        });
      });
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

    return new Promise<MatchFormat>((resolve, reject) => {
      db.get(query, [matchId], (err, row: any) => {
        if (err) {
          console.error('Error getting match format:', err);
          reject(new Error(`Failed to get match format: ${err.message}`));
        } else {
          resolve((row?.match_format as MatchFormat) || 'casual');
        }
      });
    });
  } catch (error) {
    console.error('Error in getMatchFormat:', error);
    throw error;
  }
}