import { describe, it, expect } from 'vitest';
import {
  ALLOWED_TIEBREAKERS, DEFAULT_TIEBREAKERS, POSITION_PRESETS, defaultModeForScoringType, defaultScoringConfig,
  effectiveTiebreakers, isDefaultScoringConfig, isLegacyScoringConfig, moveItem, suggestNextPlace, switchScoringMode,
} from '@/components/series/scoring-config';

describe('default mode', () => {
  it('uses head to head for Normal and points for FFA / Position / unknown', () => {
    expect(defaultModeForScoringType('Normal')).toBe('head_to_head');
    expect(defaultModeForScoringType('FFA')).toBe('points');
    expect(defaultModeForScoringType('Position')).toBe('points');
    expect(defaultModeForScoringType(null)).toBe('head_to_head');
  });

  it('builds a default config per scoring type', () => {
    expect(defaultScoringConfig('Normal')).toEqual({ mode: 'head_to_head' });
    expect(defaultScoringConfig('Position')).toEqual({ mode: 'points', position_points: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1] });
  });

  it('does not share the preset array with the config', () => {
    const cfg = defaultScoringConfig('Position');
    cfg.position_points!.push(99);
    expect(POSITION_PRESETS[0].points).toHaveLength(10);
  });

  it('knows when a config is the untouched default', () => {
    expect(isDefaultScoringConfig({}, 'Normal')).toBe(true);
    expect(isDefaultScoringConfig(defaultScoringConfig('Normal'), 'Normal')).toBe(true);
    expect(isDefaultScoringConfig({ mode: 'head_to_head', win_points: 3 }, 'Normal')).toBe(false);
  });

  it('treats a config without mode as legacy', () => {
    expect(isLegacyScoringConfig({ match_win_points: 3 })).toBe(true);
    expect(isLegacyScoringConfig({ mode: 'points' })).toBe(false);
  });
});

describe('switchScoringMode', () => {
  it('keeps the other keys and sets the mode', () => {
    expect(switchScoringMode({ match_win_points: 3 }, 'head_to_head')).toEqual({ match_win_points: 3, mode: 'head_to_head' });
  });

  it('seeds a position spread when switching to points', () => {
    expect(switchScoringMode({ mode: 'head_to_head' }, 'points').position_points).toEqual(POSITION_PRESETS[0].points);
    expect(switchScoringMode({ mode: 'head_to_head', position_points: [9, 5] }, 'points').position_points).toEqual([9, 5]);
  });

  it('drops tiebreakers that do not exist in the new mode', () => {
    const next = switchScoringMode({ mode: 'head_to_head', tiebreakers: ['match_wins', 'map_diff'] }, 'points');
    expect(next.tiebreakers).toBeUndefined();
    const kept = switchScoringMode({ mode: 'points', tiebreakers: ['points', 'event_wins'] }, 'head_to_head');
    // "points" exists in both modes but event_wins does not
    expect(kept.tiebreakers).toBeUndefined();
    expect(switchScoringMode({ mode: 'points', tiebreakers: ['points'] }, 'head_to_head').tiebreakers).toEqual(['points']);
  });
});

describe('tiebreakers', () => {
  it('uses the mode default until a list is stored', () => {
    expect(effectiveTiebreakers({ mode: 'head_to_head' }, 'head_to_head')).toEqual(DEFAULT_TIEBREAKERS.head_to_head);
    expect(effectiveTiebreakers({ mode: 'points', tiebreakers: ['best_finishes'] }, 'points')).toEqual(['best_finishes']);
  });

  it('ranks on league points first by default when win/tie/loss points are set (matches the server)', () => {
    expect(effectiveTiebreakers({ mode: 'head_to_head', win_points: 3, tie_points: 1 }, 'head_to_head'))
      .toEqual(['points', ...DEFAULT_TIEBREAKERS.head_to_head]);
    expect(effectiveTiebreakers({ mode: 'head_to_head', win_points: 3, tiebreakers: ['match_wins'] }, 'head_to_head')).toEqual(['match_wins']);
  });

  it('every default is allowed', () => {
    for (const mode of ['head_to_head', 'points'] as const) {
      expect(DEFAULT_TIEBREAKERS[mode].every((t) => ALLOWED_TIEBREAKERS[mode].includes(t))).toBe(true);
    }
  });
});

describe('list helpers', () => {
  it('moves an item up and down without mutating', () => {
    const list = ['a', 'b', 'c'];
    expect(moveItem(list, 2, -1)).toEqual(['a', 'c', 'b']);
    expect(moveItem(list, 0, 1)).toEqual(['b', 'a', 'c']);
    expect(list).toEqual(['a', 'b', 'c']);
  });

  it('ignores moves past the ends', () => {
    expect(moveItem(['a', 'b'], 0, -1)).toEqual(['a', 'b']);
    expect(moveItem(['a', 'b'], 1, 1)).toEqual(['a', 'b']);
  });

  it('suggests the next place just below the last one', () => {
    expect(suggestNextPlace([])).toBe(10);
    expect(suggestNextPlace([25, 18])).toBe(16);
    expect(suggestNextPlace([1])).toBe(0);
  });
});
