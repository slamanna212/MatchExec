// @vitest-environment node
/** Pure generator code (no database): circle-method pairings, divisions, the slot scheduler, timezones, race calendar. */
import { describe, expect, it } from 'vitest';
import { circleRounds, generatePairingRounds, planRoundRobin, type PairingEntrant } from '@/lib/series/generators/round-robin';
import { planRaceCalendar } from '@/lib/series/generators/race-calendar';
import {
  GeneratorConfigError, dayNumber, firstMatchDay, mondayOf, renderTemplate, scheduleItems, weekdayOf, weeklyByes, zonedTimeToUtc,
  type ScheduleConfig,
} from '@/lib/series/generators/schedule';

const ids = (n: number): string[] => Array.from({ length: n }, (_, i) => `e${i + 1}`);
const entrants = (n: number, divisions: Array<string | null> = []): PairingEntrant[] =>
  ids(n).map((id, i) => ({ id, name: `Team ${i + 1}`, division: divisions[i] ?? null }));
const key = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** How often each unordered pair meets. */
function pairCounts(rounds: ReturnType<typeof circleRounds>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const r of rounds) for (const [a, b] of r.pairs) counts.set(key(a, b), (counts.get(key(a, b)) ?? 0) + 1);
  return counts;
}

function expectNobodyTwicePerRound(rounds: ReturnType<typeof circleRounds>): void {
  for (const r of rounds) {
    const seen = r.pairs.flat();
    expect(new Set(seen).size).toBe(seen.length);
  }
}

describe('circleRounds', () => {
  it.each([2, 3, 4, 5, 6, 7, 8, 9, 12])('%i entrants: every pair exactly once, nobody twice in a round', (n) => {
    const rounds = circleRounds(ids(n));
    const counts = pairCounts(rounds);
    expect(counts.size).toBe((n * (n - 1)) / 2);
    expect([...counts.values()].every((c) => c === 1)).toBe(true);
    expectNobodyTwicePerRound(rounds);
    expect(rounds).toHaveLength(n % 2 === 0 ? n - 1 : n);
  });

  it('an odd count gives every entrant exactly one bye, one per round', () => {
    const rounds = circleRounds(ids(5));
    expect(rounds.every((r) => r.byes.length === 1)).toBe(true);
    expect(rounds.flatMap((r) => r.byes).sort()).toEqual(ids(5));
  });

  it('an even count has no byes; fewer than two entrants have no rounds', () => {
    expect(circleRounds(ids(6)).every((r) => r.byes.length === 0)).toBe(true);
    expect(circleRounds(ids(1))).toEqual([]);
    expect(circleRounds([])).toEqual([]);
  });

  it('balances home and away roughly', () => {
    const home = new Map<string, number>();
    for (const r of circleRounds(ids(8))) for (const [h] of r.pairs) home.set(h, (home.get(h) ?? 0) + 1);
    for (const count of home.values()) expect(count).toBeGreaterThanOrEqual(2); // 7 matches each: 3-4 at home
    for (const count of home.values()) expect(count).toBeLessThanOrEqual(5);
  });
});

