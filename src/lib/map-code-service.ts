import { getDbInstance } from './database-init';
import { logger } from './logger';

/**
 * Service for handling map code operations and lookups
 */
export class MapCodeService {
  /**
   * Normalizes a string by converting to lowercase and removing diacritics
   */
  private static normalizeString(str: string): string {
    return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  /**
   * Looks up a map code with triple-fallback logic:
   * 1. Exact match
   * 2. Case-insensitive match
   * 3. Normalized match (removing diacritics)
   */
  private static findMapCode(mapId: string, mapCodes: Record<string, string>): string | null {
    // Try exact match first
    if (mapCodes[mapId]) {
      return mapCodes[mapId];
    }

    // Try case-insensitive and normalized lookup
    const normalizedMapId = this.normalizeString(mapId);
    const mapCodeKey = Object.keys(mapCodes).find(key =>
      this.normalizeString(key) === normalizedMapId
    );

    return mapCodeKey ? mapCodes[mapCodeKey] : null;
  }

  /**
   * Gets the map name from the database, with fallback to map ID
   */
  private static async getMapName(gameId: string, mapId: string): Promise<string> {
    try {
      const db = await getDbInstance();
      const mapNameData = await db.get<{ name: string }>(`
        SELECT name FROM game_maps
        WHERE game_id = ? AND (id = ? OR LOWER(name) LIKE LOWER(?))
        LIMIT 1
      `, [gameId, mapId, `%${mapId}%`]);

      return mapNameData?.name || mapId;
    } catch (error) {
      logger.error('Error fetching map name:', error);
      return mapId; // Fallback to ID
    }
  }

  /**
   * Queues map code PMs for a specific map
   */
  private static async queueMapCodePM(matchId: string, mapName: string, mapCode: string): Promise<boolean> {
    try {
      const db = await getDbInstance();

      // Generate unique ID for the queue entry
      const queueId = `map_codes_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

      // Add to map code PM queue
      await db.run(`
        INSERT INTO discord_map_code_queue (id, match_id, map_name, map_code, status)
        VALUES (?, ?, ?, ?, 'pending')
      `, [queueId, matchId, mapName, mapCode]);

      logger.debug(`📱 Map code PMs queued for match ${matchId}, map: ${mapName}`);
      return true;
    } catch (error) {
      logger.error('❌ Error queuing map code PMs:', error);
      return false;
    }
  }

  /**
   * Processes and queues map code for a specific map in a match
   */
  public static async processMapCode(
    matchId: string,
    gameId: string,
    mapId: string,
    mapCodes: Record<string, string>
  ): Promise<boolean> {
    try {
      // Remove any instance suffix from map ID (e.g., "map-1" -> "map")
      const cleanMapId = mapId.replace(/-\d+$/, '');

      // Get the actual map name from database
      const mapName = await this.getMapName(gameId, cleanMapId);

      // Find map code with triple-fallback logic
      const mapCode = this.findMapCode(cleanMapId, mapCodes);

      if (!mapCode) {
        logger.debug(`ℹ️ No map code found for map "${mapName}" (ID: ${cleanMapId}) in match ${matchId}`);
        return false;
      }

      // Queue the map code PM
      const success = await this.queueMapCodePM(matchId, mapName, mapCode);

      if (success) {
        logger.debug(`✅ Map code processed and queued for map "${mapName}" in match ${matchId}`);
      }

      return success;
    } catch (error) {
      logger.error('❌ Error processing map code:', error);
      return false;
    }
  }

  /**
   * Processes the first map's code for a match (called when match enters battle state)
   */
  public static async processFirstMapCode(matchId: string): Promise<boolean> {
    try {
      const db = await getDbInstance();

      // Get match data to check if map codes are supported
      const matchWithGame = await db.get<{
        game_id: string;
        maps?: string;
        map_codes?: string;
        map_codes_supported?: number;
      }>(`
        SELECT m.game_id, m.maps, m.map_codes, g.map_codes_supported
        FROM matches m
        LEFT JOIN games g ON m.game_id = g.id
        WHERE m.id = ?
      `, [matchId]);

      if (!matchWithGame?.map_codes_supported) {
        logger.debug(`ℹ️ Map codes not supported for match ${matchId}`);
        return false;
      }

      const maps = matchWithGame.maps ? JSON.parse(matchWithGame.maps) : [];
      const mapCodes = matchWithGame.map_codes ? JSON.parse(matchWithGame.map_codes) : {};

      if (maps.length === 0) {
        logger.debug(`ℹ️ No maps configured for match ${matchId}`);
        return false;
      }

      // Process the first map
      const firstMapId = maps[0];
      return await this.processMapCode(matchId, matchWithGame.game_id, firstMapId, mapCodes);

    } catch (error) {
      logger.error('❌ Error processing first map code:', error);
      return false;
    }
  }
}
