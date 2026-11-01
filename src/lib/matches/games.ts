/** match_games: per-map rows (initialisation, listing, notes) and the scoring-type lookup for a game. */
import { and, asc, desc, eq, gt, inArray, isNotNull, lte, min, sql } from 'drizzle-orm';
import type { Executor } from '../../../lib/db';
import { matchGamePlacements, matchGames, matchParticipants, matchTeams, matches, scorecardSubmissions } from '../../../lib/db/schema';
import { logger } from '../logger';
import { cleanMapId } from '../utils/map-utils';
import { getMap, getMapModeScoringType, getModeScoringType, listMapsWithModeScoring, type MapWithModeScoring } from '../games';
import { matchGameIdFor } from './ids';
import { lockMatch } from './teams';

export type MatchGameRow = typeof matchGames.$inferSelect;
export type ScoringType = 'Normal' | 'FFA' | 'Position';

const isScoringType = (v?: string | null): v is ScoringType => v === 'Normal' || v === 'FFA' || v === 'Position';

/** The match's maps as strings (match.maps is jsonb; tolerate non-string junk). */
export function mapIdsOf(maps: unknown): string[] {
  return Array.isArray(maps) ? maps.filter((m): m is string => typeof m === 'string') : [];
}

/**
 * Create the match_games rows for all maps of a match. Idempotent: existing `${matchId}_game_N` rows are left alone.
 * The first map is 'ongoing', the rest 'pending'. A temporary note-only row (round <= 0, created by the map-notes API
 * before the games exist) is folded into the real row's `notes` and removed.
 */
export async function initializeMatchGames(ex: Executor, matchId: string): Promise<void> {
  await ex.transaction(async (tx) => {
    const match = await lockMatch(tx, matchId);
    const maps = mapIdsOf(match?.maps);
    if (!match || maps.length === 0) {
      logger.debug('initializeMatchGames - no maps found for match');
      return;
    }
    for (let i = 0; i < maps.length; i++) {
      const mapId = maps[i];
      const id = matchGameIdFor(matchId, i + 1);
      const [existing] = await tx.select({ id: matchGames.id }).from(matchGames).where(eq(matchGames.id, id));
      if (existing) continue;

      const [noteEntry] = await tx.select({ id: matchGames.id, notes: matchGames.notes }).from(matchGames)
        .where(and(eq(matchGames.match_id, matchId), eq(matchGames.map_id, mapId), lte(matchGames.round, 0))).limit(1);
      await tx.insert(matchGames).values({
        id, match_id: matchId, round: i + 1, map_id: mapId, notes: noteEntry?.notes ?? '', status: i === 0 ? 'ongoing' : 'pending',
      }).onConflictDoNothing();
      if (noteEntry) await tx.delete(matchGames).where(eq(matchGames.id, noteEntry.id));
    }
  });
}

/**
 * Ensure a match_games row exists for the given id. Only creates a row for ids following the `${matchId}_game_N`
 * convention (and only when the match exists); any other unknown id throws so arbitrary ids can never mint rows. An
 * existing row must belong to matchId.
 */
export async function ensureMatchGameExists(ex: Executor, matchGameId: string, matchId: string): Promise<void> {
  const [row] = await ex.select({ id: matchGames.id, match_id: matchGames.match_id }).from(matchGames).where(eq(matchGames.id, matchGameId));
  if (row) {
    if (row.match_id !== matchId) throw new Error(`Game ${matchGameId} does not belong to match ${matchId}`);
    return;
  }
  const prefix = `${matchId}_game_`;
  const roundSuffix = matchGameId.startsWith(prefix) ? matchGameId.slice(prefix.length) : '';
  if (!/^[1-9]\d*$/.test(roundSuffix)) throw new Error(`Game ${matchGameId} not found for match ${matchId}`);
  const round = Number(roundSuffix);

  const [match] = await ex.select({ id: matches.id, maps: matches.maps }).from(matches).where(eq(matches.id, matchId));
  if (!match) throw new Error(`Match ${matchId} not found`);

  // Mirror initializeMatchGames: game N plays the match's Nth map.
  const mapId = mapIdsOf(match.maps)[round - 1] ?? null;
  await ex.insert(matchGames).values({ id: matchGameId, match_id: matchId, round, map_id: mapId, status: 'ongoing' }).onConflictDoNothing();
  logger.debug(`Created match game entry ${matchGameId} (round ${round}) for match ${matchId}`);
}

