import { describe, it, expect } from 'vitest';
import { buildTournamentPayload } from '../../../src/components/create-tournament/tournament-helpers';

const BASE_FORM = {
  name: 'Test Tournament',
  gameId: 'overwatch2',
  gameModeId: 'mode-1',
  format: 'single-elimination' as const,
  roundsPerMatch: 3,
  ruleset: 'casual',
  allowPlayerTeamSelection: false,
};

describe('buildTournamentPayload', () => {
  describe('dateTime handling', () => {
    it('accepts a Date object and serializes startDate/startTime to ISO string', () => {
      const date = new Date('2026-04-15T18:00:00.000Z');
      const payload = buildTournamentPayload({ ...BASE_FORM, dateTime: date });
      expect(payload.startDate).toBe('2026-04-15T18:00:00.000Z');
      expect(payload.startTime).toBe('2026-04-15T18:00:00.000Z');
    });

    it('accepts a string dateTime (session-storage regression) and does not throw', () => {
      // Session storage serializes Date → ISO string via JSON.stringify.
      // Previously optional chaining didn't guard against strings:
      //   "startDateTime?.toISOString is not a function"
      const isoString = '2026-04-15T18:00:00.000Z';
      const payload = buildTournamentPayload({ ...BASE_FORM, dateTime: isoString as unknown as Date });
      expect(payload.startDate).toBe(isoString);
      expect(payload.startTime).toBe(isoString);
    });

    it('produces the same startDate whether dateTime is a Date or its ISO string', () => {
      const date = new Date('2026-06-01T12:30:00.000Z');
      const fromDate = buildTournamentPayload({ ...BASE_FORM, dateTime: date });
      const fromString = buildTournamentPayload({ ...BASE_FORM, dateTime: date.toISOString() as unknown as Date });
      expect(fromDate.startDate).toBe(fromString.startDate);
    });

    it('returns undefined startDate/startTime when dateTime is null', () => {
      const payload = buildTournamentPayload({ ...BASE_FORM, dateTime: null });
      expect(payload.startDate).toBeUndefined();
      expect(payload.startTime).toBeUndefined();
    });

    it('returns undefined startDate/startTime when dateTime is omitted', () => {
      const payload = buildTournamentPayload({ ...BASE_FORM });
      expect(payload.startDate).toBeUndefined();
      expect(payload.startTime).toBeUndefined();
    });
  });

  describe('payload fields', () => {
    it('defaults eventImageUrl to null when omitted', () => {
      const payload = buildTournamentPayload({ ...BASE_FORM });
      expect(payload.eventImageUrl).toBeNull();
    });

    it('defaults allowPlayerTeamSelection to false when omitted', () => {
      const { allowPlayerTeamSelection: _, ...rest } = BASE_FORM;
      const payload = buildTournamentPayload({ ...rest });
      expect(payload.allowPlayerTeamSelection).toBe(false);
    });
  });
});
