import { parseDbTimestamp } from '@/lib/utils/dates';
import { isUnscheduled, UNSCHEDULED_LABEL } from '@/shared/schedule';
import type {
  SeriesChampionDto, SeriesDiscordConfig, SeriesEntrantType, SeriesEventDto, SeriesEventRole, SeriesMatchDefaults, SeriesScoringConfig,
  SeriesScoringType, SeriesStatus,
} from '@/shared/series-types';

/** Client-side shapes of the series API responses (see src/lib/series/summary.ts). */

export type { SeriesStatus };

export interface SeriesGameInfo {
  game_id: string | null;
  game_name: string | null;
  game_icon: string | null;
  game_color: string | null;
  game_cover: string | null;
}

export interface SeriesNextEvent extends SeriesGameInfo {
  id: string;
  name: string | null;
  type: 'match' | 'tournament';
  event_order: number;
  start_date: string | null;
}

export interface SeriesSummary {
  id: string;
  name: string;
  description?: string | null;
  status: SeriesStatus;
  scoring_config?: SeriesScoringConfig | null;
  /** Setup fields added by the series rework; absent/null/empty on legacy series. */
  entrant_type?: SeriesEntrantType;
  roster_min?: number | null;
  roster_max?: number | null;
  scoring_type?: SeriesScoringType | null;
  game_ids?: string[];
  game_mode_id?: string | null;
  match_defaults?: SeriesMatchDefaults | null;
  discord_config?: SeriesDiscordConfig | null;
  previous_series_id?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  event_image_url?: string | null;
  game_id?: string | null;
  livestream_link?: string | null;
  announcements: boolean;
  player_notifications: boolean;
  created_at: string;
  updated_at: string;
  event_count: number;
  completed_event_count: number;
  participant_count: number;
  entrant_count: number;
  next_event: SeriesNextEvent | null;
  last_event_game: SeriesGameInfo | null;
  series_game: SeriesGameInfo | null;
  champion: SeriesChampionDto | null;
}

/**
 * One event as `GET /api/series/:id/events` returns it: the shared DTO plus the image fields the cards use.
 * `status` is `planned` (playoff placeholder) or `live`; the match / tournament status is `target_status`.
 */
export type SeriesEventView = SeriesEventDto & { event_image_url?: string | null; game_cover?: string | null };

export const EVENT_ROLE_LABEL: Record<SeriesEventRole, string> = {
  regular: 'Regular',
  stage_playoff: 'Stage playoff',
  season_playoff: 'Season playoff',
  exhibition: 'Exhibition',
};

export const EVENT_ROLE_COLOR: Record<SeriesEventRole, string> = {
  regular: 'gray',
  stage_playoff: 'orange',
  season_playoff: 'yellow',
  exhibition: 'teal',
};

export const SERIES_FALLBACK_COLOR = '#7c3aed';

export const EVENT_TYPE_COLOR: Record<'match' | 'tournament', string> = {
  match: 'blue',
  tournament: 'violet',
};

/**
 * Identity game for a series card/panel: the next event's game, else the
 * series' own game, else null (callers fall back to violet + timeline icon).
 */
export function seriesIdentity(series: Pick<SeriesSummary, 'next_event' | 'series_game'>): SeriesGameInfo | null {
  if (series.next_event?.game_id) return series.next_event;
  if (series.series_game?.game_id) return series.series_game;
  return null;
}

/** Identity for history cards: game of the last event, else the series' own game. */
export function seriesHistoryIdentity(series: Pick<SeriesSummary, 'last_event_game' | 'series_game'>): SeriesGameInfo | null {
  if (series.last_event_game?.game_id) return series.last_event_game;
  if (series.series_game?.game_id) return series.series_game;
  return null;
}

export function seriesProgress(series: Pick<SeriesSummary, 'event_count' | 'completed_event_count'>): number {
  return series.event_count > 0 ? Math.round((series.completed_event_count / series.event_count) * 100) : 0;
}

export function isEventFinished(status: string | null | undefined): boolean {
  return !status || status === 'complete' || status === 'cancelled';
}

export function formatShortDate(ts: string | null | undefined): string | null {
  if (isUnscheduled(ts)) return UNSCHEDULED_LABEL;
  return parseDbTimestamp(ts)?.toLocaleDateString('en-US') ?? null;
}

export function formatShortDateTime(ts: string | null | undefined): string | null {
  if (isUnscheduled(ts)) return UNSCHEDULED_LABEL;
  return parseDbTimestamp(ts)?.toLocaleString('en-US', {
    month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
  }) ?? null;
}

export function formatFullDateTime(ts: string | null | undefined): string | null {
  if (isUnscheduled(ts)) return UNSCHEDULED_LABEL;
  return parseDbTimestamp(ts)?.toLocaleString('en-US', {
    year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
  }) ?? null;
}

export function formatMultiplier(m: number): string {
  return `×${Number.isInteger(m) ? m : Number(m.toFixed(2))}`;
}

/** Formats a point value without trailing float noise (12.5, 25, 7.33). */
export function formatPoints(p: number): string {
  return Number.isInteger(p) ? String(p) : String(Number(p.toFixed(2)));
}

/** The API returns `scoring_config` as a JSON object (jsonb); anything else means "no config". */
export function parseScoringConfig(raw: SeriesScoringConfig | null | undefined): SeriesScoringConfig {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return raw;
}

export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

/** Page of the event's match / tournament; null for a planned playoff that has not been seeded yet. */
export function eventHref(e: Pick<SeriesEventView, 'event_type' | 'match_id' | 'tournament_id'>): string | null {
  if (e.event_type === 'match') return e.match_id ? `/matches/${e.match_id}` : null;
  return e.tournament_id ? `/tournaments/${e.tournament_id}` : null;
}

const SCORING_TYPE_LABEL: Record<SeriesScoringType, string> = {
  Normal: 'Team vs Team',
  FFA: 'Free for all',
  Position: 'Racing / Position',
};

/** "Team · Team vs Team", "Solo · Racing / Position". */
export function describeSeriesFormat(entrantType: SeriesEntrantType, scoringType: SeriesScoringType): string {
  return `${entrantType === 'team' ? 'Team' : 'Solo'} · ${SCORING_TYPE_LABEL[scoringType]}`;
}
