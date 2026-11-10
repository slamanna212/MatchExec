/**
 * Which series posts are due: the weekly schedule and the standings after a finished week. The decision itself
 * (`dueSeriesPosts`) is pure so it can be unit-tested; `enqueueDueSeriesUpdates` reads the active series and queues the
 * posts (`discord_series_update_queue`, deduped per `week:<n>`), and is what the scheduler job calls.
 */
import { and, eq } from 'drizzle-orm';
import type { Executor } from '../../../lib/db';
import { series } from '../../../lib/db/schema';
import type { SeriesDiscordConfig, SeriesUpdateKind, SeriesUpdatePayload } from '../../../shared/series-types';
import { logger } from '../logger';
import { enqueueSeriesUpdate } from '../queues/enqueue';
import { isEventFinished, listSeriesEventDetails } from './summary';

export const DEFAULT_SCHEDULE_LEAD_HOURS = 48;

/** The part of a series event the due-post decision needs. */
export interface DueCheckEvent {
  week: number | null;
  /** Start of the match / tournament (null when unscheduled). */
  start: Date | null;
  /** `live` events only: planned playoff placeholders have no schedule yet. */
  live: boolean;
  /** Status of the linked match / tournament (`complete`, `cancelled`, ...); null when the target is gone. */
  target_status: string | null;
}

/**
 * The week an event is grouped under: a season week (the event's own `week`) or, for an event without one, the ISO
 * calendar week of its start. The two never mix: season week 3 and calendar week 3 are different weeks.
 */
export interface WeekRef {
  week: number;
  /** ISO week-numbering year of a calendar week; undefined for a season week. */
  calendarYear?: number;
}

export interface DueSeriesPost {
  kind: Extract<SeriesUpdateKind, 'weekly_schedule' | 'standings'>;
  week: number;
  /** Set for a calendar week (event without a season week). */
  calendarYear?: number;
  dedupeKey: string;
  /** Standings only: earlier weeks that still have unplayed events (labels such as "Week 2"). */
  pendingWeeks?: string[];
}

export interface WeekSummary extends WeekRef {
  first_start: Date | null;
  total: number;
  /** Events whose target is not complete / cancelled yet. */
  unplayed: number;
  /** Events that finished as `complete` (not cancelled). */
  completed: number;
  /** Unplayed events that start later than `now` or have no start. */
  upcoming: number;
}

/** ISO 8601 week (1-53) of a date in UTC, with its ISO week-numbering year (which can differ from the calendar year around New Year). */
export function isoWeek(date: Date): { year: number; week: number } {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  return { year: d.getUTCFullYear(), week: Math.ceil(((d.getTime() - yearStart) / 86_400_000 + 1) / 7) };
}

/** ISO 8601 week number (1-53) of a date, in UTC. */
export function isoWeekNumber(date: Date): number {
  return isoWeek(date).week;
}

/** The week an event belongs to: its season `week`, else the ISO calendar week of its start date, else null (never grouped). */
export function eventWeek(event: Pick<DueCheckEvent, 'week' | 'start'>): WeekRef | null {
  if (event.week !== null && event.week !== undefined) return { week: event.week };
  if (!event.start) return null;
  const { year, week } = isoWeek(event.start);
  return { week, calendarYear: year };
}

export const sameWeek = (a: WeekRef | null, b: WeekRef | null): boolean =>
  !!a && !!b && a.week === b.week && a.calendarYear === b.calendarYear;

/** "Week 3" for a season week, "Calendar week 46" for an event grouped by the date it starts. */
export function weekLabel(ref: WeekRef): string {
  return ref.calendarYear === undefined ? `Week ${ref.week}` : `Calendar week ${ref.week}`;
}

/** Dedupe key of a week's posts: `week:3` for season weeks, `cweek:2026-W46` for calendar weeks (they recur every year). */
export function weekDedupeKey(ref: WeekRef | number): string {
  const r = typeof ref === 'number' ? { week: ref } : ref;
  return r.calendarYear === undefined ? `week:${r.week}` : `cweek:${r.calendarYear}-W${r.week}`;
}

/** Season weeks by number, then calendar weeks by (year, week). */
function compareWeeks(a: WeekRef, b: WeekRef): number {
  const ac = a.calendarYear === undefined ? 0 : 1;
  const bc = b.calendarYear === undefined ? 0 : 1;
  return ac - bc || (a.calendarYear ?? 0) - (b.calendarYear ?? 0) || a.week - b.week;
}

