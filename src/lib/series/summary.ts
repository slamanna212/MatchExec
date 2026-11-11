/**
 * Read models for the series UI: events joined with their match/tournament and game, and per-series summaries (counts,
 * next event, identity game, champion). Writes live in series.ts / events.ts, scoring in standings.ts.
 */
import { and, asc, desc, eq, getTableColumns, inArray, sql } from 'drizzle-orm';
import type { Executor } from '../../../lib/db';
import {
  games, matchGamePlacements, matchGames, matchParticipants, matchTeams, matches, series, seriesEntrantMembers, seriesEntrants, seriesEvents,
  tournamentParticipants, tournaments,
} from '../../../lib/db/schema';
import type { SeriesChampionDto, SeriesEventDto, SeriesEventStatus } from '../../../shared/series-types';
import type { SeriesEventRow } from './events';
import type { SeriesRow } from './series';
import { getSeriesChampion } from './standings';

export interface SeriesGameInfo {
  game_id: string | null;
  game_name: string | null;
  game_icon: string | null;
  game_color: string | null;
  game_cover: string | null;
}

export interface SeriesEventDetail extends Omit<SeriesEventRow, 'status'>, SeriesGameInfo {
  /** `live` (has a match / tournament) or `planned` (playoff placeholder). */
  status: SeriesEventStatus;
  /** Name of the linked match/tournament (the placeholder's template name when planned); null when the target was deleted. */
  name: string | null;
  /** Status of the linked match/tournament; null for a planned event. */
  target_status: string | null;
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
  /**
   * Players of the series. With entrants: the current roster members of its non-withdrawn entrants. Without entrants
   * (legacy series): the distinct players who appear in its events.
   */
  participant_count: number;
  /** Non-withdrawn entrants (teams for a team series, players for a solo series). 0 for a series without entrants. */
  entrant_count: number;
  next_event: SeriesNextEvent | null;
  /** Game of the last event in event_order (used by history cards). */
  last_event_game: SeriesGameInfo | null;
  /** The series' own game (series.game_id), used as an identity fallback. */
  series_game: SeriesGameInfo | null;
  /** Season playoff winner, else the rank-1 entrant(s) of a complete series; null otherwise or when nobody qualifies. */
  champion: SeriesChampionDto | null;
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
      plannedName: sql<string | null>`coalesce(${seriesEvents.seeding_rule}->'template'->>'name', ${seriesEvents.match_template}->>'name')`,
      plannedStart: sql<string | null>`coalesce(${seriesEvents.seeding_rule}->'template'->>'start_time', ${seriesEvents.match_template}->>'start_date')`,
      mStatus: matches.status, tStatus: tournaments.status,
      mImage: matches.event_image_url, tImage: tournaments.event_image_url,
      mStart: matches.start_date, tStart: tournaments.start_date,
      game_id: games.id, game_name: games.name, game_icon: games.icon_url, game_color: games.color, game_cover: games.cover_url,
    })
    .from(seriesEvents)
    .leftJoin(matches, and(eq(seriesEvents.event_type, 'match'), eq(matches.id, seriesEvents.match_id)))
    .leftJoin(tournaments, and(eq(seriesEvents.event_type, 'tournament'), eq(tournaments.id, seriesEvents.tournament_id)))
    .leftJoin(series, eq(series.id, seriesEvents.series_id))
    // a planned event has no target yet: fall back to its template's game, then the series' game
    .leftJoin(games, eq(games.id, sql`coalesce(${matches.game_id}, ${tournaments.game_id}, ${seriesEvents.seeding_rule}->'template'->>'game_id', ${seriesEvents.match_template}->>'game_id', ${series.game_id})`))
    .$dynamic();
}

type EventDetailRow = Awaited<ReturnType<typeof selectEventDetails>>[number];

function toEventDetail(r: EventDetailRow): SeriesEventDetail {
  const { mName, tName, plannedName, plannedStart, mStatus, tStatus, mImage, tImage, mStart, tStart, ...rest } = r;
  const planned = r.status === 'planned';
  return {
    ...rest,
    name: planned ? plannedName : (mName ?? tName),
    target_status: mStatus ?? tStatus,
    event_image_url: mImage ?? tImage,
    start_date: r.event_date ?? mStart ?? tStart ?? (plannedStart ? new Date(plannedStart) : null),
  };
}

