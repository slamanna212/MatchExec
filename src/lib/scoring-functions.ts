import { getDbInstance } from './database-init';
import { logger } from '@/lib/logger';
import { deleteMatchVoiceChannels } from './voice-channel-manager';
import { logFeedEvent } from './feed-helpers';
import type {
  MatchResult,
  MatchFormat,
  PositionScoringConfig
} from '@/shared/types';
import type { GameResult, TeamPlacement, ParticipantPlacement } from './types/scoring';

/**
 * Get points for a given position based on a scoring config
 * Returns 0 if position is not in the config
 */
export function getPointsForPosition(position: number, config: PositionScoringConfig): number {
  return config.pointsPerPosition[position.toString()] ?? 0;
}

/**
 * Resolve position points for a match, honouring per-match override before game default
 */
export async function getPointsForPositionByMatchId(position: number, matchId: string): Promise<number> {
  const db = await getDbInstance();
  const row = await db.get<{ position_scoring_override?: string; scoring_config?: string }>(
    `SELECT m.position_scoring_override, g.scoring_config
     FROM matches m JOIN games g ON m.game_id = g.id WHERE m.id = ?`,
    [matchId]
  );
  const raw = row?.position_scoring_override ?? row?.scoring_config;
  if (!raw) return 0;
  try {
    const config = JSON.parse(raw) as PositionScoringConfig;
    return getPointsForPosition(position, config);
  } catch {
    return 0;
  }
}

/**
 * Calculate points awarded for position results.
 * Checks per-match position_scoring_override before falling back to game scoring_config.
 * @param positionResults - participantId → 1-based position
 * @param matchGameId - match_games.id (used to resolve the match and its overrides)
 */
export async function calculatePositionPoints(
  positionResults: Record<string, number>,
  matchGameId: string
): Promise<Record<string, number>> {
  const db = await getDbInstance();

  try {
    const row = await db.get<{ position_scoring_override?: string; scoring_config?: string }>(
      `SELECT m.position_scoring_override, g.scoring_config
       FROM match_games mg
       JOIN matches m ON mg.match_id = m.id
       JOIN games g ON m.game_id = g.id
       WHERE mg.id = ?`,
      [matchGameId]
    );

    const raw = row?.position_scoring_override ?? row?.scoring_config;
    if (!raw) {
      logger.warning('No scoring config found, defaulting to 0 points for all positions');
      return Object.keys(positionResults).reduce((acc, id) => { acc[id] = 0; return acc; }, {} as Record<string, number>);
    }

    let config: PositionScoringConfig;
    try {
      config = JSON.parse(raw) as PositionScoringConfig;
    } catch {
      logger.error('Malformed scoring_config, defaulting to 0 points for all positions');
      return Object.keys(positionResults).reduce((acc, id) => { acc[id] = 0; return acc; }, {} as Record<string, number>);
    }

    const pointsAwarded: Record<string, number> = {};
    for (const [participantId, position] of Object.entries(positionResults)) {
      pointsAwarded[participantId] = getPointsForPosition(position, config);
    }
    return pointsAwarded;
  } catch (error) {
    logger.error('Error calculating position points:', error);
    throw error;
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
    logger.error('Error in getMatchFormat:', error);
    throw error;
  }
}

/**
 * Create match_games entries for all maps in a match
 */
export async function initializeMatchGames(matchId: string): Promise<void> {
  logger.debug('initializeMatchGames - Starting with matchId:', matchId);
  
  const db = await getDbInstance();
  
  try {
    // Get match data including maps
    const matchQuery = `SELECT maps FROM matches WHERE id = ?`;
    const matchRow = await db.get<{ maps?: string }>(matchQuery, [matchId]);

    if (!matchRow || !matchRow.maps) {
      logger.debug('initializeMatchGames - No maps found for match');
      return;
    }

    let maps: string[];
    try {
      maps = JSON.parse(matchRow.maps);
    } catch {
      logger.error(`Malformed maps JSON for match ${matchId}, skipping game initialization`);
      return;
    }
    logger.debug(`initializeMatchGames - Found ${maps.length} maps:`, maps);

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
        logger.debug(`Created match game ${gameId} for map ${mapId} with status ${status} and note: ${existingNote}`);


        // Clean up the temporary Round 0 entry if it exists
        if (noteEntry) {
          await db.run(`
            DELETE FROM match_games 
            WHERE match_id = ? AND map_id = ? AND round = 0
          `, [matchId, mapId]);
          logger.debug(`Cleaned up temporary note entry for ${mapId}`);
        }
      } else {
        logger.debug(`Match game ${gameId} already exists`);
      }
    }
    
    logger.debug('initializeMatchGames - Completed successfully');
  } catch (error) {
    logger.error('Error in initializeMatchGames:', error);
    throw error;
  }
}

/**
 * Queue scorecard prompts and winner vote DMs for the first map when a match enters battle.
 * Called explicitly from handleBattleTransition so it runs after participants are assigned.
 */
export async function queueBattleStartDMs(matchId: string): Promise<void> {
  try {
    const db = await getDbInstance();
    const firstGame = await db.get<{ id: string; map_id: string }>(
      `SELECT mg.id, mg.map_id FROM match_games mg WHERE mg.match_id = ? AND mg.status = 'ongoing' ORDER BY mg.round ASC LIMIT 1`,
      [matchId]
    );
    if (!firstGame) return;

    const baseMapId = firstGame.map_id.replace(/-\d{10,}-[a-zA-Z0-9]+$/, '');
    const mapData = await db.get<{ name: string }>('SELECT name FROM game_maps WHERE id = ?', [baseMapId]);
    const mapName = mapData?.name || firstGame.map_id;

    await queueScorecardPrompts(matchId, firstGame.id, mapName);
    await queueWinnerVote(matchId, firstGame.id, mapName);
  } catch (err) {
    logger.error('Error queuing battle start DMs:', err);
  }
}

/**
 * Get all match games for a match with their current status
 */