describe('generatePairingRounds', () => {
  it('single round robin without divisions', () => {
    const { rounds } = generatePairingRounds(entrants(6), { double: false, divisions: 'none' });
    expect(pairCounts(rounds).size).toBe(15);
    expect(rounds).toHaveLength(5);
  });

  it('double mirrors the first leg with home and away swapped', () => {
    const { rounds } = generatePairingRounds(entrants(4), { double: true, divisions: 'none' });
    expect(rounds).toHaveLength(6);
    expect([...pairCounts(rounds).values()].every((c) => c === 2)).toBe(true);
    const firstLeg = rounds.slice(0, 3);
    const secondLeg = rounds.slice(3);
    for (const [i, r] of firstLeg.entries()) expect(secondLeg[i].pairs).toEqual(r.pairs.map(([h, a]) => [a, h]));
    expectNobodyTwicePerRound(rounds);
  });

  it('a double round robin of an odd count: every pair twice and a bye per entrant per leg', () => {
    const { rounds } = generatePairingRounds(entrants(5), { double: true, divisions: 'none' });
    expect([...pairCounts(rounds).values()].every((c) => c === 2)).toBe(true);
    expect(rounds.flatMap((r) => r.byes).sort()).toEqual([...ids(5), ...ids(5)].sort());
  });

  const divs = ['A', 'A', 'A', 'B', 'B', 'B'];

  it('within: only inside divisions, divisions play in parallel rounds', () => {
    const list = entrants(6, divs);
    const { rounds } = generatePairingRounds(list, { double: false, divisions: 'within' });
    const counts = pairCounts(rounds);
    expect(counts.size).toBe(6); // 3 + 3
    for (const k of counts.keys()) {
      const [a, b] = k.split('|');
      expect(list.find((e) => e.id === a)!.division).toBe(list.find((e) => e.id === b)!.division);
    }
    expectNobodyTwicePerRound(rounds);
    expect(rounds).toHaveLength(3); // both divisions share their rounds
    expect(rounds[0].pairs).toHaveLength(2);
  });

  it('within with double plays inside divisions twice', () => {
    const { rounds } = generatePairingRounds(entrants(6, divs), { double: true, divisions: 'within' });
    expect([...pairCounts(rounds).values()].every((c) => c === 2)).toBe(true);
  });

  it('within_and_cross: inside divisions twice, across divisions once', () => {
    const list = entrants(6, divs);
    const { rounds } = generatePairingRounds(list, { double: false, divisions: 'within_and_cross' });
    const sameDivision = (k: string): boolean => {
      const [a, b] = k.split('|');
      return list.find((e) => e.id === a)!.division === list.find((e) => e.id === b)!.division;
    };
    const counts = pairCounts(rounds);
    expect(counts.size).toBe(15); // every pair of the 6 appears
    for (const [k, c] of counts) expect(c).toBe(sameDivision(k) ? 2 : 1);
    expectNobodyTwicePerRound(rounds);
  });

  it('within_and_cross with double: across divisions twice as well', () => {
    const list = entrants(6, divs);
    const { rounds } = generatePairingRounds(list, { double: true, divisions: 'within_and_cross' });
    expect([...pairCounts(rounds).values()].every((c) => c === 2)).toBe(true);
  });

  it('warns for a single division or a lone entrant in a division and rejects fewer than two entrants', () => {
    expect(generatePairingRounds(entrants(4, ['A', 'A', 'A', 'A']), { double: false, divisions: 'within' }).warnings[0]).toMatch(/same division/);
    expect(generatePairingRounds(entrants(3, ['A', 'A', 'B']), { double: false, divisions: 'within' }).warnings.join()).toMatch(/single entrant/);
    expect(() => generatePairingRounds(entrants(1), { double: false, divisions: 'none' })).toThrow(GeneratorConfigError);
  });
});

describe('zonedTimeToUtc', () => {
  it('is DST-safe in New York', () => {
    expect(zonedTimeToUtc('2026-03-07', '19:00', 'America/New_York').toISOString()).toBe('2026-03-08T00:00:00.000Z'); // EST, UTC-5
    expect(zonedTimeToUtc('2026-03-08', '19:00', 'America/New_York').toISOString()).toBe('2026-03-08T23:00:00.000Z'); // EDT, UTC-4
    expect(zonedTimeToUtc('2026-10-31', '19:00', 'America/New_York').toISOString()).toBe('2026-10-31T23:00:00.000Z'); // EDT
    expect(zonedTimeToUtc('2026-11-01', '19:00', 'America/New_York').toISOString()).toBe('2026-11-02T00:00:00.000Z'); // EST
  });

  it('is DST-safe in Europe and for half-hour zones', () => {
    expect(zonedTimeToUtc('2026-03-28', '12:00', 'Europe/Berlin').toISOString()).toBe('2026-03-28T11:00:00.000Z'); // CET
    expect(zonedTimeToUtc('2026-03-29', '12:00', 'Europe/Berlin').toISOString()).toBe('2026-03-29T10:00:00.000Z'); // CEST from 02:00 that day
    expect(zonedTimeToUtc('2026-06-01', '10:00', 'Asia/Kolkata').toISOString()).toBe('2026-06-01T04:30:00.000Z');
    expect(zonedTimeToUtc('2026-06-01', '23:30', 'UTC').toISOString()).toBe('2026-06-01T23:30:00.000Z');
  });

  it('puts a time inside the spring-forward gap at or after the gap, never before', () => {
    const gap = zonedTimeToUtc('2026-03-08', '02:30', 'America/New_York');
    expect(gap.getTime()).toBeGreaterThanOrEqual(Date.parse('2026-03-08T07:00:00Z') - 3_600_000);
    expect(Math.abs(gap.getTime() - Date.parse('2026-03-08T07:30:00Z'))).toBeLessThanOrEqual(3_600_000);
  });

  it('rejects an unknown timezone and malformed input', () => {
    expect(() => zonedTimeToUtc('2026-03-08', '19:00', 'Mars/Olympus')).toThrow(GeneratorConfigError);
    expect(() => zonedTimeToUtc('2026-3-8', '19:00', 'UTC')).toThrow(GeneratorConfigError);
    expect(() => zonedTimeToUtc('2026-03-08', '25:00', 'UTC')).toThrow(GeneratorConfigError);
  });
});