/**
 * Scoring type of a match game: its map's mode, falling back to the match's own mode. Null when unknown.
 */
export async function getScoringTypeForGame(ex: Executor, matchGameId: string): Promise<ScoringType | null> {
  const [row] = await ex.select({ map_id: matchGames.map_id, game_id: matches.game_id, mode_id: matches.mode_id })
    .from(matchGames).innerJoin(matches, eq(matches.id, matchGames.match_id)).where(eq(matchGames.id, matchGameId));
  if (!row) return null;
  if (row.map_id) {
    const t = await getMapModeScoringType(ex, row.game_id, cleanMapId(row.map_id));
    if (isScoringType(t)) return t;
  }
  if (row.mode_id) {
    const t = await getModeScoringType(ex, row.game_id, row.mode_id);
    if (isScoringType(t)) return t;
  }
  return null;
}

/** Display name of a match's (possibly instance-suffixed) map, scoped to the match's game. */
export async function lookupMapName(ex: Executor, matchId: string, mapId: string | null | undefined): Promise<string | null> {
  if (!mapId) return null;
  const [match] = await ex.select({ game_id: matches.game_id }).from(matches).where(eq(matches.id, matchId));
  if (!match) return null;
  return (await getMap(ex, match.game_id, cleanMapId(mapId)))?.name ?? null;
}

/** game_maps rows for (possibly instance-suffixed) map ids, keyed by clean id; scoped to the game (ids are only unique per game). */
export async function lookupMaps(ex: Executor, gameId: string, mapIds: Array<string | null | undefined>): Promise<Record<string, MapWithModeScoring>> {
  const cleanIds = [...new Set(mapIds.filter((id): id is string => !!id).map(cleanMapId))];
  if (!gameId || cleanIds.length === 0) return {};
  const rows = await listMapsWithModeScoring(ex, gameId, cleanIds);
  return Object.fromEntries(rows.map((r) => [r.id, r]));
}

export interface PlacementView {
  entity_type: 'team' | 'participant';
  entity_id: string;
  position: number | null;
  score: number | null;
  points_awarded: number | null;
  is_winner: boolean;
}

export async function listPlacements(ex: Executor, matchGameId: string): Promise<PlacementView[]> {
  return ex.select({
    entity_type: matchGamePlacements.entity_type, entity_id: matchGamePlacements.entity_id, position: matchGamePlacements.position,
    score: matchGamePlacements.score, points_awarded: matchGamePlacements.points_awarded, is_winner: matchGamePlacements.is_winner,
  }).from(matchGamePlacements).where(eq(matchGamePlacements.match_game_id, matchGameId))
    .orderBy(sql`${matchGamePlacements.position} ASC NULLS LAST`, asc(matchGamePlacements.entity_id));
}

/** Legacy-shaped result summary derived from placements (kept in the API so the UI keeps working). */
export interface LegacyGameFields {
  winner_id?: string;
  participant_winner_id?: string;
  is_ffa_mode: boolean;
  position_results?: string;
  points_awarded?: string;
}

export function legacyFieldsFromPlacements(
  placements: PlacementView[],
  teamOrderById: Map<string, number>,
  scoringType: string | null | undefined,
): LegacyGameFields {
  if (placements.length === 0) return { is_ffa_mode: false };
  const participantRows = placements.filter((p) => p.entity_type === 'participant');
  const teamRows = placements.filter((p) => p.entity_type === 'team');
  if (scoringType === 'Position' || (scoringType !== 'Normal' && scoringType !== 'FFA' && participantRows.filter((p) => p.position != null).length > 1)) {
    const results: Record<string, number> = {};
    const points: Record<string, number> = {};
    for (const p of participantRows) {
      if (p.position != null) results[p.entity_id] = p.position;
      points[p.entity_id] = p.points_awarded ?? 0;
    }
    return { is_ffa_mode: false, position_results: JSON.stringify(results), points_awarded: JSON.stringify(points) };
  }
  if (participantRows.length > 0 && teamRows.length === 0) {
    return { is_ffa_mode: true, participant_winner_id: participantRows.find((p) => p.is_winner)?.entity_id };
  }
  const winner = teamRows.find((p) => p.is_winner);
  if (!winner) return { is_ffa_mode: false, winner_id: teamRows.length > 0 && teamRows.every((p) => p.position === 1) ? 'draw' : undefined };
  const order = teamOrderById.get(winner.entity_id);
  return { is_ffa_mode: false, winner_id: order === 0 ? 'team1' : order === 1 ? 'team2' : undefined };
}

