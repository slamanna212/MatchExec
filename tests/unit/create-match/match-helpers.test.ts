import { describe, it, expect, vi } from 'vitest';
import { buildMatchPayload } from '../../../src/components/create-match/match-helpers';

vi.mock('../../../src/lib/logger/client', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn(), critical: vi.fn() },
}));

const BASE_FORM = {
  name: 'Test Match',
  gameId: 'overwatch2',
  rules: 'casual' as const,
  playerNotifications: true,
  announcements: [],
};

describe('buildMatchPayload', () => {
  describe('dateTime handling', () => {
    it('accepts a Date object and serializes to ISO string', () => {
      const date = new Date('2026-04-15T18:00:00.000Z');
      const payload = buildMatchPayload({ ...BASE_FORM, dateTime: date });
      expect(payload.startDate).toBe('2026-04-15T18:00:00.000Z');
    });

    it('accepts a string dateTime (session-storage regression) and does not throw', () => {
      // Session storage serializes Date → ISO string via JSON.stringify.
      // Previously this caused: "formData.dateTime.toISOString is not a function"
      const isoString = '2026-04-15T18:00:00.000Z';
      const payload = buildMatchPayload({ ...BASE_FORM, dateTime: isoString as unknown as Date });
      expect(payload.startDate).toBe(isoString);
    });

    it('produces the same startDate whether dateTime is a Date or its ISO string', () => {
      const date = new Date('2026-06-01T12:30:00.000Z');
      const fromDate = buildMatchPayload({ ...BASE_FORM, dateTime: date });
      const fromString = buildMatchPayload({ ...BASE_FORM, dateTime: date.toISOString() as unknown as Date });
      expect(fromDate.startDate).toBe(fromString.startDate);
    });
  });

  describe('required field validation', () => {
    it('throws when name is missing', () => {
      expect(() => buildMatchPayload({ gameId: 'overwatch2', dateTime: new Date() }))
        .toThrow('Missing required fields');
    });

    it('throws when gameId is missing', () => {
      expect(() => buildMatchPayload({ name: 'Test', dateTime: new Date() }))
        .toThrow('Missing required fields');
    });

    it('throws when dateTime is missing', () => {
      expect(() => buildMatchPayload({ name: 'Test', gameId: 'overwatch2' }))
        .toThrow('Missing required fields');
    });

    it('throws when dateTime is null', () => {
      expect(() => buildMatchPayload({ name: 'Test', gameId: 'overwatch2', dateTime: null }))
        .toThrow('Missing required fields');
    });
  });

  describe('payload defaults', () => {
    it('derives rounds from maps array length', () => {
      const payload = buildMatchPayload({ ...BASE_FORM, dateTime: new Date(), maps: ['map1', 'map2', 'map3'] });
      expect(payload.rounds).toBe(3);
    });

    it('defaults rounds to 1 when maps is empty', () => {
      const payload = buildMatchPayload({ ...BASE_FORM, dateTime: new Date(), maps: [] });
      expect(payload.rounds).toBe(1);
    });

    it('defaults description to empty string when omitted', () => {
      const payload = buildMatchPayload({ ...BASE_FORM, dateTime: new Date() });
      expect(payload.description).toBe('');
    });

    it('defaults playerNotifications to true when omitted', () => {
      const { playerNotifications: _, ...rest } = BASE_FORM;
      const payload = buildMatchPayload({ ...rest, dateTime: new Date() });
      expect(payload.playerNotifications).toBe(true);
    });

    it('defaults eventImageUrl to null when omitted', () => {
      const payload = buildMatchPayload({ ...BASE_FORM, dateTime: new Date() });
      expect(payload.eventImageUrl).toBeNull();
    });
  });
});
