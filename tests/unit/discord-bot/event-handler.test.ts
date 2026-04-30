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

const fsMocks = vi.hoisted(() => ({
  existsSync: vi.fn<() => boolean>().mockReturnValue(false),
  readFileSync: vi.fn(),
}));

vi.mock('fs', () => ({
  default: fsMocks,
  existsSync: fsMocks.existsSync,
  readFileSync: fsMocks.readFileSync,
}));

vi.mock('discord.js', () => ({
  GuildScheduledEventPrivacyLevel: { GuildOnly: 2 },
  GuildScheduledEventEntityType: { External: 3 },
}));

import { EventHandler } from '../../../processes/discord-bot/modules/event-handler';
import { getTestDb } from '../../utils/test-db';
import { seedBasicTestData } from '../../utils/fixtures';

describe('EventHandler', () => {
  let db: any;
  let game: any;
  let mockClient: any;
  let mockGuild: any;
  let handler: EventHandler;
  const settings = {
    guild_id: 'guild-123',
    event_duration_minutes: 45,
  };

  beforeEach(async () => {
    const data = await seedBasicTestData();
    game = data.game;
    db = getTestDb();
    vi.clearAllMocks();

    mockGuild = {
      scheduledEvents: {
        create: vi.fn().mockResolvedValue({ id: 'event-123' }),
        fetch: vi.fn(),
      },
    };

    mockClient = {
      guilds: {
        cache: {
          get: vi.fn().mockReturnValue(mockGuild),
        },
      },
    };

    handler = new EventHandler(mockClient as any, db as any, settings as any);
  });

  describe('createDiscordEvent', () => {
    const mockMessage = {
      guild: { id: 'guild-123' },
      channelId: 'ch-456',
      id: 'msg-789',
    };

    it('creates a Discord event and returns its ID', async () => {
      const eventData = {
        id: 'match-1',
        name: 'Test Match',
        description: 'A test match',
        game_id: game.id,
        type: 'competitive' as const,
        start_date: new Date(Date.now() + 3600000).toISOString(),
      };

      const result = await handler.createDiscordEvent(eventData, mockMessage as any);

      expect(result).toBe('event-123');
      expect(mockGuild.scheduledEvents.create).toHaveBeenCalledOnce();
    });

    it('returns null when guild is not found', async () => {
      mockClient.guilds.cache.get.mockReturnValue(null);

      const result = await handler.createDiscordEvent(
        { id: 'x', name: 'x', description: 'x', game_id: game.id, type: 'casual' as const, start_date: new Date().toISOString() },
        mockMessage as any
      );

      expect(result).toBeNull();
    });

    it('returns null when create throws', async () => {
      mockGuild.scheduledEvents.create.mockRejectedValue(new Error('Discord API error'));

      const result = await handler.createDiscordEvent(
        { id: 'x', name: 'x', description: 'x', game_id: game.id, type: 'competitive' as const, start_date: new Date().toISOString() },
        mockMessage as any
      );

      expect(result).toBeNull();
    });

    it('includes livestream link in description', async () => {
      const eventData = {
        id: 'match-stream',
        name: 'Stream Match',
        description: 'Watch live',
        game_id: game.id,
        type: 'competitive' as const,
        start_date: new Date(Date.now() + 3600000).toISOString(),
        livestream_link: 'https://twitch.tv/test',
      };

      await handler.createDiscordEvent(eventData, mockMessage as any);

      const createCall = mockGuild.scheduledEvents.create.mock.calls[0][0];
      expect(createCall.description).toContain('twitch.tv');
    });
  });

  describe('deleteDiscordEvent', () => {
    it('deletes event and returns true on success', async () => {
      const mockEvent = { delete: vi.fn().mockResolvedValue(undefined) };
      mockGuild.scheduledEvents.fetch.mockResolvedValue(mockEvent);

      const result = await handler.deleteDiscordEvent('event-to-delete');

      expect(result).toBe(true);
      expect(mockEvent.delete).toHaveBeenCalledOnce();
    });

    it('returns false when guild not found', async () => {
      mockClient.guilds.cache.get.mockReturnValue(null);
      const result = await handler.deleteDiscordEvent('event-123');
      expect(result).toBe(false);
    });

    it('returns false when event not found', async () => {
      mockGuild.scheduledEvents.fetch.mockResolvedValue(null);
      const result = await handler.deleteDiscordEvent('nonexistent');
      expect(result).toBe(false);
    });

    it('returns false when delete throws', async () => {
      mockGuild.scheduledEvents.fetch.mockRejectedValue(new Error('API error'));
      const result = await handler.deleteDiscordEvent('event-error');
      expect(result).toBe(false);
    });
  });

  describe('updateSettings', () => {
    it('accepts new settings without throwing', () => {
      expect(() => handler.updateSettings(null)).not.toThrow();
      expect(() => handler.updateSettings(settings as any)).not.toThrow();
    });
  });
});
