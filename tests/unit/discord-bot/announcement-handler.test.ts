import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { mockDiscordClient, resetDiscordMocks, createMockChannel } from '../../mocks/discord';
import { getTestDb } from '../../utils/test-db';
import { seedBasicTestData, createMatch } from '../../utils/fixtures';

// Mock the logger to prevent database access during import
vi.mock('../../../src/lib/logger/server', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    critical: vi.fn(),
  },
}));

// Mock discord.js
vi.mock('discord.js', () => ({
  Client: vi.fn(() => mockDiscordClient),
  EmbedBuilder: vi.fn().mockImplementation(function(this: any) {
    this.data = { fields: [] };
    this.setTitle = vi.fn().mockReturnThis();
    this.setDescription = vi.fn().mockReturnThis();
    this.setColor = vi.fn().mockReturnThis();
    this.setTimestamp = vi.fn().mockReturnThis();
    this.setFooter = vi.fn().mockReturnThis();
    this.addFields = vi.fn(function(this: any, ...fields: any[]) {
      this.data.fields = this.data.fields || [];
      this.data.fields.push(...fields);
      return this;
    });
    this.setImage = vi.fn().mockReturnThis();
    return this;
  }),
  AttachmentBuilder: vi.fn().mockImplementation((source, options) => ({
    source,
    name: options?.name || 'attachment.png'
  })),
  ButtonBuilder: vi.fn().mockImplementation(function(this: any) {
    this.setCustomId = vi.fn().mockReturnThis();
    this.setLabel = vi.fn().mockReturnThis();
    this.setStyle = vi.fn().mockReturnThis();
    return this;
  }),
  ActionRowBuilder: vi.fn().mockImplementation(function(this: any) {
    this.addComponents = vi.fn().mockReturnThis();
    return this;
  }),
  ButtonStyle: { Primary: 1 }
}));

// Mock fs for image loading
vi.mock('fs', () => {
  return {
    default: {
      existsSync: vi.fn().mockReturnValue(false),
      promises: {
        readFile: vi.fn().mockResolvedValue(Buffer.from('fake-image-data'))
      }
    },
    existsSync: vi.fn().mockReturnValue(false),
    promises: {
      readFile: vi.fn().mockResolvedValue(Buffer.from('fake-image-data'))
    }
  };
});

// Import AnnouncementHandler dynamically in tests
let AnnouncementHandler: any;

