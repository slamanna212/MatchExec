import { describe, it, expect } from 'vitest';
import {
  buildCommitPayload, buildRaceCalendarConfig, buildRoundRobinConfig, buildSeedingRule, defaultRaceCalendarForm, defaultRoundRobinForm,
  groupFixturesByWeek, isoToZoned, matchEntrantBounds, matchTemplatePayload, removeFixture, setFixtureTime, stripKeys, swapHomeAway,
  toEditable, validatePlannedForm, validateRaceCalendarForm, validateRoundRobinForm, zonedToIso,
} from '@/components/series/series-fixtures';
import type { GeneratedFixture } from '@/shared/series-types';

const fx = (name: string, week: number, start: string, ids: string[]): GeneratedFixture => ({ name, week, start, entrant_ids: ids });
const NAMES = new Map([['a', 'Alpha'], ['b', 'Bravo'], ['c', 'Charlie']]);

describe('timezone conversion', () => {
  it('round-trips wall-clock time through a timezone', () => {
    const iso = zonedToIso('2026-07-01', '19:30', 'America/New_York');
    expect(iso).toBe('2026-07-01T23:30:00.000Z'); // EDT = UTC-4
    expect(isoToZoned(iso as string, 'America/New_York')).toEqual({ date: '2026-07-01', time: '19:30' });
  });

  it('handles winter time and UTC', () => {
    expect(zonedToIso('2026-01-15', '19:30', 'America/New_York')).toBe('2026-01-16T00:30:00.000Z');
    expect(zonedToIso('2026-01-15', '07:00', 'UTC')).toBe('2026-01-15T07:00:00.000Z');
    expect(isoToZoned('2026-01-16T00:30:00.000Z', 'Asia/Tokyo')).toEqual({ date: '2026-01-16', time: '09:30' });
  });

  it('rejects malformed input', () => {
    expect(zonedToIso('2026-1-5', '19:30', 'UTC')).toBeNull();
    expect(zonedToIso('2026-01-05', '25:00', 'UTC')).toBeNull();
  });
});

describe('preview edits', () => {
  const base = toEditable([
    fx('Alpha vs Bravo', 1, '2026-07-01T23:00:00.000Z', ['a', 'b']),
    fx('Charlie vs Alpha', 2, '2026-07-08T23:00:00.000Z', ['c', 'a']),
    fx('Bravo vs Charlie', 1, '2026-07-01T21:00:00.000Z', ['b', 'c']),
  ]);

  it('gives rows stable keys and strips them for the payload', () => {
    expect(base.map((f) => f.key)).toEqual(['fx-0', 'fx-1', 'fx-2']);
    expect(stripKeys(base)[0]).toEqual(fx('Alpha vs Bravo', 1, '2026-07-01T23:00:00.000Z', ['a', 'b']));
  });

  it('swaps home and away and renames a default-named fixture', () => {
    const next = swapHomeAway(base, 'fx-0', NAMES);
    expect(next[0].entrant_ids).toEqual(['b', 'a']);
    expect(next[0].name).toBe('Bravo vs Alpha');
    expect(base[0].entrant_ids).toEqual(['a', 'b']); // input untouched
  });

  it('keeps a custom name when swapping', () => {
    const custom = toEditable([fx('Opening night', 1, '2026-07-01T23:00:00.000Z', ['a', 'b'])]);
    expect(swapHomeAway(custom, 'fx-0', NAMES)[0].name).toBe('Opening night');
  });

  it('removes a fixture', () => {
    expect(removeFixture(base, 'fx-1').map((f) => f.key)).toEqual(['fx-0', 'fx-2']);
  });

  it('moves a fixture to a new wall-clock date and time', () => {
    const next = setFixtureTime(base, 'fx-0', '2026-07-02', '18:00', 'UTC');
    expect(next[0].start).toBe('2026-07-02T18:00:00.000Z');
    expect(setFixtureTime(base, 'fx-0', 'nonsense', '18:00', 'UTC')[0].start).toBe('2026-07-01T23:00:00.000Z');
  });

  it('groups by week, ordered by start time, with byes', () => {
    const groups = groupFixturesByWeek(base, [{ week: 2, entrant_ids: ['b'] }]);
    expect(groups.map((g) => g.week)).toEqual([1, 2]);
    expect(groups[0].fixtures.map((f) => f.key)).toEqual(['fx-2', 'fx-0']);
    expect(groups[1].byes).toEqual(['b']);
  });

  it('builds the commit payload from the edited fixtures in start order', () => {
    const edited = removeFixture(swapHomeAway(base, 'fx-0', NAMES), 'fx-1');
    const payload = buildCommitPayload({ marker: true }, edited);
    expect(payload.config).toEqual({ marker: true });
    expect(payload.fixtures).toEqual([
      fx('Bravo vs Charlie', 1, '2026-07-01T21:00:00.000Z', ['b', 'c']),
      fx('Bravo vs Alpha', 1, '2026-07-01T23:00:00.000Z', ['b', 'a']),
    ]);
  });
});

