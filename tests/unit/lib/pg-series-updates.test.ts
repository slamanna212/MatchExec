// @vitest-environment node
/** Which series posts are due (weekly schedule / standings), the dedupe, and the discord_config / announcements switches. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { asc } from 'drizzle-orm';
import { setupPgTestFile, getPgTestDb } from '../../utils/pg-test-db';
import { createMatch, seedBasicTestData } from '../../utils/pg-fixtures';
import { insertSeries, insertStage, linkEvent } from '../../utils/pg-series-fixtures';
import {
  DEFAULT_SCHEDULE_LEAD_HOURS, dueSeriesPosts, enqueueDueSeriesUpdates, eventWeek, isoWeek, isoWeekNumber, sameWeek, summariseWeeks,
  weekDedupeKey, weekLabel, type DueCheckEvent,
} from '@/lib/series';
import { discordSeriesUpdateQueue, matches } from '../../../lib/db/schema';

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warning: vi.fn(), info: vi.fn(), debug: vi.fn(), reload: vi.fn() } }));

setupPgTestFile();
const pg = () => getPgTestDb();

const H = 3_600_000;
const NOW = new Date('2026-03-10T12:00:00Z');
const at = (hoursFromNow: number) => new Date(NOW.getTime() + hoursFromNow * H);
const ev = (week: number | null, startHours: number | null, target_status: string | null = 'created', live = true): DueCheckEvent =>
  ({ week, start: startHours === null ? null : at(startHours), live, target_status });

describe('week helpers', () => {
  it('computes ISO weeks (Monday based, week 1 holds the first Thursday)', () => {
    expect(isoWeekNumber(new Date('2026-01-01T12:00:00Z'))).toBe(1); // Thursday
    expect(isoWeekNumber(new Date('2025-12-29T00:00:00Z'))).toBe(1); // Monday of 2026-W01
    expect(isoWeekNumber(new Date('2026-03-08T23:59:00Z'))).toBe(10); // Sunday
    expect(isoWeekNumber(new Date('2026-03-09T00:00:00Z'))).toBe(11); // Monday
    expect(isoWeekNumber(new Date('2021-01-03T00:00:00Z'))).toBe(53);
  });

  it('returns the ISO week-numbering year, which differs from the calendar year around New Year', () => {
    expect(isoWeek(new Date('2025-12-29T00:00:00Z'))).toEqual({ year: 2026, week: 1 });
    expect(isoWeek(new Date('2021-01-03T00:00:00Z'))).toEqual({ year: 2020, week: 53 });
  });

  it('uses the explicit season week, else the ISO calendar week of the start, else nothing', () => {
    expect(eventWeek({ week: 4, start: new Date('2026-03-10T00:00:00Z') })).toEqual({ week: 4 });
    expect(eventWeek({ week: 0, start: null })).toEqual({ week: 0 });
    expect(eventWeek({ week: null, start: new Date('2026-03-10T00:00:00Z') })).toEqual({ week: 11, calendarYear: 2026 });
    expect(eventWeek({ week: null, start: null })).toBeNull();
  });

  it('labels and keys season and calendar weeks apart', () => {
    expect(weekLabel({ week: 3 })).toBe('Week 3');
    expect(weekLabel({ week: 46, calendarYear: 2026 })).toBe('Calendar week 46');
    expect(weekDedupeKey({ week: 3 })).toBe('week:3');
    expect(weekDedupeKey({ week: 46, calendarYear: 2026 })).toBe('cweek:2026-W46');
    expect(sameWeek({ week: 11 }, { week: 11, calendarYear: 2026 })).toBe(false);
    expect(sameWeek({ week: 11, calendarYear: 2026 }, { week: 11, calendarYear: 2026 })).toBe(true);
  });

  it('never merges a season week with the calendar week of the same number; season weeks sort first', () => {
    const weeks = summariseWeeks([ev(11, 5), ev(null, 5), ev(2, 10)], NOW); // NOW is in ISO week 11
    expect(weeks.map((w) => weekDedupeKey(w))).toEqual(['week:2', 'week:11', 'cweek:2026-W11']);
  });

  it('summarises live events per week; planned ones never count', () => {
    const weeks = summariseWeeks([
      ev(1, -48, 'complete'), ev(1, -24, 'cancelled'), ev(2, 10), ev(2, -1, 'battle'), ev(2, null), ev(3, 5, null, false), ev(null, null),
    ], NOW);
    expect(weeks.map((w) => w.week)).toEqual([1, 2]);
    expect(weeks[0]).toMatchObject({ total: 2, unplayed: 0, completed: 1, upcoming: 0 });
    expect(weeks[1]).toMatchObject({ total: 3, unplayed: 3, completed: 0, upcoming: 2 });
    expect(weeks[1].first_start).toEqual(at(-1));
  });
});

describe('dueSeriesPosts: weekly schedule', () => {
  it('is due once now reaches (first start - lead), default 48 h', () => {
    expect(DEFAULT_SCHEDULE_LEAD_HOURS).toBe(48);
    expect(dueSeriesPosts([ev(1, 49)], null, NOW)).toEqual([]);
    expect(dueSeriesPosts([ev(1, 48)], null, NOW)).toEqual([{ kind: 'weekly_schedule', week: 1, dedupeKey: 'week:1' }]);
    expect(dueSeriesPosts([ev(1, 6)], null, NOW)).toHaveLength(1);
  });

  it('honours schedule_lead_hours and the first start of the week (not the later ones)', () => {
    const events = [ev(2, 100), ev(2, 30)];
    expect(dueSeriesPosts(events, { schedule_lead_hours: 24 }, NOW)).toEqual([]);
    expect(dueSeriesPosts(events, { schedule_lead_hours: 30 }, NOW)).toHaveLength(1);
    expect(dueSeriesPosts(events, { schedule_lead_hours: 0 }, NOW)).toEqual([]);
  });

  it('needs an unplayed event that has not started: finished or long-past weeks are not announced late', () => {
    expect(dueSeriesPosts([ev(1, 5, 'complete')], { standings_posts: false }, NOW)).toEqual([]);
    expect(dueSeriesPosts([ev(1, -200, 'created'), ev(1, -190, 'battle')], { standings_posts: false }, NOW)).toEqual([]);
    expect(dueSeriesPosts([ev(1, -2, 'complete'), ev(1, 3, 'created')], { standings_posts: false }, NOW)).toHaveLength(1);
  });

  it('posts for several due weeks, ignores planned events and events without a start', () => {
    const events = [ev(1, 10), ev(2, 20), ev(3, 200), ev(4, 1, null, false), ev(5, null)];
    const due = dueSeriesPosts(events, { standings_posts: false }, NOW);
    expect(due.map((d) => d.dedupeKey)).toEqual(['week:1', 'week:2']);
  });

  it('is switched off by weekly_schedule = false', () => {
    expect(dueSeriesPosts([ev(1, 5)], { weekly_schedule: false }, NOW)).toEqual([]);
    expect(dueSeriesPosts([ev(1, 5)], { weekly_schedule: true }, NOW)).toHaveLength(1);
  });

  it('groups events without a week by the ISO calendar week of their start, with a calendar-week dedupe key', () => {
    const due = dueSeriesPosts([ev(null, 5)], null, NOW);
    expect(due).toEqual([{ kind: 'weekly_schedule', week: 11, calendarYear: 2026, dedupeKey: 'cweek:2026-W11' }]);
  });
});

describe('dueSeriesPosts: standings', () => {
  it('is due when every live event of a week is complete or cancelled', () => {
    expect(dueSeriesPosts([ev(1, -10, 'complete'), ev(1, -5, 'battle')], null, NOW)).toEqual([]);
    expect(dueSeriesPosts([ev(1, -10, 'complete'), ev(1, -5, 'cancelled')], null, NOW)).toEqual([{ kind: 'standings', week: 1, dedupeKey: 'week:1' }]);
  });

  it('needs at least one completed event (a week of only cancelled events posts nothing)', () => {
    expect(dueSeriesPosts([ev(1, -10, 'cancelled')], null, NOW)).toEqual([]);
  });

  it('only posts the most recent finished week, and not while a later week is unfinished', () => {
    const events = [ev(1, -300, 'complete'), ev(2, -200, 'complete'), ev(3, 100, 'created')];
    expect(dueSeriesPosts(events, null, NOW)).toEqual([{ kind: 'standings', week: 2, dedupeKey: 'week:2' }]);
    expect(dueSeriesPosts([events[0], events[1], ev(3, 100, 'complete')], null, NOW).map((d) => d.dedupeKey)).toEqual(['week:3']);
  });

  it('is switched off by standings_posts = false', () => {
    expect(dueSeriesPosts([ev(1, -10, 'complete')], { standings_posts: false }, NOW)).toEqual([]);
  });

  it('posts a partial table while an earlier week has a postponed match, then the full one once it is played', () => {
    const events = [ev(1, -300, 'complete'), ev(2, -200, 'complete'), ev(2, 30, 'created'), ev(3, -100, 'complete')];
    expect(dueSeriesPosts(events, { weekly_schedule: false }, NOW)).toEqual([
      { kind: 'standings', week: 3, dedupeKey: 'week:3:partial', pendingWeeks: ['Week 2'] },
    ]);
    events[2] = ev(2, 30, 'complete');
    expect(dueSeriesPosts(events, { weekly_schedule: false }, NOW)).toEqual([{ kind: 'standings', week: 3, dedupeKey: 'week:3' }]);
  });

  it('can be due together with the next weekly schedule', () => {
    const due = dueSeriesPosts([ev(1, -100, 'complete'), ev(2, 10, 'created')], null, NOW);
    expect(due.map((d) => `${d.kind}:${d.dedupeKey}`).sort()).toEqual(['standings:week:1', 'weekly_schedule:week:2']);
  });
});

describe('enqueueDueSeriesUpdates', () => {
  let gameId: string;
  let modeId: string;
  beforeEach(async () => {
    const seed = await seedBasicTestData();
    gameId = seed.game.id;
    modeId = seed.mode.id;
  });

  async function addMatch(seriesId: string, week: number | null, startHours: number, status = 'gather', extra: Record<string, unknown> = {}) {
    const m = await createMatch(gameId, modeId, { start_date: at(startHours), start_time: at(startHours), status: status as never });
    return linkEvent(seriesId, 'match', m.id, { week, ...extra });
  }
  const queue = () => pg().select().from(discordSeriesUpdateQueue).orderBy(asc(discordSeriesUpdateQueue.kind), asc(discordSeriesUpdateQueue.dedupe_key));

  it('queues the weekly schedule with the week in the payload', async () => {
    const s = await insertSeries({ status: 'active', announcements: true });
    await addMatch(s.id, 1, 24);
    const result = await enqueueDueSeriesUpdates(pg(), NOW);
    expect(result).toEqual({ series_checked: 1, enqueued: 1 });
    expect(await queue()).toMatchObject([{ series_id: s.id, kind: 'weekly_schedule', dedupe_key: 'week:1', payload: { week: 1 }, status: 'pending' }]);
  });

  it('is idempotent: running again queues nothing, even after the first post completed', async () => {
    const s = await insertSeries({ status: 'active' });
    await addMatch(s.id, 1, 24);
    await enqueueDueSeriesUpdates(pg(), NOW);
    await pg().update(discordSeriesUpdateQueue).set({ status: 'completed' });
    expect(await enqueueDueSeriesUpdates(pg(), at(1))).toMatchObject({ enqueued: 0 });
    expect(await queue()).toHaveLength(1);
  });

  it('queues standings once a week is fully played, with its own dedupe key per week', async () => {
    const s = await insertSeries({ status: 'active' });
    await addMatch(s.id, 1, -30, 'complete');
    await addMatch(s.id, 1, -28, 'cancelled');
    await addMatch(s.id, 2, 100, 'gather');
    await enqueueDueSeriesUpdates(pg(), NOW);
    expect((await queue()).map((r) => `${r.kind}/${r.dedupe_key}`)).toEqual(['standings/week:1']);

    // week 2 gets played later: a second standings post, week 1's stays deduped
    await addMatch(s.id, 2, 101, 'complete');
    await pg().update(matches).set({ status: 'complete' });
    await enqueueDueSeriesUpdates(pg(), at(200));
    expect((await queue()).map((r) => `${r.kind}/${r.dedupe_key}`)).toEqual(['standings/week:1', 'standings/week:2']);
  });

  it('skips series that are not active, have announcements off, or switch the kind off', async () => {
    const created = await insertSeries({ status: 'created' });
    const registration = await insertSeries({ status: 'registration' });
    const silent = await insertSeries({ status: 'active', announcements: false });
    const noSchedule = await insertSeries({ status: 'active', discord_config: { weekly_schedule: false, standings_posts: false } });
    for (const s of [created, registration, silent, noSchedule]) {
      await addMatch(s.id, 1, 5);
      await addMatch(s.id, 0, -50, 'complete');
    }
    const result = await enqueueDueSeriesUpdates(pg(), NOW);
    expect(result.series_checked).toBe(1); // only noSchedule is active with announcements on
    expect(await queue()).toEqual([]);
  });

  it('uses the ISO week of the start for events without a week, and ignores planned playoff placeholders', async () => {
    const s = await insertSeries({ status: 'active' });
    await addMatch(s.id, null, 10);
    const stage = await insertStage(s.id);
    await linkEvent(s.id, 'match', 'ignored', {
      status: 'planned', match_id: null, tournament_id: null, stage_id: stage.id, role: 'season_playoff',
      seeding_rule: { source: 'season', top: 4, format: 'single-elimination', template: { name: 'Finals' } },
    });
    await enqueueDueSeriesUpdates(pg(), NOW);
    expect(await queue()).toMatchObject([{
      kind: 'weekly_schedule', dedupe_key: `cweek:2026-W${isoWeekNumber(at(10))}`, payload: { week: isoWeekNumber(at(10)), calendar_year: 2026 },
    }]);
  });

  it('queues a partial standings post with the pending weeks, then the full one once the postponed match is played', async () => {
    const s = await insertSeries({ status: 'active', discord_config: { weekly_schedule: false } });
    await addMatch(s.id, 1, -300, 'complete');
    const postponed = await createMatch(gameId, modeId, { start_date: at(50), start_time: at(50), status: 'gather' as never });
    await linkEvent(s.id, 'match', postponed.id, { week: 2 });
    await addMatch(s.id, 3, -100, 'complete');
    await enqueueDueSeriesUpdates(pg(), NOW);
    expect(await queue()).toMatchObject([{ kind: 'standings', dedupe_key: 'week:3:partial', payload: { week: 3, pending_weeks: ['Week 2'] } }]);

    await pg().update(matches).set({ status: 'complete' });
    await enqueueDueSeriesUpdates(pg(), at(60));
    expect((await queue()).map((r) => r.dedupe_key)).toEqual(['week:3', 'week:3:partial']);
  });

  it('handles several active series in one run', async () => {
    const a = await insertSeries({ status: 'active' });
    const b = await insertSeries({ status: 'active' });
    await addMatch(a.id, 1, 5);
    await addMatch(b.id, 1, 6);
    const result = await enqueueDueSeriesUpdates(pg(), NOW);
    expect(result).toEqual({ series_checked: 2, enqueued: 2 });
    expect((await queue()).map((r) => r.series_id).sort()).toEqual([a.id, b.id].sort());
  });
});
