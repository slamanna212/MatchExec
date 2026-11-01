/** Map-code lookups and the map-code DM queue for a match's first map. */
import { eq } from 'drizzle-orm';
import type { Executor } from '../../../lib/db';
import { matches } from '../../../lib/db/schema';
import { logger } from '../logger';
import { enqueueMapCode } from '../discord-queues';
import { findMapByIdOrName, gameSupportsMapCodes } from '../games';
import { cleanMapId } from '../utils/map-utils';
import { mapIdsOf } from './games';

const normalize = (str: string): string => str.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export const MapCodeService = {
  /** Map code with a triple fallback: exact key, then case/diacritics-insensitive key. */
  findMapCode(mapId: string, mapCodes: Record<string, string>): string | null {
    if (mapCodes[mapId]) return mapCodes[mapId];
    const target = normalize(mapId);
    const key = Object.keys(mapCodes).find((k) => normalize(k) === target);
    return key ? mapCodes[key] : null;
  },

  /** Queue the map-code DMs for one map. Map codes are keyed by instance id ("antarctic-peninsula-1776547135395-abc"). */
  async processMapCode(ex: Executor, matchId: string, gameId: string, mapId: string, mapCodes: Record<string, string>): Promise<boolean> {
    try {
      const baseMapId = cleanMapId(mapId);
      let mapName = baseMapId;
      try {
        mapName = (await findMapByIdOrName(ex, gameId, baseMapId))?.name || baseMapId;
      } catch (error) {
        logger.error('Error fetching map name:', error);
      }
      const mapCode = this.findMapCode(mapId, mapCodes);
      if (!mapCode) {
        logger.debug(`No map code found for map "${mapName}" (ID: ${baseMapId}) in match ${matchId}`);
        return false;
      }
      await enqueueMapCode(ex, { matchId, mapName, mapCode });
      return true;
    } catch (error) {
      logger.error('Error processing map code:', error);
      return false;
    }
  },

  /** Queue the first map's code (called when the match enters battle). */
  async processFirstMapCode(ex: Executor, matchId: string): Promise<boolean> {
    try {
      const [match] = await ex.select({ game_id: matches.game_id, maps: matches.maps, map_codes: matches.map_codes }).from(matches).where(eq(matches.id, matchId));
      if (!match || !(await gameSupportsMapCodes(ex, match.game_id))) {
        logger.debug(`Map codes not supported for match ${matchId}`);
        return false;
      }
      const maps = mapIdsOf(match.maps);
      if (maps.length === 0) return false;
      return await this.processMapCode(ex, matchId, match.game_id, maps[0], match.map_codes ?? {});
    } catch (error) {
      logger.error('Error processing first map code:', error);
      return false;
    }
  },
};