describe('calendar helpers', () => {
  it('weekdays and Monday-based weeks', () => {
    expect(weekdayOf(dayNumber('2026-01-04'))).toBe(0); // Sunday
    expect(weekdayOf(dayNumber('2026-01-05'))).toBe(1); // Monday
    expect(mondayOf(dayNumber('2026-01-04'))).toBe(dayNumber('2025-12-29'));
    expect(mondayOf(dayNumber('2026-01-05'))).toBe(dayNumber('2026-01-05'));
  });

  it('rejects impossible dates', () => {
    expect(() => dayNumber('2026-02-30')).toThrow(GeneratorConfigError);
    expect(() => dayNumber('nope')).toThrow(GeneratorConfigError);
  });

  it('firstMatchDay skips non-match days and skipped dates', () => {
    expect(firstMatchDay({ start_date: '2026-01-05', match_days: [3], skip_dates: [] })).toBe('2026-01-07');
    expect(firstMatchDay({ start_date: '2026-01-05', match_days: [3], skip_dates: ['2026-01-07'] })).toBe('2026-01-14');
    expect(() => firstMatchDay({ start_date: '2026-01-05', match_days: [3], skip_dates: [] }, 2)).toThrow(GeneratorConfigError);
  });

  it('renderTemplate fills known placeholders only', () => {
    expect(renderTemplate('{home} vs {away} (R{round}) {x}', { home: 'A', away: 'B', round: 2 })).toBe('A vs B (R2) {x}');
  });
});

