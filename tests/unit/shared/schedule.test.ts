import { describe, it, expect } from 'vitest';
import { UNSCHEDULED_START, UNSCHEDULED_LABEL, isUnscheduled } from '../../../shared/schedule';
import { formatShortDate, formatShortDateTime, formatFullDateTime } from '../../../src/components/series/series-shared';

describe('isUnscheduled', () => {
  it('recognises the placeholder in every form it travels in', () => {
    expect(isUnscheduled(UNSCHEDULED_START)).toBe(true);
    expect(isUnscheduled(UNSCHEDULED_START.toISOString())).toBe(true);
    expect(isUnscheduled(UNSCHEDULED_START.getTime())).toBe(true);
    expect(isUnscheduled('2099-12-31T23:59:59.999Z')).toBe(true);
  });

  it('is false for real dates and for missing / invalid values', () => {
    expect(isUnscheduled('2026-11-20T19:00:00.000Z')).toBe(false);
    expect(isUnscheduled(new Date())).toBe(false);
    expect(isUnscheduled(null)).toBe(false);
    expect(isUnscheduled(undefined)).toBe(false);
    expect(isUnscheduled('')).toBe(false);
    expect(isUnscheduled('not a date')).toBe(false);
  });
});

describe('series date formatters', () => {
  it('show "Unscheduled" for the placeholder instead of the 2099 date', () => {
    const ts = UNSCHEDULED_START.toISOString();
    expect(formatShortDate(ts)).toBe(UNSCHEDULED_LABEL);
    expect(formatShortDateTime(ts)).toBe(UNSCHEDULED_LABEL);
    expect(formatFullDateTime(ts)).toBe(UNSCHEDULED_LABEL);
  });

  it('still format real dates and pass missing ones through as null', () => {
    expect(formatShortDate('2026-11-20T19:00:00.000Z')).toMatch(/2026/);
    expect(formatShortDate(null)).toBeNull();
    expect(formatShortDateTime(undefined)).toBeNull();
  });
});
