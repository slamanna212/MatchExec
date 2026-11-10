/**
 * Memo for `getSeriesStandingsResponse`: the series page re-polls standings every few seconds while a series runs, and
 * computing them loads ~10 tables. The cache entry is keyed by (series, scope, view) and is valid only while a one-query
 * fingerprint of every row the computation reads is unchanged.
 *
 * The fingerprint uses each row's `xmin` (the id of the transaction that wrote that row version, so it changes on every
 * INSERT and UPDATE, including tables without an `updated_at` such as placements or roster `left_at` changes) together
 * with the row count of each set (which catches DELETEs). Rows covered, mirroring `computeResponse` / `loadStandingsData`:
 *   series, its stages, events, entrants and members; the matches of its match events and of its tournament events, with
 *   their tournament_matches, teams, participants, games and placements; its tournaments, their teams and team members;
 *   and game_modes (scoring type).
 *
 * Entries also expire after `MAX_AGE_MS` and the cache holds at most `MAX_ENTRIES`, so a missed input can never be stale
 * for long. Per process; there is nothing to invalidate across pods because every read re-checks the fingerprint.
 */
import { and, eq, inArray, isNotNull, or, sql, type SQL } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import type { Executor } from '../../../lib/db';
import {
  gameModes, matchGamePlacements, matchGames, matchParticipants, matchTeams, matches, series, seriesEntrantMembers, seriesEntrants,
  seriesEvents, seriesStages, tournamentMatches, tournamentTeamMembers, tournamentTeams, tournaments,
} from '../../../lib/db/schema';

export const MAX_AGE_MS = 5 * 60_000;
export const MAX_ENTRIES = 100;

/** `count.maxXmin` of the rows of `table` matching `where` (whole table when omitted). */
function stamp(table: PgTable, where?: SQL): SQL {
  const filter = where ? sql` WHERE ${where}` : sql``;
  return sql`(SELECT count(*)::text || '.' || coalesce(max(${table}.xmin::text::bigint), 0)::text FROM ${table}${filter})`;
}

/** Change marker for everything the standings of `seriesId` are computed from, or null when the series does not exist. */
export async function getStandingsFingerprint(ex: Executor, seriesId: string): Promise<string | null> {
  const eventMatchIds = ex.select({ id: seriesEvents.match_id }).from(seriesEvents)
    .where(and(eq(seriesEvents.series_id, seriesId), isNotNull(seriesEvents.match_id)));
  const eventTournamentIds = ex.select({ id: seriesEvents.tournament_id }).from(seriesEvents)
    .where(and(eq(seriesEvents.series_id, seriesId), isNotNull(seriesEvents.tournament_id)));
  const matchIds = ex.select({ id: matches.id }).from(matches)
    .where(or(inArray(matches.id, eventMatchIds), inArray(matches.tournament_id, eventTournamentIds)));
  const matchTournamentIds = ex.select({ id: matches.tournament_id }).from(matches)
    .where(and(inArray(matches.id, matchIds), isNotNull(matches.tournament_id)));
  const teamWhere = or(inArray(tournamentTeams.tournament_id, eventTournamentIds), inArray(tournamentTeams.tournament_id, matchTournamentIds));
  const teamIds = ex.select({ id: tournamentTeams.id }).from(tournamentTeams).where(teamWhere);
  const gameIds = ex.select({ id: matchGames.id }).from(matchGames).where(inArray(matchGames.match_id, matchIds));

  const parts: SQL[] = [
    stamp(seriesStages, eq(seriesStages.series_id, seriesId)),
    stamp(seriesEvents, eq(seriesEvents.series_id, seriesId)),
    stamp(seriesEntrants, eq(seriesEntrants.series_id, seriesId)),
    stamp(seriesEntrantMembers, eq(seriesEntrantMembers.series_id, seriesId)),
    stamp(matches, inArray(matches.id, matchIds)),
    stamp(tournamentMatches, inArray(tournamentMatches.match_id, matchIds)),
    stamp(matchTeams, inArray(matchTeams.match_id, matchIds)),
    stamp(matchParticipants, inArray(matchParticipants.match_id, matchIds)),
    stamp(matchGames, inArray(matchGames.match_id, matchIds)),
    stamp(matchGamePlacements, inArray(matchGamePlacements.match_game_id, gameIds)),
    stamp(tournaments, inArray(tournaments.id, eventTournamentIds)),
    stamp(tournamentTeams, teamWhere),
    stamp(tournamentTeamMembers, inArray(tournamentTeamMembers.team_id, teamIds)),
    stamp(gameModes),
  ];
  const [row] = await ex
    .select({ fp: sql<string>`${series}.xmin::text || '|' || ${sql.join(parts, sql` || '|' || `)}` })
    .from(series)
    .where(eq(series.id, seriesId));
  return row?.fp ?? null;
}

interface Entry<T> { fingerprint: string; value: T; at: number }
const cache = new Map<string, Entry<unknown>>();

/**
 * Return the cached value for `key` when the series' fingerprint is unchanged, otherwise run `compute` and cache it.
 * `compute` returning null (unknown series) is never cached.
 */
export async function withStandingsCache<T>(
  ex: Executor,
  seriesId: string,
  key: string,
  compute: () => Promise<T | null>,
  now = Date.now(),
): Promise<T | null> {
  const fingerprint = await getStandingsFingerprint(ex, seriesId);
  if (fingerprint === null) return compute();
  const cacheKey = `${seriesId}|${key}`;
  const hit = cache.get(cacheKey);
  if (hit && hit.fingerprint === fingerprint && now - hit.at < MAX_AGE_MS) {
    // refresh LRU position
    cache.delete(cacheKey);
    cache.set(cacheKey, hit);
    return hit.value as T;
  }
  const value = await compute();
  if (value !== null) {
    cache.delete(cacheKey);
    cache.set(cacheKey, { fingerprint, value, at: now });
    while (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
  }
  return value;
}

/** Tests: empty the cache. */
export function clearStandingsCache(): void {
  cache.clear();
}

export function standingsCacheSize(): number {
  return cache.size;
}
