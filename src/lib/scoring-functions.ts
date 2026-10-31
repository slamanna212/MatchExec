import { getDbInstance } from './database-init';
import { logger } from '@/lib/logger';
import { deleteMatchVoiceChannels } from './voice-channel-manager';
import { logFeedEvent } from './feed-helpers';
import { withTransaction } from './transaction';
import { cleanMapId } from './utils/map-utils';
import { db as pgDb } from '../../lib/db';
import {
  countStatDefinitions, findMapByIdOrName, getGameScoringConfig, getMap, getMapModeScoringType, getModeScoringType,
  listMapsWithModeScoring,
} from './games';
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
  return config?.pointsPerPosition?.[position.toString()] ?? 0;
}

/**
 * Points spread used when neither the match, its tournament, nor the game defines one
 * (F1-style top 10). Without it every Position result would award 0 and tie.
 */
export const DEFAULT_POSITION_SPREAD: Record<string, number> = {
  '1': 25, '2': 18, '3': 15, '4': 12, '5': 10, '6': 8, '7': 6, '8': 4, '9': 2, '10': 1,
};

/**
 * Parse a stored spread into a PositionScoringConfig. Accepts the
 * `{ type, pointsPerPosition }` form (games, tournaments) and the flat
 * `{ "1": 25, ... }` form (per-match override from the create form). Missing or
 * malformed input falls back to DEFAULT_POSITION_SPREAD.
 */
export function parsePositionScoringConfig(raw: string | null | undefined): PositionScoringConfig {
  const fallback: PositionScoringConfig = { type: 'Position', pointsPerPosition: DEFAULT_POSITION_SPREAD };
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return fallback;
    const record = parsed as Record<string, unknown>;
    const spread = (record.pointsPerPosition ?? record) as Record<string, unknown>;
    const entries = Object.entries(spread);
    const valid = typeof spread === 'object' && spread !== null && entries.length > 0 &&
      entries.every(([pos, pts]) => /^[1-9]\d*$/.test(pos) && typeof pts === 'number' && Number.isFinite(pts));
    if (!valid) {
      logger.error('Malformed position scoring spread, using default spread');
      return fallback;
    }
    return { type: 'Position', pointsPerPosition: spread as Record<string, number> };
  } catch {
    logger.error('Unparseable position scoring spread, using default spread');
    return fallback;
  }
}

/**
 * Look up a match_teams.team_name by ID.
 */
export async function getTeamName(teamId: string): Promise<string | null> {
  const db = await getDbInstance();
  const row = await db.get<{ team_name: string }>(`SELECT team_name FROM match_teams WHERE id = ?`, [teamId]);
  return row?.team_name ?? null;
}

interface MapLookupRow {
  id: string;
  name: string;
  image_url?: string | null;
  mode_id?: string | null;
  game_id: string;
  mode_scoring_type?: string | null;
}

/**
 * Look up game_maps rows for a set of (possibly instance-suffixed) map IDs, keyed by
 * clean map ID. Always scoped to gameId: map IDs are only unique per game (e.g.
 * "midtown" exists in both Overwatch 2 and Marvel Rivals).
 */
async function lookupMaps(
  db: Awaited<ReturnType<typeof getDbInstance>>,
  gameId: string,
  mapIds: Array<string | null | undefined>
): Promise<Record<string, MapLookupRow>> {
  const cleanIds = [...new Set(mapIds.filter((id): id is string => !!id).map(cleanMapId))];
  if (!gameId || cleanIds.length === 0) return {};
  const rows: MapLookupRow[] = await listMapsWithModeScoring(pgDb, gameId, cleanIds);
  return Object.fromEntries(rows.map(r => [r.id, r]));
}

/** Display name of a match's (possibly instance-suffixed) map, scoped to the match's game. */
async function lookupMapName(
  db: Awaited<ReturnType<typeof getDbInstance>>,
  matchId: string,
  mapId: string | null | undefined
): Promise<string | null> {
  if (!mapId) return null;
  // The match lives in the legacy database until the matches domain is ported; game data is in Postgres.
  const match = await db.get<{ game_id: string }>('SELECT game_id FROM matches WHERE id = ?', [matchId]);
  if (!match) return null;
  const row = await getMap(pgDb, match.game_id, cleanMapId(mapId));
  return row?.name ?? null;
}

/**
 * Resolve a match's position points spread, honouring the 3-level override chain:
 * match-level position_scoring_override → tournament-level position_scoring_override
 * (if the match belongs to a tournament) → game scoring_config default.
 */
export async function resolvePositionScoringConfig(
  db: Awaited<ReturnType<typeof getDbInstance>>,
  matchId: string
): Promise<PositionScoringConfig> {
  const row = await db.get<{ game_id: string; position_scoring_override?: string; tournament_scoring_override?: string }>(
    `SELECT m.game_id, m.position_scoring_override, t.position_scoring_override as tournament_scoring_override
     FROM matches m
     LEFT JOIN tournaments t ON m.tournament_id = t.id
     WHERE m.id = ?`,
    [matchId]
  );
  let raw = row?.position_scoring_override ?? row?.tournament_scoring_override;
  if (raw === undefined || raw === null) {
    // Game default (typed jsonb in Postgres); the override parser takes the serialised form.
    const gameConfig = row ? await getGameScoringConfig(pgDb, row.game_id) : null;
    raw = gameConfig ? JSON.stringify(gameConfig) : undefined;
  }
  return parsePositionScoringConfig(raw);
}

/**
 * Resolve position points for a match via resolvePositionScoringConfig.
 */
export async function getPointsForPositionByMatchId(position: number, matchId: string): Promise<number> {
  const db = await getDbInstance();
  return getPointsForPosition(position, await resolvePositionScoringConfig(db, matchId));
}

/**
 * Calculate points awarded for position results, using the match's spread
 * (see resolvePositionScoringConfig).
 * @param positionResults - participantId → 1-based position
 * @param matchGameId - match_games.id (used to resolve the match and its overrides)
 */