describe('round robin config', () => {
  it('validates the form', () => {
    const form = defaultRoundRobinForm({ start_date: '2026-07-01', match_days: [3] });
    expect(validateRoundRobinForm(form, 4)).toBeNull();
    expect(validateRoundRobinForm(form, 1)).toMatch(/two entrants/);
    expect(validateRoundRobinForm({ ...form, start_date: null }, 4)).toMatch(/match day/);
    expect(validateRoundRobinForm({ ...form, match_days: [] }, 4)).toMatch(/match day/);
    expect(validateRoundRobinForm({ ...form, time_slots: ['7pm'] }, 4)).toMatch(/Time slots/);
    expect(validateRoundRobinForm({ ...form, all_entrants: false, entrant_ids: ['a'] }, 4)).toMatch(/two entrants/);
  });

  it('builds the API config with the browser timezone default and sorted unique days / slots', () => {
    const form = defaultRoundRobinForm({
      start_date: '2026-07-01', match_days: [5, 3, 3], time_slots: ['20:00', '18:00'], timezone: 'Europe/Paris', double: true,
      divisions: 'within_and_cross', skip_dates: ['2026-12-25'],
      template: { game_id: 'ow2', maps: ['m1'], rounds: 3, rules: 'competitive' },
    });
    expect(buildRoundRobinConfig(form)).toEqual({
      stage_id: null, entrant_ids: null, double: true, divisions: 'within_and_cross', start_date: '2026-07-01', match_days: [3, 5],
      time_slots: ['18:00', '20:00'], timezone: 'Europe/Paris', concurrent_matches: 1, max_per_entrant_per_week: 1,
      skip_dates: ['2026-12-25'], points_multiplier: 1,
      match: { game_id: 'ow2', maps: ['m1'], rules: 'competitive', name_template: '{home} vs {away}' }, // no rounds: one game per map
    });
    expect(defaultRoundRobinForm().timezone).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
  });

  it('sends explicit entrants when not using all', () => {
    const cfg = buildRoundRobinConfig(defaultRoundRobinForm({ start_date: '2026-07-01', all_entrants: false, entrant_ids: ['a', 'b'] }));
    expect(cfg.entrant_ids).toEqual(['a', 'b']);
    expect(cfg.skip_dates).toBeUndefined();
  });
});

describe('race calendar config', () => {
  it('validates and builds a match calendar', () => {
    const form = defaultRaceCalendarForm({ start_date: '2026-07-01', timezone: 'UTC', template: { game_id: 'mk8', maps: [], rounds: null, rules: null } });
    expect(validateRaceCalendarForm(form, 8)).toBeNull();
    expect(validateRaceCalendarForm({ ...form, count: 0 }, 8)).toMatch(/between 1 and 100/);
    expect(validateRaceCalendarForm({ ...form, time: '9pm' }, 8)).toMatch(/Time/);
    expect(buildRaceCalendarConfig(form)).toEqual({
      stage_id: null, entrant_ids: null, count: 8, start_date: '2026-07-01', interval_days: 7, time: '19:00', timezone: 'UTC',
      name_template: 'Round {n}', points_multiplier: 1, event_kind: 'match', match: { game_id: 'mk8' },
    });
  });

  it('builds a tournament calendar', () => {
    const cfg = buildRaceCalendarConfig(defaultRaceCalendarForm({
      start_date: '2026-07-01', event_kind: 'tournament', template: { game_id: 'mk8', maps: [], rounds: 2, rules: 'casual' },
    }));
    expect(cfg.match).toBeUndefined();
    expect(cfg.tournament).toEqual({ format: 'cumulative-points', game_id: 'mk8', rounds_per_match: 2, ruleset: 'casual' });
  });
});

describe('playoff placeholder rule', () => {
  const form = { name: ' Playoffs ', source: 'stage' as const, stage_id: 's1', top: 4, per_division: true, format: 'single-elimination' as const, game_id: 'ow2', rounds_per_match: 5, ruleset: null, start_time: null };

  it('validates', () => {
    expect(validatePlannedForm(form)).toBeNull();
    expect(validatePlannedForm({ ...form, name: ' ' })).toMatch(/name/);
    expect(validatePlannedForm({ ...form, stage_id: null })).toMatch(/stage/);
    expect(validatePlannedForm({ ...form, top: 1 })).toMatch(/two/);
    expect(validatePlannedForm({ ...form, source: 'season', stage_id: null })).toBeNull();
  });

  it('builds the seeding rule', () => {
    expect(buildSeedingRule(form)).toEqual({
      source: 'stage', stage_id: 's1', top: 4, per_division: true, format: 'single-elimination',
      template: { name: 'Playoffs', game_id: 'ow2', rounds_per_match: 5 },
    });
    expect(buildSeedingRule({ ...form, source: 'season' }).stage_id).toBeUndefined();
  });
});

describe('misc', () => {
  it('match template payload omits empty values', () => {
    expect(matchTemplatePayload({ game_id: null, maps: [], rounds: null, rules: null })).toEqual({});
    // a match plays one game per map: rounds is never sent, even when the form state holds a value (tournaments use it)
    expect(matchTemplatePayload({ game_id: null, maps: ['a', 'b'], rounds: 5, rules: null })).toEqual({ maps: ['a', 'b'] });
  });
  it('match entrant bounds follow the scoring type', () => {
    expect(matchEntrantBounds('Normal')).toEqual({ min: 2, max: 16 });
    expect(matchEntrantBounds('FFA')).toEqual({ min: 1, max: null });
  });
});
