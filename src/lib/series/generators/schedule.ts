/**
 * Pure scheduling helpers for the series generators: wall-clock + IANA timezone -> UTC (Intl only, DST-safe), Monday-based
 * week numbers and the greedy slot scheduler. No I/O.
 */

/** A generator config that cannot be satisfied (the service layer turns it into a 400). */
export class GeneratorConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GeneratorConfigError';
  }
}

export interface ScheduleConfig {
  /** YYYY-MM-DD, first possible match day. */
  start_date: string;
  /** 0 = Sunday .. 6 = Saturday. */
  match_days: number[];
  /** 'HH:MM' wall-clock times in `timezone`. */
  time_slots: string[];
  timezone?: string;
  /** Matches that can run in the same time slot (default 1). */
  concurrent_matches?: number;
  /** Max matches per entrant per (Monday-based) week (default 1). */
  max_per_entrant_per_week?: number;
  /** YYYY-MM-DD dates without matches. */
  skip_dates?: string[];
}

export interface ScheduleItem {
  entrant_ids: readonly string[];
}

export interface ScheduledItem<T> {
  item: T;
  /** 1-based week number: the Monday-based week of the first match day is week 1. */
  week: number;
  start: Date;
}

export interface ScheduleOptions {
  /** Do not use slots that start before this instant (regenerating: "from the next slot"). */
  notBefore?: Date;
  /** A date in week 1 (default: the first match day). Regenerated fixtures keep the original season's week numbers. */
  weekOrigin?: string;
  /** Fixtures already on the calendar: they take slot capacity and count towards the per-week limit. */
  occupied?: ReadonlyArray<{ entrant_ids: readonly string[]; start: Date }>;
  /** Give up after this many calendar days (default 1100). */
  maxDays?: number;
}

const DAY_MS = 86_400_000;
const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;
const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

// ─── timezones ───────────────────────────────────────────────────────────────

export function defaultTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat('en-US', {
        timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
      });
    } catch {
      throw new GeneratorConfigError(`Unknown timezone "${timeZone}" (use an IANA name such as Europe/Berlin)`);
    }
    formatters.set(timeZone, f);
  }
  return f;
}

/** The calendar date (YYYY-MM-DD) an instant falls on in `timeZone`. */
export function localYmd(at: Date, timeZone: string): string {
  return new Date(at.getTime() + zoneOffsetMs(at.getTime(), timeZone)).toISOString().slice(0, 10);
}

/** Throws a GeneratorConfigError for an unknown IANA timezone. */
export function assertTimezone(timeZone: string): void {
  formatterFor(timeZone);
}

/** Offset (ms) of `timeZone` from UTC at the instant `utcMs`: local wall-clock minus UTC. */
function zoneOffsetMs(utcMs: number, timeZone: string): number {
  const second = Math.floor(utcMs / 1000) * 1000;
  const parts: Record<string, number> = {};
  for (const p of formatterFor(timeZone).formatToParts(new Date(second))) {
    if (p.type !== 'literal') parts[p.type] = Number(p.value);
  }
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour % 24, parts.minute, parts.second) - second;
}

/**
 * Wall-clock date + time in `timeZone` -> the UTC instant. DST-safe: the offset is the one in force at the resulting
 * instant (a time inside a spring-forward gap lands just after the gap; an ambiguous autumn time takes the first one).
 */
export function zonedTimeToUtc(ymd: string, hhmm: string, timeZone: string): Date {
  const date = YMD.exec(ymd);
  const time = HHMM.exec(hhmm);
  if (!date || !time) throw new GeneratorConfigError(`Invalid date/time "${ymd} ${hhmm}"`);
  const guess = Date.UTC(Number(date[1]), Number(date[2]) - 1, Number(date[3]), Number(time[1]), Number(time[2]));
  const first = zoneOffsetMs(guess, timeZone);
  let utc = guess - first;
  const second = zoneOffsetMs(utc, timeZone);
  if (second !== first) utc = guess - second;
  return new Date(utc);
}

// ─── calendar days (epoch-day numbers, in the config's local calendar) ────────

/** YYYY-MM-DD -> days since 1970-01-01. Throws for a malformed or impossible date. */
export function dayNumber(ymd: string): number {
  const m = YMD.exec(ymd);
  if (!m) throw new GeneratorConfigError(`Invalid date "${ymd}" (expected YYYY-MM-DD)`);
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const back = new Date(ms).toISOString().slice(0, 10);
  if (back !== ymd) throw new GeneratorConfigError(`Invalid date "${ymd}"`);
  return Math.round(ms / DAY_MS);
}

