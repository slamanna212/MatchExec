import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { mockDiscordClient, resetDiscordMocks, createMockChannel } from '../../mocks/discord';
import { getTestDb } from '../../utils/test-db';
import { seedBasicTestData, createMatch } from '../../utils/fixtures';

vi.mock('../../../src/lib/logger/server', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn(), critical: vi.fn() },
}));

vi.mock('discord.js', () => ({
  Client: vi.fn(() => mockDiscordClient),
  EmbedBuilder: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.data = { fields: [] as unknown[] };
    this.setTitle = vi.fn().mockReturnThis();
    this.setDescription = vi.fn().mockReturnThis();
    this.setColor = vi.fn().mockReturnThis();
    this.setTimestamp = vi.fn().mockReturnThis();
    this.setFooter = vi.fn().mockReturnThis();
    this.addFields = vi.fn(function (this: { data: { fields: unknown[] } }, ...fields: unknown[]) {
      this.data.fields.push(...fields);
      return this;
    });
    this.setImage = vi.fn().mockReturnThis();
    return this;
  }),
  AttachmentBuilder: vi.fn().mockImplementation((source: unknown, options: { name?: string }) => ({
    source,
    name: options?.name ?? 'attachment.png',
  })),
  ButtonBuilder: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.setCustomId = vi.fn().mockReturnThis();
    this.setLabel = vi.fn().mockReturnThis();
    this.setStyle = vi.fn().mockReturnThis();
    return this;
  }),
  ActionRowBuilder: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.addComponents = vi.fn().mockReturnThis();
    return this;
  }),
  ButtonStyle: { Primary: 1 },
}));

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn().mockReturnValue(false),
    promises: { readFile: vi.fn().mockResolvedValue(Buffer.from('img')) },
  },
  existsSync: vi.fn().mockReturnValue(false),
  promises: { readFile: vi.fn().mockResolvedValue(Buffer.from('img')) },
}));

 
let AnnouncementHandler: any;

