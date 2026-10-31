/**
 * Games domain module: `games`, `game_modes`, `game_maps`, `game_stat_definitions`.
 * Hono routes, the bot, the scheduler, the stats-processor and later domains (matches, tournaments, series)
 * all read game reference data through here. Every function takes an `Executor` first so it can run in a tx.
 */
import { and, asc, count, eq, ilike, inArray, like, notLike, or, sql } from 'drizzle-orm';
import type { Executor } from '../../lib/db';
import { gameMaps, gameModes, games, gameStatDefinitions } from '../../lib/db/schema';

export type GameRow = typeof games.$inferSelect;
export type GameModeRow = typeof gameModes.$inferSelect;
export type GameMapRow = typeof gameMaps.$inferSelect;
export type GameStatDefinitionRow = typeof gameStatDefinitions.$inferSelect;

/** Escape `%`, `_` and `\` so user text is matched literally inside LIKE/ILIKE. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

// ─── games ───────────────────────────────────────────────────────────────────

export async function getGame(ex: Executor, gameId: string): Promise<GameRow | undefined> {
  const rows = await ex.select().from(games).where(eq(games.id, gameId)).limit(1);
  return rows[0];
}

export async function gameExists(ex: Executor, gameId: string): Promise<boolean> {
  const rows = await ex.select({ id: games.id }).from(games).where(eq(games.id, gameId)).limit(1);
  return rows.length > 0;
}

export async function listGames(ex: Executor): Promise<GameRow[]> {
  return ex.select().from(games).orderBy(asc(games.name), asc(games.id));
}

/** Name + embed colour (+ icon) for Discord embeds. */
export async function getGameDisplay(
  ex: Executor,
  gameId: string,
): Promise<{ name: string; color: string | null; icon_url: string | null } | undefined> {
  const rows = await ex
    .select({ name: games.name, color: games.color, icon_url: games.icon_url })
    .from(games)
    .where(eq(games.id, gameId))
    .limit(1);
  return rows[0];
}

export async function getGameName(ex: Executor, gameId: string): Promise<string | undefined> {
  return (await getGameDisplay(ex, gameId))?.name;
}

export async function getGameMaxSignups(ex: Executor, gameId: string): Promise<number | null | undefined> {
  const rows = await ex.select({ max_signups: games.max_signups }).from(games).where(eq(games.id, gameId)).limit(1);
  return rows.length === 0 ? undefined : rows[0].max_signups;
}

export async function gameSupportsMapCodes(ex: Executor, gameId: string): Promise<boolean> {
  const rows = await ex.select({ v: games.map_codes_supported }).from(games).where(eq(games.id, gameId)).limit(1);
  return rows[0]?.v ?? false;
}

export async function getGameAiNotes(
  ex: Executor,
  gameId: string,
): Promise<{ name: string; ai_screenshot_notes: string | null } | undefined> {
  const rows = await ex
    .select({ name: games.name, ai_screenshot_notes: games.ai_screenshot_notes })
    .from(games)
    .where(eq(games.id, gameId))
    .limit(1);
  return rows[0];
}

export interface GameListDto {
  id: string;
  name: string;
  genre: string | null;
  developer: string | null;
  description: string | null;
  minPlayers: number | null;
  maxPlayers: number | null;
  supportsAllModes: boolean;
  iconUrl: string | null;
  coverUrl: string | null;
  color: string | null;
  mapCount: number;
  modeCount: number;
}

/** `GET /api/games` rows: distinct map names / mode ids per game, ordered by name. */
export async function listGamesWithCounts(ex: Executor): Promise<GameListDto[]> {
  return ex
    .select({
      id: games.id,
      name: games.name,
      genre: games.genre,
      developer: games.developer,
      description: games.description,
      minPlayers: games.min_players,
      maxPlayers: games.max_players,
      supportsAllModes: games.supports_all_modes,
      iconUrl: games.icon_url,
      coverUrl: games.cover_url,
      color: games.color,
      // Correlated scalar subqueries; the outer reference must be table-qualified (a bare "id" would bind to the inner table).
      mapCount: sql<number>`(select count(distinct m.name) from game_maps m where m.game_id = "games"."id")`.mapWith(Number),
      modeCount: sql<number>`(select count(distinct mo.id) from game_modes mo where mo.game_id = "games"."id")`.mapWith(Number),
    })
    .from(games)
    .orderBy(asc(games.name), asc(games.id));
}

