import { getDbInstance } from './database-init';
import { getSeriesStandings } from './series';
import type { SeriesEventRow, SeriesRow } from './series';

/**
 * Read models for the series UI: events joined with their match/tournament and
 * game, and per-series summaries (counts, next event, identity game, champion).
 * Kept separate from series.ts, which owns writes and scoring.
 */

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
  start_date: string | null;
}

export interface SeriesNextEvent extends SeriesGameInfo {
  id: string;
  name: string | null;
  type: 'match' | 'tournament';
  event_order: number;
  start_date: string | null;
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

const EVENT_DETAIL_SELECT = `
  SELECT se.*,
         COALESCE(m.name, t.name) AS name,
         COALESCE(m.status, t.status) AS status,
         COALESCE(m.event_image_url, t.event_image_url) AS event_image_url,
         COALESCE(se.event_date, m.start_date, t.start_date) AS start_date,
         g.id AS game_id,
         g.name AS game_name,
         g.icon_url AS game_icon,
         g.color AS game_color,
         g.cover_url AS game_cover
  FROM series_events se
  LEFT JOIN matches m ON se.event_type = 'match' AND m.id = se.match_id
  LEFT JOIN tournaments t ON se.event_type = 'tournament' AND t.id = se.tournament_id
  LEFT JOIN games g ON g.id = COALESCE(m.game_id, t.game_id)
`;

/** Events of one series in event_order, joined with name/status/game/date. */
export async function listSeriesEventDetails(seriesId: string): Promise<SeriesEventDetail[]> {
  const db = await getDbInstance();
  return db.all<SeriesEventDetail>(
    `${EVENT_DETAIL_SELECT} WHERE se.series_id = ? ORDER BY se.event_order ASC`,
    [seriesId]
  );
}

function pickGame(e: SeriesGameInfo): SeriesGameInfo {
  return {
    game_id: e.game_id, game_name: e.game_name, game_icon: e.game_icon,
    game_color: e.game_color, game_cover: e.game_cover,
  };
}

export interface ListSeriesSummaryOptions {
  statuses?: string[];
  ids?: string[];
  limit?: number;
  offset?: number;
}

/**
 * Lists series with everything the dashboard/history cards need. Uses a fixed
 * number of queries regardless of series count, except the champion lookup,
 * which runs standings for each *complete* series in the page.
 */
export async function listSeriesSummaries(options: ListSeriesSummaryOptions = {}): Promise<SeriesSummary[]> {
  const db = await getDbInstance();
  const statuses = options.statuses ?? [];

  const conditions: string[] = [];
  const params: (string | number)[] = [];
  if (statuses.length > 0) {
    conditions.push(`s.status IN (${statuses.map(() => '?').join(', ')})`);
    params.push(...statuses);
  }
  if (options.ids) {
    if (options.ids.length === 0) return [];
    conditions.push(`s.id IN (${options.ids.map(() => '?').join(', ')})`);
    params.push(...options.ids);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  let paging = '';
  if (options.limit !== undefined) {
    paging = ' LIMIT ? OFFSET ?';
    params.push(options.limit, options.offset ?? 0);
  }

  const rows = await db.all<SeriesRow & {
    announcements: number | boolean; player_notifications: number | boolean;
    sg_name: string | null; sg_icon: string | null; sg_color: string | null; sg_cover: string | null;
  }>(
    `SELECT s.*, g.name AS sg_name, g.icon_url AS sg_icon, g.color AS sg_color, g.cover_url AS sg_cover
     FROM series s
     LEFT JOIN games g ON g.id = s.game_id
     ${where}
     ORDER BY s.created_at DESC, s.id DESC${paging}`,
    params
  );
  if (rows.length === 0) return [];

  const ids = rows.map(r => r.id);
  const idPlaceholders = ids.map(() => '?').join(', ');

  const events = await db.all<SeriesEventDetail>(
    `${EVENT_DETAIL_SELECT} WHERE se.series_id IN (${idPlaceholders}) ORDER BY se.series_id, se.event_order ASC`,
    ids
  );
  const eventsBySeries = new Map<string, SeriesEventDetail[]>();
  for (const e of events) {
    const list = eventsBySeries.get(e.series_id) ?? [];
    list.push(e);
    eventsBySeries.set(e.series_id, list);
  }

  const participantCounts = await countSeriesParticipants(ids);

  const summaries: SeriesSummary[] = [];
  for (const r of rows) {
    const { sg_name: sgName, sg_icon: sgIcon, sg_color: sgColor, sg_cover: sgCover, ...series } = r;
    const evs = eventsBySeries.get(r.id) ?? [];
    const next = evs.find(e => !isEventFinished(e.status)) ?? null;
    const last = evs.length > 0 ? evs[evs.length - 1] : null;

    let champion: string | null = null;
    if (r.status === 'complete' && evs.length > 0) {
      const standings = await getSeriesStandings(r.id);
      const leaders = standings.filter(s => s.rank === 1 && s.total_points > 0).map(s => s.username);
      champion = leaders.length > 0 ? leaders.join(', ') : null;
    }

    summaries.push({
      ...series,
      announcements: Boolean(r.announcements),
      player_notifications: Boolean(r.player_notifications),
      event_count: evs.length,
      completed_event_count: evs.filter(e => e.status === 'complete').length,
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
 * Distinct players per series across all its events: match participants of
 * match events, plus participants of every match in tournament events, plus
 * tournament signups (so a tournament counts before its bracket exists).
 */
async function countSeriesParticipants(seriesIds: string[]): Promise<Map<string, number>> {
  if (seriesIds.length === 0) return new Map();
  const db = await getDbInstance();
  const ph = seriesIds.map(() => '?').join(', ');
  const rows = await db.all<{ series_id: string; n: number }>(
    `SELECT series_id, COUNT(DISTINCT player_key) AS n FROM (
       SELECT se.series_id, COALESCE(mp.discord_user_id, mp.user_id) AS player_key
       FROM series_events se
       JOIN match_participants mp ON se.event_type = 'match' AND mp.match_id = se.match_id
       WHERE se.series_id IN (${ph})
       UNION ALL
       SELECT se.series_id, COALESCE(mp.discord_user_id, mp.user_id)
       FROM series_events se
       JOIN matches m ON se.event_type = 'tournament' AND m.tournament_id = se.tournament_id
       JOIN match_participants mp ON mp.match_id = m.id
       WHERE se.series_id IN (${ph})
       UNION ALL
       SELECT se.series_id, COALESCE(tp.discord_user_id, tp.user_id)
       FROM series_events se
       JOIN tournament_participants tp ON se.event_type = 'tournament' AND tp.tournament_id = se.tournament_id
       WHERE se.series_id IN (${ph})
     ) GROUP BY series_id`,
    [...seriesIds, ...seriesIds, ...seriesIds]
  );
  return new Map(rows.map(r => [r.series_id, r.n]));
}

export async function countPlayersInSeries(seriesId: string): Promise<number> {
  return (await countSeriesParticipants([seriesId])).get(seriesId) ?? 0;
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

/** Series a match belongs to — directly, or through its tournament being a series event. */
export async function findSeriesForMatch(matchId: string): Promise<SeriesMembership[]> {
  const db = await getDbInstance();
  return db.all<SeriesMembership>(
    `SELECT s.id AS series_id, s.name AS series_name, s.status AS series_status,
            se.id AS series_event_id, se.points_multiplier, se.event_order, 'direct' AS via
     FROM series_events se JOIN series s ON s.id = se.series_id
     WHERE se.match_id = ?
     UNION ALL
     SELECT s.id, s.name, s.status, se.id, se.points_multiplier, se.event_order, 'tournament'
     FROM matches m
     JOIN series_events se ON se.tournament_id = m.tournament_id
     JOIN series s ON s.id = se.series_id
     WHERE m.id = ? AND m.tournament_id IS NOT NULL`,
    [matchId, matchId]
  );
}

export async function findSeriesForTournament(tournamentId: string): Promise<SeriesMembership[]> {
  const db = await getDbInstance();
  return db.all<SeriesMembership>(
    `SELECT s.id AS series_id, s.name AS series_name, s.status AS series_status,
            se.id AS series_event_id, se.points_multiplier, se.event_order, 'direct' AS via
     FROM series_events se JOIN series s ON s.id = se.series_id
     WHERE se.tournament_id = ?`,
    [tournamentId]
  );
}

export async function getSeriesSummary(seriesId: string): Promise<SeriesSummary | null> {
  const [summary] = await listSeriesSummaries({ ids: [seriesId] });
  return summary ?? null;
}