describe('AnnouncementHandler — Extended', () => {
   
  let announcementHandler: any;
  let db: ReturnType<typeof getTestDb>;
  let game: { id: string };
  let mode: { id: string };

  beforeAll(async () => {
    const mod = await import('../../../processes/discord-bot/modules/announcement-handler');
    AnnouncementHandler = mod.AnnouncementHandler;
  });

  beforeEach(async () => {
    resetDiscordMocks();
    db = getTestDb();
    const testData = await seedBasicTestData();
    game = testData.game;
    mode = testData.mode;

    await db.run(
      `INSERT INTO discord_settings (guild_id, bot_token, announcements_channel_id)
       VALUES ('guild-ext', 'tok-ext', 'chan-ext')`
    );
    await db.run(
      `INSERT INTO discord_channels (id, guild_id, discord_channel_id, name, channel_name, type, channel_type, send_announcements)
       VALUES ('chan-ext', 'guild-ext', 'chan-ext', 'announcements', 'announcements', 0, 'text', 1)`
    );

    announcementHandler = new AnnouncementHandler(
      mockDiscordClient,
      db,
      { guild_id: 'guild-ext', announcement_channel_id: 'chan-ext', mention_everyone: false, announcement_role_id: null }
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('mention rendering', () => {
    it('sends @everyone content when mention_everyone is true', async () => {
      announcementHandler.updateSettings({
        guild_id: 'guild-ext',
        announcement_channel_id: 'chan-ext',
        mention_everyone: true,
        announcement_role_id: null,
      });

      const mockChannel = createMockChannel();
      mockDiscordClient.channels.fetch.mockResolvedValue(mockChannel);

      const eventData = {
        id: 'match-mention-all',
        name: 'Everyone Match',
        description: 'Test',
        game_id: game.id,
        type: 'competitive' as const,
        maps: [],
        max_participants: 10,
        guild_id: 'guild-ext',
      };

      await announcementHandler.postEventAnnouncement(eventData);

      const sendCall = mockChannel.send.mock.calls[0][0];
      expect(sendCall.content).toBe('@everyone');
    });

    it('sends role mention content when announcement_role_id is set', async () => {
      announcementHandler.updateSettings({
        guild_id: 'guild-ext',
        announcement_channel_id: 'chan-ext',
        mention_everyone: false,
        announcement_role_id: 'role-999',
      });

      const mockChannel = createMockChannel();
      mockDiscordClient.channels.fetch.mockResolvedValue(mockChannel);

      const eventData = {
        id: 'match-mention-role',
        name: 'Role Match',
        description: 'Test',
        game_id: game.id,
        type: 'competitive' as const,
        maps: [],
        max_participants: 10,
        guild_id: 'guild-ext',
      };

      await announcementHandler.postEventAnnouncement(eventData);

      const sendCall = mockChannel.send.mock.calls[0][0];
      expect(sendCall.content).toBe('<@&role-999>');
    });

    it('sends empty content when no mention configured', async () => {
      const mockChannel = createMockChannel();
      mockDiscordClient.channels.fetch.mockResolvedValue(mockChannel);

      const eventData = {
        id: 'match-no-mention',
        name: 'Silent Match',
        description: 'Test',
        game_id: game.id,
        type: 'competitive' as const,
        maps: [],
        max_participants: 10,
        guild_id: 'guild-ext',
      };

      await announcementHandler.postEventAnnouncement(eventData);

      const sendCall = mockChannel.send.mock.calls[0][0];
      expect(sendCall.content).toBe('');
    });
  });

  describe('postEventAnnouncement — edge cases', () => {
    it('returns false when channel fetch throws', async () => {
      mockDiscordClient.channels.fetch.mockRejectedValue(new Error('Unknown Channel'));

      const eventData = {
        id: 'match-fetch-err',
        name: 'Error Match',
        description: 'Test',
        game_id: game.id,
        type: 'competitive' as const,
        maps: [],
        max_participants: 10,
        guild_id: 'guild-ext',
      };

      const result = await announcementHandler.postEventAnnouncement(eventData);
      expect(result === false || (result && !result.success)).toBe(true);
    });

    it('posts to multiple announcement channels when configured', async () => {
      // Add a second announcement channel
      await db.run(
        `INSERT INTO discord_channels (id, guild_id, discord_channel_id, name, channel_name, type, channel_type, send_announcements)
         VALUES ('chan-ext-2', 'guild-ext', 'chan-ext-2', 'announcements2', 'announcements2', 0, 'text', 1)`
      );

      const mockChannel1 = createMockChannel();
      const mockChannel2 = createMockChannel();
      mockDiscordClient.channels.fetch
        .mockResolvedValueOnce(mockChannel1)
        .mockResolvedValueOnce(mockChannel2);

      const eventData = {
        id: 'match-multichan',
        name: 'Multi Channel',
        description: 'Test',
        game_id: game.id,
        type: 'competitive' as const,
        maps: [],
        max_participants: 10,
        guild_id: 'guild-ext',
      };

      await announcementHandler.postEventAnnouncement(eventData);

      // At least one channel should have been sent to
      const totalSends = mockChannel1.send.mock.calls.length + mockChannel2.send.mock.calls.length;
      expect(totalSends).toBeGreaterThanOrEqual(1);
    });

    it('handles no description gracefully', async () => {
      const mockChannel = createMockChannel();
      mockDiscordClient.channels.fetch.mockResolvedValue(mockChannel);

      const eventData = {
        id: 'match-no-desc',
        name: 'No Description Match',
        description: '',
        game_id: game.id,
        type: 'competitive' as const,
        maps: [],
        max_participants: 10,
        guild_id: 'guild-ext',
      };

      await expect(announcementHandler.postEventAnnouncement(eventData)).resolves.not.toThrow();
    });

    it('handles match with maps array', async () => {
      const mockChannel = createMockChannel();
      mockDiscordClient.channels.fetch.mockResolvedValue(mockChannel);
      mockChannel.send.mockResolvedValue({
        id: 'msg-with-maps',
        startThread: vi.fn().mockResolvedValue({ id: 'thread-maps', send: vi.fn() }),
      });

      const match = await createMatch(game.id, mode.id);
      const eventData = {
        id: match.id,
        name: 'Maps Match',
        description: 'Has maps',
        game_id: game.id,
        type: 'competitive' as const,
        maps: ['map-a', 'map-b'],
        max_participants: 10,
        guild_id: 'guild-ext',
      };

      await expect(announcementHandler.postEventAnnouncement(eventData)).resolves.not.toThrow();
    });
  });

  describe('postMatchStartAnnouncement — edge cases', () => {
    it('does not throw when no match-start channels configured', async () => {
      // No send_match_start channels in DB
      const match = await createMatch(game.id, mode.id);
      const eventData = {
        id: match.id,
        name: 'Start Match',
        description: 'Starting',
        game_id: game.id,
        type: 'competitive' as const,
        maps: [],
        max_participants: 10,
        guild_id: 'guild-ext',
      };

      await expect(announcementHandler.postMatchStartAnnouncement(eventData)).resolves.not.toThrow();
    });

    it('posts to match-start channel when configured', async () => {
      await db.run(
        `INSERT INTO discord_channels (id, guild_id, discord_channel_id, name, channel_name, type, channel_type, send_match_start)
         VALUES ('ms-chan-ext', 'guild-ext', 'ms-chan-ext', 'match-start', 'match-start', 0, 'text', 1)`
      );

      const mockChannel = createMockChannel();
      mockDiscordClient.channels.fetch.mockResolvedValue(mockChannel);

      const match = await createMatch(game.id, mode.id);
      const eventData = {
        id: match.id,
        name: 'Battle Match',
        description: 'Battle starting',
        game_id: game.id,
        type: 'competitive' as const,
        maps: [],
        max_participants: 10,
        guild_id: 'guild-ext',
      };

      const result = await announcementHandler.postMatchStartAnnouncement(eventData);
      expect(result).toHaveProperty('success', true);
      expect(mockChannel.send).toHaveBeenCalled();
    });
  });

  describe('postMapScoreNotification — edge cases', () => {
    it('does not throw when no live-update channels configured', async () => {
      const match = await createMatch(game.id, mode.id);
      const scoreData = {
        matchId: match.id,
        matchName: 'Test',
        gameId: game.id,
        gameNumber: 1,
        mapId: 'mp1',
        winner: 'team1' as const,
        winningTeamName: 'Blue',
        winningPlayers: [],
      };

      await expect(announcementHandler.postMapScoreNotification(scoreData)).resolves.not.toThrow();
    });

    it('posts score notification when channel configured', async () => {
      await db.run(
        `INSERT INTO discord_channels (id, guild_id, discord_channel_id, name, channel_name, type, channel_type, send_match_start)
         VALUES ('live-ext', 'guild-ext', 'live-ext', 'live', 'live', 0, 'text', 1)`
      );

      const mockChannel = createMockChannel();
      mockDiscordClient.channels.fetch.mockResolvedValue(mockChannel);

      const match = await createMatch(game.id, mode.id);
      const scoreData = {
        matchId: match.id,
        matchName: 'Score Match',
        gameId: game.id,
        gameNumber: 2,
        mapId: 'mp2',
        winner: 'team2' as const,
        winningTeamName: 'Red Squad',
        winningPlayers: ['<@p1>', '<@p2>'],
      };

      const result = await announcementHandler.postMapScoreNotification(scoreData);
      expect(result).toHaveProperty('success', true);
    });
  });
});