export function ymdOf(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

/** 0 = Sunday .. 6 = Saturday. */
export function weekdayOf(day: number): number {
  return (((day + 4) % 7) + 7) % 7; // 1970-01-01 was a Thursday
}

export function mondayOf(day: number): number {
  return day - ((weekdayOf(day) + 6) % 7);
}

/** The first date on or after `startDate` that is a match day and not skipped. */
export function firstMatchDay(cfg: Pick<ScheduleConfig, 'start_date' | 'match_days' | 'skip_dates'>, maxDays = 1100): string {
  const skip = new Set(cfg.skip_dates ?? []);
  const days = new Set(cfg.match_days);
  const start = dayNumber(cfg.start_date);
  for (let d = start; d < start + maxDays; d++) {
    if (days.has(weekdayOf(d)) && !skip.has(ymdOf(d))) return ymdOf(d);
  }
  throw new GeneratorConfigError('No match day found: check match_days and skip_dates');
}

/** Validates the scheduling part of a generator config; throws a GeneratorConfigError. */
export function assertScheduleConfig(cfg: ScheduleConfig): void {
  dayNumber(cfg.start_date);
  if (!Array.isArray(cfg.match_days) || cfg.match_days.length === 0 || !cfg.match_days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) {
    throw new GeneratorConfigError('match_days must list weekdays 0 (Sunday) to 6 (Saturday)');
  }
  if (!Array.isArray(cfg.time_slots) || cfg.time_slots.length === 0 || !cfg.time_slots.every((t) => typeof t === 'string' && HHMM.test(t))) {
    throw new GeneratorConfigError('time_slots must list times as HH:MM');
  }
  for (const [field, v] of [['concurrent_matches', cfg.concurrent_matches], ['max_per_entrant_per_week', cfg.max_per_entrant_per_week]] as const) {
    if (v !== undefined && (!Number.isInteger(v) || v < 1 || v > 100)) throw new GeneratorConfigError(`${field} must be an integer from 1 to 100`);
  }
  for (const d of cfg.skip_dates ?? []) dayNumber(d);
  if (cfg.timezone) assertTimezone(cfg.timezone);
}

// ─── the slot scheduler ──────────────────────────────────────────────────────

/**
 * Greedy slot scheduler. Walks the calendar from `start_date`; on every match day (not skipped) it visits the time slots
 * in order and fills each with up to `concurrent_matches` items, taking the earliest pending item whose entrants are free
 * in that slot and under `max_per_entrant_per_week` for the week. Input order is kept as far as the constraints allow
 * (round order for a round robin). Throws a GeneratorConfigError when the items do not fit in `maxDays`.
 */
export function scheduleItems<T extends ScheduleItem>(items: readonly T[], cfg: ScheduleConfig, opts: ScheduleOptions = {}): Array<ScheduledItem<T>> {
  assertScheduleConfig(cfg);
  if (items.length === 0) return [];
  const timeZone = cfg.timezone ?? defaultTimezone();
  const slots = [...new Set(cfg.time_slots)].sort();
  const matchDays = new Set(cfg.match_days);
  const skip = new Set(cfg.skip_dates ?? []);
  const concurrent = cfg.concurrent_matches ?? 1;
  const perWeekLimit = cfg.max_per_entrant_per_week ?? 1;
  const maxDays = opts.maxDays ?? 1100;

  const startDay = dayNumber(cfg.start_date);
  const originMonday = mondayOf(opts.weekOrigin ? dayNumber(opts.weekOrigin) : dayNumber(firstMatchDay(cfg, maxDays)));
  const weekOf = (day: number): number => Math.max(1, Math.floor((mondayOf(day) - originMonday) / 7) + 1);

  const weekCounts = new Map<number, Map<string, number>>();
  const slotEntrants = new Map<number, Set<string>>();
  const slotCounts = new Map<number, number>();
  const take = (week: number, startMs: number, entrantIds: readonly string[]): void => {
    const perEntrant = weekCounts.get(week) ?? new Map<string, number>();
    weekCounts.set(week, perEntrant);
    const busy = slotEntrants.get(startMs) ?? new Set<string>();
    slotEntrants.set(startMs, busy);
    for (const id of entrantIds) {
      perEntrant.set(id, (perEntrant.get(id) ?? 0) + 1);
      busy.add(id);
    }
    slotCounts.set(startMs, (slotCounts.get(startMs) ?? 0) + 1);
  };
  for (const o of opts.occupied ?? []) {
    take(weekOf(dayNumber(localYmd(o.start, timeZone))), o.start.getTime(), o.entrant_ids);
  }

  const pending = [...items];
  const out: Array<ScheduledItem<T>> = [];
  for (let day = startDay; pending.length > 0 && day < startDay + maxDays; day++) {
    if (!matchDays.has(weekdayOf(day)) || skip.has(ymdOf(day))) continue;
    const week = weekOf(day);
    for (const slot of slots) {
      const start = zonedTimeToUtc(ymdOf(day), slot, timeZone);
      if (opts.notBefore && start.getTime() < opts.notBefore.getTime()) continue;
      const startMs = start.getTime();
      for (let i = 0; i < pending.length && (slotCounts.get(startMs) ?? 0) < concurrent;) {
        const ids = pending[i].entrant_ids;
        const busy = slotEntrants.get(startMs);
        const counts = weekCounts.get(week);
        const free = ids.every((id) => !busy?.has(id) && (counts?.get(id) ?? 0) < perWeekLimit);
        if (!free) {
          i++;
          continue;
        }
        take(week, startMs, ids);
        out.push({ item: pending[i], week, start });
        pending.splice(i, 1);
      }
    }
  }
  if (pending.length > 0) {
    throw new GeneratorConfigError(`Could not place ${pending.length} fixture(s) within ${maxDays} days: add match days or time slots, or raise the per-entrant weekly limit`);
  }
  return out;
}

/** Per week that has fixtures, the entrants without one (a round robin's byes). */
export function weeklyByes(fixtures: ReadonlyArray<{ week: number; entrant_ids: readonly string[] }>, allEntrantIds: readonly string[]): Array<{ week: number; entrant_ids: string[] }> {
  const playing = new Map<number, Set<string>>();
  for (const f of fixtures) {
    const set = playing.get(f.week) ?? new Set<string>();
    playing.set(f.week, set);
    for (const id of f.entrant_ids) set.add(id);
  }
  return [...playing.entries()].sort((a, b) => a[0] - b[0])
    .map(([week, set]) => ({ week, entrant_ids: allEntrantIds.filter((id) => !set.has(id)) }))
    .filter((w) => w.entrant_ids.length > 0);
}

/** Fill `{name}` placeholders; unknown placeholders are left as written. */
export function renderTemplate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => (key in vars ? String(vars[key]) : whole));
}