export interface GameDto {
  id: string;
  name: string;
  genre: string | null;
  developer: string | null;
  description: string | null;
  minPlayers: number | null;
  maxPlayers: number | null;
  supportsAllModes: boolean;
  iconUrl: string | null;
  coverUrl: string | null;
}

/** `GET /api/games/:gameId` row. */
export async function getGameDto(ex: Executor, gameId: string): Promise<GameDto | undefined> {
  const rows = await ex
    .select({
      id: games.id,
      name: games.name,
      genre: games.genre,
      developer: games.developer,
      description: games.description,
      minPlayers: games.min_players,
      maxPlayers: games.max_players,
      supportsAllModes: games.supports_all_modes,
      iconUrl: games.icon_url,
      coverUrl: games.cover_url,
    })
    .from(games)
    .where(eq(games.id, gameId))
    .limit(1);
  return rows[0];
}

/** `games.scoring_config` default position spread (typed jsonb), or null. */
export async function getGameScoringConfig(ex: Executor, gameId: string): Promise<GameRow['scoring_config']> {
  const rows = await ex.select({ c: games.scoring_config }).from(games).where(eq(games.id, gameId)).limit(1);
  return rows[0]?.c ?? null;
}

// ─── modes ───────────────────────────────────────────────────────────────────

export async function getMode(ex: Executor, gameId: string, modeId: string): Promise<GameModeRow | undefined> {
  const rows = await ex
    .select()
    .from(gameModes)
    .where(and(eq(gameModes.id, modeId), eq(gameModes.game_id, gameId)))
    .limit(1);
  return rows[0];
}

/** Mode lookup by id only (tournament bracket generation has no game id handy; ids are unique per game in practice). */
export async function getModeById(ex: Executor, modeId: string): Promise<GameModeRow | undefined> {
  const rows = await ex
    .select()
    .from(gameModes)
    .where(eq(gameModes.id, modeId))
    .orderBy(asc(gameModes.game_id))
    .limit(1);
  return rows[0];
}

export async function listModes(ex: Executor, gameId: string): Promise<GameModeRow[]> {
  return ex.select().from(gameModes).where(eq(gameModes.game_id, gameId)).orderBy(asc(gameModes.name), asc(gameModes.id));
}

export interface GameModeListDto {
  id: string;
  name: string;
  description: string | null;
  team_size: number | null;
  max_players: number | null;
}

/** `GET /api/games/:gameId/modes` rows (carries the game's max_players). */
export async function listModesDto(ex: Executor, gameId: string): Promise<GameModeListDto[]> {
  return ex
    .select({
      id: gameModes.id,
      name: gameModes.name,
      description: gameModes.description,
      team_size: gameModes.team_size,
      max_players: games.max_players,
    })
    .from(gameModes)
    .innerJoin(games, eq(gameModes.game_id, games.id))
    .where(eq(gameModes.game_id, gameId))
    .orderBy(asc(gameModes.name), asc(gameModes.id));
}

/** Scoring type of a mode, or undefined when the mode does not exist. */
export async function getModeScoringType(ex: Executor, gameId: string, modeId: string): Promise<string | undefined> {
  const rows = await ex
    .select({ scoring_type: gameModes.scoring_type })
    .from(gameModes)
    .where(and(eq(gameModes.id, modeId), eq(gameModes.game_id, gameId)))
    .limit(1);
  return rows[0]?.scoring_type;
}