describe('scheduleItems', () => {
  const base: ScheduleConfig = { start_date: '2026-01-05', match_days: [2, 4], time_slots: ['19:00', '20:00'], timezone: 'UTC' }; // Tue + Thu
  const items = (pairs: Array<[string, string]>) => pairs.map(([a, b]) => ({ entrant_ids: [a, b] }));

  it('fills slots in order, one match per slot by default', () => {
    const out = scheduleItems(items([['a', 'b'], ['c', 'd'], ['e', 'f'], ['g', 'h']]), base);
    expect(out.map((s) => s.start.toISOString())).toEqual([
      '2026-01-06T19:00:00.000Z', '2026-01-06T20:00:00.000Z', '2026-01-08T19:00:00.000Z', '2026-01-08T20:00:00.000Z',
    ]);
    expect(out.map((s) => s.week)).toEqual([1, 1, 1, 1]);
  });

  it('only uses match days and never a skipped date', () => {
    const out = scheduleItems(items(Array.from({ length: 8 }, (_, i) => [`a${i}`, `b${i}`] as [string, string])), { ...base, skip_dates: ['2026-01-08'] });
    for (const s of out) expect([2, 4]).toContain(s.start.getUTCDay());
    expect(out.some((s) => s.start.toISOString().startsWith('2026-01-08'))).toBe(false);
    expect(out.map((s) => s.week)).toEqual([1, 1, 2, 2, 2, 2, 3, 3]);
  });

  it('runs concurrent_matches in the same slot', () => {
    const out = scheduleItems(items([['a', 'b'], ['c', 'd'], ['e', 'f'], ['g', 'h']]), { ...base, time_slots: ['19:00'], concurrent_matches: 2 });
    const bySlot = new Map<string, number>();
    for (const s of out) bySlot.set(s.start.toISOString(), (bySlot.get(s.start.toISOString()) ?? 0) + 1);
    expect([...bySlot.values()]).toEqual([2, 2]);
  });

  it('never puts an entrant twice in the same slot or beyond max_per_entrant_per_week', () => {
    // a plays in all four fixtures; 1 per week -> four different weeks
    const out = scheduleItems(items([['a', 'b'], ['a', 'c'], ['a', 'd'], ['a', 'e']]), { ...base, concurrent_matches: 4 });
    expect(out.map((s) => s.week)).toEqual([1, 2, 3, 4]);

    const two = scheduleItems(items([['a', 'b'], ['a', 'c'], ['a', 'd']]), { ...base, concurrent_matches: 4, max_per_entrant_per_week: 2 });
    expect(two.map((s) => s.week)).toEqual([1, 1, 2]);
    // same slot never holds an entrant twice even when the weekly cap allows it
    const slots = two.map((s) => s.start.toISOString());
    expect(new Set(slots).size).toBe(slots.length);
  });

  it('skips over a blocked item to keep the slots filled, preserving order otherwise', () => {
    const out = scheduleItems(items([['a', 'b'], ['a', 'c'], ['d', 'e']]), { ...base, concurrent_matches: 3, time_slots: ['19:00'] });
    // a-c has to wait a week (a already plays), d-e takes the free place in week 1
    expect(out.map((s) => [s.item.entrant_ids.join('-'), s.week])).toEqual([['a-b', 1], ['d-e', 1], ['a-c', 2]]);
  });

  it('numbers Monday-based weeks from the first match day, including empty weeks', () => {
    const cfg: ScheduleConfig = { start_date: '2026-01-04', match_days: [0, 3], time_slots: ['10:00'], timezone: 'UTC', max_per_entrant_per_week: 5 };
    // Sun Jan 4 belongs to the week of Mon Dec 29 -> week 1; Wed Jan 7 is the next Monday-week -> 2
    const out = scheduleItems(items([['a', 'b'], ['c', 'd'], ['e', 'f'], ['g', 'h']]), cfg);
    expect(out.map((s) => s.start.toISOString().slice(0, 10))).toEqual(['2026-01-04', '2026-01-07', '2026-01-11', '2026-01-14']);
    expect(out.map((s) => s.week)).toEqual([1, 2, 2, 3]);
  });

  it('keeps the wall-clock slot across a DST change (UTC instants move)', () => {
    const cfg: ScheduleConfig = { start_date: '2026-03-02', match_days: [1], time_slots: ['19:00'], timezone: 'America/New_York' };
    const out = scheduleItems(items(Array.from({ length: 3 }, (_, i) => [`a${i}`, `b${i}`] as [string, string])), cfg);
    expect(out.map((s) => s.start.toISOString())).toEqual(['2026-03-03T00:00:00.000Z', '2026-03-09T23:00:00.000Z', '2026-03-16T23:00:00.000Z']);
  });

  it('honours notBefore, weekOrigin and occupied (regenerating)', () => {
    const cfg: ScheduleConfig = { start_date: '2026-01-05', match_days: [2], time_slots: ['19:00'], timezone: 'UTC', concurrent_matches: 2 };
    const out = scheduleItems(items([['a', 'b'], ['c', 'd']]), cfg, {
      notBefore: new Date('2026-01-07T00:00:00Z'), weekOrigin: '2025-12-30',
      occupied: [{ entrant_ids: ['a', 'x'], start: new Date('2026-01-13T19:00:00Z') }],
    });
    // Jan 6 is before notBefore; Jan 13 holds a's other match (cap 1 per week) so a-b goes to Jan 20, c-d takes Jan 13
    expect(out.map((s) => [s.item.entrant_ids.join('-'), s.start.toISOString().slice(0, 10), s.week])).toEqual([
      ['c-d', '2026-01-13', 3], ['a-b', '2026-01-20', 4],
    ]);
  });

  it('throws when the items do not fit and on a bad config', () => {
    expect(() => scheduleItems(items([['a', 'b'], ['a', 'c'], ['a', 'd']]), base, { maxDays: 8 })).toThrow(/Could not place/);
    expect(() => scheduleItems(items([['a', 'b']]), { ...base, match_days: [] })).toThrow(GeneratorConfigError);
    expect(() => scheduleItems(items([['a', 'b']]), { ...base, time_slots: ['7pm'] })).toThrow(GeneratorConfigError);
    expect(() => scheduleItems(items([['a', 'b']]), { ...base, timezone: 'Nope/Nope' })).toThrow(GeneratorConfigError);
    expect(scheduleItems([], base)).toEqual([]);
  });
});

