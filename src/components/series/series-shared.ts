import { parseDbTimestamp } from '@/lib/utils/dates';
import type { SeriesScoringConfig } from '@/lib/series';

/** Client-side shapes of the series API responses (see src/lib/series/summary.ts). */

export type SeriesStatus = 'created' | 'active' | 'complete' | 'cancelled';

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
  scoring_config?: SeriesScoringConfig | string | null;
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
  next_event: SeriesNextEvent | null;
  last_event_game: SeriesGameInfo | null;
  series_game: SeriesGameInfo | null;
  champion: string | null;
}

export interface SeriesEventDetail extends SeriesGameInfo {
  id: string;
  series_id: string;
  event_type: 'match' | 'tournament';
  match_id?: string | null;
  tournament_id?: string | null;
  event_order: number;
  event_date?: string | null;
  points_multiplier: number;
  name: string | null;
  status: string | null;
  event_image_url: string | null;
  start_date: string | null;
}

export interface SeriesStanding {
  rank: number;
  username: string;
  user_id: string;
  total_points: number;
  events_played: number;
  events: { series_event_id: string; points: number | null }[];
}

export const SERIES_STATUS_COLOR: Record<SeriesStatus, string> = {
  created: 'gray',
  active: 'green',
  complete: 'blue',
  cancelled: 'red',
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
  return parseDbTimestamp(ts)?.toLocaleDateString('en-US') ?? null;
}

export function formatShortDateTime(ts: string | null | undefined): string | null {
  return parseDbTimestamp(ts)?.toLocaleString('en-US', {
    month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
  }) ?? null;
}

export function formatFullDateTime(ts: string | null | undefined): string | null {
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

/** The API returns scoring_config as an object (jsonb); a JSON string is still accepted. */
export function parseScoringConfig(raw: SeriesScoringConfig | string | null | undefined): SeriesScoringConfig {
  if (!raw) return {};
  if (typeof raw === 'object') return Array.isArray(raw) ? {} : raw;
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as SeriesScoringConfig : {};
  } catch {
    return {};
  }
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

export function eventHref(e: Pick<SeriesEventDetail, 'event_type' | 'match_id' | 'tournament_id'>): string {
  return e.event_type === 'match' ? `/matches/${e.match_id}` : `/tournaments/${e.tournament_id}`;
}
