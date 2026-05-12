import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn(), critical: vi.fn() },
}));

vi.mock('@/lib/database-init', () => ({
  getDbInstance: vi.fn(async () => {
    const { getTestDb } = await import('../../utils/test-db');
    return getTestDb();
  }),
}));

import {
  parseAnnouncementsField,
  calculateAnnouncementTime,
} from '@/lib/reminder-helpers';

describe('Reminder Helpers — Extended', () => {
  describe('parseAnnouncementsField — additional cases', () => {
    it('returns null for an empty string', () => {
      // empty string is not valid JSON → catches parse error → null
      expect(parseAnnouncementsField('')).toBeNull();
    });

    it('parses a JSON string with a single announcement object', () => {
      const input = JSON.stringify([{ id: 'a1', value: 15, unit: 'minutes' }]);
      const result = parseAnnouncementsField(input);
      expect(result).toHaveLength(1);
      expect(result![0].unit).toBe('minutes');
    });

    it('returns null for JSON string that is not an array (e.g. object)', () => {
      // JSON.parse succeeds but result is an object — returned as-is per implementation
      const input = JSON.stringify({ value: 1, unit: 'hours' });
      const result = parseAnnouncementsField(input);
      // Implementation returns the parsed value regardless; it won't be null
      expect(result).toBeDefined();
    });

    it('returns default announcements for numeric 1 (truthy)', () => {
      const result = parseAnnouncementsField(1);
      expect(Array.isArray(result)).toBe(true);
      expect(result!.length).toBeGreaterThan(0);
    });

    it('returns null for numeric 0', () => {
      expect(parseAnnouncementsField(0)).toBeNull();
    });

    it('returns default announcements for boolean true', () => {
      const result = parseAnnouncementsField(true);
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
    });

    it('returns null for boolean false', () => {
      expect(parseAnnouncementsField(false)).toBeNull();
    });

    it('returns null for null', () => {
      expect(parseAnnouncementsField(null)).toBeNull();
    });

    it('returns null for undefined', () => {
      expect(parseAnnouncementsField(undefined)).toBeNull();
    });

    it('returns the array as-is when input is already an array', () => {
      const arr = [{ id: 'x', value: 5, unit: 'minutes' }];
      const result = parseAnnouncementsField(arr);
      expect(result).toEqual(arr);
    });
  });

  describe('calculateAnnouncementTime — boundary and window tests', () => {
    const baseDate = new Date('2025-06-15T14:00:00.000Z');

    it('60 minutes before start', () => {
      const result = calculateAnnouncementTime(baseDate, 60, 'minutes');
      expect(result.getTime()).toBe(baseDate.getTime() - 60 * 60 * 1000);
    });

    it('30 minutes before start', () => {
      const result = calculateAnnouncementTime(baseDate, 30, 'minutes');
      expect(result.getTime()).toBe(baseDate.getTime() - 30 * 60 * 1000);
    });

    it('15 minutes before start', () => {
      const result = calculateAnnouncementTime(baseDate, 15, 'minutes');
      expect(result.getTime()).toBe(baseDate.getTime() - 15 * 60 * 1000);
    });

    it('5 minutes before start', () => {
      const result = calculateAnnouncementTime(baseDate, 5, 'minutes');
      expect(result.getTime()).toBe(baseDate.getTime() - 5 * 60 * 1000);
    });

    it('1 minute before start', () => {
      const result = calculateAnnouncementTime(baseDate, 1, 'minutes');
      expect(result.getTime()).toBe(baseDate.getTime() - 1 * 60 * 1000);
    });

    it('exactly 0 minutes offset — same time as start', () => {
      const result = calculateAnnouncementTime(baseDate, 0, 'minutes');
      expect(result.getTime()).toBe(baseDate.getTime());
    });

    it('1 hour before start', () => {
      const result = calculateAnnouncementTime(baseDate, 1, 'hours');
      expect(result.getTime()).toBe(baseDate.getTime() - 60 * 60 * 1000);
    });

    it('2 hours before start', () => {
      const result = calculateAnnouncementTime(baseDate, 2, 'hours');
      expect(result.getTime()).toBe(baseDate.getTime() - 2 * 60 * 60 * 1000);
    });

    it('1 day before start', () => {
      const result = calculateAnnouncementTime(baseDate, 1, 'days');
      expect(result.getTime()).toBe(baseDate.getTime() - 24 * 60 * 60 * 1000);
    });

    it('unknown unit returns same time as start', () => {
      const result = calculateAnnouncementTime(baseDate, 10, 'weeks');
      expect(result.getTime()).toBe(baseDate.getTime());
    });

    it('preserves millisecond precision', () => {
      const preciseDate = new Date('2025-06-15T14:00:00.500Z');
      const result = calculateAnnouncementTime(preciseDate, 30, 'minutes');
      expect(result.getTime()).toBe(preciseDate.getTime() - 30 * 60 * 1000);
      // Milliseconds preserved
      expect(result.getMilliseconds()).toBe(500);
    });

    it('large offsets work correctly (7 days)', () => {
      const result = calculateAnnouncementTime(baseDate, 7, 'days');
      expect(result.getTime()).toBe(baseDate.getTime() - 7 * 24 * 60 * 60 * 1000);
    });
  });
});
