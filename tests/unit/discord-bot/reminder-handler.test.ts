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
  EmbedBuilder: vi.fn().mockImplementation(function(this: any) {
    this.data = { fields: [] };
    this.setTitle = vi.fn().mockReturnThis();
    this.setDescription = vi.fn().mockReturnThis();
    this.setColor = vi.fn().mockReturnThis();
    this.setFooter = vi.fn().mockReturnThis();
    this.setURL = vi.fn().mockReturnThis();
    this.setTimestamp = vi.fn().mockReturnThis();
    this.setThumbnail = vi.fn().mockReturnThis();
    this.setImage = vi.fn().mockReturnThis();
    this.addFields = vi.fn().mockReturnThis();
    return this;
  }),
}));

import { ReminderHandler } from '../../../processes/discord-bot/modules/reminder-handler';
import { setupPgTestFile } from '../../utils/pg-test-db';
import { seedBasicTestData, createMatch, createMatchParticipant, createDiscordChannel, createDiscordSettings } from '../../utils/pg-fixtures';

setupPgTestFile();

describe('ReminderHandler', () => {
  let game: any;
  let mode: any;
  let mockClient: any;
  let handler: ReminderHandler;

  beforeEach(async () => {
    const data = await seedBasicTestData();
    game = data.game;
    mode = data.mode;
    vi.clearAllMocks();

    mockClient = {
      isReady: vi.fn().mockReturnValue(false),
      channels: {
        fetch: vi.fn().mockResolvedValue({
          isTextBased: vi.fn().mockReturnValue(true),
          send: vi.fn().mockResolvedValue(undefined),
        }),
      },
      guilds: {
        cache: {
          first: vi.fn().mockReturnValue(null),
        },
      },
    };

    handler = new ReminderHandler(mockClient as any, null);
  });

  describe('sendPlayerReminders', () => {
    it('returns false when client is not ready', async () => {
      mockClient.isReady.mockReturnValue(false);
      const result = await handler.sendPlayerReminders('match-1');
      expect(result).toBe(false);
    });

    it('returns false when match not found', async () => {
      mockClient.isReady.mockReturnValue(true);
      const result = await handler.sendPlayerReminders('nonexistent-match');
      expect(result).toBe(false);
    });

    it('returns true when match exists but has no participants', async () => {
      mockClient.isReady.mockReturnValue(true);
      const match = await createMatch(game.id, mode.id);
      const result = await handler.sendPlayerReminders(match.id);
      expect(result).toBe(true);
    });

    it('sends DMs to participants with discord_user_id', async () => {
      mockClient.isReady.mockReturnValue(true);
      const mockSend = vi.fn().mockResolvedValue(undefined);
      mockClient.users = {
        fetch: vi.fn().mockResolvedValue({
          send: mockSend,
        }),
      };

      const match = await createMatch(game.id, mode.id);
      await createMatchParticipant(match.id, 'discord-u1', 'Player1');

      const result = await handler.sendPlayerReminders(match.id);
      expect(result).toBe(true);
      expect(mockClient.users.fetch).toHaveBeenCalledWith('discord-u1');
      expect(mockSend).toHaveBeenCalled();
      // Verify the DM contains an embed
      const sendArgs = mockSend.mock.calls[0][0];
      expect(sendArgs).toHaveProperty('embeds');
      expect(sendArgs.embeds.length).toBeGreaterThan(0);
    });
  });

  describe('sendSignupNotification', () => {
    it('returns false when client is not ready', async () => {
      mockClient.isReady.mockReturnValue(false);
      const result = await handler.sendSignupNotification('match-1', {
        username: 'TestUser',
        discordUserId: 'user-123',
        signupData: {},
        participantCount: 1,
      });
      expect(result).toBe(false);
    });

    it('returns true when no signup channels configured', async () => {
      mockClient.isReady.mockReturnValue(true);
      // No discord_channels rows → returns true (not an error)
      const result = await handler.sendSignupNotification('match-1', {
        username: 'TestUser',
        discordUserId: 'user-123',
        signupData: {},
        participantCount: 1,
      });
      expect(result).toBe(true);
    });

    it('returns false when match not found and channels exist', async () => {
      mockClient.isReady.mockReturnValue(true);
      await createDiscordSettings({ guild_id: 'guild-123', bot_token: 'token-abc' });
      await createDiscordChannel({ id: 'ch-1', guild_id: 'guild-123', discord_channel_id: 'dc-111', name: 'general', send_signup_updates: true });

      mockClient.channels.fetch.mockResolvedValue({
        isTextBased: vi.fn().mockReturnValue(true),
        send: vi.fn().mockResolvedValue(undefined),
      });

      const result = await handler.sendSignupNotification('nonexistent-match', {
        username: 'TestUser',
        discordUserId: 'user-123',
        signupData: {},
        participantCount: 1,
      });
      expect(result).toBe(false);
    });
  });

  describe('sendMapCodePMs', () => {
    it('returns false when client is not ready', async () => {
      mockClient.isReady.mockReturnValue(false);
      const result = await handler.sendMapCodePMs('match-1', 'Map Name', 'ABC123');
      expect(result).toBe(false);
    });

    it('returns false when match not found', async () => {
      mockClient.isReady.mockReturnValue(true);
      const result = await handler.sendMapCodePMs('nonexistent-match', 'Map Name', 'ABC123');
      expect(result).toBe(false);
    });

    it('returns true when no participants have map code flag set', async () => {
      mockClient.isReady.mockReturnValue(true);
      const match = await createMatch(game.id, mode.id);
      // createMatchParticipant doesn't set receives_map_codes=1 by default
      await createMatchParticipant(match.id, 'user-1', 'Player1');

      // No participants with receives_map_codes=1 → returns true (not an error)
      const result = await handler.sendMapCodePMs(match.id, 'Numbani', 'ABC123');
      expect(result).toBe(true);
    });
  });

  describe('updateSettings', () => {
    it('accepts null settings without throwing', () => {
      expect(() => handler.updateSettings(null)).not.toThrow();
    });

    it('accepts valid settings object without throwing', () => {
      const settings = { guild_id: 'guild-123', bot_token: 'token' } as any;
      expect(() => handler.updateSettings(settings)).not.toThrow();
    });
  });
});
