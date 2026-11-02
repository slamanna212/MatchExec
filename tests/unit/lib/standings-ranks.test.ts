import { describe, it, expect } from 'vitest';
import { assignRanks } from '../../../src/lib/tournaments/standings';

describe('assignRanks', () => {
  it('shares a rank only when points AND first places match', () => {
    const ranked = assignRanks([
      { name: 'a', total_points: 10, first_places: 2 },
      { name: 'b', total_points: 10, first_places: 2 },
      { name: 'c', total_points: 10, first_places: 1 },
      { name: 'd', total_points: 4, first_places: 1 },
    ]);
    expect(ranked.map((r) => [r.name, r.rank])).toEqual([['a', 1], ['b', 1], ['c', 3], ['d', 4]]);
  });

  it('ranks a points-free (FFA) field by wins instead of tying everyone for first', () => {
    const ranked = assignRanks([
      { total_points: 0, first_places: 2 },
      { total_points: 0, first_places: 1 },
      { total_points: 0, first_places: 0 },
      { total_points: 0, first_places: 0 },
    ]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3, 3]);
  });

  it('works for rows without a first_places count (points only)', () => {
    expect(assignRanks([{ total_points: 5 }, { total_points: 5 }, { total_points: 1 }]).map((r) => r.rank)).toEqual([1, 1, 3]);
  });
});
