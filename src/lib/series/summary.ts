/**
 * Read models for the series UI: events joined with their match/tournament and game, and per-series summaries (counts,
 * next event, identity game, champion). Writes live in series.ts / events.ts, scoring in standings.ts.
 */
import { and, asc, desc, eq, getTableColumns, inArray, sql } from 'drizzle-orm';
import type { Executor } from '../../../lib/db';
import { games, matchParticipants, matches, series, seriesEvents, tournamentParticipants, tournaments } from '../../../lib/db/schema';
import type { SeriesEventRow } from './events';
import type { SeriesRow } from './series';
import { getSeriesStandings } from './standings';

export interface SeriesGameInfo {
  game_id: string | null;
  game_name: string | null;
  game_icon: string | null;
  game_color: string | null;
  game_cover: string | null;
}

export interface SeriesEventDetail extends SeriesEventRow, SeriesGameInfo {
  /** Name of the linked match/tournament; null when the target was deleted. */
  name: string | null;
  /** Status of the linked match/tournament. */
  status: string | null;
  event_image_url: string | null;
  /** event_date when set, else the match/tournament start date. */
  start_date: Date | null;
}

export interface SeriesNextEvent extends SeriesGameInfo {
  id: string;
  name: string | null;
  type: 'match' | 'tournament';
  event_order: number;
  start_date: Date | null;
}

export interface SeriesSummary extends SeriesRow {
  event_count: number;
  completed_event_count: number;
  participant_count: number;
  next_event: SeriesNextEvent | null;
  /** Game of the last event in event_order (used by history cards). */
  last_event_game: SeriesGameInfo | null;
  /** The series' own game (series.game_id), used as an identity fallback. */
  series_game: SeriesGameInfo | null;
  /** Rank-1 username(s) for complete series; null otherwise or when no standings. */
  champion: string | null;
}

const FINISHED_EVENT_STATUSES = new Set(['complete', 'cancelled']);

export function isEventFinished(status: string | null | undefined): boolean {
  // A missing target (deleted match/tournament) can never progress, so treat it as finished.
  return !status || FINISHED_EVENT_STATUSES.has(status);
}

/** series_events joined with the linked match / tournament and its game. */
function selectEventDetails(ex: Executor) {
  return ex
    .select({
      ...getTableColumns(seriesEvents),
      mName: matches.name, tName: tournaments.name,
      mStatus: matches.status, tStatus: tournaments.status,
      mImage: matches.event_image_url, tImage: tournaments.event_image_url,
      mStart: matches.start_date, tStart: tournaments.start_date,
      game_id: games.id, game_name: games.name, game_icon: games.icon_url, game_color: games.color, game_cover: games.cover_url,
    })
    .from(seriesEvents)
    .leftJoin(matches, and(eq(seriesEvents.event_type, 'match'), eq(matches.id, seriesEvents.match_id)))
    .leftJoin(tournaments, and(eq(seriesEvents.event_type, 'tournament'), eq(tournaments.id, seriesEvents.tournament_id)))
    .leftJoin(games, eq(games.id, sql`coalesce(${matches.game_id}, ${tournaments.game_id})`))
    .$dynamic();
}

type EventDetailRow = Awaited<ReturnType<typeof selectEventDetails>>[number];

function toEventDetail(r: EventDetailRow): SeriesEventDetail {
  const { mName, tName, mStatus, tStatus, mImage, tImage, mStart, tStart, ...rest } = r;
  return {
    ...rest,
    name: mName ?? tName,
    status: mStatus ?? tStatus,
    event_image_url: mImage ?? tImage,
    start_date: r.event_date ?? mStart ?? tStart,
  };
}

/** Events of one series in event_order, joined with name/status/game/date. */
export async function listSeriesEventDetails(ex: Executor, seriesId: string): Promise<SeriesEventDetail[]> {
  const rows = await selectEventDetails(ex).where(eq(seriesEvents.series_id, seriesId)).orderBy(asc(seriesEvents.event_order), asc(seriesEvents.id));
  return rows.map(toEventDetail);
}

