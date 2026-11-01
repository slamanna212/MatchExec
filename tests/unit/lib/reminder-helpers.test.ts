import { describe, it, expect, vi } from 'vitest';
import {
  parseAnnouncementsField,
  calculateAnnouncementTime,
  createScheduledAnnouncement,
} from '@/lib/reminder-helpers';

vi.mock('@/lib/logger/server', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    critical: vi.fn(),
  },
}));

describe('parseAnnouncementsField', () => {
  it('parses a valid JSON string array', () => {
    const input = '[{"id":"1hour","value":1,"unit":"hours"}]';
    const result = parseAnnouncementsField(input);
    expect(result).toEqual([{ id: '1hour', value: 1, unit: 'hours' }]);
  });

  it('returns null for invalid JSON string', () => {
    expect(parseAnnouncementsField('not-json')).toBeNull();
  });

  it('returns default announcements when boolean true', () => {
    const result = parseAnnouncementsField(true);
    expect(result).toHaveLength(2);
    expect(result![0].unit).toBe('hours');
    expect(result![1].unit).toBe('minutes');
  });

  it('returns null when boolean false', () => {
    expect(parseAnnouncementsField(false)).toBeNull();
  });

  it('returns default announcements when numeric truthy (1)', () => {
    const result = parseAnnouncementsField(1);
    expect(result).toHaveLength(2);
  });

  it('returns null for numeric 0 (falsy)', () => {
    expect(parseAnnouncementsField(0)).toBeNull();
  });

  it('returns object array as-is when already an array object', () => {
    const obj = [{ id: 'x', value: 5, unit: 'minutes' }];
    expect(parseAnnouncementsField(obj)).toBe(obj);
  });

  it('returns null for null input', () => {
    expect(parseAnnouncementsField(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(parseAnnouncementsField(undefined)).toBeNull();
  });
});

describe('calculateAnnouncementTime', () => {
  const baseDate = new Date('2025-12-01T15:00:00Z');

  it('subtracts minutes correctly', () => {
    const result = calculateAnnouncementTime(baseDate, 30, 'minutes');
    expect(result.toISOString()).toBe('2025-12-01T14:30:00.000Z');
  });

  it('subtracts hours correctly', () => {
    const result = calculateAnnouncementTime(baseDate, 2, 'hours');
    expect(result.toISOString()).toBe('2025-12-01T13:00:00.000Z');
  });

  it('subtracts days correctly', () => {
    const result = calculateAnnouncementTime(baseDate, 1, 'days');
    expect(result.toISOString()).toBe('2025-11-30T15:00:00.000Z');
  });

  it('returns same time for unknown unit (no offset)', () => {
    const result = calculateAnnouncementTime(baseDate, 1, 'weeks');
    expect(result.toISOString()).toBe(baseDate.toISOString());
  });

  it('handles zero value', () => {
    const result = calculateAnnouncementTime(baseDate, 0, 'hours');
    expect(result.toISOString()).toBe(baseDate.toISOString());
  });
});

describe('createScheduledAnnouncement', () => {
  it('returns correctly structured object', () => {
    const announcement = { id: '1hour', value: 1, unit: 'hours' as const };
    const announcementTime = new Date('2025-12-01T14:00:00Z');
    const now = '2025-12-01T12:00:00.000Z';

    const result = createScheduledAnnouncement(
      'match_123',
      announcement,
      announcementTime,
      'pending',
      null,
      null,
      now
    );

    expect(result.id).toBe('announcement_1hour');
    expect(result.match_id).toBe('match_123');
    expect(result.reminder_time).toBe(announcementTime.toISOString());
    expect(result.status).toBe('pending');
    expect(result.type).toBe('timed_announcement');
    expect(result.description).toBe('1 hours before start');
    expect(result.timing).toEqual({ value: 1, unit: 'hours' });
    expect(result.created_at).toBe(now);
    expect(result.sent_at).toBeNull();
    expect(result.error_message).toBeNull();
  });

  it('includes sentAt and errorMessage when provided', () => {
    const announcement = { id: '30min', value: 30, unit: 'minutes' as const };
    const result = createScheduledAnnouncement(
      'match_456',
      announcement,
      new Date(),
      'sent',
      '2025-12-01T13:30:00Z',
      'some error',
      '2025-12-01T12:00:00Z'
    );

    expect(result.sent_at).toBe('2025-12-01T13:30:00Z');
    expect(result.error_message).toBe('some error');
  });
});
