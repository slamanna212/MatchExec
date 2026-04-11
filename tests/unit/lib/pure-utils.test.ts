import { describe, it, expect } from 'vitest';

import { cleanMapId, getMapImageUrl, formatMapName, getStatusColor } from '../../../src/lib/utils/map-utils';
import { parseDbTimestamp } from '../../../src/lib/utils/dates';
import {
  parseAnnouncementsField,
  calculateAnnouncementTime,
  createScheduledAnnouncement,
} from '../../../src/lib/reminder-helpers';

// ─── map-utils ───────────────────────────────────────────────────────────────

describe('cleanMapId', () => {
  it('removes timestamp suffix', () => {
    expect(cleanMapId('hanamura-1234567890-abc123')).toBe('hanamura');
  });

  it('leaves IDs without timestamp suffix unchanged', () => {
    expect(cleanMapId('hanamura')).toBe('hanamura');
    expect(cleanMapId('king-of-the-hill')).toBe('king-of-the-hill');
  });

  it('removes multi-digit timestamp', () => {
    expect(cleanMapId('map-name-1711234567890-xyz99')).toBe('map-name');
  });
});

describe('getMapImageUrl', () => {
  it('returns correct path', () => {
    expect(getMapImageUrl('overwatch', 'hanamura')).toBe('/images/games/overwatch/maps/hanamura.jpg');
  });

  it('cleans map ID before building URL', () => {
    expect(getMapImageUrl('ow2', 'hanamura-1234567890-abc')).toBe('/images/games/ow2/maps/hanamura.jpg');
  });
});

describe('formatMapName', () => {
  it('returns provided mapName when given', () => {
    expect(formatMapName('hanamura', 'Hanamura')).toBe('Hanamura');
  });

  it('converts kebab-case ID to title case when no name', () => {
    expect(formatMapName('king-of-the-hill')).toBe('King Of The Hill');
  });

  it('converts snake_case ID to title case when no name', () => {
    expect(formatMapName('lijiang_tower')).toBe('Lijiang Tower');
  });

  it('handles null mapName', () => {
    expect(formatMapName('nepal', null)).toBe('Nepal');
  });

  it('handles undefined mapName', () => {
    expect(formatMapName('busan')).toBe('Busan');
  });

  it('cleans timestamp suffix before formatting', () => {
    expect(formatMapName('hanamura-1234567890-abc')).toBe('Hanamura');
  });
});

describe('getStatusColor', () => {
  it('returns green for completed', () => {
    expect(getStatusColor('completed')).toBe('green');
  });

  it('returns blue for ongoing', () => {
    expect(getStatusColor('ongoing')).toBe('blue');
  });

  it('returns blue for battle', () => {
    expect(getStatusColor('battle')).toBe('blue');
  });

  it('returns red for cancelled', () => {
    expect(getStatusColor('cancelled')).toBe('red');
  });

  it('returns yellow for created/gather/assign', () => {
    expect(getStatusColor('created')).toBe('yellow');
    expect(getStatusColor('gather')).toBe('yellow');
    expect(getStatusColor('assign')).toBe('yellow');
  });

  it('returns gray for unknown status', () => {
    expect(getStatusColor('unknown')).toBe('gray');
    expect(getStatusColor('')).toBe('gray');
  });
});

// ─── dates ───────────────────────────────────────────────────────────────────