/** `max_teams` + `scoring_type` of a mode (voice-channel layout and team-count decisions). */
export async function getModeScoringTypeAndMaxTeams(
  ex: Executor,
  gameId: string,
  modeId: string,
): Promise<{ max_teams: number; scoring_type: string } | undefined> {
  const rows = await ex
    .select({ max_teams: gameModes.max_teams, scoring_type: gameModes.scoring_type })
    .from(gameModes)
    .where(and(eq(gameModes.id, modeId), eq(gameModes.game_id, gameId)))
    .limit(1);
  return rows[0];
}

/** Non-workshop modes (all of them), used for Overwatch 2 tournament bracket map pools. */
export async function listNonWorkshopModes(ex: Executor, gameId: string): Promise<GameModeRow[]> {
  return ex
    .select()
    .from(gameModes)
    .where(and(eq(gameModes.game_id, gameId), notLike(gameModes.id, '%workshop%')))
    .orderBy(asc(gameModes.id));
}

/** Non-workshop, non-custom modes with the same team size (NULL team size matches NULL). */
export async function listModesByTeamSize(ex: Executor, gameId: string, teamSize: number | null): Promise<GameModeRow[]> {
  return ex
    .select()
    .from(gameModes)
    .where(
      and(
        eq(gameModes.game_id, gameId),
        teamSize === null ? sql`${gameModes.team_size} is null` : eq(gameModes.team_size, teamSize),
        notLike(gameModes.id, '%workshop%'),
        notLike(gameModes.id, '%custom%'),
      ),
    )
    .orderBy(asc(gameModes.id));
}

// ─── maps ────────────────────────────────────────────────────────────────────

export async function getMap(ex: Executor, gameId: string, mapId: string): Promise<GameMapRow | undefined> {
  const rows = await ex
    .select()
    .from(gameMaps)
    .where(and(eq(gameMaps.id, mapId), eq(gameMaps.game_id, gameId)))
    .limit(1);
  return rows[0];
}

/** Map name by id alone (queue-processor embeds keep only the cleaned map id). */
export async function getMapNameById(ex: Executor, mapId: string): Promise<string | undefined> {
  const rows = await ex
    .select({ name: gameMaps.name })
    .from(gameMaps)
    .where(eq(gameMaps.id, mapId))
    .orderBy(asc(gameMaps.game_id))
    .limit(1);
  return rows[0]?.name;
}

/**
 * Finds a map of a game by exact id, falling back to a case-insensitive "name contains" match.
 * Exact id matches win over fuzzy name matches.
 */
export async function findMapByIdOrName(ex: Executor, gameId: string, mapIdOrName: string): Promise<GameMapRow | undefined> {
  const rows = await ex
    .select()
    .from(gameMaps)
    .where(
      and(
        eq(gameMaps.game_id, gameId),
        or(eq(gameMaps.id, mapIdOrName), ilike(gameMaps.name, `%${escapeLike(mapIdOrName)}%`)),
      ),
    )
    .orderBy(sql`(${gameMaps.id} = ${mapIdOrName}) desc`, asc(gameMaps.id))
    .limit(1);
  return rows[0];
}

/** Fallback lookup used by map embeds: a map id that starts with the base name and ends with the instance suffix. */
export async function findMapByIdPattern(ex: Executor, gameId: string, pattern: string): Promise<GameMapRow | undefined> {
  const rows = await ex
    .select()
    .from(gameMaps)
    .where(and(eq(gameMaps.game_id, gameId), like(gameMaps.id, pattern)))
    .orderBy(asc(gameMaps.id))
    .limit(1);
  return rows[0];
}

/** Map rows (with their mode's scoring type) for a set of map ids, keyed by id; used by scoring. */
export async function listMapsByIds(ex: Executor, gameId: string, mapIds: readonly string[]): Promise<GameMapRow[]> {
  if (mapIds.length === 0) return [];
  return ex
    .select()
    .from(gameMaps)
    .where(and(eq(gameMaps.game_id, gameId), inArray(gameMaps.id, [...mapIds])))
    .orderBy(asc(gameMaps.id));
}