export async function getMatchGames(matchId: string): Promise<Array<Record<string, unknown>>> {
  logger.debug(`getMatchGames: Starting for matchId: ${matchId}`);

  try {
    const db = await getDbInstance();
    logger.debug('getMatchGames: Database instance obtained');

    // Fetch match games together with the match's game_id in one query
    const gamesQuery = `
      SELECT mg.*, m.game_id AS match_game_id
      FROM match_games mg
      JOIN matches m ON mg.match_id = m.id
      WHERE mg.match_id = ?
      ORDER BY mg.round ASC
    `;

    logger.debug('getMatchGames: Executing games query...');
    const games = await db.all<Record<string, unknown>>(gamesQuery, [matchId]);
    logger.debug(`getMatchGames: Query completed, found ${games?.length || 0} games`);

    if (!games || games.length === 0) {
      return [];
    }

    // All games in a match share the same game_id (from the parent match)
    const gameId = String(games[0].match_game_id || '');

    // Compute clean map IDs (strip timestamp suffixes added during map customisation)
    const cleanMapIds = games
      .map(g => String(g.map_id || '').replace(/-\d+-[a-zA-Z0-9]+$/, ''))
      .filter(id => id !== '');

    // Fetch all map data in a single query, filtered by the correct game_id to avoid
    // returning the wrong map when multiple games share the same map name/id.
    const mapLookup: Record<string, {
      name: string;
      image_url?: string;
      mode_id?: string;
      game_id: string;
      mode_scoring_type?: string;
    }> = {};

    if (gameId && cleanMapIds.length > 0) {
      const placeholders = cleanMapIds.map(() => '?').join(', ');
      const mapQuery = `
        SELECT gm.id, gm.name, gm.image_url, gm.mode_id, gm.game_id,
               gamemode.scoring_type AS mode_scoring_type
        FROM game_maps gm
        LEFT JOIN game_modes gamemode ON gm.mode_id = gamemode.id AND gm.game_id = gamemode.game_id
        WHERE gm.game_id = ? AND gm.id IN (${placeholders})
      `;

      const mapRows = await db.all<{
        id: string;
        name: string;
        image_url?: string;
        mode_id?: string;
        game_id: string;
        mode_scoring_type?: string;
      }>(mapQuery, [gameId, ...cleanMapIds]);

      for (const row of mapRows) {
        mapLookup[row.id] = row;
      }
    }

    // Enrich each game with its map data
    for (const game of games) {
      const cleanMapId = String(game.map_id || '').replace(/-\d+-[a-zA-Z0-9]+$/, '');
      const mapData = mapLookup[cleanMapId];
      if (mapData) {
        game.map_name = mapData.name;
        game.image_url = mapData.image_url;
        game.mode_id = mapData.mode_id;
        game.game_id = mapData.game_id;
        game.mode_scoring_type = mapData.mode_scoring_type;
      }
    }

    return games;
  } catch (error) {
    logger.error('Error in getMatchGames:', error);
    logger.error('Error details:', error instanceof Error ? error.message : 'Unknown error');
    throw error;
  }
}

/**
 * Ensure a match_games entry exists for the given match game ID
 */
async function ensureMatchGameExists(matchGameId: string, matchId: string): Promise<void> {
  logger.debug('ensureMatchGameExists - Starting with matchGameId:', matchGameId, 'matchId:', matchId);
  
  const db = await getDbInstance();
  logger.debug('ensureMatchGameExists - Database instance obtained');
  
  try {
    // Check if the match_games entry already exists
    const checkQuery = `SELECT id FROM match_games WHERE id = ?`;
    logger.debug('ensureMatchGameExists - Running check query');
    
    const row = await db.get<{ id: string }>(checkQuery, [matchGameId]);
    const exists = !!row;
    logger.debug('ensureMatchGameExists - Check query result:', exists);

    if (!exists) {
      logger.debug('ensureMatchGameExists - Entry does not exist, creating new entry');
      // Create the match_games entry
      const insertQuery = `
        INSERT INTO match_games (
          id, match_id, round, participant1_id, participant2_id, 
          status, created_at, updated_at
        ) VALUES (?, ?, 1, 'team1', 'team2', 'ongoing', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `;
      
      await db.run(insertQuery, [matchGameId, matchId]);
      logger.debug(`Created match game entry ${matchGameId} for match ${matchId}`);
    } else {
      logger.debug('ensureMatchGameExists - Entry already exists, skipping creation');
    }
    logger.debug('ensureMatchGameExists - Completed successfully');
  } catch (error) {
    logger.error('Error in ensureMatchGameExists:', error);
    throw error;
  }
}