describe('planRoundRobin', () => {
  const cfg = { double: false, divisions: 'none' as const, start_date: '2026-01-05', match_days: [2, 4], time_slots: ['19:00'], timezone: 'UTC', concurrent_matches: 2 };

  it('plans every pairing with names and weeks, each entrant at most once per week', () => {
    const { fixtures, warnings } = planRoundRobin(entrants(4), cfg, undefined);
    expect(warnings).toEqual([]);
    expect(fixtures).toHaveLength(6);
    expect(new Set(fixtures.map((f) => key(f.entrant_ids[0], f.entrant_ids[1]))).size).toBe(6);
    expect(fixtures.every((f) => /^Team \d vs Team \d$/.test(f.name))).toBe(true);
    for (let week = 1; week <= 3; week++) {
      const inWeek = fixtures.filter((f) => f.week === week).flatMap((f) => f.entrant_ids);
      expect(new Set(inWeek).size).toBe(inWeek.length);
    }
    expect(Math.max(...fixtures.map((f) => f.week))).toBe(3);
  });

  it('uses a name template with {home}, {away} and {round}', () => {
    const { fixtures } = planRoundRobin(entrants(2), cfg, 'R{round}: {away} @ {home}');
    expect(fixtures[0].name).toMatch(/^R1: Team [12] @ Team [12]$/);
  });

  it('reports the entrants without a fixture per week (odd count)', () => {
    const { fixtures, byes } = planRoundRobin(entrants(5), { ...cfg, concurrent_matches: 2 }, undefined);
    expect(fixtures).toHaveLength(10);
    for (const b of byes) {
      const playing = new Set(fixtures.filter((f) => f.week === b.week).flatMap((f) => f.entrant_ids));
      for (const id of b.entrant_ids) expect(playing.has(id)).toBe(false);
    }
    expect(byes.length).toBeGreaterThan(0);
  });

  it('weeklyByes only lists weeks with fixtures and drops empty entries', () => {
    expect(weeklyByes([{ week: 1, entrant_ids: ['a', 'b'] }, { week: 3, entrant_ids: ['a', 'c'] }], ['a', 'b', 'c'])).toEqual([
      { week: 1, entrant_ids: ['c'] }, { week: 3, entrant_ids: ['b'] },
    ]);
    expect(weeklyByes([{ week: 1, entrant_ids: ['a', 'b'] }], ['a', 'b'])).toEqual([]);
  });

  it('can schedule a given pairing list (regenerate)', () => {
    const { fixtures } = planRoundRobin(entrants(4), cfg, undefined, { pairings: [{ round: 3, home: 'e1', away: 'e2', entrant_ids: ['e1', 'e2'] }] });
    expect(fixtures).toHaveLength(1);
    expect(fixtures[0].entrant_ids).toEqual(['e1', 'e2']);
  });
});

describe('planRaceCalendar', () => {
  it('creates `count` events every interval at the wall-clock time, week = index', () => {
    const out = planRaceCalendar({ count: 4, interval_days: 7, start_date: '2026-03-20', time: '20:00', timezone: 'Europe/Berlin' }, ids(3));
    expect(out.map((f) => f.week)).toEqual([1, 2, 3, 4]);
    expect(out.map((f) => f.name)).toEqual(['Round 1', 'Round 2', 'Round 3', 'Round 4']);
    // DST starts 2026-03-29: 20:00 is 19:00Z before it and 18:00Z after
    expect(out.map((f) => f.start)).toEqual([
      '2026-03-20T19:00:00.000Z', '2026-03-27T19:00:00.000Z', '2026-04-03T18:00:00.000Z', '2026-04-10T18:00:00.000Z',
    ]);
    expect(out.every((f) => f.entrant_ids.join() === ids(3).join())).toBe(true);
  });

  it('supports a name template and validates its config', () => {
    expect(planRaceCalendar({ count: 2, interval_days: 14, start_date: '2026-06-01', time: '18:30', timezone: 'UTC', name_template: 'GP {n}' }, ids(2)).map((f) => f.name)).toEqual(['GP 1', 'GP 2']);
    const bad = { interval_days: 7, start_date: '2026-06-01', time: '18:30', timezone: 'UTC' };
    expect(() => planRaceCalendar({ ...bad, count: 0 }, ids(2))).toThrow(GeneratorConfigError);
    expect(() => planRaceCalendar({ ...bad, count: 5, interval_days: 0 }, ids(2))).toThrow(GeneratorConfigError);
    expect(() => planRaceCalendar({ ...bad, count: 5, time: '6pm' }, ids(2))).toThrow(GeneratorConfigError);
    expect(() => planRaceCalendar({ ...bad, count: 5, timezone: 'Nope/Nope' }, ids(2))).toThrow(GeneratorConfigError);
  });
});