export interface MapWithModeScoring {
  id: string;
  name: string;
  image_url: string | null;
  mode_id: string | null;
  game_id: string;
  mode_scoring_type: string | null;
}

/** Maps of a game by id, each with its mode's scoring type (null when the map has no mode). */
export async function listMapsWithModeScoring(ex: Executor, gameId: string, mapIds: readonly string[]): Promise<MapWithModeScoring[]> {
  if (mapIds.length === 0) return [];
  return ex
    .select({
      id: gameMaps.id,
      name: gameMaps.name,
      image_url: gameMaps.image_url,
      mode_id: gameMaps.mode_id,
      game_id: gameMaps.game_id,
      mode_scoring_type: gameModes.scoring_type,
    })
    .from(gameMaps)
    .leftJoin(gameModes, and(eq(gameMaps.mode_id, gameModes.id), eq(gameMaps.game_id, gameModes.game_id)))
    .where(and(eq(gameMaps.game_id, gameId), inArray(gameMaps.id, [...mapIds])))
    .orderBy(asc(gameMaps.id));
}

/** Scoring type of the mode a map belongs to (undefined when the map or mode is missing). */
export async function getMapModeScoringType(ex: Executor, gameId: string, mapId: string): Promise<string | undefined> {
  const rows = await ex
    .select({ scoring_type: gameModes.scoring_type })
    .from(gameMaps)
    .innerJoin(gameModes, and(eq(gameMaps.mode_id, gameModes.id), eq(gameMaps.game_id, gameModes.game_id)))
    .where(and(eq(gameMaps.game_id, gameId), eq(gameMaps.id, mapId)))
    .limit(1);
  return rows[0]?.scoring_type;
}

export async function listMapsForModes(ex: Executor, gameId: string, modeIds: readonly string[]): Promise<GameMapRow[]> {
  if (modeIds.length === 0) return [];
  return ex
    .select()
    .from(gameMaps)
    .where(and(eq(gameMaps.game_id, gameId), inArray(gameMaps.mode_id, [...modeIds])))
    .orderBy(asc(gameMaps.id));
}

/** `GET /api/games/:gameId/modes/:modeId/maps` rows. */
export async function listMapsForMode(
  ex: Executor,
  gameId: string,
  modeId: string,
): Promise<Array<{ id: string; name: string; modeId: string | null; imageUrl: string | null }>> {
  return ex
    .select({ id: gameMaps.id, name: gameMaps.name, modeId: gameMaps.mode_id, imageUrl: gameMaps.image_url })
    .from(gameMaps)
    .where(and(eq(gameMaps.game_id, gameId), eq(gameMaps.mode_id, modeId)))
    .orderBy(asc(gameMaps.name), asc(gameMaps.id));
}

export interface GameMapListDto {
  id: string;
  name: string;
  modeId?: string | null;
  imageUrl: string | null;
  location: string | null;
  modeName: string | null;
  modeDescription: string | null;
  supportedModes?: string | null;
  tournament_enabled: boolean;
}

/** CS2-style listing: one row per distinct map name with the modes that support it. */
export async function listMapsGroupedWithModes(ex: Executor, gameId: string): Promise<GameMapListDto[]> {
  return ex
    .select({
      id: sql<string>`min(${gameMaps.id})`,
      name: gameMaps.name,
      imageUrl: gameMaps.image_url,
      location: gameMaps.location,
      modeName: sql<string | null>`string_agg(distinct ${gameModes.name}, ',' order by ${gameModes.name})`,
      modeDescription: sql<string | null>`'Supports: ' || string_agg(distinct ${gameModes.name}, ',' order by ${gameModes.name})`,
      supportedModes: sql<string | null>`string_agg(distinct ${gameModes.name}, ',' order by ${gameModes.name})`,
      tournament_enabled: sql<boolean>`bool_and(${gameMaps.tournament_enabled})`,
    })
    .from(gameMaps)
    .leftJoin(gameModes, and(eq(gameMaps.mode_id, gameModes.id), eq(gameMaps.game_id, gameModes.game_id)))
    .where(eq(gameMaps.game_id, gameId))
    .groupBy(gameMaps.name, gameMaps.image_url, gameMaps.location)
    .orderBy(asc(gameMaps.name));
}