async function saveScoringModeResult(
  db: Awaited<ReturnType<typeof getDbInstance>>,
  matchGameId: string,
  result: MatchResult
): Promise<void> {
  if (result.isPositionMode && result.positionResults) {
    const pointsAwarded = await calculatePositionPoints(result.positionResults, matchGameId);
    // Legacy write
    await db.run(
      `UPDATE match_games
       SET position_results = ?, points_awarded = ?, status = 'completed',
           completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [JSON.stringify(result.positionResults), JSON.stringify(pointsAwarded), matchGameId]
    );
    // Dual-write: match_game_placements
    await savePlacementsForPosition(db, matchGameId, result.positionResults, pointsAwarded);
    logger.debug(`Saved Position match result for game ${matchGameId}:`, pointsAwarded);
  } else if (result.isFfaMode && result.participantWinnerId) {
    // Legacy write
    await db.run(
      `UPDATE match_games
       SET participant_winner_id = ?, is_ffa_mode = 1, status = 'completed',
           completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [result.participantWinnerId, matchGameId]
    );
    // Dual-write: match_game_placements
    await savePlacementsForFfa(db, matchGameId, result.participantWinnerId);
    logger.debug(`Saved FFA match result for game ${matchGameId}: participant ${result.participantWinnerId} wins`);
  } else {
    // Legacy write
    await db.run(
      `UPDATE match_games
       SET winner_id = ?, is_ffa_mode = 0, status = 'completed',
           completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [result.winner, matchGameId]
    );
    // Dual-write: match_game_placements
    await savePlacementsForNormal(db, matchGameId, result.matchId, result.winner);
    logger.debug(`Saved team match result for game ${matchGameId}: ${result.winner} wins`);
  }
}

// ── Placement writers (dual-write helpers) ─────────────────────────────────

async function savePlacementsForNormal(
  db: Awaited<ReturnType<typeof getDbInstance>>,
  matchGameId: string,
  matchId: string,
  winner: 'team1' | 'team2' | undefined
): Promise<void> {
  try {
    // Look up team IDs by order — cannot use hardcoded IDs because new matches
    // created via createMatchTeams() use genId(), not the backfill migration convention.
    const blueRow = await db.get<{ id: string }>(
      `SELECT id FROM match_teams WHERE match_id = ? AND team_order = 0 AND is_reserve = 0 LIMIT 1`, [matchId]
    );
    const redRow = await db.get<{ id: string }>(
      `SELECT id FROM match_teams WHERE match_id = ? AND team_order = 1 AND is_reserve = 0 LIMIT 1`, [matchId]
    );
    if (!blueRow || !redRow) return;

    const winnerTeamId = winner === 'team1' ? blueRow.id : redRow.id;
    const loserTeamId = winner === 'team1' ? redRow.id : blueRow.id;

    const scores = await db.get<{ score_a?: number; score_b?: number }>(
      `SELECT score_a, score_b FROM match_games WHERE id = ?`, [matchGameId]
    );
    const winnerScore = winner === 'team1' ? (scores?.score_a ?? null) : (scores?.score_b ?? null);
    const loserScore = winner === 'team1' ? (scores?.score_b ?? null) : (scores?.score_a ?? null);

    const genId = () => `mgp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`; // NOSONAR
    await db.run(
      `INSERT OR REPLACE INTO match_game_placements
       (id, match_game_id, entity_type, entity_id, position, score, is_winner)
       VALUES (?, ?, 'team', ?, 1, ?, 1)`,
      [genId(), matchGameId, winnerTeamId, winnerScore]
    );
    await db.run(
      `INSERT OR REPLACE INTO match_game_placements
       (id, match_game_id, entity_type, entity_id, position, score, is_winner)
       VALUES (?, ?, 'team', ?, 2, ?, 0)`,
      [genId(), matchGameId, loserTeamId, loserScore]
    );
  } catch (err) {
    logger.error('Error writing normal placements:', err);
  }
}

async function savePlacementsForFfa(
  db: Awaited<ReturnType<typeof getDbInstance>>,
  matchGameId: string,
  winnerParticipantId: string
): Promise<void> {
  try {
    const genId = () => `mgp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`; // NOSONAR
    await db.run(
      `INSERT OR REPLACE INTO match_game_placements
       (id, match_game_id, entity_type, entity_id, position, is_winner)
       VALUES (?, ?, 'participant', ?, 1, 1)`,
      [genId(), matchGameId, winnerParticipantId]
    );
  } catch (err) {
    logger.error('Error writing FFA placements:', err);
  }
}

async function savePlacementsForPosition(
  db: Awaited<ReturnType<typeof getDbInstance>>,
  matchGameId: string,
  positionResults: Record<string, number>,
  pointsAwarded: Record<string, number>
): Promise<void> {
  try {
    const genId = () => `mgp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`; // NOSONAR
    for (const [participantId, position] of Object.entries(positionResults)) {
      await db.run(
        `INSERT OR REPLACE INTO match_game_placements
         (id, match_game_id, entity_type, entity_id, position, points_awarded, is_winner)
         VALUES (?, ?, 'participant', ?, ?, ?, ?)`,
        [genId(), matchGameId, participantId, position, pointsAwarded[participantId] ?? 0, position === 1 ? 1 : 0]
      );
    }
  } catch (err) {
    logger.error('Error writing position placements:', err);
  }
}

async function logMapScoredFeedEvent(
  db: Awaited<ReturnType<typeof getDbInstance>>,
  matchGameId: string,
  matchId: string
): Promise<void> {
  try {
    const gameInfo = await db.get<{ name: string; round: number }>(
      `SELECT m.name, mg.round FROM match_games mg JOIN matches m ON mg.match_id = m.id WHERE mg.id = ?`,
      [matchGameId]
    );
    await logFeedEvent({
      eventType: 'map_scored',
      priority: 3,
      title: 'Map Scored',
      description: `Map ${gameInfo?.round ?? ''} of "${gameInfo?.name ?? matchGameId}" completed`,
      matchId,
      metadata: { matchGameId, round: gameInfo?.round },
    });
  } catch (feedError) {
    logger.error('Error logging map scored feed event:', feedError);
  }
}

async function handlePostSaveNotifications(
  db: Awaited<ReturnType<typeof getDbInstance>>,
  matchGameId: string,
  result: MatchResult
): Promise<boolean> {
  const matchSettings = await db.get<{ stats_enabled: number }>(
    'SELECT stats_enabled FROM matches WHERE id = ?', [result.matchId]
  );
  if (matchSettings?.stats_enabled) {
    logger.debug(`Stats-enabled match — holding Discord map notification for game ${matchGameId}`);
  } else {
    await queueScoreNotification(matchGameId, result);
    await db.run('UPDATE match_games SET discord_notified = 1 WHERE id = ?', [matchGameId]);
  }

  try {
    await db.run(
      `DELETE FROM activity_feed WHERE event_type = 'match_scoring_required' AND match_id = ?`,
      [result.matchId]
    );
  } catch (feedError) {
    logger.error('Error removing map scoring notification:', feedError);
  }

  const nextMap = await setNextMapToOngoing(result.matchId);
  if (nextMap) {
    try {
      const matchRow = await db.get<{ name: string }>('SELECT name FROM matches WHERE id = ?', [result.matchId]);
      await logFeedEvent({
        eventType: 'match_scoring_required',
        priority: 3,
        title: 'Map Scoring Required',
        description: `"${matchRow?.name ?? result.matchId}" — Map ${nextMap.round}: ${nextMap.mapName ?? 'Unknown Map'}`,
        matchId: result.matchId,
        metadata: { matchGameId: nextMap.id, round: nextMap.round, mapName: nextMap.mapName },
      });
    } catch (feedError) {
      logger.error('Error creating next map scoring notification:', feedError);
    }
  }

  return nextMap !== null;
}

/**
 * Save match result - handles team-based, FFA, and Position scoring
 */
export async function saveMatchResult(
  matchGameId: string,
  result: MatchResult
): Promise<void> {
  logger.debug('saveMatchResult - Starting with matchGameId:', matchGameId);
  logger.debug('saveMatchResult - Result:', JSON.stringify(result, null, 2));

  const db = await getDbInstance();

  try {
    await ensureMatchGameExists(matchGameId, result.matchId);
    await saveScoringModeResult(db, matchGameId, result);
    await logMapScoredFeedEvent(db, matchGameId, result.matchId);
    const hasNextMap = await handlePostSaveNotifications(db, matchGameId, result);
    const isMatchComplete = await updateMatchStatusIfComplete(matchGameId);
    await queueVoiceAnnouncementForScore(result.matchId, hasNextMap, isMatchComplete);
  } catch (error) {
    logger.error('Error in saveMatchResult:', error);
    throw error;
  }
}

/**
 * Get match result for a game — reads match_game_placements first, falls back to legacy columns.
 */
export async function getMatchResult(matchGameId: string): Promise<MatchResult | null> { // NOSONAR typescript:S3776
  const db = await getDbInstance();

  try {
    const game = await db.get<{
      match_id?: string;
      winner_id?: string;
      participant_winner_id?: string;
      is_ffa_mode?: number;
      position_results?: string;
      points_awarded?: string;
      completed_at?: string;
    }>(
      `SELECT mg.match_id, mg.winner_id, mg.participant_winner_id, mg.is_ffa_mode,
              mg.position_results, mg.points_awarded, mg.completed_at
       FROM match_games mg WHERE mg.id = ?`,
      [matchGameId]
    );

    if (!game) return null;

    // Check new placements table first
    const placements = await db.all<{ entity_type: string; entity_id: string; position?: number; is_winner: number; points_awarded?: number }>(
      `SELECT entity_type, entity_id, position, is_winner, points_awarded
       FROM match_game_placements WHERE match_game_id = ?`,
      [matchGameId]
    );

    if (placements.length > 0) {
      const winner = placements.find(p => p.is_winner);
      if (!winner) return null;

      if (winner.entity_type === 'team') {
        // Normal — map team row ID back to 'team1'/'team2' via match_teams order
        const teamRow = await db.get<{ team_order: number }>(
          `SELECT team_order FROM match_teams WHERE id = ?`, [winner.entity_id]
        );
        const winnerSide = (teamRow?.team_order ?? 0) === 0 ? 'team1' : 'team2';
        return {
          matchId: game.match_id!,
          gameId: matchGameId,
          winner: winnerSide as 'team1' | 'team2',
          isFfaMode: false,
          completedAt: new Date(game.completed_at!)
        };
      }

      // FFA or Position — participant entity
      const posEntries = placements
        .filter(p => p.entity_type === 'participant' && p.position != null)
        .sort((a, b) => (a.position ?? 99) - (b.position ?? 99));

      if (posEntries.length > 1) {
        // Position mode
        const positionResults: Record<string, number> = {};
        const pointsMap: Record<string, number> = {};
        for (const p of posEntries) {
          positionResults[p.entity_id] = p.position!;
          pointsMap[p.entity_id] = p.points_awarded ?? 0;
        }
        return {
          matchId: game.match_id!,
          gameId: matchGameId,
          winner: 'team1', // unused for Position
          isFfaMode: false,
          isPositionMode: true,
          positionResults,
          completedAt: new Date(game.completed_at!)
        };
      }

      // FFA — single winner participant
      return {
        matchId: game.match_id!,
        gameId: matchGameId,
        winner: 'team1', // unused for FFA
        participantWinnerId: winner.entity_id,
        isFfaMode: true,
        completedAt: new Date(game.completed_at!)
      };
    }

    // Fallback: legacy columns
    const isFfaMode = Boolean(game.is_ffa_mode);
    if (game.position_results) {
      return {
        matchId: game.match_id!,
        gameId: matchGameId,
        winner: 'team1',
        isFfaMode: false,
        isPositionMode: true,
        positionResults: JSON.parse(game.position_results) as Record<string, number>,
        completedAt: new Date(game.completed_at!)
      };
    }
    if (isFfaMode && !game.participant_winner_id) return null;
    if (!isFfaMode && !game.winner_id) return null;

    return {
      matchId: game.match_id!,
      gameId: matchGameId,
      winner: game.winner_id as 'team1' | 'team2',
      participantWinnerId: game.participant_winner_id,
      isFfaMode,
      completedAt: new Date(game.completed_at!)
    };
  } catch (error) {
    logger.error('Error in getMatchResult:', error);
    throw error;
  }
}

/**
 * Get a typed GameResult discriminated union for a match game.
 * Used by newer API consumers; falls back gracefully when no placements exist.
 */
export async function getGameResult(matchGameId: string): Promise<GameResult | null> {
  const db = await getDbInstance();

  try {
    const game = await db.get<{
      match_id: string;
      completed_at?: string;
      is_ffa_mode?: number;
      position_results?: string;
    }>(
      `SELECT mg.match_id, mg.completed_at, mg.is_ffa_mode, mg.position_results
       FROM match_games mg WHERE mg.id = ?`,
      [matchGameId]
    );
    if (!game) return null;

    const placements = await db.all<{
      entity_type: string;
      entity_id: string;
      position?: number;
      score?: number;
      points_awarded?: number;
      is_winner: number;
    }>(
      `SELECT entity_type, entity_id, position, score, points_awarded, is_winner
       FROM match_game_placements WHERE match_game_id = ?`,
      [matchGameId]
    );

    if (placements.length === 0) return null;

    const sample = placements[0];

    if (sample.entity_type === 'team') {
      const teamRows = await db.all<{ id: string; team_name: string; team_color?: string; team_order: number }>(
        `SELECT id, team_name, team_color, team_order FROM match_teams WHERE id IN (${placements.map(() => '?').join(',')})`,
        placements.map(p => p.entity_id)
      );
      const teamMap = Object.fromEntries(teamRows.map(t => [t.id, t]));
      const typed: TeamPlacement[] = placements.map(p => ({
        entityType: 'team' as const,
        entityId: p.entity_id,
        teamName: teamMap[p.entity_id]?.team_name ?? p.entity_id,
        teamColor: teamMap[p.entity_id]?.team_color,
        position: p.position ?? 99,
        score: p.score ?? undefined,
        isWinner: Boolean(p.is_winner),
      }));
      return { type: 'Normal', matchGameId, matchId: game.match_id, placements: typed };
    }

    // Participant placements — FFA vs Position distinguished by position count
    const participants = await db.all<{ id: string; username: string }>(
      `SELECT id, username FROM match_participants WHERE id IN (${placements.map(() => '?').join(',')})`,
      placements.map(p => p.entity_id)
    );
    const pMap = Object.fromEntries(participants.map(p => [p.id, p]));
    const hasPositions = placements.some(p => p.position != null);

    const typed: ParticipantPlacement[] = placements.map(p => ({
      entityType: 'participant' as const,
      entityId: p.entity_id,
      username: pMap[p.entity_id]?.username,
      position: p.position ?? undefined,
      score: p.score ?? undefined,
      pointsAwarded: p.points_awarded ?? undefined,
      isWinner: Boolean(p.is_winner),
    }));

    if (hasPositions && typed.filter(t => t.position != null).length > 1) {
      return { type: 'Position', matchGameId, matchId: game.match_id, placements: typed };
    }
    return { type: 'FFA', matchGameId, matchId: game.match_id, placements: typed };
  } catch (error) {
    logger.error('Error in getGameResult:', error);
    return null;
  }
}

/**
 * Set the next pending map to ongoing status
 */
async function setNextMapToOngoing(matchId: string): Promise<{ id: string; round: number; mapName: string | null } | null> {
  const db = await getDbInstance();

  try {
    // Find the first pending map and set it to ongoing
    const nextMapQuery = `
      SELECT mg.id, mg.round, mg.map_id, gm.name as map_name
      FROM match_games mg
      LEFT JOIN game_maps gm ON mg.map_id = gm.id
      WHERE mg.match_id = ? AND mg.status = 'pending'
      ORDER BY mg.round ASC
      LIMIT 1
    `;

    const nextMap = await db.get<{ id: string; round: number; map_id?: string; map_name?: string }>(nextMapQuery, [matchId]);

    if (nextMap) {
      const updateQuery = `
        UPDATE match_games
        SET status = 'ongoing', updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;

      await db.run(updateQuery, [nextMap.id]);
      logger.debug(`Set next map ${nextMap.id} to ongoing status`);

      // Resolve map name — the JOIN may miss if map_id has a custom suffix
      let mapName: string | null = nextMap.map_name ?? null;
      if (!mapName && nextMap.map_id) {
        const strippedId = nextMap.map_id.replace(/-\d+-[a-zA-Z0-9]+$/, '');
        const mapRow = await db.get<{ name: string }>('SELECT name FROM game_maps WHERE id = ?', [strippedId]);
        mapName = mapRow?.name ?? null;
      }

      // Queue map code PMs for the new map if map codes are supported
      try {
        await queueMapCodePMsForNext(matchId, mapName ?? undefined, nextMap.map_id ?? undefined);
      } catch (mapCodeError) {
        logger.error('Error queuing map code PMs for next map:', mapCodeError);
        // Don't throw - this is a non-critical operation
      }

      // Queue scorecard prompts and winner vote for the next map
      try {
        await queueScorecardPrompts(matchId, nextMap.id, mapName || '');
        await queueWinnerVote(matchId, nextMap.id, mapName || '');
      } catch (scorecardError) {
        logger.error('Error queuing scorecard prompts or winner vote for next map:', scorecardError);
      }

      return { id: nextMap.id, round: nextMap.round, mapName };
    }
      logger.debug('No pending maps found to set as ongoing');
      return null;

  } catch (error) {
    logger.error('Error setting next map to ongoing:', error);
    // Don't throw - this is a non-critical operation
    return null;
  }
}