export async function calculatePositionPoints(
  positionResults: Record<string, number>,
  matchGameId: string
): Promise<Record<string, number>> {
  const db = await getDbInstance();

  try {
    const game = await db.get<{ match_id: string }>(`SELECT match_id FROM match_games WHERE id = ?`, [matchGameId]);
    const config = game
      ? await resolvePositionScoringConfig(db, game.match_id)
      : parsePositionScoringConfig(null);

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

    const mapName = (await lookupMapName(db, matchId, firstGame.map_id)) || firstGame.map_id;

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
    const mapLookup = await lookupMaps(db, gameId, games.map(g => g.map_id as string | null));

    // Enrich each game with its map data
    for (const game of games) {
      const mapData = mapLookup[cleanMapId(String(game.map_id || ''))];
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

type Db = Awaited<ReturnType<typeof getDbInstance>>;

/**
 * Ensure a match_games entry exists for the given match game ID.
 *
 * Only creates a row for ids following the `${matchId}_game_N` convention used by
 * initializeMatchGames (and only when the match exists); any other unknown id throws
 * so arbitrary/foreign ids can never mint rows. An existing row must belong to matchId.
 */
async function ensureMatchGameExists(matchGameId: string, matchId: string): Promise<void> {
  const db = await getDbInstance();

  const row = await db.get<{ id: string; match_id: string }>(
    `SELECT id, match_id FROM match_games WHERE id = ?`, [matchGameId]
  );
  if (row) {
    if (row.match_id !== matchId) {
      throw new Error(`Game ${matchGameId} does not belong to match ${matchId}`);
    }
    return;
  }

  const prefix = `${matchId}_game_`;
  const roundSuffix = matchGameId.startsWith(prefix) ? matchGameId.slice(prefix.length) : '';
  if (!/^[1-9]\d*$/.test(roundSuffix)) {
    throw new Error(`Game ${matchGameId} not found for match ${matchId}`);
  }
  const round = Number(roundSuffix);

  const matchRow = await db.get<{ id: string; maps?: string | null }>(`SELECT id, maps FROM matches WHERE id = ?`, [matchId]);
  if (!matchRow) {
    throw new Error(`Match ${matchId} not found`);
  }

  // Mirror initializeMatchGames: game N plays the match's Nth map.
  let mapId: string | null = null;
  try {
    const maps = matchRow.maps ? JSON.parse(matchRow.maps) as unknown : null;
    if (Array.isArray(maps) && typeof maps[round - 1] === 'string') mapId = maps[round - 1] as string;
  } catch {
    logger.warning(`Malformed maps JSON for match ${matchId}; creating game ${matchGameId} without a map`);
  }

  await db.run(
    `INSERT INTO match_games (
       id, match_id, round, participant1_id, participant2_id,
       map_id, status, created_at, updated_at
     ) VALUES (?, ?, ?, 'team1', 'team2', ?, 'ongoing', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [matchGameId, matchId, round, mapId]
  );
  logger.debug(`Created match game entry ${matchGameId} (round ${round}) for match ${matchId}`);
}

/**
 * Resolve the scoring_type for a match game from its map's mode (as getMatchGames does),
 * falling back to the match's own mode. Returns null when it cannot be determined.
 */
export async function getScoringTypeForGame(
  db: Db,
  matchGameId: string
): Promise<'Normal' | 'FFA' | 'Position' | null> {
  const row = await db.get<{ map_id?: string | null; game_id: string; mode_id?: string | null }>(
    `SELECT mg.map_id, m.game_id, m.mode_id
     FROM match_games mg JOIN matches m ON m.id = mg.match_id WHERE mg.id = ?`,
    [matchGameId]
  );
  if (!row) return null;

  const valid = (v?: string | null): v is 'Normal' | 'FFA' | 'Position' =>
    v === 'Normal' || v === 'FFA' || v === 'Position';

  if (row.map_id) {
    const mapScoringType = await getMapModeScoringType(pgDb, row.game_id, cleanMapId(row.map_id));
    if (valid(mapScoringType)) return mapScoringType;
  }
  if (row.mode_id) {
    const modeScoringType = await getModeScoringType(pgDb, row.game_id, row.mode_id);
    if (valid(modeScoringType)) return modeScoringType;
  }
  return null;
}

/**
 * `matches.winner_team` stores one of THREE different ID spaces depending on the match:
 *  - 'tournament_team': tournament matches (Normal) -> tournament_teams.id
 *  - 'participant':     FFA / Position matches       -> match_participants.id
 *  - 'match_team':      standalone Normal matches    -> match_teams.id
 * Consumers must use this helper instead of guessing. `type` is null when no winner is set.
 */
export type WinnerEntityType = 'tournament_team' | 'match_team' | 'participant';

export async function resolveWinnerEntity(
  db: Db,
  matchId: string
): Promise<{ type: WinnerEntityType | null; id: string | null }> {
  const row = await db.get<{ winner_team: string | null; tournament_id: string | null; scoring_type: string | null }>(
    `SELECT m.winner_team, m.tournament_id, gm.scoring_type
     FROM matches m
     LEFT JOIN game_modes gm ON gm.id = m.mode_id AND gm.game_id = m.game_id
     WHERE m.id = ?`,
    [matchId]
  );
  if (!row?.winner_team) return { type: null, id: null };
  let type: WinnerEntityType;
  if (row.scoring_type === 'FFA' || row.scoring_type === 'Position') type = 'participant';
  else if (row.tournament_id) type = 'tournament_team';
  else type = 'match_team';
  return { type, id: row.winner_team };
}

/**
 * Why a completed tournament match can no longer be rescored, or null if it can.
 * Once the bracket has consumed a match's result (a later match was generated with
 * either of its teams, or the tournament finished), changing winner_team would leave
 * the bracket inconsistent, since nothing re-seeds the downstream matches.
 * Later matches are detected by rowid: bracket rows are only ever inserted, so a
 * higher rowid means the match was generated after this one.
 */
export async function getTournamentRescoreBlocker(db: Db, matchId: string): Promise<string | null> {
  const row = await db.get<{ tournament_status: string; rowid: number; team1_id: string | null; team2_id: string | null }>(
    `SELECT t.status AS tournament_status, tm.rowid AS rowid, tm.team1_id, tm.team2_id
     FROM matches m
     JOIN tournaments t ON t.id = m.tournament_id
     LEFT JOIN tournament_matches tm ON tm.match_id = m.id
     WHERE m.id = ?`,
    [matchId]
  );
  if (!row) return null; // standalone match

  if (row.tournament_status === 'complete') {
    return 'The tournament is complete; its match results can no longer be rescored';
  }

  const teams = [row.team1_id, row.team2_id].filter((t): t is string => !!t);
  if (row.rowid == null || teams.length === 0) return null;

  const placeholders = teams.map(() => '?').join(',');
  const later = await db.get<{ match_id: string }>(
    `SELECT tm2.match_id FROM tournament_matches tm2
     JOIN tournament_matches tm ON tm.match_id = ?
     WHERE tm2.tournament_id = tm.tournament_id AND tm2.rowid > tm.rowid
       AND (tm2.team1_id IN (${placeholders}) OR tm2.team2_id IN (${placeholders}))
     LIMIT 1`,
    [matchId, ...teams, ...teams]
  );
  return later
    ? 'The bracket has already advanced past this match; it can no longer be rescored'
    : null;
}

const genPlacementId = () => `mgp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`; // NOSONAR

/** Remove every placement row for a game so a (re)score fully replaces prior results. */
async function clearPlacements(db: Db, matchGameId: string): Promise<void> {
  await db.run(`DELETE FROM match_game_placements WHERE match_game_id = ?`, [matchGameId]);
}

/**
 * Writes the legacy match_games columns and the match_game_placements rows for one
 * result. Callers must run this inside withTransaction so a failure rolls back both.
 */
async function saveScoringModeResult(
  db: Db,
  matchGameId: string,
  result: MatchResult
): Promise<void> {
  if (result.isPositionMode && result.positionResults) {
    const pointsAwarded = await calculatePositionPoints(result.positionResults, matchGameId);
    // Legacy write
    await db.run(
      `UPDATE match_games
       SET position_results = ?, points_awarded = ?, is_ffa_mode = 0, winner_id = NULL,
           participant_winner_id = NULL, status = 'completed',
           completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [JSON.stringify(result.positionResults), JSON.stringify(pointsAwarded), matchGameId]
    );
    // Dual-write: match_game_placements. Team-endurance Position matches (participants
    // grouped into match_teams) get team-level placements too; individual Position
    // matches only get participant-level rows.
    await savePlacementsForPosition(db, matchGameId, result.matchId, result.positionResults, pointsAwarded);
    logger.debug(`Saved Position match result for game ${matchGameId}:`, pointsAwarded);
  } else if (result.isFfaMode && result.participantWinnerId) {
    // Legacy write
    await db.run(
      `UPDATE match_games
       SET participant_winner_id = ?, is_ffa_mode = 1, winner_id = NULL,
           position_results = NULL, points_awarded = NULL, status = 'completed',
           completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [result.participantWinnerId, matchGameId]
    );
    // Dual-write: match_game_placements
    await savePlacementsForFfa(db, matchGameId, result.participantWinnerId);
    logger.debug(`Saved FFA match result for game ${matchGameId}: participant ${result.participantWinnerId} wins`);
  } else if (result.draw) {
    // Normal-mode draw: completed with no winner. Legacy winner_id is 'draw' so that
    // legacy win-count queries count the game as played but credit neither side.
    await db.run(
      `UPDATE match_games
       SET winner_id = 'draw', is_ffa_mode = 0, participant_winner_id = NULL,
           position_results = NULL, points_awarded = NULL, status = 'completed',
           completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [matchGameId]
    );
    await savePlacementsForNormal(db, matchGameId, result.matchId, null, undefined, undefined, undefined, true);
    logger.debug(`Saved drawn team result for game ${matchGameId}`);
  } else {
    // N-team-aware: prefer an explicit winnerTeamId (match_teams.id); fall back to
    // resolving the legacy 'team1'/'team2' shorthand against team_order 0/1.
    const winnerTeamId = await resolveWinnerTeamId(db, result.matchId, result);
    const legacyWinner = winnerTeamId
      ? await deriveLegacyWinnerLabel(db, winnerTeamId)
      : (result.winner === 'team1' || result.winner === 'team2' ? result.winner : null);

    // Legacy write — only meaningful for the first two teams (team_order 0/1);
    // for a 3rd+ team winner this is left NULL since 'team1'/'team2' can't represent it.
    await db.run(
      `UPDATE match_games
       SET winner_id = ?, is_ffa_mode = 0, participant_winner_id = NULL,
           position_results = NULL, points_awarded = NULL, status = 'completed',
           completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [legacyWinner, matchGameId]
    );
    // Dual-write: match_game_placements — writes a row for every non-reserve team.
    await savePlacementsForNormal(db, matchGameId, result.matchId, winnerTeamId, result.winnerScore, result.loserTeamId, result.loserScore);
    logger.debug(`Saved team match result for game ${matchGameId}: winner team ${winnerTeamId ?? 'unresolved'}`);
  }
}

/**
 * Resolve the winning match_teams.id for a Normal-mode result.
 * Prefers the explicit winnerTeamId (N-team-aware); falls back to mapping the
 * legacy 'team1'/'team2' shorthand onto team_order 0/1.
 */
async function resolveWinnerTeamId(
  db: Db,
  matchId: string,
  result: Pick<MatchResult, 'winner' | 'winnerTeamId'>
): Promise<string | null> {
  if (result.winnerTeamId) return result.winnerTeamId;
  if (result.winner !== 'team1' && result.winner !== 'team2') return null;
  const order = result.winner === 'team1' ? 0 : 1;
  const row = await db.get<{ id: string }>(
    `SELECT id FROM match_teams WHERE match_id = ? AND team_order = ? AND is_reserve = 0 LIMIT 1`,
    [matchId, order]
  );
  return row?.id ?? null;
}

/**
 * Map a match_teams.id back to the legacy 'team1'/'team2' label via team_order,
 * for writing the legacy match_games.winner_id column. Returns null for any
 * team beyond order 1 (3rd+ team), since the legacy column can't represent it.
 */
async function deriveLegacyWinnerLabel(
  db: Db,
  winnerTeamId: string | null
): Promise<'team1' | 'team2' | null> {
  if (!winnerTeamId) return null;
  const row = await db.get<{ team_order: number }>(
    `SELECT team_order FROM match_teams WHERE id = ?`, [winnerTeamId]
  );
  if (row == null) return null;
  if (row.team_order === 0) return 'team1';
  if (row.team_order === 1) return 'team2';
  return null;
}

// ── Placement writers (dual-write helpers) ─────────────────────────────────
// Each writer first clears the game's existing placements so a rescore replaces
// (rather than merges with) the previous result. Errors propagate so the
// surrounding transaction rolls back the legacy write too.

/**
 * Write match_game_placements for a Normal-mode result — one row per non-reserve
 * match_teams row (supports N teams, not just Blue/Red). The winning team gets
 * position=1/is_winner=1; every other team gets position=2/is_winner=0, since a
 * single game only ever declares one winner. A draw writes every team at
 * position=1 with is_winner=0.
 */
async function savePlacementsForNormal(
  db: Db,
  matchGameId: string,
  matchId: string,
  winnerTeamId: string | null,
  winnerScore?: number | null,
  loserTeamId?: string | null,
  loserScore?: number | null,
  draw = false
): Promise<void> {
  await clearPlacements(db, matchGameId);
  const teams = await db.all<{ id: string }>(
    `SELECT id FROM match_teams WHERE match_id = ? AND is_reserve = 0 ORDER BY team_order ASC`,
    [matchId]
  );
  // With exactly two teams the loser is unambiguous, so a loserScore is kept even
  // when the caller didn't name loserTeamId. With 3+ teams it can't be attributed.
  const impliedLoserId = !loserTeamId && !draw && winnerTeamId && teams.length === 2
    ? teams.find(t => t.id !== winnerTeamId)?.id
    : undefined;
  const effectiveLoserId = loserTeamId ?? impliedLoserId;
  for (const team of teams) {
    const isWinner = !draw && team.id === winnerTeamId;
    const score = isWinner
      ? (winnerScore ?? null)
      : (effectiveLoserId && team.id === effectiveLoserId ? (loserScore ?? null) : null);
    await db.run(
      `INSERT INTO match_game_placements
       (id, match_game_id, entity_type, entity_id, position, score, is_winner)
       VALUES (?, ?, 'team', ?, ?, ?, ?)`,
      [genPlacementId(), matchGameId, team.id, draw || isWinner ? 1 : 2, score, isWinner ? 1 : 0]
    );
  }

  // Mirror the first two teams' scores into the legacy score_a / score_b columns.
  await db.run(
    `UPDATE match_games SET
       score_a = COALESCE((SELECT p.score FROM match_game_placements p
                           JOIN match_teams t ON t.id = p.entity_id
                           WHERE p.match_game_id = ? AND p.entity_type = 'team' AND t.team_order = 0), 0),
       score_b = COALESCE((SELECT p.score FROM match_game_placements p
                           JOIN match_teams t ON t.id = p.entity_id
                           WHERE p.match_game_id = ? AND p.entity_type = 'team' AND t.team_order = 1), 0)
     WHERE id = ?`,
    [matchGameId, matchGameId, matchGameId]
  );
}

async function savePlacementsForFfa(
  db: Db,
  matchGameId: string,
  winnerParticipantId: string
): Promise<void> {
  await clearPlacements(db, matchGameId);
  await db.run(
    `INSERT INTO match_game_placements
     (id, match_game_id, entity_type, entity_id, position, is_winner)
     VALUES (?, ?, 'participant', ?, 1, 1)`,
    [genPlacementId(), matchGameId, winnerParticipantId]
  );
}

async function savePlacementsForPosition(
  db: Db,
  matchGameId: string,
  matchId: string,
  positionResults: Record<string, number>,
  pointsAwarded: Record<string, number>
): Promise<void> {
  await clearPlacements(db, matchGameId);
  for (const [participantId, position] of Object.entries(positionResults)) {
    await db.run(
      `INSERT INTO match_game_placements
       (id, match_game_id, entity_type, entity_id, position, points_awarded, is_winner)
       VALUES (?, ?, 'participant', ?, ?, ?, ?)`,
      [genPlacementId(), matchGameId, participantId, position, pointsAwarded[participantId] ?? 0, position === 1 ? 1 : 0]
    );
  }

  await savePlacementsForPositionTeams(db, matchGameId, matchId, positionResults, pointsAwarded);
}

/**
 * Competition ranking (1, 1, 3) by points, highest first: tied entries share a
 * position, and a tie for the top spot yields no winner, matching
 * determineMatchWinner's tie handling.
 */
export function rankByPoints(
  points: Map<string, number>
): Array<{ teamId: string; points: number; position: number; isWinner: boolean }> {
  const ranked = [...points.entries()].sort((a, b) => b[1] - a[1]);
  const topTied = ranked.length > 1 && ranked[0][1] === ranked[1][1];
  let position = 0;
  return ranked.map(([teamId, pts], i) => {
    if (i === 0 || pts !== ranked[i - 1][1]) position = i + 1;
    return { teamId, points: pts, position, isWinner: position === 1 && !topTied };
  });
}

/**
 * Team-endurance Position matches (participants grouped into match_teams with 2+
 * members) additionally get team-level placement rows, derived by summing each
 * team's members' points_awarded for this game and ranking teams by total. This
 * is a no-op for individual Position matches (one participant per team, or no
 * team_id at all), so it's safe to call unconditionally.
 */
async function savePlacementsForPositionTeams(
  db: Db,
  matchGameId: string,
  matchId: string,
  positionResults: Record<string, number>,
  pointsAwarded: Record<string, number>
): Promise<void> {
  const participantIds = Object.keys(positionResults);
  if (participantIds.length === 0) return;

  const teamRows = await db.all<{ id: string; team_id: string | null }>(
    `SELECT id, team_id FROM match_participants WHERE match_id = ? AND id IN (${participantIds.map(() => '?').join(',')})`,
    [matchId, ...participantIds]
  );
  const teamOfParticipant = new Map(teamRows.map(r => [r.id, r.team_id]));

  const countByTeam = new Map<string, number>();
  for (const pid of participantIds) {
    const teamId = teamOfParticipant.get(pid);
    if (!teamId) continue;
    countByTeam.set(teamId, (countByTeam.get(teamId) ?? 0) + 1);
  }
  const isTeamEndurance = [...countByTeam.values()].some(c => c >= 2);
  if (!isTeamEndurance) return;

  const teamPoints = new Map<string, number>();
  for (const pid of participantIds) {
    const teamId = teamOfParticipant.get(pid);
    if (!teamId) continue;
    teamPoints.set(teamId, (teamPoints.get(teamId) ?? 0) + (pointsAwarded[pid] ?? 0));
  }
  if (teamPoints.size === 0) return;

  for (const { teamId, points, position, isWinner } of rankByPoints(teamPoints)) {
    await db.run(
      `INSERT INTO match_game_placements
       (id, match_game_id, entity_type, entity_id, position, points_awarded, is_winner)
       VALUES (?, ?, 'team', ?, ?, ?, ?)`,
      [genPlacementId(), matchGameId, teamId, position, points, isWinner ? 1 : 0]
    );
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

/** Thrown by saveMatchResult when the game is already scored and the caller didn't ask to rescore. */
export class GameAlreadyScoredError extends Error {
  constructor(public matchGameId: string) {
    super(`Game ${matchGameId} is already scored; pass rescore: true to correct its result`);
    this.name = 'GameAlreadyScoredError';
  }
}

/**
 * Save match result - handles team-based, FFA, and Position scoring.
 *
 * DB writes (legacy columns + placements) run in one transaction. The "already
 * scored?" check runs inside that transaction (BEGIN IMMEDIATE holds the write lock
 * across processes), so when the web UI and a Discord winner vote score the same game
 * concurrently exactly one of them performs the first score and runs the
 * next-map/completion side effects; the other gets GameAlreadyScoredError.
 *
 * Overwriting an already-completed game requires `result.rescore`: placements are
 * replaced and the match's winner_team recomputed, but no notification/completion
 * side effects re-fire.
 */
export async function saveMatchResult(
  matchGameId: string,
  result: MatchResult
): Promise<void> {
  logger.debug('saveMatchResult - Starting with matchGameId:', matchGameId);

  const db = await getDbInstance();

  try {
    await ensureMatchGameExists(matchGameId, result.matchId);

    const isRescore = await withTransaction(db, async () => {
      const prior = await db.get<{ status: string }>('SELECT status FROM match_games WHERE id = ?', [matchGameId]);
      const alreadyScored = prior?.status === 'completed';
      if (alreadyScored && !result.rescore) throw new GameAlreadyScoredError(matchGameId);
      await saveScoringModeResult(db, matchGameId, result);
      return alreadyScored;
    });

    if (isRescore) {
      await recomputeWinnerAfterRescore(db, result.matchId);
      return;
    }

    await logMapScoredFeedEvent(db, matchGameId, result.matchId);
    const hasNextMap = await handlePostSaveNotifications(db, matchGameId, result);
    const isMatchComplete = await updateMatchStatusIfComplete(matchGameId);
    await queueVoiceAnnouncementForScore(result.matchId, hasNextMap, isMatchComplete);
  } catch (error) {
    if (!(error instanceof GameAlreadyScoredError)) logger.error('Error in saveMatchResult:', error);
    throw error;
  }
}

/** After a rescore, refresh winner_team on an already-complete match (no side effects). */
async function recomputeWinnerAfterRescore(db: Db, matchId: string): Promise<void> {
  const match = await db.get<{ status: string }>('SELECT status FROM matches WHERE id = ?', [matchId]);
  if (match?.status !== 'complete') return;
  const winnerTeam = await determineMatchWinner(db, matchId);
  await db.run(
    `UPDATE matches SET winner_team = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'complete'`,
    [winnerTeam, matchId]
  );
  logger.debug(`Rescore recomputed winner_team for match ${matchId}: ${winnerTeam ?? 'tie/none'}`);
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
      // Prefer the mode's declared scoring_type over inferring from row counts/shape.
      const declared = await getScoringTypeForGame(db, matchGameId);
      const hasParticipantRows = placements.some(p => p.entity_type === 'participant');
      const hasTeamRows = placements.some(p => p.entity_type === 'team');
      // Only trust the declared type when rows of the matching kind exist.
      const declaredType = declared && (declared === 'Normal' ? hasTeamRows : hasParticipantRows) ? declared : null;
      const scoringType = declaredType ?? (hasParticipantRows
        ? (placements.filter(p => p.entity_type === 'participant' && p.position != null).length > 1 ? 'Position' : 'FFA')
        : 'Normal');
      const completedAt = new Date(game.completed_at!);

      if (scoringType === 'Normal') {
        const teamPlacements = placements.filter(p => p.entity_type === 'team');
        const winner = teamPlacements.find(p => p.is_winner);
        if (!winner) {
          // A draw: every team recorded at position 1 with no winner.
          const isDraw = teamPlacements.length > 0 && teamPlacements.every(p => p.position === 1);
          if (!isDraw) return null;
          return {
            matchId: game.match_id!,
            gameId: matchGameId,
            winner: 'tie',
            draw: true,
            isFfaMode: false,
            completedAt
          };
        }
        // Map team row ID back to 'team1'/'team2' via team_order for the first two teams;
        // 3rd+ teams report 'team' — callers needing identity must use winnerTeamId.
        const teamRow = await db.get<{ team_order: number }>(
          `SELECT team_order FROM match_teams WHERE id = ?`, [winner.entity_id]
        );
        const order = teamRow?.team_order ?? 0;
        return {
          matchId: game.match_id!,
          gameId: matchGameId,
          winner: order === 0 ? 'team1' : order === 1 ? 'team2' : 'team',
          winnerTeamId: winner.entity_id,
          isFfaMode: false,
          completedAt
        };
      }

      const participantPlacements = placements.filter(p => p.entity_type === 'participant');

      if (scoringType === 'Position') {
        const posEntries = participantPlacements
          .filter(p => p.position != null)
          .sort((a, b) => (a.position ?? 99) - (b.position ?? 99));
        const positionResults: Record<string, number> = {};
        for (const p of posEntries) positionResults[p.entity_id] = p.position!;
        return {
          matchId: game.match_id!,
          gameId: matchGameId,
          winner: 'team1', // unused for Position
          isFfaMode: false,
          isPositionMode: true,
          positionResults,
          completedAt
        };
      }

      // FFA — single winner participant
      const ffaWinner = participantPlacements.find(p => p.is_winner);
      if (!ffaWinner) return null;
      return {
        matchId: game.match_id!,
        gameId: matchGameId,
        winner: 'team1', // unused for FFA
        participantWinnerId: ffaWinner.entity_id,
        isFfaMode: true,
        completedAt
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
    if (!isFfaMode && game.winner_id === 'draw') {
      return {
        matchId: game.match_id!,
        gameId: matchGameId,
        winner: 'tie',
        draw: true,
        isFfaMode: false,
        completedAt: new Date(game.completed_at!)
      };
    }

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

    // Prefer the mode's declared scoring_type; fall back to the shape of the rows.
    const declared = await getScoringTypeForGame(db, matchGameId);
    const hasTeamRows = placements.some(p => p.entity_type === 'team');
    const hasParticipantRows = placements.some(p => p.entity_type === 'participant');
    const declaredType = declared && (declared === 'Normal' ? hasTeamRows : hasParticipantRows) ? declared : null;
    const scoringType = declaredType ?? (hasTeamRows ? 'Normal' : 'FFA');

    if (scoringType === 'Normal') {
      const teamPlacements = placements.filter(p => p.entity_type === 'team');
      const teamRows = teamPlacements.length === 0 ? [] : await db.all<{ id: string; team_name: string; team_color?: string; team_order: number }>(
        `SELECT id, team_name, team_color, team_order FROM match_teams WHERE id IN (${teamPlacements.map(() => '?').join(',')})`,
        teamPlacements.map(p => p.entity_id)
      );
      const teamMap = Object.fromEntries(teamRows.map(t => [t.id, t]));
      const typed: TeamPlacement[] = teamPlacements.map(p => ({
        entityType: 'team' as const,
        entityId: p.entity_id,
        teamName: teamMap[p.entity_id]?.team_name ?? p.entity_id,
        teamColor: teamMap[p.entity_id]?.team_color,
        position: p.position ?? 99,
        score: p.score ?? undefined,
        isWinner: Boolean(p.is_winner),
      }));
      // A draw is a completed result: all teams at position 1, none flagged as winner.
      return { type: 'Normal', matchGameId, matchId: game.match_id, placements: typed };
    }

    // Participant placements — FFA vs Position per the mode's scoring_type
    const participantPlacements = placements.filter(p => p.entity_type === 'participant');
    if (participantPlacements.length === 0) return null;
    const participants = await db.all<{ id: string; username: string }>(
      `SELECT id, username FROM match_participants WHERE id IN (${participantPlacements.map(() => '?').join(',')})`,
      participantPlacements.map(p => p.entity_id)
    );
    const pMap = Object.fromEntries(participants.map(p => [p.id, p]));

    const typed: ParticipantPlacement[] = participantPlacements.map(p => ({
      entityType: 'participant' as const,
      entityId: p.entity_id,
      username: pMap[p.entity_id]?.username,
      position: p.position ?? undefined,
      score: p.score ?? undefined,
      pointsAwarded: p.points_awarded ?? undefined,
      isWinner: Boolean(p.is_winner),
    }));

    if (scoringType === 'Position') {
      return { type: 'Position', matchGameId, matchId: game.match_id, placements: typed };
    }
    return { type: 'FFA', matchGameId, matchId: game.match_id, placements: typed };
  } catch (error) {
    logger.error('Error in getGameResult:', error);
    throw error;
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
      SELECT mg.id, mg.round, mg.map_id
      FROM match_games mg
      WHERE mg.match_id = ? AND mg.status = 'pending'
      ORDER BY mg.round ASC
      LIMIT 1
    `;

    const nextMap = await db.get<{ id: string; round: number; map_id?: string }>(nextMapQuery, [matchId]);

    if (nextMap) {
      const updateQuery = `
        UPDATE match_games
        SET status = 'ongoing', updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;

      await db.run(updateQuery, [nextMap.id]);
      logger.debug(`Set next map ${nextMap.id} to ongoing status`);

      const mapName = await lookupMapName(db, matchId, nextMap.map_id);

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
          const matchGame = await db.get<{ game_id: string }>('SELECT game_id FROM matches WHERE id = ?', [matchId]);
          const mapNameData = matchGame ? await findMapByIdOrName(pgDb, matchGame.game_id, cleanMapName) : undefined;
          
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
             m.name as match_name, m.game_id
      FROM match_games mg
      JOIN matches m ON mg.match_id = m.id
      WHERE mg.id = ?
    `;

    const gameData = await db.get<{
      match_id: string;
      round: number;
      map_id?: string;
      match_name: string;
      game_id: string;
    }>(gameDataQuery, [matchGameId]);

    if (!gameData) {
      logger.warning('No game data found for score notification');
      return;
    }

    // Resolve authoritative display values + the `winner` label per queue contract:
    // 'team1'/'team2' for team_order 0/1, 'team' for 3rd+ teams, 'participant' for
    // FFA/Position, 'tie' for draws.
    let winningTeamName: string;
    let winningPlayers: string[];
    let winnerLabel: string;

    const fmt = (p: { username: string; discord_user_id?: string | null }) =>
      p.discord_user_id ? `<@${p.discord_user_id}>` : p.username;

    let participantWinnerId: string | undefined;
    if (result.isFfaMode && result.participantWinnerId) {
      participantWinnerId = result.participantWinnerId;
    } else if (result.isPositionMode && result.positionResults) {
      participantWinnerId = Object.entries(result.positionResults).find(([, pos]) => pos === 1)?.[0];
    }

    if (result.isFfaMode || result.isPositionMode) {
      winnerLabel = 'participant';
      const participant = participantWinnerId
        ? await db.get<{ username: string; discord_user_id?: string | null }>(
            `SELECT username, discord_user_id FROM match_participants WHERE match_id = ? AND id = ?`,
            [gameData.match_id, participantWinnerId]
          )
        : undefined;
      winningTeamName = participant?.username ?? 'Unknown Player';
      winningPlayers = [participant ? fmt(participant) : 'Unknown Player'];
    } else if (result.draw) {
      winnerLabel = 'tie';
      winningTeamName = 'Draw';
      winningPlayers = [];
    } else {
      // Team Mode: resolve the winning team via match_teams/team_id when available
      // (N-team aware), falling back to the legacy blue/red team_assignment lookup.
      const winnerTeamId = await resolveWinnerTeamId(db, gameData.match_id, result);
      const teamRow = winnerTeamId
        ? await db.get<{ team_name: string; team_order: number }>(
            `SELECT team_name, team_order FROM match_teams WHERE id = ?`, [winnerTeamId]
          )
        : undefined;

      if (winnerTeamId && teamRow) {
        winnerLabel = teamRow.team_order === 0 ? 'team1' : teamRow.team_order === 1 ? 'team2' : 'team';
        winningTeamName = teamRow.team_name;
        const players = await db.all<{ username: string; discord_user_id?: string | null }>(
          `SELECT username, discord_user_id FROM match_participants WHERE match_id = ? AND team_id = ? ORDER BY username ASC`,
          [gameData.match_id, winnerTeamId]
        );
        winningPlayers = players.map(fmt);
      } else {
        const isTeam1 = result.winner !== 'team2';
        winnerLabel = isTeam1 ? 'team1' : 'team2';
        winningTeamName = isTeam1 ? 'Blue Team' : 'Red Team';
        const players = await db.all<{ username: string; discord_user_id?: string | null }>(
          `SELECT username, discord_user_id FROM match_participants WHERE match_id = ? AND team_assignment = ? ORDER BY username ASC`,
          [gameData.match_id, isTeam1 ? 'blue' : 'red']
        );
        winningPlayers = players.map(fmt);
      }
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
      winnerLabel,
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

  // insertMatch stores blue_team_id = team1 and red_team_id = team2 (team1 is blue/team_order 0).
  if (teamNumber === 1) {
    return teamData?.team1_id || teamData?.blue_team_id || null;
  }
  return teamData?.team2_id || teamData?.red_team_id || null;
}

/**
 * Participant point totals across completed games, highest first.
 * Wins count as 1 point for FFA games (no points_awarded).
 */
async function getParticipantPointTotals(
  db: Db,
  matchId: string
): Promise<Array<{ entity_id: string; total_pts: number }>> {
  return db.all<{ entity_id: string; total_pts: number }>(
    `SELECT mgp.entity_id, SUM(COALESCE(mgp.points_awarded, mgp.is_winner)) as total_pts
     FROM match_games mg
     JOIN match_game_placements mgp ON mgp.match_game_id = mg.id
     WHERE mg.match_id = ? AND mg.status = 'completed' AND mgp.entity_type = 'participant'
     GROUP BY mgp.entity_id
     ORDER BY total_pts DESC`,
    [matchId]
  );
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
    // Winner = participant with highest total points_awarded across all games.
    // A tie for the top total yields no winner (null).
    const totals = await getParticipantPointTotals(db, matchId);
    if (totals.length === 0) return null;
    if (totals.length > 1 && totals[0].total_pts === totals[1].total_pts) return null;
    return totals[0].entity_id;
  }

  // Tournament matches: winner_team MUST resolve to a tournament_teams.id (via
  // getMatchTeamId), since bracket progression (tournament-bracket.ts,
  // standings/route.ts, progress/route.ts) compares winner_team against
  // tournament_teams.id / tournament_matches.team1_id/team2_id — a completely
  // different ID space from match_teams.id. Tournament matches are always 1v1,
  // so the original team_order 0/1 win-count comparison is still correct here.
  const tournamentRow = await db.get<{ tournament_id: string | null }>(
    `SELECT tournament_id FROM matches WHERE id = ?`, [matchId]
  );
  if (tournamentRow?.tournament_id) {
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

  // Standalone matches — N-team aware: ranks every non-reserve match_teams row
  // by win count and returns the real match_teams.id of the winner directly.
  // Scoped to games that actually produced team placements (mirrors
  // getOverallMatchScore), so FFA-flagged legacy rows are naturally excluded.
  const placementsTotalRow = await db.get<{ total: number }>(
    `SELECT COUNT(DISTINCT mgp.match_game_id) as total
     FROM match_game_placements mgp
     JOIN match_games mg ON mg.id = mgp.match_game_id
     WHERE mg.match_id = ? AND mg.status = 'completed' AND mgp.entity_type = 'team'`,
    [matchId]
  );

  const teamWins = await db.all<{ team_id: string; wins: number }>(
    `SELECT mt.id as team_id,
            SUM(CASE WHEN mgp.is_winner = 1 THEN 1 ELSE 0 END) as wins
     FROM match_teams mt
     LEFT JOIN match_game_placements mgp
       ON mgp.entity_id = mt.id AND mgp.entity_type = 'team'
       AND mgp.match_game_id IN (SELECT id FROM match_games WHERE match_id = ? AND status = 'completed')
     WHERE mt.match_id = ? AND mt.is_reserve = 0
     GROUP BY mt.id`,
    [matchId, matchId]
  );

  if (teamWins.length > 0 && (placementsTotalRow?.total ?? 0) > 0) {
    const sorted = [...teamWins].sort((a, b) => b.wins - a.wins);
    const isTie = sorted.length > 1 && sorted[0].wins === sorted[1].wins;
    if (isTie || sorted[0].wins === 0) return null;
    return sorted[0].team_id;
  }

  // Legacy fallback (matches with no match_teams rows yet)
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
 * Completion side effects shared by the manual transition route (via
 * handleCompleteTransition) and auto-complete after the last map is scored.
 * Must be invoked exactly once per match, after the status flipped to 'complete'.
 */
export async function runMatchCompletionSideEffects(matchId: string): Promise<void> {
  await queueMatchWinnerNotification(matchId);
  await queueDiscordDeletion(matchId);

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

  try {
    await deleteMatchVoiceChannels(matchId);
  } catch (voiceError) {
    logger.error('Error deleting voice channels for completed match:', voiceError);
  }

  try {
    const db = await getDbInstance();
    const row = await db.get<{ name: string }>('SELECT name FROM matches WHERE id = ?', [matchId]);
    await logFeedEvent({
      eventType: 'match_completed',
      priority: 2,
      title: 'Match Completed',
      description: `"${row?.name ?? matchId}" has finished`,
      matchId,
    });
  } catch (feedError) {
    logger.error('Error logging complete feed event:', feedError);
  }
}

/**
 * Update match status to complete if all games are scored. The status flip is a
 * compare-and-set so concurrent scorers can't both run completion side effects.
 */
async function updateMatchStatusIfComplete(matchGameId: string): Promise<boolean> {
  const db = await getDbInstance();

  try {
    const matchRow = await db.get<{ match_id?: string }>(
      'SELECT match_id FROM match_games WHERE id = ?',
      [matchGameId]
    );
    const matchId = matchRow?.match_id;
    if (!matchId) return false;

    const allGamesCompleted = await areAllGamesCompleted(db, matchId);
    if (!allGamesCompleted) return false;

    const current = await db.get<{ status: string }>('SELECT status FROM matches WHERE id = ?', [matchId]);
    if (!current || current.status === 'complete' || current.status === 'cancelled') return false;

    const winnerTeam = await determineMatchWinner(db, matchId);
    const update = await db.run(
      `UPDATE matches SET status = 'complete', winner_team = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = ?`,
      [winnerTeam, matchId, current.status]
    );
    if (!update.changes) return false; // lost the race; someone else completed it

    logger.debug(`Match ${matchId} marked as complete with winner: ${winnerTeam || 'tie/none'}`);

    await runMatchCompletionSideEffects(matchId);
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

    // Fall back to match_teams.voice_channel_id (team_order 0/1) when the legacy columns are empty
    if (!match.blue_team_voice_channel || !match.red_team_voice_channel) {
      const teamChannels = await db.all<{ team_order: number; voice_channel_id: string | null }>(
        `SELECT team_order, voice_channel_id FROM match_teams
         WHERE match_id = ? AND is_reserve = 0 AND team_order IN (0, 1)`,
        [matchId]
      );
      const blue = teamChannels.find(t => t.team_order === 0)?.voice_channel_id;
      const red = teamChannels.find(t => t.team_order === 1)?.voice_channel_id;
      match.blue_team_voice_channel = match.blue_team_voice_channel || blue || undefined;
      match.red_team_voice_channel = match.red_team_voice_channel || red || undefined;
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
    // Same totals as determineMatchWinner (getParticipantPointTotals), plus race count and username.
    const rows = await db.all<{ entity_id: string; username: string | null; total_pts: number; races: number }>(
      `SELECT mgp.entity_id, mp.username,
              SUM(COALESCE(mgp.points_awarded, mgp.is_winner)) as total_pts,
              COUNT(*) as races
       FROM match_games mg
       JOIN match_game_placements mgp ON mgp.match_game_id = mg.id
       LEFT JOIN match_participants mp ON mp.id = mgp.entity_id
       WHERE mg.match_id = ? AND mg.status = 'completed' AND mgp.entity_type = 'participant'
       GROUP BY mgp.entity_id
       ORDER BY total_pts DESC`,
      [matchId]
    );

    const participantScores: Record<string, { username: string; totalPoints: number; races: number }> = {};
    for (const row of rows) {
      participantScores[row.entity_id] = {
        username: row.username || 'Unknown',
        totalPoints: row.total_pts,
        races: row.races
      };
    }

    // A tie for the top total yields no winner.
    const isTie = rows.length > 1 && rows[0].total_pts === rows[1].total_pts;
    const winner = rows.length > 0 && !isTie ? rows[0].entity_id : null;

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
 * Normal: returns per-team win counts (N-team aware via teamScores; team1Wins/team2Wins
 * mirror the first two teams by team_order for backward compatibility).
 * FFA/Position: returns null overallWinner (use getOverallPositionScore for those).
 */
export async function getOverallMatchScore(matchId: string): Promise<{
  team1Wins: number;
  team2Wins: number;
  totalNormalGames: number;
  overallWinner: 'team1' | 'team2' | 'tie' | null;
  overallWinnerTeamId: string | null;
  scoringType: string;
  teamScores: Array<{ teamId: string; teamName: string; teamOrder: number; wins: number }>;
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
      return { team1Wins: 0, team2Wins: 0, totalNormalGames: 0, overallWinner: null, overallWinnerTeamId: null, scoringType, teamScores: [] };
    }

    // Try new placements table first — one row per non-reserve team, N-team aware.
    // Scoped to games that actually produced team placements, so FFA-flagged
    // legacy rows (which never get entity_type='team' placements) are excluded
    // without needing an explicit is_ffa_mode filter here.
    const teamRows = await db.all<{ team_id: string; team_name: string; team_order: number; wins: number }>(
      `SELECT mt.id as team_id, mt.team_name, mt.team_order,
              SUM(CASE WHEN mgp.is_winner = 1 THEN 1 ELSE 0 END) as wins
       FROM match_teams mt
       LEFT JOIN match_game_placements mgp
         ON mgp.entity_id = mt.id AND mgp.entity_type = 'team'
         AND mgp.match_game_id IN (SELECT id FROM match_games WHERE match_id = ? AND status = 'completed')
       WHERE mt.match_id = ? AND mt.is_reserve = 0
       GROUP BY mt.id, mt.team_name, mt.team_order
       ORDER BY mt.team_order ASC`,
      [matchId, matchId]
    );
    const placementsTotalRow = await db.get<{ total: number }>(
      `SELECT COUNT(DISTINCT mgp.match_game_id) as total
       FROM match_game_placements mgp
       JOIN match_games mg ON mg.id = mgp.match_game_id
       WHERE mg.match_id = ? AND mg.status = 'completed' AND mgp.entity_type = 'team'`,
      [matchId]
    );
    const totalFromPlacements = placementsTotalRow?.total ?? 0;

    if (teamRows.length > 0 && totalFromPlacements > 0) {
      const teamScores = teamRows.map(r => ({ teamId: r.team_id, teamName: r.team_name, teamOrder: r.team_order, wins: r.wins ?? 0 }));
      const sorted = [...teamScores].sort((a, b) => b.wins - a.wins);
      const isTie = sorted.length > 1 && sorted[0].wins === sorted[1].wins;
      const overallWinnerTeamId = !isTie && sorted[0]?.wins > 0 ? sorted[0].teamId : null;

      const team1 = teamScores.find(t => t.teamOrder === 0);
      const team2 = teamScores.find(t => t.teamOrder === 1);
      const overallWinner: 'team1' | 'team2' | 'tie' | null =
        isTie ? 'tie' :
        overallWinnerTeamId && team1?.teamId === overallWinnerTeamId ? 'team1' :
        overallWinnerTeamId && team2?.teamId === overallWinnerTeamId ? 'team2' :
        overallWinnerTeamId ? null : // 3rd+ team won — can't represent in legacy label
        'tie';

      return {
        team1Wins: team1?.wins ?? 0,
        team2Wins: team2?.wins ?? 0,
        totalNormalGames: totalFromPlacements,
        overallWinner,
        overallWinnerTeamId,
        scoringType,
        teamScores,
      };
    }

    // Fallback: legacy columns (matches with no match_teams/placements rows yet)
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

    return { team1Wins, team2Wins, totalNormalGames, overallWinner, overallWinnerTeamId: null, scoringType, teamScores: [] };
  } catch (error) {
    logger.error('Error getting overall match score:', error);
    return { team1Wins: 0, team2Wins: 0, totalNormalGames: 0, overallWinner: null, overallWinnerTeamId: null, scoringType: 'Normal', teamScores: [] };
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
    const rawGames = await db.all<{
      id: string;
      round: number;
      map_id?: string | null;
      game_id: string;
      status: string;
      winner_id?: string;
      participant_winner_id?: string;
      participant_winner_name?: string;
      is_ffa_mode: number;
    }>(
      `SELECT mg.id, mg.round, mg.map_id, m.game_id, mg.winner_id, mg.participant_winner_id, mg.is_ffa_mode, mg.status,
              mp.username as participant_winner_name
       FROM match_games mg
       JOIN matches m ON m.id = mg.match_id
       LEFT JOIN match_participants mp ON mg.participant_winner_id = mp.id
       WHERE mg.match_id = ? ORDER BY mg.round ASC`,
      [matchId]
    );

    // Map data is looked up per game (map IDs aren't unique across games) and with
    // instance suffixes stripped, so customised maps still resolve.
    const mapLookup = await lookupMaps(db, rawGames[0]?.game_id ?? '', rawGames.map(g => g.map_id));
    const games = rawGames.map(({ map_id, game_id: _gameId, ...game }) => {
      const mapData = map_id ? mapLookup[cleanMapId(map_id)] : undefined;
      return {
        ...game,
        map_name: mapData?.name as string,
        mode_scoring_type: mapData?.mode_scoring_type as string,
      };
    });

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
 * Queue match winner notification when match completes.
 * Normal: N-team aware (names from match_teams, players via team_id with
 * team_assignment fallback for legacy matches), tie-aware.
 * FFA/Position: winner by total points (tie-aware); winning_team_name holds the
 * winning participant's username.
 */
async function queueMatchWinnerNotification(matchId: string): Promise<void> {
  try {
    const db = await getDbInstance();

    const matchData = await db.get<{ name: string; game_id: string }>(
      `SELECT name, game_id FROM matches WHERE id = ?`, [matchId]
    );
    if (!matchData) {
      logger.warning('Match not found for winner notification:', matchId);
      return;
    }

    const scoreData = await getOverallMatchScore(matchId);
    const fmt = (p: { username: string; discord_user_id?: string | null }) =>
      p.discord_user_id ? `<@${p.discord_user_id}>` : p.username;

    let winner: string;
    let winningTeamName: string;
    let winningPlayers: string[] = [];
    let team1Score: number;
    let team2Score: number;
    let totalMaps: number;

    if (scoreData.scoringType === 'FFA' || scoreData.scoringType === 'Position') {
      const totals = await getParticipantPointTotals(db, matchId);
      const completedRow = await db.get<{ cnt: number }>(
        `SELECT COUNT(*) as cnt FROM match_games WHERE match_id = ? AND status = 'completed'`, [matchId]
      );
      totalMaps = completedRow?.cnt ?? 0;
      if (totals.length === 0 || totalMaps === 0) {
        logger.warning('No completed games found for match winner notification:', matchId);
        return;
      }
      const isTie = totals.length > 1 && totals[0].total_pts === totals[1].total_pts;
      team1Score = totals[0].total_pts;
      team2Score = 0;
      if (isTie) {
        winner = 'tie';
        winningTeamName = 'Match Tied';
      } else {
        winner = 'participant';
        const participant = await db.get<{ username: string; discord_user_id?: string | null }>(
          `SELECT username, discord_user_id FROM match_participants WHERE match_id = ? AND id = ?`,
          [matchId, totals[0].entity_id]
        );
        winningTeamName = participant?.username ?? 'Unknown Player';
        winningPlayers = participant ? [fmt(participant)] : [];
      }
    } else {
      if (scoreData.totalNormalGames === 0) {
        logger.warning('No completed normal games found for match winner notification:', matchId);
        return;
      }
      team1Score = scoreData.team1Wins;
      team2Score = scoreData.team2Wins;
      totalMaps = scoreData.totalNormalGames;

      const winnerTeamId = scoreData.overallWinnerTeamId;
      if (winnerTeamId) {
        const winnerTeam = scoreData.teamScores.find(t => t.teamId === winnerTeamId);
        winner = winnerTeam?.teamOrder === 0 ? 'team1' : winnerTeam?.teamOrder === 1 ? 'team2' : 'team';
        winningTeamName = winnerTeam?.teamName ?? 'Unknown Team';
        // For 3+ teams the 2-slot score columns can't hold the winner's wins; show winner vs best opponent.
        if (winner === 'team') {
          team1Score = winnerTeam?.wins ?? 0;
          team2Score = Math.max(0, ...scoreData.teamScores.filter(t => t.teamId !== winnerTeamId).map(t => t.wins));
        }
        const players = await db.all<{ username: string; discord_user_id?: string | null }>(
          `SELECT username, discord_user_id FROM match_participants
           WHERE match_id = ? AND team_id = ? ORDER BY username ASC`,
          [matchId, winnerTeamId]
        );
        winningPlayers = players.map(fmt);
      } else if (scoreData.overallWinner === 'team1' || scoreData.overallWinner === 'team2') {
        // Legacy match (no match_teams rows): fall back to team_assignment.
        winner = scoreData.overallWinner;
        winningTeamName = winner === 'team1' ? 'Blue Team' : 'Red Team';
        const players = await db.all<{ username: string; discord_user_id?: string | null }>(
          `SELECT username, discord_user_id FROM match_participants
           WHERE match_id = ? AND team_assignment = ? ORDER BY username ASC`,
          [matchId, winner === 'team1' ? 'blue' : 'red']
        );
        winningPlayers = players.map(fmt);
      } else {
        winner = 'tie';
        winningTeamName = 'Match Tied';
      }
    }

    const notificationId = `match_winner_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`; // NOSONAR: non-security internal ID generation

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
      team1Score,
      team2Score,
      totalMaps
    ]);

    logger.debug(`🏆 Match winner notification queued: ${winningTeamName} (${winner}) for ${matchData.name} (${team1Score}-${team2Score})`);
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

    if ((await countStatDefinitions(pgDb, match.game_id)) === 0) return;

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