function pickGame(e: SeriesGameInfo): SeriesGameInfo {
  return { game_id: e.game_id, game_name: e.game_name, game_icon: e.game_icon, game_color: e.game_color, game_cover: e.game_cover };
}

export interface ListSeriesSummaryOptions {
  statuses?: string[];
  ids?: string[];
  limit?: number;
  offset?: number;
}

/**
 * Lists series with everything the dashboard/history cards need. Uses a fixed number of queries regardless of series
 * count, except the champion lookup, which runs standings for each *complete* series in the page.
 */
export async function listSeriesSummaries(ex: Executor, options: ListSeriesSummaryOptions = {}): Promise<SeriesSummary[]> {
  const statuses = (options.statuses ?? []) as SeriesRow['status'][];
  if (options.ids && options.ids.length === 0) return [];

  const conditions = [
    statuses.length > 0 ? inArray(series.status, statuses) : undefined,
    options.ids ? inArray(series.id, options.ids) : undefined,
  ];
  let query = ex
    .select({ ...getTableColumns(series), sg_name: games.name, sg_icon: games.icon_url, sg_color: games.color, sg_cover: games.cover_url })
    .from(series).leftJoin(games, eq(games.id, series.game_id))
    .where(and(...conditions))
    .orderBy(desc(series.created_at), desc(series.id))
    .$dynamic();
  if (options.limit !== undefined) query = query.limit(options.limit).offset(options.offset ?? 0);
  const rows = await query;
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const events = (await selectEventDetails(ex).where(inArray(seriesEvents.series_id, ids)).orderBy(asc(seriesEvents.series_id), asc(seriesEvents.event_order), asc(seriesEvents.id)))
    .map(toEventDetail);
  const eventsBySeries = new Map<string, SeriesEventDetail[]>();
  for (const e of events) {
    const list = eventsBySeries.get(e.series_id) ?? [];
    list.push(e);
    eventsBySeries.set(e.series_id, list);
  }

  const participantCounts = await countSeriesParticipants(ex, ids);

  const summaries: SeriesSummary[] = [];
  for (const r of rows) {
    const { sg_name: sgName, sg_icon: sgIcon, sg_color: sgColor, sg_cover: sgCover, ...row } = r;
    const evs = eventsBySeries.get(r.id) ?? [];
    const next = evs.find((e) => !isEventFinished(e.status)) ?? null;
    const last = evs.length > 0 ? evs[evs.length - 1] : null;

    let champion: string | null = null;
    if (r.status === 'complete' && evs.length > 0) {
      const standings = await getSeriesStandings(ex, r.id);
      const leaders = standings.filter((s) => s.rank === 1 && s.total_points > 0).map((s) => s.username);
      champion = leaders.length > 0 ? leaders.join(', ') : null;
    }

    summaries.push({
      ...row,
      event_count: evs.length,
      completed_event_count: evs.filter((e) => e.status === 'complete').length,
      participant_count: participantCounts.get(r.id) ?? 0,
      next_event: next ? {
        id: next.id,
        name: next.name,
        type: next.event_type,
        event_order: next.event_order,
        start_date: next.start_date,
        ...pickGame(next),
      } : null,
      last_event_game: last ? pickGame(last) : null,
      series_game: r.game_id ? {
        game_id: r.game_id, game_name: sgName, game_icon: sgIcon, game_color: sgColor, game_cover: sgCover,
      } : null,
      champion,
    });
  }
  return summaries;
}

/**
 * Distinct players per series across all its events: match participants of match events, plus participants of every
 * match in tournament events, plus tournament signups (so a tournament counts before its bracket exists).
 */