/** Deduplicated listing for games that support all modes. */
export async function listMapsDeduplicated(ex: Executor, gameId: string): Promise<GameMapListDto[]> {
  return ex
    .select({
      id: sql<string>`min(${gameMaps.id})`,
      name: gameMaps.name,
      modeId: sql<string | null>`min(${gameMaps.mode_id})`,
      imageUrl: gameMaps.image_url,
      location: gameMaps.location,
      modeName: sql<string>`'All Modes'`,
      modeDescription: sql<string>`'Available for all game modes'`,
      tournament_enabled: sql<boolean>`bool_and(${gameMaps.tournament_enabled})`,
    })
    .from(gameMaps)
    .where(eq(gameMaps.game_id, gameId))
    .groupBy(gameMaps.name, gameMaps.image_url, gameMaps.location)
    .orderBy(asc(gameMaps.name));
}

/** Every mode/map combination for games with mode-specific map pools. */
export async function listMapModeCombinations(ex: Executor, gameId: string): Promise<GameMapListDto[]> {
  return ex
    .select({
      id: gameMaps.id,
      name: gameMaps.name,
      modeId: gameMaps.mode_id,
      imageUrl: gameMaps.image_url,
      location: gameMaps.location,
      modeName: gameModes.name,
      modeDescription: gameModes.description,
      tournament_enabled: gameMaps.tournament_enabled,
    })
    .from(gameMaps)
    .leftJoin(gameModes, and(eq(gameMaps.mode_id, gameModes.id), eq(gameMaps.game_id, gameModes.game_id)))
    .where(eq(gameMaps.game_id, gameId))
    .orderBy(asc(gameMaps.name), asc(gameMaps.id), asc(gameModes.id));
}

/**
 * Sets `tournament_enabled` for every map row with each given name in one transaction-friendly pass.
 * Returns the number of rows updated.
 */
export async function setMapsTournamentEnabled(
  ex: Executor,
  gameId: string,
  updates: ReadonlyArray<{ name: string; tournament_enabled: boolean }>,
): Promise<number> {
  let updated = 0;
  for (const item of updates) {
    const rows = await ex
      .update(gameMaps)
      .set({ tournament_enabled: item.tournament_enabled, updated_at: new Date() })
      .where(and(eq(gameMaps.game_id, gameId), eq(gameMaps.name, item.name)))
      .returning({ id: gameMaps.id });
    updated += rows.length;
  }
  return updated;
}

// ─── stat definitions ────────────────────────────────────────────────────────

export async function listStatDefinitions(ex: Executor, gameId: string): Promise<GameStatDefinitionRow[]> {
  return ex
    .select()
    .from(gameStatDefinitions)
    .where(eq(gameStatDefinitions.game_id, gameId))
    .orderBy(asc(gameStatDefinitions.sort_order), asc(gameStatDefinitions.id));
}

export async function countStatDefinitions(ex: Executor, gameId: string): Promise<number> {
  const [row] = await ex.select({ n: count() }).from(gameStatDefinitions).where(eq(gameStatDefinitions.game_id, gameId));
  return row?.n ?? 0;
}

/** Games that have at least one stat definition (id + name), ordered by name. */
export async function listGamesWithStatDefinitions(ex: Executor): Promise<Array<{ id: string; name: string }>> {
  return ex
    .selectDistinct({ id: games.id, name: games.name })
    .from(games)
    .innerJoin(gameStatDefinitions, eq(games.id, gameStatDefinitions.game_id))
    .orderBy(asc(games.name), asc(games.id));
}