/** All real games of a match (rounds >= 1) with map data and legacy-shaped result fields. */
export async function getMatchGames(ex: Executor, matchId: string): Promise<Array<Record<string, unknown>>> {
  const games = await ex.select().from(matchGames).where(and(eq(matchGames.match_id, matchId), gt(matchGames.round, 0)))
    .orderBy(asc(matchGames.round));
  if (games.length === 0) return [];
  const [match] = await ex.select({ game_id: matches.game_id }).from(matches).where(eq(matches.id, matchId));
  const gameId = match?.game_id ?? '';
  const mapLookup = await lookupMaps(ex, gameId, games.map((g) => g.map_id));

  const placementRows = await ex.select().from(matchGamePlacements)
    .where(inArray(matchGamePlacements.match_game_id, games.map((g) => g.id)));
  const teams = await ex.select({ id: matchTeams.id, team_order: matchTeams.team_order }).from(matchTeams).where(eq(matchTeams.match_id, matchId));
  const teamOrderById = new Map(teams.map((t) => [t.id, t.team_order]));

  return games.map((game) => {
    const mapData = game.map_id ? mapLookup[cleanMapId(game.map_id)] : undefined;
    const placements = placementRows.filter((p) => p.match_game_id === game.id) as unknown as PlacementView[];
    const out: Record<string, unknown> = { ...game, match_game_id: gameId };
    if (mapData) {
      out.map_name = mapData.name;
      out.image_url = mapData.image_url;
      out.mode_id = mapData.mode_id;
      out.game_id = mapData.game_id;
      out.mode_scoring_type = mapData.mode_scoring_type;
    }
    Object.assign(out, legacyFieldsFromPlacements(placements, teamOrderById, mapData?.mode_scoring_type));
    return out;
  });
}

// ─── Map notes ───────────────────────────────────────────────────────────────

export async function getMapNotes(ex: Executor, matchId: string): Promise<Record<string, string>> {
  const rows = await ex.select({ map_id: matchGames.map_id, notes: matchGames.notes }).from(matchGames)
    .where(eq(matchGames.match_id, matchId)).orderBy(asc(matchGames.round));
  const out: Record<string, string> = {};
  for (const r of rows) if (r.map_id && r.notes) out[r.map_id] = r.notes;
  return out;
}

/**
 * Save a note for a map. Updates the real game row when it exists; before the games are initialised a temporary
 * note-only row (round 0, -1, -2, ... : (match_id, round) is unique) holds it until initializeMatchGames folds it in.
 */
export async function saveMapNote(ex: Executor, matchId: string, mapId: string, note: string): Promise<void> {
  await ex.transaction(async (tx) => {
    await lockMatch(tx, matchId);
    const [real] = await tx.select({ id: matchGames.id }).from(matchGames)
      .where(and(eq(matchGames.match_id, matchId), eq(matchGames.map_id, mapId), gt(matchGames.round, 0))).limit(1);
    if (real) {
      await tx.update(matchGames).set({ notes: note }).where(eq(matchGames.id, real.id));
      return;
    }
    const [temp] = await tx.select({ id: matchGames.id }).from(matchGames)
      .where(and(eq(matchGames.match_id, matchId), eq(matchGames.map_id, mapId), lte(matchGames.round, 0))).limit(1);
    if (temp) {
      await tx.update(matchGames).set({ notes: note }).where(eq(matchGames.id, temp.id));
      return;
    }
    const [lowest] = await tx.select({ lowest: min(matchGames.round) }).from(matchGames).where(eq(matchGames.match_id, matchId));
    const round = lowest?.lowest != null && lowest.lowest <= 0 ? lowest.lowest - 1 : 0;
    await tx.insert(matchGames).values({
      id: `note-${matchId}-${mapId}-${Date.now()}`, match_id: matchId, round, map_id: mapId, notes: note, status: 'pending',
    });
  });
}