async function countSeriesParticipants(ex: Executor, seriesIds: string[]): Promise<Map<string, number>> {
  const players = new Map<string, Set<string>>();
  if (seriesIds.length === 0) return new Map();
  const add = (rows: Array<{ series_id: string; player_key: string }>) => {
    for (const r of rows) {
      const set = players.get(r.series_id) ?? new Set<string>();
      set.add(r.player_key);
      players.set(r.series_id, set);
    }
  };
  const mpKey = sql<string>`coalesce(${matchParticipants.discord_user_id}, ${matchParticipants.user_id})`;

  add(await ex.selectDistinct({ series_id: seriesEvents.series_id, player_key: mpKey })
    .from(seriesEvents)
    .innerJoin(matchParticipants, and(eq(seriesEvents.event_type, 'match'), eq(matchParticipants.match_id, seriesEvents.match_id)))
    .where(inArray(seriesEvents.series_id, seriesIds)));

  add(await ex.selectDistinct({ series_id: seriesEvents.series_id, player_key: mpKey })
    .from(seriesEvents)
    .innerJoin(matches, and(eq(seriesEvents.event_type, 'tournament'), eq(matches.tournament_id, seriesEvents.tournament_id)))
    .innerJoin(matchParticipants, eq(matchParticipants.match_id, matches.id))
    .where(inArray(seriesEvents.series_id, seriesIds)));

  add(await ex.selectDistinct({ series_id: seriesEvents.series_id, player_key: sql<string>`coalesce(${tournamentParticipants.discord_user_id}, ${tournamentParticipants.user_id})` })
    .from(seriesEvents)
    .innerJoin(tournamentParticipants, and(eq(seriesEvents.event_type, 'tournament'), eq(tournamentParticipants.tournament_id, seriesEvents.tournament_id)))
    .where(inArray(seriesEvents.series_id, seriesIds)));

  return new Map([...players].map(([id, set]) => [id, set.size]));
}

export async function countPlayersInSeries(ex: Executor, seriesId: string): Promise<number> {
  return (await countSeriesParticipants(ex, [seriesId])).get(seriesId) ?? 0;
}

export interface SeriesMembership {
  series_id: string;
  series_name: string;
  series_status: string;
  series_event_id: string;
  points_multiplier: number;
  event_order: number;
  /** 'direct' when the entity itself is the event; 'tournament' when a match counts via its tournament. */
  via: 'direct' | 'tournament';
}

const membershipColumns = {
  series_id: series.id, series_name: series.name, series_status: series.status,
  series_event_id: seriesEvents.id, points_multiplier: seriesEvents.points_multiplier, event_order: seriesEvents.event_order,
};

/** Series a match belongs to - directly, or through its tournament being a series event. */
export async function findSeriesForMatch(ex: Executor, matchId: string): Promise<SeriesMembership[]> {
  const direct = await ex.select(membershipColumns).from(seriesEvents).innerJoin(series, eq(series.id, seriesEvents.series_id))
    .where(eq(seriesEvents.match_id, matchId)).orderBy(asc(series.id), asc(seriesEvents.event_order));
  const viaTournament = await ex.select(membershipColumns).from(matches)
    .innerJoin(seriesEvents, eq(seriesEvents.tournament_id, matches.tournament_id))
    .innerJoin(series, eq(series.id, seriesEvents.series_id))
    .where(eq(matches.id, matchId)).orderBy(asc(series.id), asc(seriesEvents.event_order));
  return [
    ...direct.map((r) => ({ ...r, via: 'direct' as const })),
    ...viaTournament.map((r) => ({ ...r, via: 'tournament' as const })),
  ];
}

export async function findSeriesForTournament(ex: Executor, tournamentId: string): Promise<SeriesMembership[]> {
  const rows = await ex.select(membershipColumns).from(seriesEvents).innerJoin(series, eq(series.id, seriesEvents.series_id))
    .where(eq(seriesEvents.tournament_id, tournamentId)).orderBy(asc(series.id), asc(seriesEvents.event_order));
  return rows.map((r) => ({ ...r, via: 'direct' as const }));
}

export async function getSeriesSummary(ex: Executor, seriesId: string): Promise<SeriesSummary | null> {
  const [summary] = await listSeriesSummaries(ex, { ids: [seriesId] });
  return summary ?? null;
}
