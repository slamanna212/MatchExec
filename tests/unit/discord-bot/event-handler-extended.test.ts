import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getTestDb } from '../../utils/test-db';
import { seedBasicTestData } from '../../utils/fixtures';

vi.mock('../../../src/lib/logger/server', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn(), critical: vi.fn() },
}));

const fsMocks = vi.hoisted(() => ({
  existsSync: vi.fn<() => boolean>().mockReturnValue(false),
  readFileSync: vi.fn(),
  promises: {
    stat: vi.fn<() => Promise<{ size: number }>>(),
    readFile: vi.fn<() => Promise<Buffer>>(),
  },
}));

vi.mock('fs', () => ({
  default: { ...fsMocks, promises: fsMocks.promises },
  existsSync: fsMocks.existsSync,
  readFileSync: fsMocks.readFileSync,
  promises: fsMocks.promises,
}));

vi.mock('discord.js', () => ({
  GuildScheduledEventPrivacyLevel: { GuildOnly: 2 },
  GuildScheduledEventEntityType: { External: 3 },
}));

import { EventHandler } from '../../../processes/discord-bot/modules/event-handler';

describe('EventHandler — Extended', () => {
   
  let db: any;
   
  let game: any;
   
  let mockClient: any;
   
  let mockGuild: any;
  let handler: EventHandler;

  const settings = { guild_id: 'guild-ext-ev', event_duration_minutes: 60 };

  const mockMessage = {
    guild: { id: 'guild-ext-ev' },
    channelId: 'ch-ext',
    id: 'msg-ext',
  };

  beforeEach(async () => {
    const data = await seedBasicTestData();
    game = data.game;
    db = getTestDb();
    vi.clearAllMocks();

    mockGuild = {
      scheduledEvents: {
        create: vi.fn().mockResolvedValue({ id: 'ev-ext-123' }),
        fetch: vi.fn(),
      },
    };

    mockClient = {
      guilds: {
        cache: { get: vi.fn().mockReturnValue(mockGuild) },
      },
    };

    handler = new EventHandler(mockClient, db, settings as never);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  function makeEventData(overrides: Record<string, unknown> = {}) {
    return {
      id: `ev-${Math.random().toString(36).slice(2)}`,
      name: 'Ext Match',
      description: 'An extended match',
      game_id: game.id,
      type: 'competitive' as const,
      start_date: new Date(Date.now() + 3600000).toISOString(),
      ...overrides,
    };
  }

  describe('createDiscordEvent — extended', () => {
    it('returns event ID for competitive type', async () => {
      const result = await handler.createDiscordEvent(makeEventData({ type: 'competitive' }), mockMessage as never);
      expect(result).toBe('ev-ext-123');
    });

    it('returns event ID for casual type', async () => {
      const result = await handler.createDiscordEvent(makeEventData({ type: 'casual' }), mockMessage as never);
      expect(result).toBe('ev-ext-123');
    });

    it('includes Casual in description when type is casual', async () => {
      await handler.createDiscordEvent(makeEventData({ type: 'casual' }), mockMessage as never);
      const createArg = mockGuild.scheduledEvents.create.mock.calls[0][0];
      expect(createArg.description).toContain('Casual');
    });

    it('includes Competitive in description when type is competitive', async () => {
      await handler.createDiscordEvent(makeEventData({ type: 'competitive' }), mockMessage as never);
      const createArg = mockGuild.scheduledEvents.create.mock.calls[0][0];
      expect(createArg.description).toContain('Competitive');
    });

    it('falls back to gameId when game not found in DB', async () => {
      const result = await handler.createDiscordEvent(
        makeEventData({ game_id: 'nonexistent-game-id' }),
        mockMessage as never
      );
      expect(result).toBe('ev-ext-123');
      // description should contain the raw game ID as fallback
      const createArg = mockGuild.scheduledEvents.create.mock.calls[0][0];
      expect(createArg.description).toContain('nonexistent-game-id');
    });

    it('uses rounds to multiply event duration', async () => {
      // With rounds=3 and event_duration_minutes=60, endTime should be 3h after startTime
      await handler.createDiscordEvent(makeEventData(), mockMessage as never, 3);
      const createArg = mockGuild.scheduledEvents.create.mock.calls[0][0];
      const durationMs =
        new Date(createArg.scheduledEndTime).getTime() -
        new Date(createArg.scheduledStartTime).getTime();
      expect(durationMs).toBe(3 * 60 * 60 * 1000);
    });

    it('returns null when settings is null', () => {
      const handlerNoSettings = new EventHandler(mockClient, db, null);
      // guild_id would be '' so guilds.cache.get returns undefined
      mockClient.guilds.cache.get.mockReturnValue(null);
      return expect(
        handlerNoSettings.createDiscordEvent(makeEventData(), mockMessage as never)
      ).resolves.toBeNull();
    });
  });

  describe('deleteDiscordEvent — extended', () => {
    it('returns false when event.delete() throws', async () => {
      const mockEvent = { delete: vi.fn().mockRejectedValue(new Error('Forbidden')) };
      mockGuild.scheduledEvents.fetch.mockResolvedValue(mockEvent);

      const result = await handler.deleteDiscordEvent('ev-delete-throws');
      expect(result).toBe(false);
    });

    it('returns true when event is deleted successfully', async () => {
      const mockEvent = { delete: vi.fn().mockResolvedValue(undefined) };
      mockGuild.scheduledEvents.fetch.mockResolvedValue(mockEvent);

      const result = await handler.deleteDiscordEvent('ev-ok');
      expect(result).toBe(true);
    });

    it('returns false when fetch returns null', async () => {
      mockGuild.scheduledEvents.fetch.mockResolvedValue(null);
      const result = await handler.deleteDiscordEvent('ev-null');
      expect(result).toBe(false);
    });
  });

  describe('updateSettings', () => {
    it('can update settings to null', () => {
      expect(() => handler.updateSettings(null)).not.toThrow();
    });

    it('can update settings to a new object', () => {
      expect(() =>
        handler.updateSettings({ guild_id: 'new-guild', event_duration_minutes: 30 } as never)
      ).not.toThrow();
    });
  });
});