// Queue map code PMs for the next map
async function queueMapCodePMsForNext(matchId: string, mapName?: string, mapInstanceId?: string): Promise<void> {
  logger.debug('🔍 queueMapCodePMsForNext called with:', matchId, mapName, mapInstanceId);

  if (!mapName) {
    logger.debug('No map name available for map code PMs');
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

    logger.debug('🔍 matchData:', matchData);

    if (matchData?.map_codes_supported) {
      const mapCodes = matchData.map_codes ? JSON.parse(matchData.map_codes) : {};

      // Try instance ID exact match first (map_codes keys are instance IDs like "hanamura-1776547135395-abc")
      let mapCode: string | undefined = mapInstanceId ? mapCodes[mapInstanceId] || undefined : undefined;

      // Fallback: try display name exact match
      if (!mapCode) {
        const cleanMapName = mapName.replace(/-\d+$/, '');
        mapCode = mapCodes[cleanMapName];

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
      }
      
      logger.debug('🔍 mapCodes:', mapCodes);
      logger.debug('🔍 mapInstanceId:', mapInstanceId);
      logger.debug('🔍 mapCode:', mapCode);
      
      if (mapCode) {
        // Generate unique ID for the queue entry
        const queueId = `map_codes_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`; // NOSONAR: non-security internal ID generation
        
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
          logger.error('Error fetching map name for PM queue:', error);
          // Keep original mapName as fallback
        }

        // Add to map code PM queue
        await db.run(`
          INSERT INTO discord_map_code_queue (id, match_id, map_name, map_code, status)
          VALUES (?, ?, ?, ?, 'pending')
        `, [queueId, matchId, displayMapName, mapCode]);
        
        logger.debug('📱 Map code PMs queued for next map:', mapName, 'in match:', matchId);
      } else {
        logger.debug('No map code found for map:', mapName);
      }
    }
  } catch (error) {
    logger.error('Error queuing map code PMs for next map:', error);
    throw error;
  }
}

