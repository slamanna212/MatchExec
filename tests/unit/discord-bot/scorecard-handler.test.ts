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

    it('replies with instructions when user has a pending scorecard', async () => {
      const match = await createMatch(game.id, mode.id);
      const matchGameId = `mg-${Date.now()}`;
      await db.run(
        `INSERT INTO match_games (id, match_id, round, status) VALUES (?, ?, 1, 'ongoing')`,
        [matchGameId, match.id]
      );
      await db.run(
        `INSERT INTO scorecard_dm_messages (id, match_id, match_game_id, discord_user_id, discord_message_id)
         VALUES ('dm-1', ?, ?, 'user-with-pending', 'msg-123')`,
        [match.id, matchGameId]
      );

      const mockMessage = {
        author: { id: 'user-with-pending' },
        reply: vi.fn().mockResolvedValue(undefined),
      };

      await handler.handleNonReplyDM(mockMessage as any);

      expect(mockMessage.reply).toHaveBeenCalled();
      const replyText = mockMessage.reply.mock.calls[0][0];
      expect(replyText).toContain('reply directly');
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

    it('replies with error when no image attachment is provided', async () => {
      const match = await createMatch(game.id, mode.id);
      const matchGameId = `mg-${Date.now()}`;
      await db.run(
        `INSERT INTO match_games (id, match_id, round, status) VALUES (?, ?, 1, 'ongoing')`,
        [matchGameId, match.id]
      );
      // Use a numeric match_id value since the handler validates with /^\d+$/
      await db.run(
        `INSERT INTO scorecard_dm_messages (id, match_id, match_game_id, discord_user_id, discord_message_id)
         VALUES ('dm-reply-1', '12345', ?, 'user-reply', 'msg-scorecard')`,
        [matchGameId]
      );

      const mockMessage = {
        reference: { messageId: 'msg-scorecard' },
        author: { id: 'user-reply' },
        id: 'reply-msg-1',
        reply: vi.fn().mockResolvedValue(undefined),
        attachments: {
          filter: vi.fn().mockReturnValue({ size: 0, first: vi.fn() }),
        },
      };

      await handler.handleDMReply(mockMessage as any);

      expect(mockMessage.reply).toHaveBeenCalled();
      expect(mockMessage.reply.mock.calls[0][0]).toContain('screenshot image');
    });

    it('processes image attachment and creates submission', async () => {
      const match = await createMatch(game.id, mode.id);
      const matchGameId = `mg-${Date.now()}`;
      await db.run(
        `INSERT INTO match_games (id, match_id, round, status) VALUES (?, ?, 1, 'ongoing')`,
        [matchGameId, match.id]
      );

      const participantId = `p-${Date.now()}`;
      await db.run(
        `INSERT INTO match_participants (id, match_id, user_id, discord_user_id, username, team)
         VALUES (?, ?, 'u1', 'user-img', 'Tester', 'blue')`,
        [participantId, match.id]
      );
      // Use a numeric match_id since the handler validates with /^\d+$/
      await db.run(
        `INSERT INTO scorecard_dm_messages (id, match_id, match_game_id, discord_user_id, discord_message_id, participant_id, team_side)
         VALUES ('dm-img-1', '99999', ?, 'user-img', 'msg-sc-dm', ?, 'blue')`,
        [matchGameId, participantId]
      );

      // Mock fs to succeed
      fsMocks.existsSync.mockReturnValue(true);

      // Mock global fetch for image download
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(100)),
      }) as any;

      const mockAttachment = {
        url: 'https://cdn.discordapp.com/attachments/test/image.png',
        contentType: 'image/png',
        name: 'image.png',
      };

      const filteredAttachments = {
        size: 1,
        first: () => mockAttachment,
      };

      const mockMessage = {
        reference: { messageId: 'msg-sc-dm' },
        author: { id: 'user-img' },
        id: 'reply-msg-img',
        reply: vi.fn().mockResolvedValue(undefined),
        attachments: {
          filter: vi.fn().mockReturnValue(filteredAttachments),
        },
      };

      await handler.handleDMReply(mockMessage as any);

      // Restore fetch
      globalThis.fetch = originalFetch;

      // Should reply with success message
      expect(mockMessage.reply).toHaveBeenCalled();
      expect(mockMessage.reply.mock.calls[0][0]).toContain('Screenshot received');

      // Verify submission was created in DB
      const submissions = await db.all('SELECT * FROM scorecard_submissions WHERE match_id = ?', ['99999']);
      expect(submissions.length).toBe(1);
      expect(submissions[0].submitted_by_discord_user_id).toBe('user-img');
      expect(submissions[0].team_side).toBe('blue');

      // Verify processing queue entry was created
      const queueEntries = await db.all('SELECT * FROM stats_processing_queue WHERE match_id = ?', ['99999']);
      expect(queueEntries.length).toBe(1);
    });
  });

  describe('updateSettings', () => {
    it('accepts new settings without throwing', () => {
      expect(() => handler.updateSettings(null)).not.toThrow();
    });
  });
});