describe('AnnouncementHandler', () => {
  let announcementHandler: any;
  let db: any;
  let game: any;
  let mode: any;

  beforeAll(async () => {
    // Dynamically import AnnouncementHandler AFTER mocks are set up
    const handlerModule = await import('../../../processes/discord-bot/modules/announcement-handler');
    AnnouncementHandler = handlerModule.AnnouncementHandler;
  });

  beforeEach(async () => {
    resetDiscordMocks();
    db = getTestDb();
    const testData = await seedBasicTestData();
    game = testData.game;
    mode = testData.mode;

    // Insert Discord settings first (required for foreign key)
    await db.run(`
      INSERT INTO discord_settings (guild_id, bot_token, announcements_channel_id)
      VALUES (?, ?, ?)
    `, ['guild-123', 'test-bot-token', 'channel-123']);

    // Add discord_channels for announcements
    await db.run(`
      INSERT INTO discord_channels (id, guild_id, discord_channel_id, name, channel_name, type, channel_type, send_announcements)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, ['channel-1', 'guild-123', 'channel-123', 'announcements', 'announcements', 0, 'text', 1]);

    const settings = {
      guild_id: 'guild-123',
      announcement_channel_id: 'channel-123',
      mention_everyone: false,
      announcement_role_id: null
    };

    announcementHandler = new AnnouncementHandler(
      mockDiscordClient as any,
      db,
      settings as any
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('postEventAnnouncement', () => {
    it('should post event announcement to configured channels', async () => {
      const mockChannel = createMockChannel();
      mockDiscordClient.channels.fetch.mockResolvedValue(mockChannel);

      const eventData = {
        id: 'match-123',
        name: 'Test Match',
        description: 'A test match',
        game_id: game.id,
        type: 'competitive' as const,
        maps: [],
        max_participants: 10,
        guild_id: 'guild-123'
      };

      const result = await announcementHandler.postEventAnnouncement(eventData);

      expect(result).toBeTruthy();
      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('mainMessage');
      expect(mockChannel.send).toHaveBeenCalledTimes(1);
    });

    it('should include signup button for non-tournament matches', async () => {
      const match = await createMatch(game.id, mode.id);
      const mockChannel = createMockChannel();
      mockDiscordClient.channels.fetch.mockResolvedValue(mockChannel);

      const eventData = {
        id: match.id,
        name: 'Regular Match',
        description: 'A regular match',
        game_id: game.id,
        type: 'competitive' as const,
        maps: [],
        max_participants: 10,
        guild_id: 'guild-123'
      };

      await announcementHandler.postEventAnnouncement(eventData);

      expect(mockChannel.send).toHaveBeenCalledTimes(1);
      const sendCall = mockChannel.send.mock.calls[0][0];
      expect(sendCall.components).toHaveLength(1); // Should have signup button
    });

    it('should not include signup button for tournament matches', async () => {
      // Create tournament
      await db.run(`
        INSERT INTO tournaments (id, name, game_id, format, status, rounds_per_match, created_at)
        VALUES (?, 'Test Tournament', ?, 'single-elimination', 'created', 3, datetime('now'))
      `, ['tournament-1', game.id]);

      // Create tournament match
      const match = await createMatch(game.id, mode.id);
      await db.run(`UPDATE matches SET tournament_id = ? WHERE id = ?`, ['tournament-1', match.id]);

      const mockChannel = createMockChannel();
      mockDiscordClient.channels.fetch.mockResolvedValue(mockChannel);

      const eventData = {
        id: match.id,
        name: 'Tournament Match',
        description: 'A tournament match',
        game_id: game.id,
        type: 'competitive' as const,
        maps: [],
        max_participants: 10,
        guild_id: 'guild-123'
      };

      await announcementHandler.postEventAnnouncement(eventData);

      expect(mockChannel.send).toHaveBeenCalledTimes(1);
      const sendCall = mockChannel.send.mock.calls[0][0];
      expect(sendCall.components).toHaveLength(0); // No signup button
    });

    it('should handle missing channels gracefully', async () => {
      mockDiscordClient.channels.fetch.mockResolvedValue(null);

      const eventData = {
        id: 'match-456',
        name: 'Test Match',
        description: 'A test match',
        game_id: game.id,
        type: 'casual' as const,
        maps: [],
        max_participants: 10,
        guild_id: 'guild-123'
      };

      const result = await announcementHandler.postEventAnnouncement(eventData);

      expect(result).toBe(false);
    });

    it('should include mention text when configured', async () => {
      const settings = {
        guild_id: 'guild-123',
        announcement_channel_id: 'channel-123',
        mention_everyone: true,
        announcement_role_id: null
      };

      announcementHandler.updateSettings(settings as any);

      const mockChannel = createMockChannel();
      mockDiscordClient.channels.fetch.mockResolvedValue(mockChannel);

      const eventData = {
        id: 'match-789',
        name: 'Important Match',
        description: 'An important match',
        game_id: game.id,
        type: 'competitive' as const,
        maps: [],
        max_participants: 10,
        guild_id: 'guild-123'
      };

      await announcementHandler.postEventAnnouncement(eventData);

      const sendCall = mockChannel.send.mock.calls[0][0];
      expect(sendCall.content).toBe('@everyone');
    });
  });

  describe('createMapsThread', () => {
    it('should create a thread for maps', async () => {
      const mockMessage = {
        id: 'message-123',
        startThread: vi.fn().mockResolvedValue({
          id: 'thread-123',
          send: vi.fn().mockResolvedValue({ id: 'thread-msg-123' })
        })
      };

      const maps = ['map-1', 'map-2'];

      const thread = await announcementHandler.createMapsThread(
        mockMessage as any,
        'Test Event',
        game.id,
        maps,
        'match-123'
      );

      expect(thread).toBeTruthy();
      expect(thread?.id).toBe('thread-123');
      expect(mockMessage.startThread).toHaveBeenCalledWith({
        name: 'Test Event Maps',
        autoArchiveDuration: 1440,
        reason: 'Map details for event'
      });
    });

    it('should handle errors when creating thread', async () => {
      const mockMessage = {
        id: 'message-123',
        startThread: vi.fn().mockRejectedValue(new Error('Thread creation failed'))
      };

      const maps = ['map-1'];

      const thread = await announcementHandler.createMapsThread(
        mockMessage as any,
        'Test Event',
        game.id,
        maps
      );

      expect(thread).toBeNull();
    });
  });

  describe('postTimedReminder', () => {
    it('should post timed reminder to reminder channels', async () => {
      // Add reminder channel
      await db.run(`
        INSERT INTO discord_channels (id, guild_id, discord_channel_id, name, channel_name, type, channel_type, send_reminders)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, ['reminder-channel-1', 'guild-123', 'reminder-channel-123', 'reminders', 'reminders', 0, 'text', 1]);

      const mockChannel = createMockChannel();
      mockDiscordClient.channels.fetch.mockResolvedValue(mockChannel);

      const match = await createMatch(game.id, mode.id, {
        start_date: new Date(Date.now() + 3600000).toISOString() // 1 hour from now
      });

      const eventData = {
        id: match.id,
        name: 'Test Match',
        description: 'A test match',
        game_id: game.id,
        game_name: 'Test Game',
        start_date: new Date(Date.now() + 3600000).toISOString(),
        _timingInfo: { value: 60, unit: 'minutes' as const }
      };

      const result = await announcementHandler.postTimedReminder(eventData);

      expect(result).toBeTruthy();
      expect(result).toHaveProperty('success', true);
      expect(mockChannel.send).toHaveBeenCalled();
    });

    it('should not send reminder when no channels configured', async () => {
      // Remove reminder channels
      await db.run(`DELETE FROM discord_channels WHERE send_reminders = 1`);

      const eventData = {
        id: 'match-123',
        name: 'Test Match',
        description: 'A test match',
        game_id: game.id,
        start_date: new Date().toISOString(),
        _timingInfo: { value: 30, unit: 'minutes' as const }
      };

      const result = await announcementHandler.postTimedReminder(eventData);

      expect(result).toBe(false);
    });
  });

  describe('postMatchStartAnnouncement', () => {
    it('should post match start announcement', async () => {
      // Add match_start channel
      await db.run(`
        INSERT INTO discord_channels (id, guild_id, discord_channel_id, name, channel_name, type, channel_type, send_match_start)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, ['match-start-channel-1', 'guild-123', 'match-start-channel-123', 'match-start', 'match-start', 0, 'text', 1]);

      const mockChannel = createMockChannel();
      mockDiscordClient.channels.fetch.mockResolvedValue(mockChannel);

      const match = await createMatch(game.id, mode.id);

      const eventData = {
        id: match.id,
        name: 'Test Match',
        description: 'Match is starting',
        game_id: game.id,
        type: 'competitive' as const,
        maps: [],
        max_participants: 10,
        guild_id: 'guild-123'
      };

      const result = await announcementHandler.postMatchStartAnnouncement(eventData);

      expect(result).toBeTruthy();
      expect(result).toHaveProperty('success', true);
      expect(mockChannel.send).toHaveBeenCalled();
    });
  });

  describe('postMapScoreNotification', () => {
    it('should post map score notification', async () => {
      // Add match_start channel (used for live updates)
      await db.run(`
        INSERT INTO discord_channels (id, guild_id, discord_channel_id, name, channel_name, type, channel_type, send_match_start)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, ['live-channel-1', 'guild-123', 'live-channel-123', 'live-updates', 'live-updates', 0, 'text', 1]);

      const mockChannel = createMockChannel();
      mockDiscordClient.channels.fetch.mockResolvedValue(mockChannel);

      const match = await createMatch(game.id, mode.id);

      const scoreData = {
        matchId: match.id,
        matchName: 'Test Match',
        gameId: game.id,
        gameNumber: 1,
        mapId: 'map-1',
        winner: 'team1' as const,
        winningTeamName: 'Blue Team',
        winningPlayers: ['<@user1>', '<@user2>']
      };

      const result = await announcementHandler.postMapScoreNotification(scoreData);

      expect(result).toBeTruthy();
      expect(result).toHaveProperty('success', true);
      expect(mockChannel.send).toHaveBeenCalled();
    });
  });

  describe('postMatchWinnerNotification', () => {
    it('should post match winner notification', async () => {
      // Add live update channel
      await db.run(`
        INSERT INTO discord_channels (id, guild_id, discord_channel_id, name, channel_name, type, channel_type, send_match_start)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, ['live-channel-2', 'guild-123', 'live-channel-456', 'live-updates', 'live-updates', 0, 'text', 1]);

      const mockChannel = createMockChannel();
      mockDiscordClient.channels.fetch.mockResolvedValue(mockChannel);

      const match = await createMatch(game.id, mode.id);

      const winnerData = {
        matchId: match.id,
        matchName: 'Test Match',
        gameId: game.id,
        winner: 'team1' as const,
        winningTeamName: 'Blue Team',
        winningPlayers: ['<@user1>', '<@user2>'],
        team1Score: 3,
        team2Score: 1,
        totalMaps: 4
      };

      const result = await announcementHandler.postMatchWinnerNotification(winnerData);

      expect(result).toBeTruthy();
      expect(result).toHaveProperty('success', true);
      expect(mockChannel.send).toHaveBeenCalled();
    });

    it('should handle tie scenarios', async () => {
      await db.run(`
        INSERT INTO discord_channels (id, guild_id, discord_channel_id, name, channel_name, type, channel_type, send_match_start)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, ['live-channel-3', 'guild-123', 'live-channel-789', 'live-updates', 'live-updates', 0, 'text', 1]);

      const mockChannel = createMockChannel();
      mockDiscordClient.channels.fetch.mockResolvedValue(mockChannel);

      const match = await createMatch(game.id, mode.id);

      const winnerData = {
        matchId: match.id,
        matchName: 'Test Match',
        gameId: game.id,
        winner: 'tie' as const,
        winningTeamName: '',
        winningPlayers: [],
        team1Score: 2,
        team2Score: 2,
        totalMaps: 4
      };

      const result = await announcementHandler.postMatchWinnerNotification(winnerData);

      expect(result).toBeTruthy();
    });
  });

  describe('postTournamentWinnerNotification', () => {
    it('should post tournament winner notification', async () => {
      await db.run(`
        INSERT INTO discord_channels (id, guild_id, discord_channel_id, name, channel_name, type, channel_type, send_match_start)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, ['live-channel-4', 'guild-123', 'live-channel-999', 'live-updates', 'live-updates', 0, 'text', 1]);

      const mockChannel = createMockChannel();
      mockDiscordClient.channels.fetch.mockResolvedValue(mockChannel);

      const tournamentData = {
        tournamentId: 'tournament-1',
        tournamentName: 'Test Tournament',
        gameId: game.id,
        winner: 'team-1',
        winningTeamName: 'Champions',
        winningPlayers: ['<@user1>', '<@user2>', '<@user3>'],
        format: 'single-elimination' as const,
        totalParticipants: 8
      };

      const result = await announcementHandler.postTournamentWinnerNotification(tournamentData);

      expect(result).toBeTruthy();
      expect(mockChannel.send).toHaveBeenCalled();
    });
  });

  describe('postHealthAlert', () => {
    it('should post critical health alerts', async () => {
      await db.run(`
        INSERT INTO discord_channels (id, guild_id, discord_channel_id, name, channel_name, type, channel_type, send_health_alerts)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, ['health-channel-1', 'guild-123', 'health-channel-123', 'health-alerts', 'health-alerts', 0, 'text', 1]);

      const mockChannel = createMockChannel();
      mockDiscordClient.channels.fetch.mockResolvedValue(mockChannel);

      await announcementHandler.postHealthAlert({
        severity: 'critical',
        title: 'Database Connection Lost',
        description: 'Unable to connect to the database'
      });

      expect(mockChannel.send).toHaveBeenCalled();
    });

    it('should post warning health alerts', async () => {
      await db.run(`
        INSERT INTO discord_channels (id, guild_id, discord_channel_id, name, channel_name, type, channel_type, send_health_alerts)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, ['health-channel-2', 'guild-123', 'health-channel-456', 'health-alerts', 'health-alerts', 0, 'text', 1]);

      const mockChannel = createMockChannel();
      mockDiscordClient.channels.fetch.mockResolvedValue(mockChannel);

      await announcementHandler.postHealthAlert({
        severity: 'warning',
        title: 'High Memory Usage',
        description: 'Memory usage is at 85%'
      });

      expect(mockChannel.send).toHaveBeenCalled();
    });
  });
});