/**
 * Queue a Discord score notification for this game result
 */
export async function queueScoreNotification(matchGameId: string, result: MatchResult): Promise<void> {
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
      logger.warning('No game data found for score notification');
      return;
    }

    // Handle FFA vs team mode differently
    let winningTeamName: string;
    let winningPlayers: string[];
    
    if (result.isFfaMode && result.participantWinnerId) {
      // FFA Mode: Get the individual winner's name
      const participantQuery = `
        SELECT username, discord_user_id
        FROM match_participants
        WHERE match_id = ? AND id = ?
      `;
      const participant = await db.get<{ username: string; discord_user_id?: string | null }>(participantQuery, [gameData.match_id, result.participantWinnerId]);

      if (participant) {
        winningTeamName = participant.username;
        winningPlayers = [participant.discord_user_id ? `<@${participant.discord_user_id}>` : participant.username];
      } else {
        winningTeamName = 'Unknown Player';
        winningPlayers = ['Unknown Player'];
      }
    } else {
      // Team Mode: Get winning team players
      winningTeamName = result.winner === 'team1' ? 'Blue Team' : 'Red Team';
      const teamAssignment = result.winner === 'team1' ? 'blue' : 'red';
      
      const playersQuery = `
        SELECT username, discord_user_id
        FROM match_participants
        WHERE match_id = ? AND team_assignment = ?
        ORDER BY username ASC
      `;

      const players = await db.all<{ username: string; discord_user_id?: string | null }>(playersQuery, [gameData.match_id, teamAssignment]);
      winningPlayers = players.map(p => p.discord_user_id ? `<@${p.discord_user_id}>` : p.username);
    }

    // Generate unique notification ID
    const notificationId = `score_notification_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`; // NOSONAR: non-security internal ID generation

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

    logger.debug(`✅ Queued score notification: ${winningTeamName} wins game ${gameData.round}`);
  } catch (error) {
    logger.error('Error queueing score notification:', error);
    // Don't throw - this is not critical for the main scoring flow
  }
}

/**
 * Get the team ID for a match (supports both tournament and regular matches)
 */
async function getMatchTeamId(
  db: Awaited<ReturnType<typeof getDbInstance>>,
  matchId: string,
  teamNumber: 1 | 2
): Promise<string | null> {
  const teamData = await db.get<{
    red_team_id?: string;
    blue_team_id?: string;
    team1_id?: string;
    team2_id?: string;
  }>(`
    SELECT m.red_team_id, m.blue_team_id, tm.team1_id, tm.team2_id
    FROM matches m
    LEFT JOIN tournament_matches tm ON m.id = tm.match_id
    WHERE m.id = ?
  `, [matchId]);

  if (teamNumber === 1) {
    return teamData?.team1_id || teamData?.red_team_id || null;
  }
  return teamData?.team2_id || teamData?.blue_team_id || null;
}

/**
 * Determine the winner of a match based on scoring_type.
 * Normal: most game wins. FFA/Position: highest cumulative points.
 */