/** Events of one series in event_order, joined with name/status/game/date. */
export async function listSeriesEventDetails(ex: Executor, seriesId: string): Promise<SeriesEventDetail[]> {
  const rows = await selectEventDetails(ex).where(eq(seriesEvents.series_id, seriesId)).orderBy(asc(seriesEvents.event_order), asc(seriesEvents.id));
  return rows.map(toEventDetail);
}

/** The two entrants of every 2-entrant series-created match, with their map wins and the winner. */
async function loadMatchEntrants(ex: Executor, matchIds: string[]): Promise<Map<string, NonNullable<SeriesEventDto['entrants']>>> {
  const out = new Map<string, NonNullable<SeriesEventDto['entrants']>>();
  if (matchIds.length === 0) return out;
  const completedGames = ex.select({ id: matchGames.id }).from(matchGames).where(and(inArray(matchGames.match_id, matchIds), eq(matchGames.status, 'completed')));
  const wins = sql<number>`count(${matchGamePlacements.id}) filter (where ${matchGamePlacements.is_winner})`.mapWith(Number);
  const rows = await ex
    .select({
      match_id: matchTeams.match_id, team_id: matchTeams.id, team_order: matchTeams.team_order, entrant_id: seriesEntrants.id,
      name: seriesEntrants.name, color: seriesEntrants.color, winner_team: matches.winner_team, match_status: matches.status, wins,
    })
    .from(matchTeams)
    .innerJoin(seriesEntrants, eq(seriesEntrants.id, matchTeams.series_entrant_id))
    .innerJoin(matches, eq(matches.id, matchTeams.match_id))
    .leftJoin(matchGamePlacements, and(
      eq(matchGamePlacements.entity_id, matchTeams.id), eq(matchGamePlacements.entity_type, 'team'),
      inArray(matchGamePlacements.match_game_id, completedGames),
    ))
    .where(and(inArray(matchTeams.match_id, matchIds), eq(matchTeams.is_reserve, false)))
    .groupBy(matchTeams.id, seriesEntrants.id, matches.id)
    .orderBy(asc(matchTeams.match_id), asc(matchTeams.team_order));
  const byMatch = new Map<string, typeof rows>();
  for (const r of rows) byMatch.set(r.match_id, [...(byMatch.get(r.match_id) ?? []), r]);
  for (const [matchId, teams] of byMatch) {
    if (teams.length !== 2) continue;
    const played = teams.some((t) => t.match_status === 'complete' || t.match_status === 'battle');
    out.set(matchId, teams.map((t) => ({
      entrant_id: t.entrant_id, name: t.name, color: t.color,
      ...(played ? { score: t.wins } : {}),
      ...(t.match_status === 'complete' ? { is_winner: t.winner_team === t.team_id } : {}),
    })));
  }
  return out;
}

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

/** Wire shape of an event (`SeriesEventDto`, plus the image / cover fields the UI cards already use). */
export type SeriesEventWire = SeriesEventDto & { event_image_url: string | null; game_cover: string | null };

export function toSeriesEventDto(e: SeriesEventDetail, entrants?: SeriesEventDto['entrants']): SeriesEventWire {
  return {
    id: e.id, series_id: e.series_id, stage_id: e.stage_id, event_type: e.event_type, match_id: e.match_id, tournament_id: e.tournament_id,
    event_order: e.event_order, event_date: iso(e.event_date), points_multiplier: e.points_multiplier, role: e.role, week: e.week,
    counts_for_standings: e.counts_for_standings, batch_id: e.batch_id, status: e.status, entrant_ids: e.entrant_ids,
    seeding_rule: e.seeding_rule, match_template: e.match_template ?? null, name: e.name, target_status: e.target_status, start_date: iso(e.start_date), game_id: e.game_id,
    game_name: e.game_name, game_icon: e.game_icon, game_color: e.game_color,
    event_image_url: e.event_image_url, game_cover: e.game_cover,
    ...(entrants ? { entrants } : {}),
  };
}

