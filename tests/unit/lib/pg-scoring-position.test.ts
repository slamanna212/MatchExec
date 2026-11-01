// @vitest-environment node
/** Pure scoring calculations (src/lib/scoring/*): no database. */
import { describe, expect, it, vi } from 'vitest';
import { calculatePointsFromConfig, DEFAULT_POSITION_SPREAD, getPointsForPosition, parsePositionScoringConfig, rankByPoints } from '@/lib/scoring/position';
import { pickTopEntry, teamLabelForOrder, winnerByWins, winnerEntityTypeFor } from '@/lib/scoring/winners';

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warning: vi.fn(), info: vi.fn(), debug: vi.fn(), reload: vi.fn() } }));

describe('parsePositionScoringConfig', () => {
  it('falls back to the default spread for missing or malformed input', () => {
    for (const raw of [null, undefined, '', 'not json', '[]', '{}', '{"1":"x"}', '{"first":1}', { '0': 3 }, 42, []]) {
      expect(parsePositionScoringConfig(raw as never).pointsPerPosition).toEqual(DEFAULT_POSITION_SPREAD);
    }
  });

  it('accepts the flat and the wrapped form, as objects (jsonb) or JSON strings', () => {
    expect(parsePositionScoringConfig({ '1': 10, '2': 5 })).toEqual({ type: 'Position', pointsPerPosition: { '1': 10, '2': 5 } });
    expect(parsePositionScoringConfig({ type: 'Position', pointsPerPosition: { '1': 9 } }).pointsPerPosition).toEqual({ '1': 9 });
    expect(parsePositionScoringConfig('{"1":7,"3":1}').pointsPerPosition).toEqual({ '1': 7, '3': 1 });
    expect(parsePositionScoringConfig(JSON.stringify({ type: 'Position', pointsPerPosition: { '2': 4 } })).pointsPerPosition).toEqual({ '2': 4 });
  });
});

describe('points', () => {
  const config = { type: 'Position' as const, pointsPerPosition: { '1': 25, '2': 18 } };
  it('maps positions to points and 0 for positions outside the spread', () => {
    expect(getPointsForPosition(1, config)).toBe(25);
    expect(getPointsForPosition(3, config)).toBe(0);
    expect(calculatePointsFromConfig({ a: 2, b: 1, c: 9 }, config)).toEqual({ a: 18, b: 25, c: 0 });
  });
});

describe('rankByPoints', () => {
  it('uses competition ranking and gives no winner on a tie for first', () => {
    const ranked = rankByPoints(new Map([['a', 10], ['b', 30], ['c', 30], ['d', 5]]));
    expect(ranked.map((r) => [r.teamId, r.position, r.isWinner])).toEqual([['b', 1, false], ['c', 1, false], ['a', 3, false], ['d', 4, false]]);
    expect(rankByPoints(new Map([['x', 3], ['y', 1]])).map((r) => r.isWinner)).toEqual([true, false]);
    expect(rankByPoints(new Map([['solo', 0]]))[0]).toMatchObject({ position: 1, isWinner: true });
  });
});

describe('winner helpers', () => {
  it('labels teams by order', () => {
    expect([0, 1, 2, 7, null, undefined].map(teamLabelForOrder)).toEqual(['team1', 'team2', 'team', 'team', 'team', 'team']);
  });

  it('picks the top entry unless tied (or zero when positive is required)', () => {
    expect(pickTopEntry([], (x: number) => x)).toBeNull();
    expect(pickTopEntry([3, 9, 5], (x) => x)).toBe(9);
    expect(pickTopEntry([9, 9, 1], (x) => x)).toBeNull();
    expect(pickTopEntry([0, 0], (x) => x, true)).toBeNull();
    expect(pickTopEntry([0], (x) => x, true)).toBeNull();
    expect(winnerByWins([{ teamId: 'a', wins: 2 }, { teamId: 'b', wins: 1 }])).toBe('a');
    expect(winnerByWins([{ teamId: 'a', wins: 1 }, { teamId: 'b', wins: 1 }])).toBeNull();
  });

  it('classifies the three winner_team ID spaces', () => {
    expect(winnerEntityTypeFor({ tournament_id: null, scoring_type: 'FFA' })).toBe('participant');
    expect(winnerEntityTypeFor({ tournament_id: 't', scoring_type: 'Position' })).toBe('participant');
    expect(winnerEntityTypeFor({ tournament_id: 't', scoring_type: 'Normal' })).toBe('tournament_team');
    expect(winnerEntityTypeFor({ tournament_id: null, scoring_type: null })).toBe('match_team');
  });
});