export async function determineMatchWinner(
  db: Awaited<ReturnType<typeof getDbInstance>>,
  matchId: string
): Promise<string | null> {
  const modeRow = await db.get<{ scoring_type?: string }>(
    `SELECT gm.scoring_type FROM matches m
     LEFT JOIN game_modes gm ON gm.id = m.mode_id AND gm.game_id = m.game_id
     WHERE m.id = ?`,
    [matchId]
  );
  const scoringType = modeRow?.scoring_type ?? 'Normal';

  if (scoringType === 'FFA' || scoringType === 'Position') {
    // Winner = participant with highest total points_awarded across all games
    const result = await db.get<{ entity_id: string; total_pts: number }>(
      `SELECT mgp.entity_id, SUM(COALESCE(mgp.points_awarded, mgp.is_winner)) as total_pts
       FROM match_games mg
       JOIN match_game_placements mgp ON mgp.match_game_id = mg.id
       WHERE mg.match_id = ? AND mg.status = 'completed' AND mgp.entity_type = 'participant'
       GROUP BY mgp.entity_id
       ORDER BY total_pts DESC LIMIT 1`,
      [matchId]
    );
    return result?.entity_id ?? null;
  }

  // Normal — try placements first
  const placResult = await db.get<{ team1_wins: number; team2_wins: number; total: number }>(
    `SELECT
       SUM(CASE WHEN mt.team_order = 0 AND mgp.is_winner = 1 THEN 1 ELSE 0 END) as team1_wins,
       SUM(CASE WHEN mt.team_order = 1 AND mgp.is_winner = 1 THEN 1 ELSE 0 END) as team2_wins,
       COUNT(DISTINCT mgp.match_game_id) as total
     FROM match_games mg
     JOIN match_game_placements mgp ON mgp.match_game_id = mg.id
     JOIN match_teams mt ON mt.id = mgp.entity_id
     WHERE mg.match_id = ? AND mg.status = 'completed' AND mgp.entity_type = 'team'`,
    [matchId]
  );

  if (placResult && placResult.total > 0) {
    if (placResult.team1_wins > placResult.team2_wins) return await getMatchTeamId(db, matchId, 1);
    if (placResult.team2_wins > placResult.team1_wins) return await getMatchTeamId(db, matchId, 2);
    return null;
  }

  // Legacy fallback
  const winResult = await db.get<{ team1_wins: number; team2_wins: number; total_normal_games: number }>(
    `SELECT COUNT(*) as total_normal_games,
            SUM(CASE WHEN mg.winner_id = 'team1' THEN 1 ELSE 0 END) as team1_wins,
            SUM(CASE WHEN mg.winner_id = 'team2' THEN 1 ELSE 0 END) as team2_wins
     FROM match_games mg
     WHERE mg.match_id = ? AND mg.status = 'completed'
       AND (mg.is_ffa_mode = 0 OR mg.is_ffa_mode IS NULL) AND mg.winner_id IS NOT NULL`,
    [matchId]
  );

  if (!winResult || winResult.total_normal_games === 0) return null;
  if (winResult.team1_wins > winResult.team2_wins) return await getMatchTeamId(db, matchId, 1);
  if (winResult.team2_wins > winResult.team1_wins) return await getMatchTeamId(db, matchId, 2);
  return null;
}

/**
 * Check if all games in a match are completed
 */
export async function areAllGamesCompleted(
  db: Awaited<ReturnType<typeof getDbInstance>>,
  matchId: string
): Promise<boolean> {
  const statusQuery = `
    SELECT COUNT(*) as total,
           SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
    FROM match_games
    WHERE match_id = ?
  `;

  const statusResult = await db.get<{ total: number; completed: number }>(statusQuery, [matchId]);
  return statusResult !== undefined && statusResult.total > 0 && statusResult.completed === statusResult.total;
}

/**
 * Update match status to complete if all games are scored
 */
async function updateMatchStatusIfComplete(matchGameId: string): Promise<boolean> {
  const db = await getDbInstance();

  try {
    // Get the match ID for this game
    const matchRow = await db.get<{ match_id?: string }>(
      'SELECT match_id FROM match_games WHERE id = ?',
      [matchGameId]
    );
    const matchId = matchRow?.match_id;

    if (!matchId) return false;

    // Check if all games in this match are completed
    const allGamesCompleted = await areAllGamesCompleted(db, matchId);
    if (!allGamesCompleted) {
      return false;
    }

    // Determine the match winner
    const winnerTeam = await determineMatchWinner(db, matchId);

    // Update match status
    await db.run(
      'UPDATE matches SET status = \'complete\', winner_team = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [winnerTeam, matchId]
    );

    logger.debug(`Match ${matchId} marked as complete with winner: ${winnerTeam || 'tie/none'}`);

    // Queue post-match operations
    await queueMatchWinnerNotification(matchId);
    await queueDiscordDeletion(matchId);

    // Queue stats aggregation and image generation
    try {
      await queueStatsAggregation(matchId);
    } catch (statsError) {
      logger.error('Error queuing stats aggregation:', statsError);
    }

    // Queue stats report DMs if all submissions are already in a final state
    try {
      await queueStatsReportDMs(matchId);
    } catch (statsReportError) {
      logger.error('Error queuing stats report DMs:', statsReportError);
    }

    // Clean up voice channels
    await deleteMatchVoiceChannels(matchId);

    return true;
  } catch (error) {
    logger.error('Error updating match status:', error);
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
      logger.warning('Match not found for voice announcement:', matchId);
      return;
    }

    // Skip if no voice channels are configured
    if (!match.blue_team_voice_channel && !match.red_team_voice_channel) {
      logger.debug('📢 No voice channels configured for match:', matchId);
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
      logger.warning('No next map but match not complete for:', matchId);
      return;
    }

    // Determine which team should go first (alternating)
    const lastAlternation = await db.get<{ last_first_team: string }>(`
      SELECT last_first_team FROM match_voice_alternation WHERE match_id = ?
    `, [matchId]);

    const firstTeam = !lastAlternation || lastAlternation.last_first_team === 'red' ? 'blue' : 'red';

    // Generate unique announcement ID
    const announcementId = `voice_announcement_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`; // NOSONAR: non-security internal ID generation
    
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
    
    logger.debug(`🔊 Voice announcement queued for match ${matchId}: ${announcementType}, starting with ${firstTeam} team`);
  } catch (error) {
    logger.error('❌ Error queuing voice announcement for score:', error);
    // Don't throw - this is not critical for the main scoring flow
  }
}

/**
 * Get overall position-based scores for a match
 */
export async function getOverallPositionScore(matchId: string): Promise<{
  participantScores: Record<string, { username: string; totalPoints: number; races: number }>;
  winner: string | null;
}> {
  const db = await getDbInstance();

  try {
    const query = `
      SELECT mg.points_awarded, mg.position_results
      FROM match_games mg
      WHERE mg.match_id = ?
        AND mg.status = 'completed'
        AND mg.points_awarded IS NOT NULL
    `;

    const games = await db.all<{
      points_awarded: string;
      position_results: string;
    }>(query, [matchId]);

    // Aggregate points across all races
    const participantScores: Record<string, { username: string; totalPoints: number; races: number }> = {};

    for (const game of games) {
      const pointsAwarded = JSON.parse(game.points_awarded) as Record<string, number>;

      for (const [participantId, points] of Object.entries(pointsAwarded)) {
        if (!participantScores[participantId]) {
          // Get participant username
          const participantQuery = `SELECT username FROM match_participants WHERE id = ?`;
          const participant = await db.get<{ username: string }>(participantQuery, [participantId]);

          participantScores[participantId] = {
            username: participant?.username || 'Unknown',
            totalPoints: 0,
            races: 0
          };
        }

        participantScores[participantId].totalPoints += points;
        participantScores[participantId].races += 1;
      }
    }

    // Determine winner (participant with highest total points)
    let winner: string | null = null;
    let highestPoints = -1;

    for (const [participantId, data] of Object.entries(participantScores)) {
      if (data.totalPoints > highestPoints) {
        highestPoints = data.totalPoints;
        winner = participantId;
      } else if (data.totalPoints === highestPoints) {
        winner = null; // Tie
      }
    }

    return {
      participantScores,
      winner
    };
  } catch (error) {
    logger.error('Error getting overall position score:', error);
    return {
      participantScores: {},
      winner: null
    };
  }
}

