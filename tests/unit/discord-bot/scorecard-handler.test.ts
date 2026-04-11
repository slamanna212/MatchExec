import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/lib/logger/server', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    critical: vi.fn(),
  },
}));

vi.mock('discord.js', () => ({
  EmbedBuilder: vi.fn().mockImplementation(function (this: any) {
    this.data = { fields: [] };
    this.setTitle = vi.fn().mockReturnThis();
    this.setDescription = vi.fn().mockReturnThis();
    this.setColor = vi.fn().mockReturnThis();
    this.setFooter = vi.fn().mockReturnThis();
    return this;
  }),
}));

const fsMocks = vi.hoisted(() => ({
  existsSync: vi.fn<() => boolean>().mockReturnValue(false),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

vi.mock('fs', () => ({
  default: fsMocks,
  existsSync: fsMocks.existsSync,
  mkdirSync: fsMocks.mkdirSync,
  writeFileSync: fsMocks.writeFileSync,
}));

import { ScorecardHandler } from '../../../processes/discord-bot/modules/scorecard-handler';
import { getTestDb } from '../../utils/test-db';
import { seedBasicTestData, createMatch, createMatchParticipant } from '../../utils/fixtures';

describe('ScorecardHandler', () => {
  let db: any;
  let game: any;
  let mode: any;
  let mockClient: any;
  let handler: ScorecardHandler;

  beforeEach(async () => {
    const data = await seedBasicTestData();
    game = data.game;
    mode = data.mode;
    db = getTestDb();
    vi.clearAllMocks();

    mockClient = {
      users: {
        fetch: vi.fn().mockResolvedValue({
          send: vi.fn().mockResolvedValue({ id: 'dm-msg-123' }),
        }),
      },
    };

    handler = new ScorecardHandler(mockClient as any, db as any, null);
  });

  describe('sendScorecardPrompts', () => {
    it('returns false when stats are disabled', async () => {
      // No stats_settings row → disabled
      const result = await handler.sendScorecardPrompts('match-1', 'game-1', 'Test Map');
      expect(result).toBe(false);
    });

    it('returns false when stats enabled but no stat definitions', async () => {
      await db.run(`INSERT INTO stats_settings (id, enabled) VALUES (1, 1)`);
      const match = await createMatch(game.id, mode.id);
      const result = await handler.sendScorecardPrompts(match.id, 'game-1', 'Test Map');
      expect(result).toBe(false);
    });

    it('returns false when match not found', async () => {
      await db.run(`INSERT INTO stats_settings (id, enabled) VALUES (1, 1)`);
      const result = await handler.sendScorecardPrompts('nonexistent-match', 'game-1', 'Test Map');
      expect(result).toBe(false);
    });

    it('returns false when no commanders configured', async () => {
      await db.run(`INSERT INTO stats_settings (id, enabled) VALUES (1, 1)`);
      await db.run(`
        INSERT INTO game_stat_definitions (id, game_id, name, display_name, stat_type)
        VALUES ('stat-1', ?, 'kills', 'Kills', 'number')
      `, [game.id]);

      const match = await createMatch(game.id, mode.id);
      // Add participant but not as commander (receives_map_codes=0)
      await createMatchParticipant(match.id, 'u1', 'Player1');

      const result = await handler.sendScorecardPrompts(match.id, 'mgame-1', 'Test Map');
      expect(result).toBe(false);
    });

    it('sends DMs and returns true when commanders exist', async () => {
      await db.run(`INSERT INTO stats_settings (id, enabled) VALUES (1, 1)`);
      await db.run(`
        INSERT INTO game_stat_definitions (id, game_id, name, display_name, stat_type)
        VALUES ('stat-1', ?, 'kills', 'Kills', 'number')
      `, [game.id]);

      const match = await createMatch(game.id, mode.id);

      // Insert a participant with receives_map_codes=1
      const participantId = `participant_${Date.now()}`;
      await db.run(`
        INSERT INTO match_participants (id, match_id, user_id, discord_user_id, username, receives_map_codes, team)
        VALUES (?, ?, 'u1', 'discord-u1', 'Commander', 1, 'blue')
      `, [participantId, match.id]);

      // Create a match_game entry for the match game ID
      const matchGameId = `mg-${Date.now()}`;
      await db.run(`
        INSERT INTO match_games (id, match_id, round, status)
        VALUES (?, ?, 1, 'completed')
      `, [matchGameId, match.id]);

      const result = await handler.sendScorecardPrompts(match.id, matchGameId, 'Test Map');
      expect(result).toBe(true);
      expect(mockClient.users.fetch).toHaveBeenCalledWith('discord-u1');
    });
  });

  describe('handleNonReplyDM', () => {
    it('does not reply when user has no pending scorecard records', async () => {
      const mockMessage = {
        author: { id: 'user-no-pending' },
        reply: vi.fn().mockResolvedValue(undefined),
      };

      await handler.handleNonReplyDM(mockMessage as any);

      expect(mockMessage.reply).not.toHaveBeenCalled();
    });
  });

  describe('handleDMReply', () => {
    it('returns early when message has no reference', async () => {
      const mockMessage = {
        reference: null,
        author: { id: 'user-1' },
        reply: vi.fn(),
      };

      await handler.handleDMReply(mockMessage as any);
      expect(mockMessage.reply).not.toHaveBeenCalled();
    });

    it('returns early when replied message is not a scorecard DM', async () => {
      const mockMessage = {
        reference: { messageId: 'unknown-msg' },
        author: { id: 'user-1' },
        reply: vi.fn(),
        attachments: { filter: vi.fn().mockReturnValue({ size: 0, first: vi.fn() }) },
      };

      await handler.handleDMReply(mockMessage as any);
      expect(mockMessage.reply).not.toHaveBeenCalled();
    });
  });

  describe('updateSettings', () => {
    it('accepts new settings without throwing', () => {
      expect(() => handler.updateSettings(null)).not.toThrow();
    });
  });
});