describe('parseDbTimestamp', () => {
  it('returns null for null input', () => {
    expect(parseDbTimestamp(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(parseDbTimestamp(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseDbTimestamp('')).toBeNull();
  });

  it('appends Z for plain SQLite timestamp (no timezone)', () => {
    const result = parseDbTimestamp('2025-08-08 22:52:51');
    expect(result).toBeInstanceOf(Date);
    expect(result?.toISOString()).toBe('2025-08-08T22:52:51.000Z');
  });

  it('passes through ISO strings with Z suffix as-is', () => {
    const result = parseDbTimestamp('2025-08-08T22:52:51.000Z');
    expect(result).toBeInstanceOf(Date);
    expect(result?.toISOString()).toBe('2025-08-08T22:52:51.000Z');
  });

  it('passes through strings with timezone offset', () => {
    const result = parseDbTimestamp('2025-08-08T22:52:51+05:30');
    expect(result).toBeInstanceOf(Date);
    expect(isNaN(result!.getTime())).toBe(false);
  });
});

// ─── reminder-helpers ────────────────────────────────────────────────────────

describe('parseAnnouncementsField', () => {
  it('parses valid JSON string array', () => {
    const input = JSON.stringify([{ id: 'a1', value: 1, unit: 'hours' }]);
    const result = parseAnnouncementsField(input);
    expect(Array.isArray(result)).toBe(true);
    expect(result![0].id).toBe('a1');
  });

  it('returns null for invalid JSON string', () => {
    expect(parseAnnouncementsField('not-json')).toBeNull();
  });

  it('returns default announcements for truthy number', () => {
    const result = parseAnnouncementsField(1);
    expect(Array.isArray(result)).toBe(true);
    expect(result!.length).toBeGreaterThan(0);
  });

  it('returns null for falsy number', () => {
    expect(parseAnnouncementsField(0)).toBeNull();
  });

  it('returns default announcements for true boolean', () => {
    const result = parseAnnouncementsField(true);
    expect(Array.isArray(result)).toBe(true);
  });

  it('returns null for false boolean', () => {
    expect(parseAnnouncementsField(false)).toBeNull();
  });

  it('returns object as-is when given object', () => {
    const obj = [{ id: 'test', value: 30, unit: 'minutes' }];
    const result = parseAnnouncementsField(obj);
    expect(result).toBe(obj);
  });

  it('returns null for null', () => {
    expect(parseAnnouncementsField(null)).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(parseAnnouncementsField(undefined)).toBeNull();
  });
});

describe('calculateAnnouncementTime', () => {
  const baseDate = new Date('2025-12-01T15:00:00Z');

  it('subtracts minutes', () => {
    const result = calculateAnnouncementTime(baseDate, 30, 'minutes');
    expect(result.toISOString()).toBe('2025-12-01T14:30:00.000Z');
  });

  it('subtracts hours', () => {
    const result = calculateAnnouncementTime(baseDate, 1, 'hours');
    expect(result.toISOString()).toBe('2025-12-01T14:00:00.000Z');
  });

  it('subtracts days', () => {
    const result = calculateAnnouncementTime(baseDate, 1, 'days');
    expect(result.toISOString()).toBe('2025-11-30T15:00:00.000Z');
  });

  it('returns unchanged date for unknown unit', () => {
    const result = calculateAnnouncementTime(baseDate, 5, 'weeks');
    expect(result.getTime()).toBe(baseDate.getTime());
  });
});

describe('createScheduledAnnouncement', () => {
  it('formats scheduled announcement correctly', () => {
    const matchId = 'match-123';
    const announcement = { id: '1hour', value: 1, unit: 'hours' as const };
    const announcementTime = new Date('2025-12-01T14:00:00Z');
    const now = '2025-12-01T10:00:00Z';

    const result = createScheduledAnnouncement(matchId, announcement, announcementTime, 'pending', null, null, now);

    expect(result.id).toBe('announcement_1hour');
    expect(result.match_id).toBe(matchId);
    expect(result.reminder_time).toBe('2025-12-01T14:00:00.000Z');
    expect(result.status).toBe('pending');
    expect(result.type).toBe('timed_announcement');
    expect(result.description).toContain('1');
    expect(result.description).toContain('hours');
    expect(result.timing.value).toBe(1);
    expect(result.timing.unit).toBe('hours');
  });

  it('includes sentAt and errorMessage when provided', () => {
    const result = createScheduledAnnouncement(
      'm1', { id: 'r', value: 30, unit: 'minutes' as const },
      new Date(), 'sent', '2025-12-01T13:00:00Z', null, new Date().toISOString()
    );

    expect(result.sent_at).toBe('2025-12-01T13:00:00Z');
    expect(result.error_message).toBeNull();
  });
});
