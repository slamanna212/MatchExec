/** Pure bracket math (no database): round / match counts, pairing, map selection, naming. */
import { describe, expect, it } from 'vitest';
import {
  calculateTotalMatches, calculateTournamentRounds, filterTournamentMaps, matchTitle, pairTeams, plannedMatchName, selectMapForRound,
  selectMapsForMatch, shuffleArray,
} from '@/lib/tournaments/bracket-math';

describe('calculateTournamentRounds', () => {
  it('single elimination: log2 of the next power of two', () => {
    expect(calculateTournamentRounds(2, 'single-elimination')).toBe(1);
    expect(calculateTournamentRounds(4, 'single-elimination')).toBe(2);
    expect(calculateTournamentRounds(8, 'single-elimination')).toBe(3);
    expect(calculateTournamentRounds(16, 'single-elimination')).toBe(4);
  });

  it.each([[3, 2], [5, 3], [6, 3], [7, 3], [9, 4], [17, 5], [32, 5]])('rounds up non-powers of two: %i teams -> %i rounds', (teams, rounds) => {
    expect(calculateTournamentRounds(teams, 'single-elimination')).toBe(rounds);
  });

  it('double elimination: winners + losers + grand final', () => {
    expect(calculateTournamentRounds(4, 'double-elimination')).toBe(5); // 2 + 2 + 1
    expect(calculateTournamentRounds(8, 'double-elimination')).toBe(8); // 3 + 4 + 1
    expect(calculateTournamentRounds(8, 'double-elimination')).toBeGreaterThan(calculateTournamentRounds(8, 'single-elimination'));
  });

  it('handles edge cases', () => {
    expect(calculateTournamentRounds(0, 'single-elimination')).toBe(0);
    expect(calculateTournamentRounds(1, 'single-elimination')).toBe(0);
    expect(calculateTournamentRounds(0, 'double-elimination')).toBe(0);
    expect(calculateTournamentRounds(1024, 'single-elimination')).toBe(10);
  });
});

describe('calculateTotalMatches', () => {
  it('single elimination: n - 1', () => {
    for (const n of [2, 4, 8, 12, 16, 32]) expect(calculateTotalMatches(n, 'single-elimination')).toBe(n - 1);
  });

  it('double elimination: 2n - 2', () => {
    expect(calculateTotalMatches(4, 'double-elimination')).toBe(6);
    expect(calculateTotalMatches(8, 'double-elimination')).toBe(14);
    expect(calculateTotalMatches(8, 'double-elimination')).toBeGreaterThan(calculateTotalMatches(8, 'single-elimination'));
  });

  it('handles edge cases and large brackets', () => {
    expect(calculateTotalMatches(0, 'single-elimination')).toBe(0);
    expect(calculateTotalMatches(1, 'single-elimination')).toBe(0);
    expect(calculateTotalMatches(1024, 'single-elimination')).toBe(1023);
  });
});

describe('pairTeams', () => {
  it('pairs front to back', () => {
    expect(pairTeams(['a', 'b', 'c', 'd'])).toEqual({ pairs: [['a', 'b'], ['c', 'd']], bye: null });
  });

  it('gives the odd team out a bye', () => {
    expect(pairTeams(['a', 'b', 'c'])).toEqual({ pairs: [['a', 'b']], bye: 'c' });
    expect(pairTeams(['a'])).toEqual({ pairs: [], bye: 'a' });
    expect(pairTeams([])).toEqual({ pairs: [], bye: null });
  });

  it('pairs 1024 teams without a bye', () => {
    const { pairs, bye } = pairTeams(Array.from({ length: 1024 }, (_, i) => i));
    expect(pairs).toHaveLength(512);
    expect(bye).toBeNull();
  });
});

describe('map selection', () => {
  const modes = [{ id: 'm1', team_size: 5 }, { id: 'm2', team_size: 5 }];
  const maps = [
    { id: 'a', name: 'A', mode_id: 'm1' }, { id: 'b', name: 'B', mode_id: 'm1' },
    { id: 'c', name: 'C', mode_id: 'm2' }, { id: 'custom-1', name: 'Custom Thing', mode_id: 'm2' }, { id: 'x', name: 'Workshop Island', mode_id: 'm1' },
  ];

  it('filterTournamentMaps drops custom / workshop maps by id or name', () => {
    expect(filterTournamentMaps(maps).map((m) => m.id)).toEqual(['a', 'b', 'c']);
  });

  it('shuffleArray keeps every element, does not mutate and is deterministic for a fixed rng', () => {
    const input = [1, 2, 3, 4, 5];
    const rng = () => 0.5;
    const out = shuffleArray(input, rng);
    expect(out.sort()).toEqual([1, 2, 3, 4, 5]);
    expect(input).toEqual([1, 2, 3, 4, 5]);
    expect(shuffleArray(input, rng)).toEqual(shuffleArray(input, rng));
  });

  it('selectMapsForMatch never repeats a map and returns the primary mode of the first pick', () => {
    const pool = filterTournamentMaps(maps);
    for (let i = 0; i < 20; i++) {
      const { selectedMaps, selectedModes, primaryMode } = selectMapsForMatch(3, modes, pool);
      expect(new Set(selectedMaps).size).toBe(3);
      expect(primaryMode.id).toBe(selectedModes[0]);
      selectedMaps.forEach((mapId, k) => expect(pool.find((m) => m.id === mapId)!.mode_id).toBe(selectedModes[k]));
    }
  });

  it('selectMapForRound falls back to any unused map, then throws when the pool is exhausted', () => {
    const only = [{ id: 'a', name: 'A', mode_id: 'unknown-mode' }];
    expect(selectMapForRound([], modes, only, 0)).toEqual({ mapId: 'a', modeId: 'm1' }); // mode of an unknown map falls back to the first mode
    expect(() => selectMapForRound(['a'], modes, only, 1)).toThrow(/Cannot avoid duplicate maps in round 2/);
    expect(() => selectMapsForMatch(4, modes, filterTournamentMaps(maps))).toThrow(/duplicate maps/);
  });
});

describe('naming', () => {
  it('matchTitle uses team names with fallbacks', () => {
    expect(matchTitle('Red', 'Blue')).toBe('Red vs Blue');
    expect(matchTitle(undefined, undefined)).toBe('Team 1 vs Team 2');
    expect(matchTitle(undefined, 'Blue', ['Winner 1', 'Winner 2'])).toBe('Winner 1 vs Blue');
  });

  it('plannedMatchName prefixes grand finals only', () => {
    expect(plannedMatchName('winners', undefined, 'A vs B')).toBe('A vs B');
    expect(plannedMatchName('losers', undefined, 'A vs B')).toBe('A vs B');
    expect(plannedMatchName('final', false, 'A vs B')).toBe('Grand Finals: A vs B');
    expect(plannedMatchName('final', true, 'A vs B')).toBe('Grand Finals Reset: A vs B');
  });
});
