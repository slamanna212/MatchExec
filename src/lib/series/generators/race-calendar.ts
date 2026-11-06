/** Pure race-calendar fixtures: `count` events, every `interval_days`, at a fixed local time. */
import type { GeneratedFixture, RaceCalendarConfig } from '../../../../shared/series-types';
import {
  GeneratorConfigError, assertTimezone, dayNumber, defaultTimezone, renderTemplate, ymdOf, zonedTimeToUtc,
} from './schedule';

export const MAX_RACE_EVENTS = 200;

export function assertRaceCalendarConfig(cfg: Pick<RaceCalendarConfig, 'count' | 'interval_days' | 'start_date' | 'time' | 'timezone'>): void {
  if (!Number.isInteger(cfg.count) || cfg.count < 1 || cfg.count > MAX_RACE_EVENTS) throw new GeneratorConfigError(`count must be an integer from 1 to ${MAX_RACE_EVENTS}`);
  if (!Number.isInteger(cfg.interval_days) || cfg.interval_days < 1 || cfg.interval_days > 366) throw new GeneratorConfigError('interval_days must be an integer from 1 to 366');
  dayNumber(cfg.start_date);
  zonedTimeToUtc(cfg.start_date, cfg.time, cfg.timezone ?? defaultTimezone()); // validates the time
  if (cfg.timezone) assertTimezone(cfg.timezone);
}

/**
 * The calendar: event i (0-based) is on `start_date + i * interval_days` at `time` (wall-clock in the timezone), week i + 1,
 * with every selected entrant taking part.
 */
export function planRaceCalendar(
  cfg: Pick<RaceCalendarConfig, 'count' | 'interval_days' | 'start_date' | 'time' | 'timezone' | 'name_template'>,
  entrantIds: readonly string[],
): GeneratedFixture[] {
  assertRaceCalendarConfig(cfg);
  const timeZone = cfg.timezone ?? defaultTimezone();
  const template = cfg.name_template?.trim() || 'Round {n}';
  const first = dayNumber(cfg.start_date);
  return Array.from({ length: cfg.count }, (_, i) => ({
    week: i + 1,
    start: zonedTimeToUtc(ymdOf(first + i * cfg.interval_days), cfg.time, timeZone).toISOString(),
    name: renderTemplate(template, { n: i + 1 }),
    entrant_ids: [...entrantIds],
  }));
}
