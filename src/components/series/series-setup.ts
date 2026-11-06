import type { SeriesEntrantType, SeriesScoringType } from '@/shared/series-types';

/** Pure helpers for the series setup form (entrant type, scoring type, allowed games, default mode). */

export interface CatalogGame {
  id: string;
  name: string;
  icon_url?: string | null;
  color?: string | null;
}

export interface CatalogMode {
  id: string;
  name: string;
  scoring_type: string;
  team_size?: number | null;
}

/** Games plus the modes of each game, as loaded from `/api/games` and `/api/games/:id/modes`. */
export interface GameCatalog {
  games: CatalogGame[];
  modesByGame: Record<string, CatalogMode[]>;
}

export const EMPTY_CATALOG: GameCatalog = { games: [], modesByGame: {} };

export const SCORING_TYPE_OPTIONS: Array<{ value: SeriesScoringType; label: string; description: string }> = [
  { value: 'Normal', label: 'Team vs Team', description: 'Two sides play each other: head-to-head matches and brackets.' },
  { value: 'FFA', label: 'Free for all', description: 'Everyone plays for themselves in the same match.' },
  { value: 'Position', label: 'Racing / Position', description: 'Finishing order awards points (races, battle royale).' },
];

export const ENTRANT_TYPE_OPTIONS: Array<{ value: SeriesEntrantType; label: string }> = [
  { value: 'solo', label: 'Solo players' },
  { value: 'team', label: 'Teams' },
];

/** Does the game have at least one mode with this scoring type? A null scoring type (legacy series) accepts every game. */
export function gameSupportsScoringType(catalog: GameCatalog, gameId: string, scoringType: SeriesScoringType | null): boolean {
  if (!scoringType) return true;
  return (catalog.modesByGame[gameId] ?? []).some((m) => m.scoring_type === scoringType);
}

/** Games that can be part of a series of this scoring type. */
export function gamesSupportingScoringType(catalog: GameCatalog, scoringType: SeriesScoringType | null): CatalogGame[] {
  return catalog.games.filter((g) => gameSupportsScoringType(catalog, g.id, scoringType));
}

/** Modes of one game that match the scoring type (all modes for a null scoring type). */
export function modesForScoringType(catalog: GameCatalog, gameId: string | null, scoringType: SeriesScoringType | null): CatalogMode[] {
  if (!gameId) return [];
  return (catalog.modesByGame[gameId] ?? []).filter((m) => !scoringType || m.scoring_type === scoringType);
}

export interface SeriesGameSelection {
  scoring_type: SeriesScoringType | null;
  game_ids: string[];
  game_id: string | null;
  game_mode_id: string | null;
}

/**
 * Makes a game selection consistent after any change: games without a mode of the scoring type are dropped, the primary
 * game is one of the chosen games (the first when it fell out), and the default mode belongs to the primary game and
 * the scoring type. Pass `catalogLoaded = false` to leave the selection alone until the catalog is available.
 */
export function reconcileGameSelection(catalog: GameCatalog, selection: SeriesGameSelection, catalogLoaded = true): SeriesGameSelection {
  if (!catalogLoaded) return selection;
  const game_ids = selection.game_ids.filter((id) => gameSupportsScoringType(catalog, id, selection.scoring_type));
  let game_id = selection.game_id;
  if (game_ids.length > 0) {
    if (!game_id || !game_ids.includes(game_id)) game_id = game_ids[0];
  } else if (game_id && !gameSupportsScoringType(catalog, game_id, selection.scoring_type)) {
    game_id = null;
  }
  let game_mode_id = selection.game_mode_id;
  if (game_mode_id && !modesForScoringType(catalog, game_id, selection.scoring_type).some((m) => m.id === game_mode_id)) {
    game_mode_id = null;
  }
  return { scoring_type: selection.scoring_type, game_ids, game_id, game_mode_id };
}

/** Roster bounds sent to the API: solo series have none; team series send only what the user filled in. */
export function rosterPayload(entrantType: SeriesEntrantType, min: number | null, max: number | null): { roster_min: number | null; roster_max: number | null } {
  if (entrantType === 'solo') return { roster_min: null, roster_max: null };
  return { roster_min: min, roster_max: max };
}

/** Client-side check mirroring the server rule (roster_min <= roster_max). Returns an error message or null. */
export function validateRosterInputs(entrantType: SeriesEntrantType, min: number | null, max: number | null): string | null {
  if (entrantType === 'solo') return null;
  if (min !== null && max !== null && min > max) return 'Minimum roster size cannot be larger than the maximum';
  return null;
}
