import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../src/lib/logger/server', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    critical: vi.fn(),
  },
}));

vi.mock('../../../processes/discord-bot/utils/avatar-fetcher', () => ({
  getDiscordAvatarUrl: vi.fn().mockResolvedValue(null),
}));

import {
  getParticipantCount,
  buildConfirmationMessage,
  collectFormData,
  insertParticipant,
} from '../../../processes/discord-bot/modules/interaction-helpers';
import { getTestDb } from '../../utils/test-db';
import { seedBasicTestData, createMatch, createTournament } from '../../utils/fixtures';

describe('interaction-helpers', () => {
  let db: any;
  let game: any;
  let mode: any;

  beforeEach(async () => {
    const data = await seedBasicTestData();
    game = data.game;
    mode = data.mode;
    db = getTestDb();
    vi.clearAllMocks();
  });

  // ─── getParticipantCount ──────────────────────────────────────────────────────

  describe('getParticipantCount', () => {
    it('returns 1 as fallback when no match participants', async () => {
      const match = await createMatch(game.id, mode.id);
      const count = await getParticipantCount(db as any, match.id, false);
      expect(count).toBe(1); // 0 count -> returns 1 as fallback
    });

    it('returns participant count for match', async () => {
      const match = await createMatch(game.id, mode.id);
      await db.run(
        `INSERT INTO match_participants (id, match_id, user_id, discord_user_id, username)
         VALUES ('p1', ?, 'u1', 'd1', 'Player1')`,
        [match.id]
      );
      await db.run(
        `INSERT INTO match_participants (id, match_id, user_id, discord_user_id, username)
         VALUES ('p2', ?, 'u2', 'd2', 'Player2')`,
        [match.id]
      );

      const count = await getParticipantCount(db as any, match.id, false);
      expect(count).toBe(2);
    });

    it('returns tournament participant count', async () => {
      await db.run(
        `INSERT INTO tournaments (id, name, game_id, game_mode_id, status, format, rounds_per_match)
         VALUES ('t1', 'Test Tourney', ?, ?, 'created', 'single-elimination', 3)`,
        [game.id, mode.id]
      );
      await db.run(
        `INSERT INTO tournament_participants (id, tournament_id, user_id, discord_user_id, username)
         VALUES ('tp1', 't1', 'u1', 'd1', 'Player1')`
      );

      const count = await getParticipantCount(db as any, 't1', true);
      expect(count).toBe(1);
    });
  });

  // ─── buildConfirmationMessage ─────────────────────────────────────────────────

  describe('buildConfirmationMessage', () => {
    it('builds basic confirmation message', async () => {
      const parsedId = { eventId: 'match-1', isTournament: false, selectedTeamId: null };
      const signupForm = {
        fields: [
          { id: 'username', label: 'Username', required: true },
          { id: 'rank', label: 'Rank', required: false },
        ],
      };
      const signupData = { username: 'TestUser', rank: 'Diamond' };

      const msg = await buildConfirmationMessage(db as any, parsedId as any, signupForm, signupData, 5);

      expect(msg).toContain('Successfully signed up');
      expect(msg).toContain('TestUser');
      expect(msg).toContain('**Participants:** 5');
    });

    it('includes team name when selected', async () => {
      await db.run(
        `INSERT INTO tournaments (id, name, game_id, game_mode_id, status, format, rounds_per_match)
         VALUES ('t2', 'Tourney', ?, ?, 'created', 'single-elimination', 3)`,
        [game.id, mode.id]
      );
      await db.run(
        `INSERT INTO tournament_teams (id, tournament_id, team_name) VALUES ('team-1', 't2', 'Alpha Squad')`
      );

      const parsedId = { eventId: 't2', isTournament: true, selectedTeamId: 'team-1' };
      const signupForm = { fields: [{ id: 'username', label: 'Username', required: true }] };

      const msg = await buildConfirmationMessage(db as any, parsedId as any, signupForm, { username: 'player' }, 3);

      expect(msg).toContain('Alpha Squad');
    });

    it('shows only first 3 fields', async () => {
      const parsedId = { eventId: 'match-x', isTournament: false, selectedTeamId: null };
      const signupForm = {
        fields: [
          { id: 'f1', label: 'Field 1', required: false },
          { id: 'f2', label: 'Field 2', required: false },
          { id: 'f3', label: 'Field 3', required: false },
          { id: 'f4', label: 'Field 4', required: false }, // Should not be shown
        ],
      };
      const signupData = { f1: 'val1', f2: 'val2', f3: 'val3', f4: 'val4' };

      const msg = await buildConfirmationMessage(db as any, parsedId as any, signupForm, signupData, 1);

      expect(msg).toContain('Field 1');
      expect(msg).toContain('Field 2');
      expect(msg).toContain('Field 3');
      expect(msg).not.toContain('Field 4');
    });

    it('strips (Optional) from field labels', async () => {
      const parsedId = { eventId: 'match-x', isTournament: false, selectedTeamId: null };
      const signupForm = {
        fields: [{ id: 'rank', label: 'Rank (Optional)', required: false }],
      };

      const msg = await buildConfirmationMessage(db as any, parsedId as any, signupForm, { rank: 'Gold' }, 1);

      expect(msg).toContain('Rank:');
      expect(msg).not.toContain('(Optional)');
    });
  });

  // ─── collectFormData ──────────────────────────────────────────────────────────

  describe('collectFormData', () => {
    it('collects field values from interaction', () => {
      const mockInteraction = {
        user: { username: 'DefaultUser' },
        fields: {
          getTextInputValue: vi.fn().mockImplementation((fieldId: string) => {
            if (fieldId === 'username') return 'TestPlayer';
            if (fieldId === 'rank') return 'Diamond';
            throw new Error('Field not found');
          }),
        },
      } as any;

      const signupForm = {
        fields: [
          { id: 'username', label: 'Username', required: true },
          { id: 'rank', label: 'Rank', required: false },
        ],
      };

      const result = collectFormData(mockInteraction, signupForm);

      expect(result.signupData.username).toBe('TestPlayer');
      expect(result.signupData.rank).toBe('Diamond');
      expect(result.displayUsername).toBe('TestPlayer');
    });

    it('uses interaction.user.username as fallback display name', () => {
      const mockInteraction = {
        user: { username: 'FallbackUser' },
        fields: {
          getTextInputValue: vi.fn().mockImplementation((fieldId: string) => {
            if (fieldId === 'rank') return 'Gold';
            throw new Error('Field not found');
          }),
        },
      } as any;

      const signupForm = {
        fields: [{ id: 'rank', label: 'Rank', required: false }],
      };

      const result = collectFormData(mockInteraction, signupForm);
      expect(result.displayUsername).toBe('FallbackUser');
    });

    it('throws when required field is missing', () => {
      const mockInteraction = {
        user: { username: 'User' },
        fields: {
          getTextInputValue: vi.fn().mockImplementation(() => { throw new Error('Missing'); }),
        },
      } as any;

      const signupForm = {
        fields: [{ id: 'username', label: 'Username', required: true }],
      };

      expect(() => collectFormData(mockInteraction, signupForm)).toThrow('Required field username is missing');
    });

    it('uses battlenet_name field as display username', () => {
      const mockInteraction = {
        user: { username: 'DiscordName' },
        fields: {
          getTextInputValue: vi.fn().mockImplementation((fieldId: string) => {
            if (fieldId === 'battlenet_name') return 'BattleTag#1234';
            throw new Error('Field not found');
          }),
        },
      } as any;

      const signupForm = {
        fields: [{ id: 'battlenet_name', label: 'Battle.net Tag', required: true }],
      };

      const result = collectFormData(mockInteraction, signupForm);
      expect(result.displayUsername).toBe('BattleTag#1234');
    });
  });

  // ─── insertParticipant ────────────────────────────────────────────────────────

  describe('insertParticipant', () => {
    const mockInteraction = {
      user: { id: 'discord-user-123', username: 'TestPlayer' },
      fields: { getTextInputValue: vi.fn() },
    } as any;
    const mockClient = {} as any;

    it('inserts a match participant and returns a well-formed participant ID', async () => {
      const match = await createMatch(game.id, mode.id);
      const parsedId = { eventId: match.id, isTournament: false, selectedTeamId: null } as any;

      const participantId = await insertParticipant(db as any, parsedId, mockInteraction, 'TestPlayer', { rank: 'Gold' }, mockClient);

      expect(participantId).toMatch(/^participant_\d+_[a-z0-9]+$/);

      const row = await db.get(`SELECT * FROM match_participants WHERE id = ?`, [participantId]);
      expect(row).toBeDefined();
      expect(row.match_id).toBe(match.id);
      expect(row.discord_user_id).toBe('discord-user-123');
      expect(row.username).toBe('TestPlayer');
    });

    it('generates unique IDs on consecutive calls', async () => {
      const match = await createMatch(game.id, mode.id);
      const parsedId = { eventId: match.id, isTournament: false, selectedTeamId: null } as any;
      const interaction2 = { ...mockInteraction, user: { id: 'discord-user-456', username: 'Player2' } } as any;

      const id1 = await insertParticipant(db as any, parsedId, mockInteraction, 'TestPlayer', {}, mockClient);
      const id2 = await insertParticipant(db as any, parsedId, interaction2, 'Player2', {}, mockClient);

      expect(id1).not.toBe(id2);
    });

    it('inserts a tournament participant without a team', async () => {
      const tournament = await createTournament(game.id, { game_mode_id: mode.id });
      const parsedId = { eventId: tournament.id, isTournament: true, selectedTeamId: null } as any;

      const participantId = await insertParticipant(db as any, parsedId, mockInteraction, 'TestPlayer', {}, mockClient);

      expect(participantId).toMatch(/^participant_\d+_[a-z0-9]+$/);
      const row = await db.get(`SELECT * FROM tournament_participants WHERE id = ?`, [participantId]);
      expect(row).toBeDefined();
      expect(row.tournament_id).toBe(tournament.id);

      const memberRow = await db.get(`SELECT * FROM tournament_team_members WHERE user_id = ?`, ['discord-user-123']);
      expect(memberRow).toBeUndefined();
    });

    it('inserts tournament participant and team member when team is selected', async () => {
      const tournament = await createTournament(game.id, { game_mode_id: mode.id });
      const teamId = `team_test_${Date.now()}`;
      await db.run(
        `INSERT INTO tournament_teams (id, tournament_id, team_name) VALUES (?, ?, 'Alpha')`,
        [teamId, tournament.id]
      );
      const parsedId = { eventId: tournament.id, isTournament: true, selectedTeamId: teamId } as any;

      const participantId = await insertParticipant(db as any, parsedId, mockInteraction, 'TestPlayer', {}, mockClient);

      const pRow = await db.get(`SELECT * FROM tournament_participants WHERE id = ?`, [participantId]);
      expect(pRow).toBeDefined();
      expect(pRow.team_assignment).toBe(teamId);

      const mRow = await db.get(`SELECT * FROM tournament_team_members WHERE team_id = ?`, [teamId]);
      expect(mRow).toBeDefined();
      expect(mRow.id).toMatch(/^member_\d+_[a-z0-9]+$/);
      expect(mRow.discord_user_id).toBe('discord-user-123');
    });
  });
});
