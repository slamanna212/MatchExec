import type { SeriesEventRole, SeriesStageDto } from '@/shared/series-types';
import { defaultCounts } from './series-schedule-helpers';
import { gameSupportsScoringType, modesForScoringType } from './series-setup';
import type { GameCatalog } from './series-setup';
import type { SeriesSummary } from './series-shared';
import type { MatchTemplateState } from './series-fixtures';
import type { SeriesEventPlacementInput } from '@/shared/series-types';

/** Pure helpers for the event-creation modals: allowed games, default template, placement fields. */

type TemplateSeries = Pick<SeriesSummary, 'game_id' | 'game_ids' | 'game_mode_id' | 'scoring_type' | 'match_defaults'>;

/** Games an event of this series may use: the allowed set, else the primary game, else (legacy) any game. */
export function allowedGameIds(series: TemplateSeries, catalog: GameCatalog): string[] {
  if (series.game_ids && series.game_ids.length > 0) return series.game_ids;
  if (series.game_id) return [series.game_id];
  return catalog.games.filter((g) => gameSupportsScoringType(catalog, g.id, series.scoring_type ?? null)).map((g) => g.id);
}

/** Mode used for the map list: the series' default mode for the primary game, else the first mode of the scoring type. */
export function pickModeId(series: TemplateSeries, catalog: GameCatalog, gameId: string | null): string | null {
  if (!gameId) return null;
  if (gameId === series.game_id && series.game_mode_id) return series.game_mode_id;
  return modesForScoringType(catalog, gameId, series.scoring_type ?? null)[0]?.id ?? null;
}

/** Starting template: primary game and the series' match defaults. */
export function defaultTemplateState(series: TemplateSeries): MatchTemplateState {
  const d = series.match_defaults;
  const gameId = series.game_id ?? series.game_ids?.[0] ?? null;
  return {
    game_id: gameId,
    maps: gameId === series.game_id ? [...(d?.maps ?? [])] : [],
    rounds: d?.rounds ?? d?.rounds_per_match ?? null,
    rules: d?.rules ?? null,
  };
}

// ─── placement (stage / role / week / multiplier / counts) ──────────────────

export interface PlacementState {
  stage_id: string | null;
  role: SeriesEventRole;
  week: number | null;
  points_multiplier: number;
  counts_for_standings: boolean;
}

export function defaultPlacement(stageId: string | null = null, role: SeriesEventRole = 'regular'): PlacementState {
  return { stage_id: stageId, role, week: null, points_multiplier: 1, counts_for_standings: defaultCounts(role) };
}

export function placementPayload(p: PlacementState): SeriesEventPlacementInput {
  return {
    stage_id: p.stage_id,
    role: p.role,
    week: p.week,
    points_multiplier: p.points_multiplier,
    counts_for_standings: p.counts_for_standings,
  };
}

/** Role change: the counting default follows the role (the user can still flip it afterwards). */
export function withRole(p: PlacementState, role: SeriesEventRole): PlacementState {
  return { ...p, role, counts_for_standings: defaultCounts(role) };
}

/** Stage a new event should land in: the one that is running, else the first unfinished one, else none. */
export function defaultStageId(stages: readonly SeriesStageDto[]): string | null {
  const ordered = [...stages].sort((a, b) => a.stage_order - b.stage_order);
  return (ordered.find((s) => s.status === 'active') ?? ordered.find((s) => s.status === 'upcoming'))?.id ?? null;
}