/** Events of one series as `SeriesEventDto`s (the `GET /api/series/:id/events` read model). */
export async function listSeriesEventDtos(ex: Executor, seriesId: string): Promise<SeriesEventWire[]> {
  const details = await listSeriesEventDetails(ex, seriesId);
  const entrants = await loadMatchEntrants(ex, details.map((d) => d.match_id).filter((m): m is string => !!m));
  return details.map((d) => toSeriesEventDto(d, d.match_id ? entrants.get(d.match_id) : undefined));
}

/** One event as a `SeriesEventDto`, or null when it is not part of the series. */
export async function getSeriesEventDto(ex: Executor, seriesId: string, eventId: string): Promise<SeriesEventWire | null> {
  const [row] = await selectEventDetails(ex).where(and(eq(seriesEvents.id, eventId), eq(seriesEvents.series_id, seriesId)));
  if (!row) return null;
  const detail = toEventDetail(row);
  const entrants = detail.match_id ? (await loadMatchEntrants(ex, [detail.match_id])).get(detail.match_id) : undefined;
  return toSeriesEventDto(detail, entrants);
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
 * count, except the champion lookup, which runs standings for each *complete* series (or finished season playoff) in the page.
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

  const eventPlayers = await countSeriesParticipants(ex, ids);
  const rosters = await countRosters(ex, ids);

  const summaries: SeriesSummary[] = [];
  for (const r of rows) {
    const { sg_name: sgName, sg_icon: sgIcon, sg_color: sgColor, sg_cover: sgCover, ...row } = r;
    const evs = eventsBySeries.get(r.id) ?? [];
    const next = evs.find((e) => e.status === 'live' && !isEventFinished(e.target_status)) ?? null;
    const last = evs.length > 0 ? evs[evs.length - 1] : null;

    // Only series that can have a champion pay for the standings run: complete ones, or ones whose season playoff is over.
    const playoffDone = evs.some((e) => e.role === 'season_playoff' && e.status === 'live' && e.target_status === 'complete');
    const champion = (r.status === 'complete' && evs.length > 0) || playoffDone ? await getSeriesChampion(ex, r.id) : null;

    summaries.push({
      ...row,
      event_count: evs.length,
      completed_event_count: evs.filter((e) => e.target_status === 'complete').length,
      participant_count: rosters.get(r.id)?.players ?? eventPlayers.get(r.id) ?? 0,
      entrant_count: rosters.get(r.id)?.entrants ?? 0,
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
/**
 * Roster counts for the series that have entrants: non-withdrawn entrants and their current members (left_at is null).
 * A series with entrant rows is always present in the result (all withdrawn = 0 / 0); series without any are absent.
 */
async function countRosters(ex: Executor, seriesIds: string[]): Promise<Map<string, { entrants: number; players: number }>> {
  if (seriesIds.length === 0) return new Map();
  const entrantRows = await ex.select({
    series_id: seriesEntrants.series_id,
    entrants: sql<number>`count(*) filter (where ${seriesEntrants.status} <> 'withdrawn')::int`,
  }).from(seriesEntrants).where(inArray(seriesEntrants.series_id, seriesIds)).groupBy(seriesEntrants.series_id);
  const playerRows = await ex.select({
    series_id: seriesEntrantMembers.series_id,
    players: sql<number>`count(distinct ${seriesEntrantMembers.user_id})::int`,
  }).from(seriesEntrantMembers)
    .innerJoin(seriesEntrants, eq(seriesEntrants.id, seriesEntrantMembers.entrant_id))
    .where(and(inArray(seriesEntrantMembers.series_id, seriesIds), sql`${seriesEntrantMembers.left_at} is null`, sql`${seriesEntrants.status} <> 'withdrawn'`))
    .groupBy(seriesEntrantMembers.series_id);
  const players = new Map(playerRows.map((r) => [r.series_id, r.players]));
  return new Map(entrantRows.map((r) => [r.series_id, { entrants: r.entrants, players: players.get(r.series_id) ?? 0 }]));
}

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