// ─── Aggregates used by completion logic ─────────────────────────────────────

export async function listMatchGameStatuses(ex: Executor, matchId: string): Promise<Array<{ id: string; status: MatchGameRow['status'] }>> {
  return ex.select({ id: matchGames.id, status: matchGames.status }).from(matchGames)
    .where(and(eq(matchGames.match_id, matchId), gt(matchGames.round, 0))).orderBy(asc(matchGames.round));
}

/** True when the match has games and every one is completed. */
export async function areAllGamesCompleted(ex: Executor, matchId: string): Promise<boolean> {
  const games = await listMatchGameStatuses(ex, matchId);
  return games.length > 0 && games.every((g) => g.status === 'completed');
}

export async function getOngoingGame(ex: Executor, matchId: string): Promise<{ id: string; round: number; map_id: string | null } | undefined> {
  const [row] = await ex.select({ id: matchGames.id, round: matchGames.round, map_id: matchGames.map_id }).from(matchGames)
    .where(and(eq(matchGames.match_id, matchId), eq(matchGames.status, 'ongoing'))).orderBy(asc(matchGames.round)).limit(1);
  return row;
}

export async function getMatchGame(ex: Executor, matchGameId: string): Promise<MatchGameRow | undefined> {
  const [row] = await ex.select().from(matchGames).where(eq(matchGames.id, matchGameId));
  return row;
}

export async function getMatchGameInMatch(ex: Executor, matchId: string, matchGameId: string): Promise<MatchGameRow | undefined> {
  const [row] = await ex.select().from(matchGames).where(and(eq(matchGames.id, matchGameId), eq(matchGames.match_id, matchId)));
  return row;
}

/** The participant row for the given ids (used by result validation). */
export async function listParticipantNames(ex: Executor, ids: readonly string[]): Promise<Map<string, { username: string; discord_user_id: string | null }>> {
  if (ids.length === 0) return new Map();
  const rows = await ex.select({ id: matchParticipants.id, username: matchParticipants.username, discord_user_id: matchParticipants.discord_user_id })
    .from(matchParticipants).where(inArray(matchParticipants.id, [...ids]));
  return new Map(rows.map((r) => [r.id, r]));
}

// TODO(stats): scorecard_submissions belongs to Stage 2 item 8; this one read serves the scoring UI's suggestions.
/** Latest approved submission's AI-suggested finishing order for a game (participantId -> position), or null. */
export async function getSuggestedPositions(ex: Executor, matchId: string, matchGameId: string): Promise<Record<string, number> | null> {
  const rows = await ex.select({ suggested_positions: scorecardSubmissions.suggested_positions }).from(scorecardSubmissions)
    .where(and(
      eq(scorecardSubmissions.match_id, matchId), eq(scorecardSubmissions.match_game_id, matchGameId),
      inArray(scorecardSubmissions.review_status, ['approved', 'auto_approved']), isNotNull(scorecardSubmissions.suggested_positions),
    ))
    .orderBy(desc(scorecardSubmissions.created_at), desc(scorecardSubmissions.id));
  for (const row of rows) {
    // Stored data came from AI output, so it is re-checked before being handed to the UI.
    const parsed = row.suggested_positions;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue;
    const out: Record<string, number> = {};
    for (const [participantId, position] of Object.entries(parsed)) {
      if (typeof position === 'number' && Number.isInteger(position) && position >= 1) out[participantId] = position;
    }
    if (Object.keys(out).length > 0) return out;
  }
  return null;
}

/** How many of a match's games have had their Discord map notification queued (stats-enabled matches hold them). */
export async function areAllMapNotificationsSent(ex: Executor, matchId: string): Promise<{ total: number; notified: number }> {
  const rows = await ex.select({ notified: matchGames.discord_notified }).from(matchGames)
    .where(and(eq(matchGames.match_id, matchId), gt(matchGames.round, 0)));
  return { total: rows.length, notified: rows.filter((r) => r.notified).length };
}