/** Per-week counts of the live events, ordered by week (season weeks first, then calendar weeks). */
export function summariseWeeks(events: DueCheckEvent[], now: Date): WeekSummary[] {
  const weeks = new Map<string, WeekSummary>();
  for (const e of events) {
    if (!e.live) continue;
    const ref = eventWeek(e);
    if (ref === null) continue;
    const key = weekDedupeKey(ref);
    const w = weeks.get(key) ?? { ...ref, first_start: null, total: 0, unplayed: 0, completed: 0, upcoming: 0 };
    w.total++;
    if (e.start && (!w.first_start || e.start < w.first_start)) w.first_start = e.start;
    if (isEventFinished(e.target_status)) {
      if (e.target_status === 'complete') w.completed++;
    } else {
      w.unplayed++;
      if (!e.start || e.start > now) w.upcoming++;
    }
    weeks.set(key, w);
  }
  return [...weeks.values()].sort(compareWeeks);
}

const refOf = (w: WeekRef): WeekRef => (w.calendarYear === undefined ? { week: w.week } : { week: w.week, calendarYear: w.calendarYear });

/**
 * The posts due for one series right now.
 * - weekly schedule (`schedule_lead_hours` before the first start of a week, default 48 h): while the week still has
 *   an unplayed event that has not started (or has no start). Weeks that are long over are not announced late.
 * - standings: for the most recent week whose live events are all complete / cancelled (at least one complete). Older
 *   finished weeks are skipped (standings are cumulative, so one post per tick is enough and a freshly activated
 *   series does not flood the channel with back-dated tables). When an earlier week still has unplayed events (a
 *   postponed match), the post is a partial one (`week:3:partial`, listing the pending weeks); once those are played
 *   the full `week:3` post follows with the corrected table.
 * `discord_config.weekly_schedule` / `standings_posts` (default on) switch each kind off.
 */
export function dueSeriesPosts(events: DueCheckEvent[], config: SeriesDiscordConfig | null | undefined, now: Date): DueSeriesPost[] {
  const weeks = summariseWeeks(events, now);
  const due: DueSeriesPost[] = [];

  if (config?.weekly_schedule !== false) {
    const lead = (config?.schedule_lead_hours ?? DEFAULT_SCHEDULE_LEAD_HOURS) * 3_600_000;
    for (const w of weeks) {
      if (!w.first_start || w.upcoming === 0) continue;
      if (now.getTime() >= w.first_start.getTime() - lead) due.push({ kind: 'weekly_schedule', ...refOf(w), dedupeKey: weekDedupeKey(w) });
    }
  }

  if (config?.standings_posts !== false) {
    const isFinished = (w: WeekSummary) => w.total > 0 && w.unplayed === 0 && w.completed > 0;
    const latestIndex = weeks.findLastIndex(isFinished);
    if (latestIndex >= 0) {
      const latest = weeks[latestIndex];
      const pending = weeks.slice(0, latestIndex).filter((w) => w.unplayed > 0).map(weekLabel);
      due.push({
        kind: 'standings', ...refOf(latest),
        dedupeKey: pending.length > 0 ? `${weekDedupeKey(latest)}:partial` : weekDedupeKey(latest),
        ...(pending.length > 0 ? { pendingWeeks: pending } : {}),
      });
    }
  }
  return due;
}

export interface EnqueueDueResult {
  series_checked: number;
  enqueued: number;
}

/**
 * Queues every due post of every `active` series with `announcements = true`. Safe to run repeatedly: the unique
 * (series, kind, dedupe key) makes a second enqueue a no-op. One series failing does not stop the others.
 */
export async function enqueueDueSeriesUpdates(ex: Executor, now: Date = new Date()): Promise<EnqueueDueResult> {
  const rows = await ex.select({ id: series.id, discord_config: series.discord_config }).from(series)
    .where(and(eq(series.status, 'active'), eq(series.announcements, true)));
  let enqueued = 0;
  for (const row of rows) {
    try {
      const details = await listSeriesEventDetails(ex, row.id);
      const events: DueCheckEvent[] = details.map((d) => ({
        week: d.week, start: d.start_date, live: d.status === 'live', target_status: d.target_status,
      }));
      for (const post of dueSeriesPosts(events, row.discord_config, now)) {
        const payload: SeriesUpdatePayload = {
          week: post.week,
          ...(post.calendarYear !== undefined ? { calendar_year: post.calendarYear } : {}),
          ...(post.pendingWeeks ? { pending_weeks: post.pendingWeeks } : {}),
        };
        const id = await enqueueSeriesUpdate(ex, { seriesId: row.id, kind: post.kind, dedupeKey: post.dedupeKey, payload });
        if (id) enqueued++;
      }
    } catch (error) {
      logger.error(`Series ${row.id}: failed to queue series updates:`, error);
    }
  }
  return { series_checked: rows.length, enqueued };
}
