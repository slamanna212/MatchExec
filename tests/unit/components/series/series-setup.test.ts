import { describe, it, expect } from 'vitest';
import {
  gameSupportsScoringType, gamesSupportingScoringType, modesForScoringType, reconcileGameSelection, rosterPayload,
  validateRosterInputs,
} from '@/components/series/series-setup';
import type { GameCatalog } from '@/components/series/series-setup';

const catalog: GameCatalog = {
  games: [
    { id: 'overwatch2', name: 'Overwatch 2' },
    { id: 'marvel-rivals', name: 'Marvel Rivals' },
    { id: 'mk8', name: 'Mario Kart 8 Deluxe' },
    { id: 'fortnite', name: 'Fortnite' },
  ],
  modesByGame: {
    overwatch2: [{ id: 'control', name: 'Control', scoring_type: 'Normal' }, { id: 'ffa', name: 'FFA', scoring_type: 'FFA' }],
    'marvel-rivals': [{ id: 'convoy', name: 'Convoy', scoring_type: 'Normal' }],
    mk8: [{ id: 'grand-prix', name: 'Grand Prix', scoring_type: 'Position' }, { id: 'battle', name: 'Battle', scoring_type: 'Normal' }],
    fortnite: [{ id: 'br', name: 'Battle Royale', scoring_type: 'Position' }],
  },
};

describe('game filtering by scoring type', () => {
  it('lists only games with a mode of that scoring type', () => {
    expect(gamesSupportingScoringType(catalog, 'Normal').map((g) => g.id)).toEqual(['overwatch2', 'marvel-rivals', 'mk8']);
    expect(gamesSupportingScoringType(catalog, 'Position').map((g) => g.id)).toEqual(['mk8', 'fortnite']);
    expect(gamesSupportingScoringType(catalog, 'FFA').map((g) => g.id)).toEqual(['overwatch2']);
  });

  it('accepts every game for a legacy (null) scoring type', () => {
    expect(gamesSupportingScoringType(catalog, null)).toHaveLength(4);
    expect(gameSupportsScoringType(catalog, 'unknown', null)).toBe(true);
    expect(gameSupportsScoringType(catalog, 'unknown', 'Normal')).toBe(false);
  });

  it('filters the modes of one game', () => {
    expect(modesForScoringType(catalog, 'mk8', 'Position').map((m) => m.id)).toEqual(['grand-prix']);
    expect(modesForScoringType(catalog, 'mk8', null)).toHaveLength(2);
    expect(modesForScoringType(catalog, null, 'Normal')).toEqual([]);
  });
});

describe('reconcileGameSelection', () => {
  it('drops games that cannot run the new scoring type and re-picks the primary game', () => {
    expect(reconcileGameSelection(catalog, {
      scoring_type: 'Position', game_ids: ['overwatch2', 'mk8'], game_id: 'overwatch2', game_mode_id: 'control',
    })).toEqual({ scoring_type: 'Position', game_ids: ['mk8'], game_id: 'mk8', game_mode_id: null });
  });

  it('keeps a valid selection and mode', () => {
    const sel = { scoring_type: 'Normal' as const, game_ids: ['overwatch2', 'marvel-rivals'], game_id: 'marvel-rivals', game_mode_id: 'convoy' };
    expect(reconcileGameSelection(catalog, sel)).toEqual(sel);
  });

  it('clears the primary game when it does not fit and no allowed set exists', () => {
    expect(reconcileGameSelection(catalog, { scoring_type: 'FFA', game_ids: [], game_id: 'fortnite', game_mode_id: null }).game_id).toBeNull();
  });

  it('makes the first allowed game primary when the primary is not in the set', () => {
    expect(reconcileGameSelection(catalog, {
      scoring_type: 'Normal', game_ids: ['marvel-rivals'], game_id: 'overwatch2', game_mode_id: null,
    }).game_id).toBe('marvel-rivals');
  });

  it('leaves everything alone until the catalog has loaded', () => {
    const sel = { scoring_type: 'Position' as const, game_ids: ['overwatch2'], game_id: 'overwatch2', game_mode_id: 'control' };
    expect(reconcileGameSelection({ games: [], modesByGame: {} }, sel, false)).toBe(sel);
  });
});

describe('roster bounds', () => {
  it('sends no bounds for solo series', () => {
    expect(rosterPayload('solo', 3, 5)).toEqual({ roster_min: null, roster_max: null });
    expect(rosterPayload('team', 3, null)).toEqual({ roster_min: 3, roster_max: null });
  });

  it('rejects min above max for teams only', () => {
    expect(validateRosterInputs('team', 6, 5)).toMatch(/Minimum/);
    expect(validateRosterInputs('team', 5, 5)).toBeNull();
    expect(validateRosterInputs('team', null, 5)).toBeNull();
    expect(validateRosterInputs('solo', 6, 5)).toBeNull();
  });
});