/**
 * Get overall match score — branches on scoring_type.
 * Normal: returns team win counts.
 * FFA/Position: returns null overallWinner (use getOverallPositionScore for those).
 */
export async function getOverallMatchScore(matchId: string): Promise<{
  team1Wins: number;
  team2Wins: number;
  totalNormalGames: number;
  overallWinner: 'team1' | 'team2' | 'tie' | null;
  scoringType: string;
}> {
  const db = await getDbInstance();

  try {
    const modeRow = await db.get<{ scoring_type?: string }>(
      `SELECT gm.scoring_type FROM matches m
       LEFT JOIN game_modes gm ON gm.id = m.mode_id AND gm.game_id = m.game_id
       WHERE m.id = ?`,
      [matchId]
    );
    const scoringType = modeRow?.scoring_type ?? 'Normal';

    if (scoringType !== 'Normal') {
      return { team1Wins: 0, team2Wins: 0, totalNormalGames: 0, overallWinner: null, scoringType };
    }

    // Try new placements table first
    const placementResult = await db.get<{ team1_wins: number; team2_wins: number; total: number }>(
      `SELECT
         SUM(CASE WHEN mt.team_order = 0 AND mgp.is_winner = 1 THEN 1 ELSE 0 END) as team1_wins,
         SUM(CASE WHEN mt.team_order = 1 AND mgp.is_winner = 1 THEN 1 ELSE 0 END) as team2_wins,
         COUNT(DISTINCT mgp.match_game_id) as total
       FROM match_games mg
       JOIN match_game_placements mgp ON mgp.match_game_id = mg.id
       JOIN match_teams mt ON mt.id = mgp.entity_id
       WHERE mg.match_id = ? AND mg.status = 'completed' AND mgp.entity_type = 'team'`,
      [matchId]
    );

    if (placementResult && placementResult.total > 0) {
      const team1Wins = placementResult.team1_wins || 0;
      const team2Wins = placementResult.team2_wins || 0;
      const totalNormalGames = placementResult.total || 0;
      const overallWinner: 'team1' | 'team2' | 'tie' | null =
        totalNormalGames === 0 ? null :
        team1Wins > team2Wins ? 'team1' :
        team2Wins > team1Wins ? 'team2' : 'tie';
      return { team1Wins, team2Wins, totalNormalGames, overallWinner, scoringType };
    }

    // Fallback: legacy columns
    const result = await db.get<{ total_normal_games: number; team1_wins: number; team2_wins: number }>(
      `SELECT COUNT(*) as total_normal_games,
              SUM(CASE WHEN mg.winner_id = 'team1' THEN 1 ELSE 0 END) as team1_wins,
              SUM(CASE WHEN mg.winner_id = 'team2' THEN 1 ELSE 0 END) as team2_wins
       FROM match_games mg
       WHERE mg.match_id = ? AND mg.status = 'completed'
         AND (mg.is_ffa_mode = 0 OR mg.is_ffa_mode IS NULL)
         AND mg.winner_id IS NOT NULL`,
      [matchId]
    );

    const team1Wins = result?.team1_wins || 0;
    const team2Wins = result?.team2_wins || 0;
    const totalNormalGames = result?.total_normal_games || 0;
    const overallWinner: 'team1' | 'team2' | 'tie' | null =
      totalNormalGames === 0 ? null :
      team1Wins > team2Wins ? 'team1' :
      team2Wins > team1Wins ? 'team2' : 'tie';

    return { team1Wins, team2Wins, totalNormalGames, overallWinner, scoringType };
  } catch (error) {
    logger.error('Error getting overall match score:', error);
    return { team1Wins: 0, team2Wins: 0, totalNormalGames: 0, overallWinner: null, scoringType: 'Normal' };
  }
}

/**
 * Get match games with results — returns new placements shape alongside legacy fields.
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
  placements?: Array<{
    entityType: string;
    entityId: string;
    position?: number;
    score?: number;
    pointsAwarded?: number;
    isWinner: boolean;
    teamName?: string;
    username?: string;
  }>;
}>> {
  const db = await getDbInstance();

  try {
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
    }>(
      `SELECT mg.id, mg.round, mg.winner_id, mg.participant_winner_id, mg.is_ffa_mode, mg.status,
              gm.name as map_name, gamemode.scoring_type as mode_scoring_type,
              mp.username as participant_winner_name
       FROM match_games mg
       LEFT JOIN game_maps gm ON mg.map_id = gm.id
       LEFT JOIN game_modes gamemode ON gm.mode_id = gamemode.id AND gm.game_id = gamemode.game_id
       LEFT JOIN match_participants mp ON mg.participant_winner_id = mp.id
       WHERE mg.match_id = ? ORDER BY mg.round ASC`,
      [matchId]
    );

    // Enrich each game with placements if available
    const enriched = await Promise.all(games.map(async game => {
      const placements = await db.all<{
        entity_type: string; entity_id: string; position?: number;
        score?: number; points_awarded?: number; is_winner: number;
      }>(
        `SELECT entity_type, entity_id, position, score, points_awarded, is_winner
         FROM match_game_placements WHERE match_game_id = ? ORDER BY position ASC`,
        [game.id]
      );

      let placementsEnriched: Array<{
        entityType: string; entityId: string;
        position?: number; score?: number; pointsAwarded?: number;
        isWinner: boolean; teamName?: string; username?: string;
      }> = [];
      if (placements.length > 0) {
        // Fetch team/participant names
        const teamIds = placements.filter(p => p.entity_type === 'team').map(p => p.entity_id);
        const participantIds = placements.filter(p => p.entity_type === 'participant').map(p => p.entity_id);
        const teamMap: Record<string, string> = {};
        const participantMap: Record<string, string> = {};
        if (teamIds.length > 0) {
          const rows = await db.all<{ id: string; team_name: string }>(
            `SELECT id, team_name FROM match_teams WHERE id IN (${teamIds.map(() => '?').join(',')})`, teamIds
          );
          for (const r of rows) teamMap[r.id] = r.team_name;
        }
        if (participantIds.length > 0) {
          const rows = await db.all<{ id: string; username: string }>(
            `SELECT id, username FROM match_participants WHERE id IN (${participantIds.map(() => '?').join(',')})`, participantIds
          );
          for (const r of rows) participantMap[r.id] = r.username;
        }
        placementsEnriched = placements.map(p => ({
          entityType: p.entity_type,
          entityId: p.entity_id,
          position: p.position ?? undefined,
          score: p.score ?? undefined,
          pointsAwarded: p.points_awarded ?? undefined,
          isWinner: Boolean(p.is_winner),
          teamName: p.entity_type === 'team' ? teamMap[p.entity_id] : undefined,
          username: p.entity_type === 'participant' ? participantMap[p.entity_id] : undefined,
        }));
      }

      return {
        ...game,
        is_ffa_mode: Boolean(game.is_ffa_mode),
        placements: placementsEnriched.length > 0 ? placementsEnriched : undefined,
      };
    }));

    return enriched;
  } catch (error) {
    logger.error('Error getting match games with results:', error);
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
      logger.warning('Match not found for winner notification:', matchId);
      return;
    }

    // Get overall match score
    const scoreData = await getOverallMatchScore(matchId);
    
    if (scoreData.totalNormalGames === 0) {
      logger.warning('No completed normal games found for match winner notification:', matchId);
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
      const players = await db.all<{ username: string; discord_user_id?: string | null }>(`
        SELECT username, discord_user_id
        FROM match_participants
        WHERE match_id = ? AND team_assignment = ?
        ORDER BY username ASC
      `, [matchId, teamAssignment]);

      winningPlayers = players.map(p => p.discord_user_id ? `<@${p.discord_user_id}>` : p.username);
    }

    // Generate unique notification ID
    const notificationId = `match_winner_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`; // NOSONAR: non-security internal ID generation

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

    logger.debug(`🏆 Match winner notification queued: ${winningTeamName} wins ${matchData.name} (${scoreData.team1Wins}-${scoreData.team2Wins})`);
  } catch (error) {
    logger.error('❌ Error queuing match winner notification:', error);
    // Don't throw - this is not critical for the main scoring flow
  }
}

/**
 * Queue Discord deletion for match announcements and events when match completes
 */
