/** Pure series logic (no database): validators, status transitions, bracket placings, tie-aware ranks. */
import { describe, expect, it } from 'vitest';
import { resolveBracketPlacings, tieAwareRanks } from '@/lib/series/standings';
import {
  parseScoringConfig, validateEventOrder, validatePointsMultiplier, validateScoringConfig, validateSeriesBody, validateSeriesDates,
  validateSeriesStatusTransition,
} from '@/lib/series/validation';

describe('validators', () => {
  it('validatePointsMultiplier accepts (0, 10] and rejects others', () => {
    expect(validatePointsMultiplier(1)).toBeNull();
    expect(validatePointsMultiplier(0.1)).toBeNull();
    expect(validatePointsMultiplier(10)).toBeNull();
    for (const bad of [0, -1, 10.1, NaN, Infinity, '2', null, undefined]) {
      expect(validatePointsMultiplier(bad)).not.toBeNull();
    }
  });

  it('validateEventOrder requires a positive integer', () => {
    expect(validateEventOrder(1)).toBeNull();
    for (const bad of [0, -2, 1.5, '3', NaN]) expect(validateEventOrder(bad)).not.toBeNull();
  });

  it('validateScoringConfig rejects bad shapes', () => {
    expect(validateScoringConfig({})).toBeNull();
    expect(validateScoringConfig({ match_win_points: 3, tournament_position_points: [5, 3], position_event_use_event_spread: false })).toBeNull();
    expect(validateScoringConfig(null)).not.toBeNull();
    expect(validateScoringConfig([])).not.toBeNull();
    expect(validateScoringConfig({ match_win_points: 'x' })).not.toBeNull();
    expect(validateScoringConfig({ tournament_position_points: [1, 'a'] })).not.toBeNull();
    expect(validateScoringConfig({ tournament_position_points: 5 })).not.toBeNull();
    expect(validateScoringConfig({ position_event_use_event_spread: 'yes' })).not.toBeNull();
  });

  it('parseScoringConfig returns {} for missing or malformed configs', () => {
    expect(parseScoringConfig(null)).toEqual({});
    expect(parseScoringConfig([])).toEqual({});
    expect(parseScoringConfig({ match_win_points: 'x' })).toEqual({});
    expect(parseScoringConfig({ match_win_points: 3 })).toEqual({ match_win_points: 3 });
  });

  it('validateSeriesDates requires parseable dates and end >= start; null / empty are fine', () => {
    expect(validateSeriesDates(undefined, null)).toBeNull();
    expect(validateSeriesDates('', '')).toBeNull();
    expect(validateSeriesDates('2026-06-01', '2026-06-30')).toBeNull();
    expect(validateSeriesDates('soon', null)).toMatch(/start_date/);
    expect(validateSeriesDates(null, 'whenever')).toMatch(/end_date/);
    expect(validateSeriesDates('2026-12-01', '2026-01-01')).toMatch(/before/);
  });

  it('validateSeriesBody: name required on create, optional (but non-empty) on update; types are checked', () => {
    expect(validateSeriesBody({}, false)).toMatch(/name/);
    expect(validateSeriesBody({}, true)).toBeNull();
    expect(validateSeriesBody({ name: ' ' }, true)).toMatch(/name/);
    expect(validateSeriesBody({ name: 'x', description: 5 }, false)).toMatch(/description/);
    expect(validateSeriesBody({ name: 'x', announcements: 'yes' }, false)).toMatch(/announcements/);
    expect(validateSeriesBody({ scoring_config: null }, true)).toBeNull();
    expect(validateSeriesBody({ name: 'x', scoring_config: null }, false)).toMatch(/scoring_config/);
  });
});

describe('validateSeriesStatusTransition', () => {
  it('allows the forward path created -> active -> complete', () => {
    expect(validateSeriesStatusTransition('created', 'active')).toBeNull();
    expect(validateSeriesStatusTransition('active', 'complete')).toBeNull();
  });

  it('rejects skipping a step (created -> complete)', () => {
    expect(validateSeriesStatusTransition('created', 'complete')).not.toBeNull();
  });

  it('rejects moving backwards (active -> created)', () => {
    expect(validateSeriesStatusTransition('active', 'created')).not.toBeNull();
  });

  it('rejects transitions out of a terminal complete state', () => {
    expect(validateSeriesStatusTransition('complete', 'active')).not.toBeNull();
    expect(validateSeriesStatusTransition('complete', 'created')).not.toBeNull();
  });

  it('allows cancelling from created or active', () => {
    expect(validateSeriesStatusTransition('created', 'cancelled')).toBeNull();
    expect(validateSeriesStatusTransition('active', 'cancelled')).toBeNull();
  });

  it('rejects cancelling a completed series', () => {
    expect(validateSeriesStatusTransition('complete', 'cancelled')).not.toBeNull();
  });

  it('allows re-requesting the same status as a no-op, even cancelled -> cancelled', () => {
    expect(validateSeriesStatusTransition('cancelled', 'cancelled')).toBeNull();
  });

  it('is a no-op (allowed) when current equals next', () => {
    expect(validateSeriesStatusTransition('active', 'active')).toBeNull();
  });

  it('rejects an unknown status value', () => {
    expect(validateSeriesStatusTransition('created', 'bogus')).not.toBeNull();
  });
});

describe('tieAwareRanks', () => {
  it('tied totals share the rank of the first tied entry', () => {
    expect(tieAwareRanks([10, 10, 6, 6, 6, 1])).toEqual([0, 0, 2, 2, 2, 5]);
    expect(tieAwareRanks([])).toEqual([]);
  });
});

describe('resolveBracketPlacings', () => {
  const m = (round: number, bracket_type: string, team1: string, team2: string, winner: string | null, status = 'complete') =>
    ({ round, bracket_type, status, winner_team: winner, team1_id: team1, team2_id: team2 });

  it('single elimination: champion, runner-up and semifinal losers (tied 3rd)', () => {
    const bracket = [m(1, 'winners', 'a', 'd', 'a'), m(1, 'winners', 'b', 'c', 'b'), m(2, 'winners', 'a', 'b', 'a')];
    expect(resolveBracketPlacings(bracket, 'single-elimination')).toEqual([['a'], ['b'], ['d', 'c']]);
  });

  it('double elimination: champion/runner-up from the latest final, third from the last losers match', () => {
    const bracket = [m(1, 'losers', 'c', 'd', 'c'), m(2, 'losers', 'c', 'b', 'b'), m(1, 'final', 'a', 'b', 'b'), m(2, 'final', 'a', 'b', 'a')];
    expect(resolveBracketPlacings(bracket, 'double-elimination')).toEqual([['a'], ['b'], ['c']]);
  });

  it('yields no placings until the final is decided', () => {
    expect(resolveBracketPlacings([m(1, 'winners', 'a', 'b', null, 'battle')], 'single-elimination')).toEqual([]);
    expect(resolveBracketPlacings([], 'double-elimination')).toEqual([]);
  });
});
