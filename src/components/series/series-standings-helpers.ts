import type {
  SeriesScoringConfig, SeriesStageDto, SeriesStandingEventPoints, SeriesStandingRow, SeriesStandingsMode,
} from '@/shared/series-types';

/** Pure helpers of the Standings tab. */

export const SEASON_SCOPE = 'season';

export function scopeOptions(stages: readonly SeriesStageDto[]): Array<{ value: string; label: string }> {
  return [
    { value: SEASON_SCOPE, label: 'Season' },
    ...[...stages].sort((a, b) => a.stage_order - b.stage_order).map((s) => ({ value: s.id, label: s.name })),
  ];
}

/** A stage's override wins key by key over the series config. */
export function effectiveScoringConfig(
  series: SeriesScoringConfig | null | undefined, stage: SeriesScoringConfig | null | undefined,
): SeriesScoringConfig {
  return { ...(series ?? {}), ...(stage ?? {}) };
}

/** The Pts column only makes sense when win / loss / tie points were configured. */
export function hasLeaguePoints(config: SeriesScoringConfig): boolean {
  return [config.win_points, config.loss_points, config.tie_points].some((p) => typeof p === 'number' && p !== 0);
}

/**
 * Rows of one division with ranks recomputed inside it (entrants level on the season rank share the new rank too).
 * `null` / 'all' keeps every row as is.
 */
export function filterByDivision(rows: readonly SeriesStandingRow[], division: string | null): SeriesStandingRow[] {
  if (!division) return [...rows];
  const filtered = rows.filter((r) => r.division === division);
  let rank = 0;
  return filtered.map((r, i) => {
    if (i === 0 || r.rank !== filtered[i - 1].rank) rank = i + 1;
    return { ...r, rank };
  });
}

export const formatRecord = (w = 0, l = 0, t = 0): string => `${w}-${l}-${t}`;

/** Signed map difference: +3, -2, 0. */
export function formatDiff(diff = 0): string {
  return diff > 0 ? `+${diff}` : String(diff);
}

export function eventPointsFor(row: SeriesStandingRow, eventId: string): SeriesStandingEventPoints | undefined {
  return row.events.find((e) => e.series_event_id === eventId);
}

/** Division names for the filter: those the response lists, else the ones present on the rows. */
export function divisionNames(divisions: readonly string[], rows: readonly SeriesStandingRow[]): string[] {
  const set = new Set<string>(divisions.filter(Boolean));
  if (set.size === 0) for (const r of rows) if (r.division) set.add(r.division);
  return [...set].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

export function standingsModeLabel(mode: SeriesStandingsMode): string {
  return mode === 'head_to_head' ? 'Head to head' : 'Points';
}
