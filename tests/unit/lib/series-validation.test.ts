/** Pure series logic (no database): validators, status transitions, bracket placings, tie-aware ranks. */
import { describe, expect, it } from 'vitest';
import { resolveBracketPlacings, tieAwareRanks } from '@/lib/series/standings';
import {
  validateDiscordConfig, validateEntrantBody, validateMatchDefaults, validateMemberBody, validatePlacementFields, validateRosterBounds,
  validateStageBody,
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

describe('status transitions with registration', () => {
  it('created -> registration -> active -> complete, with created -> active still legal', () => {
    expect(validateSeriesStatusTransition('created', 'registration')).toBeNull();
    expect(validateSeriesStatusTransition('registration', 'active')).toBeNull();
    expect(validateSeriesStatusTransition('created', 'active')).toBeNull();
  });
  it('cancel is reachable from registration; nothing goes back or skips', () => {
    expect(validateSeriesStatusTransition('registration', 'cancelled')).toBeNull();
    expect(validateSeriesStatusTransition('registration', 'created')).not.toBeNull();
    expect(validateSeriesStatusTransition('registration', 'complete')).not.toBeNull();
    expect(validateSeriesStatusTransition('active', 'registration')).not.toBeNull();
    expect(validateSeriesStatusTransition('cancelled', 'registration')).not.toBeNull();
  });
});

describe('validateScoringConfig (rework keys)', () => {
  it('accepts head_to_head and points configs', () => {
    expect(validateScoringConfig({ mode: 'head_to_head', win_points: 3, loss_points: 0, tie_points: 1, tiebreakers: ['match_wins', 'map_diff', 'head_to_head', 'maps_won'] })).toBeNull();
    expect(validateScoringConfig({ mode: 'points', position_points: [25, 18, 15], drop_worst: 2, tiebreakers: ['points', 'event_wins', 'best_finishes'] })).toBeNull();
  });
  it('rejects bad values', () => {
    for (const bad of [
      { mode: 'league' }, { win_points: 'x' }, { loss_points: NaN }, { tie_points: null }, { tiebreakers: ['luck'] }, { tiebreakers: 'points' },
      { position_points: [1, 'a'] }, { position_points: 3 }, { drop_worst: -1 }, { drop_worst: 1.5 }, { drop_worst: '1' },
    ]) {
      expect(validateScoringConfig(bad), JSON.stringify(bad)).not.toBeNull();
    }
  });
});

describe('validateSeriesBody (rework fields)', () => {
  const ok = { name: 'S' };
  it('accepts the new fields', () => {
    expect(validateSeriesBody({ ...ok, entrant_type: 'team', roster_min: 5, roster_max: 7, scoring_type: 'Normal', game_ids: ['a', 'b'], game_mode_id: 'm', match_defaults: { rounds_per_match: 3 }, discord_config: { weekly_schedule: true }, previous_series_id: null }, false)).toBeNull();
    expect(validateSeriesBody({ scoring_type: null, match_defaults: null, discord_config: null }, true)).toBeNull();
  });
  it('rejects bad enums, bounds and blobs', () => {
    for (const bad of [
      { entrant_type: 'duo' }, { scoring_type: 'Elo' }, { roster_min: 0 }, { roster_max: 100 }, { roster_min: 4, roster_max: 2 },
      { entrant_type: 'solo', roster_max: 3 }, { game_ids: 'a' }, { game_ids: [''] }, { game_ids: [1] }, { game_mode_id: 5 },
      { match_defaults: [] }, { discord_config: 'x' },
    ]) {
      expect(validateSeriesBody({ ...ok, ...bad }, false), JSON.stringify(bad)).not.toBeNull();
    }
  });
});

describe('validateMatchDefaults / validateDiscordConfig / validateRosterBounds', () => {
  it('match defaults', () => {
    expect(validateMatchDefaults({ maps: ['a'], rounds_per_match: 5, rules: 'casual', stats_enabled: true, announcements: [{ type: 'x', time: 5 }], livestream_link: null })).toBeNull();
    expect(validateMatchDefaults({ rounds: 3 })).toMatch(/rounds is not accepted.*one game per map/);
    for (const bad of [{ maps: [1] }, { rounds_per_match: 0 }, { rounds_per_match: 100 }, { rules: 'x' }, { stats_enabled: 'y' }, { announcements: [{ type: 'x' }] }, { livestream_link: 3 }, 'x']) {
      expect(validateMatchDefaults(bad), JSON.stringify(bad)).not.toBeNull();
    }
  });
  it('discord config', () => {
    expect(validateDiscordConfig({ weekly_schedule: false, standings_posts: true, registration_posts: true, schedule_lead_hours: 48, team_creation: false })).toBeNull();
    for (const bad of [{ weekly_schedule: 1 }, { team_creation: 'no' }, { schedule_lead_hours: -1 }, { schedule_lead_hours: 'x' }, { schedule_lead_hours: 9999 }, null]) {
      expect(validateDiscordConfig(bad), JSON.stringify(bad)).not.toBeNull();
    }
  });
  it('roster bounds', () => {
    expect(validateRosterBounds('team', 5, 7)).toBeNull();
    expect(validateRosterBounds('team', null, null)).toBeNull();
    expect(validateRosterBounds('solo', 1, 1)).toBeNull();
    expect(validateRosterBounds('solo', undefined, undefined)).toBeNull();
    expect(validateRosterBounds('solo', 2, 2)).not.toBeNull();
    expect(validateRosterBounds('team', 8, 7)).not.toBeNull();
    expect(validateRosterBounds('team', 1.5, 7)).not.toBeNull();
  });
});

describe('entrant / member / stage / placement bodies', () => {
  it('entrant', () => {
    expect(validateEntrantBody({ name: 'A', tag: 'AB', color: '#fff', seed: 1, division: 'East', status: 'pending', members: [{ user_id: 'u', username: 'n', role: 'captain' }] }, false)).toBeNull();
    expect(validateEntrantBody({ seed: 2 }, true)).toBeNull();
    for (const bad of [{}, { name: '' }, { name: 'x'.repeat(101) }, { name: 'A', tag: 'x'.repeat(13) }, { name: 'A', seed: 0 }, { name: 'A', status: 'gone' }, { name: 'A', members: 'x' }, { name: 'A', members: [{ user_id: 'u' }] }, { name: 'A', color: 5 }]) {
      expect(validateEntrantBody(bad, false), JSON.stringify(bad)).not.toBeNull();
    }
  });
  it('member', () => {
    expect(validateMemberBody({ user_id: 'u', username: 'n', discord_user_id: null }, false)).toBeNull();
    expect(validateMemberBody({ role: 'sub' }, true)).toBeNull();
    for (const bad of [{ username: 'n' }, { user_id: ' ', username: 'n' }, { user_id: 'u', username: 'n', role: 'coach' }, { user_id: 'u', username: 'n', discord_user_id: 5 }]) {
      expect(validateMemberBody(bad, false), JSON.stringify(bad)).not.toBeNull();
    }
  });
  it('stage', () => {
    expect(validateStageBody({ name: 'S1', stage_order: 2, counts_toward_season: false, status: 'active', scoring_config: { drop_worst: 1 } }, false)).toBeNull();
    for (const bad of [{}, { name: ' ' }, { name: 'S', stage_order: 0 }, { name: 'S', counts_toward_season: 'y' }, { name: 'S', status: 'done' }, { name: 'S', scoring_config: { mode: 'x' } }]) {
      expect(validateStageBody(bad, false), JSON.stringify(bad)).not.toBeNull();
    }
  });
  it('placement fields', () => {
    expect(validatePlacementFields({ stage_id: null, role: 'exhibition', week: 3, counts_for_standings: false })).toBeNull();
    expect(validatePlacementFields({})).toBeNull();
    for (const bad of [{ stage_id: 3 }, { role: 'final' }, { week: 0 }, { week: 1.5 }, { week: 'x' }, { counts_for_standings: 'yes' }]) {
      expect(validatePlacementFields(bad), JSON.stringify(bad)).not.toBeNull();
    }
  });
});
