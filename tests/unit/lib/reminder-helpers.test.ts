import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  parseAnnouncementsField,
  calculateAnnouncementTime,
  createScheduledAnnouncement,
  getAnnouncementStatus,
  processMatchAnnouncements,
} from '@/lib/reminder-helpers';
import { getTestDb } from '../../utils/test-db';
import { seedBasicTestData, createMatch } from '../../utils/fixtures';

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

describe('getAnnouncementStatus', () => {
  let db: any;
  let match: any;

  beforeEach(async () => {
    const data = await seedBasicTestData();
    match = await createMatch(data.game.id, data.mode.id);
    db = getTestDb();
  });

  it('returns pending when no queue entry and time is in the future', async () => {
    const announcement = { id: '1hour', value: 1, unit: 'hours' as const };
    const futureTime = new Date(Date.now() + 3_600_000);
    const result = await getAnnouncementStatus(db as any, match.id, announcement, futureTime);

    expect(result.status).toBe('pending');
    expect(result.sentAt).toBeNull();
    expect(result.errorMessage).toBeNull();
  });

  it('returns scheduled when no queue entry and time is in the past', async () => {
    const announcement = { id: '1hour', value: 1, unit: 'hours' as const };
    const pastTime = new Date(Date.now() - 3_600_000);
    const result = await getAnnouncementStatus(db as any, match.id, announcement, pastTime);

    expect(result.status).toBe('scheduled');
  });

  it('returns sent when queue entry status is completed', async () => {
    const announcement = { id: '1hour', value: 1, unit: 'hours' as const };
    await db.run(`
      INSERT INTO discord_announcement_queue (id, match_id, announcement_type, announcement_data, status)
      VALUES ('q1', ?, 'timed', ?, 'completed')
    `, [match.id, JSON.stringify(announcement)]);

    const futureTime = new Date(Date.now() + 3_600_000);
    const result = await getAnnouncementStatus(db as any, match.id, announcement, futureTime);
    expect(result.status).toBe('sent');
  });

  it('preserves non-completed queue status (e.g. pending)', async () => {
    const announcement = { id: '30min', value: 30, unit: 'minutes' as const };
    await db.run(`
      INSERT INTO discord_announcement_queue (id, match_id, announcement_type, announcement_data, status)
      VALUES ('q2', ?, 'timed', ?, 'pending')
    `, [match.id, JSON.stringify(announcement)]);

    const futureTime = new Date(Date.now() + 3_600_000);
    const result = await getAnnouncementStatus(db as any, match.id, announcement, futureTime);
    expect(result.status).toBe('pending');
  });
});

describe('processMatchAnnouncements', () => {
  let db: any;
  let match: any;

  beforeEach(async () => {
    const data = await seedBasicTestData();
    match = await createMatch(data.game.id, data.mode.id);
    db = getTestDb();
  });

  it('returns empty array when announcements field is null/disabled', async () => {
    const result = await processMatchAnnouncements(db as any, match.id, false, match.start_time, new Date().toISOString());
    expect(result).toEqual([]);
  });

  it('returns empty array when announcements field is 0', async () => {
    const result = await processMatchAnnouncements(db as any, match.id, 0, match.start_time, new Date().toISOString());
    expect(result).toEqual([]);
  });

  it('processes JSON string announcements', async () => {
    const announcementsJson = JSON.stringify([{ id: '1hour', value: 1, unit: 'hours' }]);
    const futureStart = new Date(Date.now() + 7_200_000).toISOString();
    const result = await processMatchAnnouncements(db as any, match.id, announcementsJson, futureStart, new Date().toISOString());

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('announcement_1hour');
    expect(result[0].match_id).toBe(match.id);
  });

  it('processes boolean true with default announcements', async () => {
    const futureStart = new Date(Date.now() + 86_400_000).toISOString();
    const result = await processMatchAnnouncements(db as any, match.id, true, futureStart, new Date().toISOString());
    expect(result).toHaveLength(2);
  });
});
