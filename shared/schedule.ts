/**
 * "No scheduled time" for matches.
 *
 * `matches.start_date` / `start_time` are NOT NULL, so a tournament match that has no scheduled time yet is stored with
 * this far-future placeholder. It must never be shown to people or used as a real time: use `isUnscheduled` to detect
 * it and show `UNSCHEDULED_LABEL` instead.
 */
export const UNSCHEDULED_START = new Date('2099-12-31T23:59:59.999Z');
export const UNSCHEDULED_LABEL = 'Unscheduled';

/** True for the placeholder (and anything else absurdly far out, e.g. a value that lost a few ms on the way). */
export function isUnscheduled(value: string | number | Date | null | undefined): boolean {
  if (value === null || value === undefined || value === '') return false;
  const time = new Date(value).getTime();
  return !Number.isNaN(time) && new Date(time).getUTCFullYear() >= 2099;
}
