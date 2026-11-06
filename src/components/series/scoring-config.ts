import type {
  SeriesScoringConfig, SeriesScoringType, SeriesStandingsMode, SeriesTiebreaker,
} from '@/shared/series-types';

/** Pure helpers behind `ScoringConfigEditor` (kept out of the component so they can be unit tested). */

/** Tiebreakers each mode can use, in the order they are offered. */
export const ALLOWED_TIEBREAKERS: Record<SeriesStandingsMode, SeriesTiebreaker[]> = {
  head_to_head: ['match_wins', 'win_pct', 'points', 'map_diff', 'maps_won', 'head_to_head'],
  points: ['points', 'event_wins', 'best_finishes'],
};

/** What the server applies when `tiebreakers` is not set. */
export const DEFAULT_TIEBREAKERS: Record<SeriesStandingsMode, SeriesTiebreaker[]> = {
  head_to_head: ['match_wins', 'map_diff', 'head_to_head', 'maps_won'],
  points: ['points', 'event_wins', 'best_finishes'],
};

export const TIEBREAKER_LABELS: Record<SeriesTiebreaker, string> = {
  match_wins: 'Match wins',
  win_pct: 'Win percentage',
  points: 'League points',
  map_diff: 'Map difference',
  maps_won: 'Maps won',
  head_to_head: 'Head to head (between tied entrants)',
  event_wins: 'Event wins',
  best_finishes: 'Best finishes (count-back)',
};

export interface PositionPreset {
  id: string;
  label: string;
  points: number[];
}

export const POSITION_PRESETS: PositionPreset[] = [
  { id: 'f1', label: 'F1 (25-18-15-12-10-8-6-4-2-1)', points: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1] },
  { id: 'mk8', label: 'Mario Kart 8 (15-12-10-9-8-7-6-5-4-3-2-1)', points: [15, 12, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1] },
  { id: 'top3', label: 'Podium only (5-3-1)', points: [5, 3, 1] },
];

/** Normal (team vs team) series are standings of records; FFA / Position series score points per finishing position. */
export function defaultModeForScoringType(scoringType: SeriesScoringType | null | undefined): SeriesStandingsMode {
  return scoringType === 'FFA' || scoringType === 'Position' ? 'points' : 'head_to_head';
}

/** Starting scoring config for a new series of the given scoring type. */
export function defaultScoringConfig(scoringType: SeriesScoringType | null | undefined): SeriesScoringConfig {
  const mode = defaultModeForScoringType(scoringType);
  if (mode === 'head_to_head') return { mode };
  return { mode, position_points: [...POSITION_PRESETS[0].points] };
}

/** True when the config is empty or exactly the untouched default of the given scoring type. */
export function isDefaultScoringConfig(config: SeriesScoringConfig, scoringType: SeriesScoringType | null | undefined): boolean {
  if (Object.keys(config).length === 0) return true;
  return JSON.stringify(config) === JSON.stringify(defaultScoringConfig(scoringType));
}

/** Legacy configs (no `mode`) are scored per player by the old rules. */
export function isLegacyScoringConfig(config: SeriesScoringConfig): boolean {
  return config.mode === undefined;
}

/**
 * Switches the standings mode. Tiebreakers that do not exist in the new mode are dropped (the server default applies
 * again) and a fresh points config gets a sensible position spread.
 */
export function switchScoringMode(config: SeriesScoringConfig, mode: SeriesStandingsMode): SeriesScoringConfig {
  const next: SeriesScoringConfig = { ...config, mode };
  const allowed = ALLOWED_TIEBREAKERS[mode];
  if (next.tiebreakers && !next.tiebreakers.every((t) => allowed.includes(t))) delete next.tiebreakers;
  if (mode === 'points' && (!next.position_points || next.position_points.length === 0)) {
    next.position_points = [...POSITION_PRESETS[0].points];
  }
  return next;
}

/** Tiebreakers currently in effect (the stored list, else the mode's default). */
export function effectiveTiebreakers(config: SeriesScoringConfig, mode: SeriesStandingsMode): SeriesTiebreaker[] {
  return config.tiebreakers && config.tiebreakers.length > 0 ? config.tiebreakers : DEFAULT_TIEBREAKERS[mode];
}

/** Moves `list[index]` by `delta` positions (clamped); returns a new array. */
export function moveItem<T>(list: readonly T[], index: number, delta: number): T[] {
  const target = index + delta;
  if (index < 0 || index >= list.length || target < 0 || target >= list.length) return [...list];
  const next = [...list];
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item);
  return next;
}

/** Suggested next value for a points spread: just below the last place, never negative. */
export function suggestNextPlace(values: readonly number[], fallback = 10): number {
  const last = values[values.length - 1];
  return last === undefined ? fallback : Math.max(0, last - 2);
}