async function queueScorecardPrompts(matchId: string, matchGameId: string, mapName: string): Promise<void> {
  try {
    const db = await getDbInstance();

    const statsSettings = await db.get<{ enabled: number }>('SELECT enabled FROM stats_settings WHERE id = 1');
    if (!statsSettings?.enabled) return;

    const match = await db.get<{ game_id: string }>('SELECT game_id FROM matches WHERE id = ?', [matchId]);
    if (!match) return;

    const statDefs = await db.get<{ cnt: number }>('SELECT COUNT(*) as cnt FROM game_stat_definitions WHERE game_id = ?', [match.game_id]);
    if (!statDefs || statDefs.cnt === 0) return;

    const queueId = `scorecard_prompt_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`; // NOSONAR: non-security internal ID generation
    await db.run(
      'INSERT INTO discord_scorecard_prompt_queue (id, match_id, match_game_id, map_name, status) VALUES (?, ?, ?, ?, ?)',
      [queueId, matchId, matchGameId, mapName, 'pending']
    );
    logger.debug(`📸 Scorecard prompt queued for match ${matchId}, game ${matchGameId}`);
  } catch (error) {
    logger.error('Error queuing scorecard prompts:', error);
  }
}

async function queueWinnerVote(matchId: string, matchGameId: string, mapName: string): Promise<void> {
  try {
    const db = await getDbInstance();

    // Check winner vote is enabled in Discord settings
    const discordSettings = await db.get<{ winner_vote_enabled: number }>(
      'SELECT winner_vote_enabled FROM discord_settings WHERE id = 1'
    );
    if (!discordSettings?.winner_vote_enabled) {
      logger.debug(`⏭️ Winner vote skipped for match ${matchId}: winner_vote_enabled is disabled`);
      return;
    }

    // Check that at least one commander exists before queuing
    const commanderCount = await db.get<{ cnt: number }>(
      'SELECT COUNT(*) as cnt FROM match_participants WHERE match_id = ? AND receives_map_codes = 1 AND discord_user_id IS NOT NULL',
      [matchId]
    );
    if (!commanderCount || commanderCount.cnt === 0) {
      logger.debug(`⏭️ Winner vote skipped for match ${matchId}: no eligible commanders`);
      return;
    }

    const queueId = `winner_vote_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`; // NOSONAR: non-security internal ID generation
    await db.run(
      'INSERT INTO discord_winner_vote_queue (id, match_id, match_game_id, map_name, status) VALUES (?, ?, ?, ?, ?)',
      [queueId, matchId, matchGameId, mapName, 'pending']
    );
    logger.debug(`🗳️ Winner vote queued for match ${matchId}, game ${matchGameId}`);
  } catch (error) {
    logger.error('Error queuing winner vote:', error);
  }
}

async function queueStatsAggregation(matchId: string): Promise<void> {
  try {
    const db = await getDbInstance();

    const statsSettings = await db.get<{ enabled: number }>('SELECT enabled FROM stats_settings WHERE id = 1');
    if (!statsSettings?.enabled) return;

    const count = await db.get<{ cnt: number }>(
      "SELECT COUNT(*) as cnt FROM scorecard_submissions WHERE match_id = ? AND review_status IN ('approved', 'auto_approved')",
      [matchId]
    );
    if (!count || count.cnt === 0) return;

    const queueId = `stats_image_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`; // NOSONAR: non-security internal ID generation
    await db.run('INSERT INTO stats_image_queue (id, match_id, status) VALUES (?, ?, ?)', [queueId, matchId, 'pending']);
    logger.debug(`📊 Stats aggregation queued for completed match ${matchId}`);
  } catch (error) {
    logger.error('Error queuing stats aggregation:', error);
  }
}

async function queueStatsReportDMs(matchId: string): Promise<void> {
  const db = await getDbInstance();
  const pending = await db.get<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM scorecard_submissions
     WHERE match_id = ? AND review_status NOT IN ('approved', 'rejected', 'auto_approved', 'failed')`,
    [matchId]
  );
  if (pending && pending.cnt > 0) {
    logger.debug(`📊 Stats report DMs deferred for match ${matchId} — ${pending.cnt} submission(s) still pending review`);
    return;
  }
  const queueId = `stats_report_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`; // NOSONAR: non-security internal ID generation
  await db.run(
    `INSERT INTO discord_stats_report_queue (id, match_id) VALUES (?, ?) ON CONFLICT(match_id) DO NOTHING`,
    [queueId, matchId]
  );
  logger.debug(`📊 Stats report DMs queued for completed match ${matchId}`);
}

export async function queueDiscordDeletion(matchId: string): Promise<void> {
  try {
    const db = await getDbInstance();
    
    // Generate unique deletion ID
    const deletionId = `completion_deletion_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`; // NOSONAR: non-security internal ID generation
    
    // Insert into Discord deletion queue
    await db.run(`
      INSERT INTO discord_deletion_queue (id, match_id, status)
      VALUES (?, ?, 'pending')
    `, [deletionId, matchId]);
    
    logger.debug(`🗑️ Discord deletion queued for completed match: ${matchId}`);
  } catch (error) {
    logger.error('❌ Error queuing Discord deletion for completed match:', error);
    // Don't throw - this is not critical for the main scoring flow
  }
}