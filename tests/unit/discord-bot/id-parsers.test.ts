import { describe, it, expect } from 'vitest';
import { parseModalCustomId } from '../../../processes/discord-bot/utils/id-parsers';

describe('parseModalCustomId', () => {
  describe('team-based tournament signup (colon delimiter)', () => {
    it('parses a real team-based tournament modal custom ID correctly', () => {
      const eventId = 'tournament_1772497617996_obkfu5quc';
      const teamId = 'team_1772497618778_zzc5dryj9';
      const customId = `signup_form_team:${eventId}:${teamId}`;

      const result = parseModalCustomId(customId);

      expect(result).not.toBeNull();
      expect(result!.eventId).toBe(eventId);
      expect(result!.selectedTeamId).toBe(teamId);
      expect(result!.isTournament).toBe(true);
    });

    it('sets isTournament to true for team-based tournament IDs', () => {
      const result = parseModalCustomId(
        'signup_form_team:tournament_123_abc:team_456_def'
      );

      expect(result!.isTournament).toBe(true);
    });

    it('handles team IDs with multiple underscores correctly', () => {
      const eventId = 'tournament_1000000000000_xxxxxxxxx';
      const teamId = 'team_2000000000000_yyyyyyyyy';
      const result = parseModalCustomId(`signup_form_team:${eventId}:${teamId}`);

      expect(result!.eventId).toBe(eventId);
      expect(result!.selectedTeamId).toBe(teamId);
    });
  });

  describe('non-team tournament signup', () => {
    it('parses a non-team tournament modal custom ID', () => {
      const eventId = 'tournament_1772497617996_obkfu5quc';
      const result = parseModalCustomId(`signup_form_${eventId}`);

      expect(result).not.toBeNull();
      expect(result!.eventId).toBe(eventId);
      expect(result!.selectedTeamId).toBeNull();
      expect(result!.isTournament).toBe(true);
    });
  });

  describe('match signup (non-tournament)', () => {
    it('parses a match modal custom ID', () => {
      const matchId = 'match_1772497617996_xyz123';
      const result = parseModalCustomId(`signup_form_${matchId}`);

      expect(result).not.toBeNull();
      expect(result!.eventId).toBe(matchId);
      expect(result!.selectedTeamId).toBeNull();
      expect(result!.isTournament).toBe(false);
    });

    it('sets isTournament to false for match IDs', () => {
      const result = parseModalCustomId('signup_form_match_123_abc');

      expect(result!.isTournament).toBe(false);
    });
  });

  describe('invalid / unrecognized custom IDs', () => {
    it('returns null for an unrecognized custom ID', () => {
      expect(parseModalCustomId('button_click_something')).toBeNull();
    });

    it('returns null for an empty string', () => {
      expect(parseModalCustomId('')).toBeNull();
    });

    it('returns null for signup_form_ with no event ID', () => {
      expect(parseModalCustomId('signup_form_')).toBeNull();
    });

    it('returns null for team-based ID missing the team segment', () => {
      // signup_form_team: with no colon separating eventId and teamId
      expect(parseModalCustomId('signup_form_team:tournament_123_abc')).toBeNull();
    });
  });
});
