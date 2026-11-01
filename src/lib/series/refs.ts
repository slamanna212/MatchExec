/**
 * Which series a match / tournament belongs to, for the list endpoints (cards link back to the series).
 * Leaf module (schema only) so the matches and tournaments domains can import it without a cycle.
 */
import { asc, eq, inArray, or } from 'drizzle-orm';
import type { Executor } from '../../../lib/db';
import { series, seriesEvents } from '../../../lib/db/schema';

export interface SeriesRef { id: string; name: string }

/** Series each match belongs to: directly, or through the series its tournament is part of. */
export async function listSeriesRefsForMatches(
  ex: Executor,
  rows: Array<{ id: string; tournament_id: string | null }>,
): Promise<Map<string, SeriesRef[]>> {
  const out = new Map<string, SeriesRef[]>();
  if (rows.length === 0) return out;
  const matchIds = rows.map((r) => r.id);
  const tournamentIds = [...new Set(rows.map((r) => r.tournament_id).filter((t): t is string => !!t))];
  const events = await ex
    .select({ match_id: seriesEvents.match_id, tournament_id: seriesEvents.tournament_id, id: series.id, name: series.name })
    .from(seriesEvents).innerJoin(series, eq(series.id, seriesEvents.series_id))
    .where(or(inArray(seriesEvents.match_id, matchIds), tournamentIds.length ? inArray(seriesEvents.tournament_id, tournamentIds) : undefined))
    .orderBy(asc(series.id));
  for (const row of rows) {
    const refs = new Map<string, SeriesRef>();
    for (const e of events) {
      if (e.match_id === row.id || (row.tournament_id && e.tournament_id === row.tournament_id)) refs.set(e.id, { id: e.id, name: e.name });
    }
    out.set(row.id, [...refs.values()]);
  }
  return out;
}

/** Series each tournament belongs to. */
export async function listSeriesRefsForTournaments(ex: Executor, tournamentIds: string[]): Promise<Map<string, SeriesRef[]>> {
  const out = new Map<string, SeriesRef[]>();
  if (tournamentIds.length === 0) return out;
  const rows = await ex
    .select({ tournament_id: seriesEvents.tournament_id, id: series.id, name: series.name })
    .from(seriesEvents).innerJoin(series, eq(series.id, seriesEvents.series_id))
    .where(inArray(seriesEvents.tournament_id, tournamentIds))
    .orderBy(asc(series.id));
  for (const r of rows) {
    if (!r.tournament_id) continue;
    const list = out.get(r.tournament_id) ?? [];
    if (!list.some((s) => s.id === r.id)) list.push({ id: r.id, name: r.name });
    out.set(r.tournament_id, list);
  }
  return out;
}
