import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { mockDiscordClient, resetDiscordMocks, createMockChannel } from '../../mocks/discord';
import { getPgTestDb, setupPgTestFile } from '../../utils/pg-test-db';
import { seedBasicTestData, createMatch, createDiscordChannel, createDiscordSettings, createTournament } from '../../utils/pg-fixtures';
import { eq } from 'drizzle-orm';
import { discordChannels, matches } from '../../../lib/db/schema';

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

setupPgTestFile();

describe('AnnouncementHandler', () => {
  let announcementHandler: any;
  let game: any;
  let mode: any;

  beforeAll(async () => {
    // Dynamically import AnnouncementHandler AFTER mocks are set up
    const handlerModule = await import('../../../processes/discord-bot/modules/announcement-handler');
    AnnouncementHandler = handlerModule.AnnouncementHandler;
  });

  beforeEach(async () => {
    resetDiscordMocks();
    const testData = await seedBasicTestData();
    game = testData.game;
    mode = testData.mode;

    // Insert Discord settings first (required for foreign key)
    await createDiscordSettings({ guild_id: 'guild-123', bot_token: 'test-bot-token', announcements_channel_id: 'channel-123' });

    // Add discord_channels for announcements
    await createDiscordChannel({ id: 'channel-1', guild_id: 'guild-123', discord_channel_id: 'channel-123', name: 'announcements', channel_name: 'announcements', send_announcements: true });

    const settings = {
      guild_id: 'guild-123',
      announcement_channel_id: 'channel-123',
      mention_everyone: false,
      announcement_role_id: null
    };

    announcementHandler = new AnnouncementHandler(
      mockDiscordClient as any,
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
      await createTournament(game.id, { id: 'tournament-1' });

      // Create tournament match
      const match = await createMatch(game.id, mode.id);
      await getPgTestDb().update(matches).set({ tournament_id: 'tournament-1' }).where(eq(matches.id, match.id));

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
      await createDiscordChannel({ id: 'reminder-channel-1', guild_id: 'guild-123', discord_channel_id: 'reminder-channel-123', name: 'reminders', channel_name: 'reminders', send_reminders: true });

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
      await getPgTestDb().delete(discordChannels).where(eq(discordChannels.send_reminders, true));

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
      await createDiscordChannel({ id: 'match-start-channel-1', guild_id: 'guild-123', discord_channel_id: 'match-start-channel-123', name: 'match-start', channel_name: 'match-start', send_match_start: true });

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

      expect(result).toHaveProperty('success', true);
      expect(mockChannel.send).toHaveBeenCalled();
    });
  });

  describe('postMapScoreNotification', () => {
    it('should post map score notification', async () => {
      // Add match_start channel (used for live updates)
      await createDiscordChannel({ id: 'live-channel-1', guild_id: 'guild-123', discord_channel_id: 'live-channel-123', name: 'live-updates', channel_name: 'live-updates', send_match_start: true });

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

      expect(result).toHaveProperty('success', true);
      expect(mockChannel.send).toHaveBeenCalled();
    });
  });

  describe('postMatchWinnerNotification', () => {
    it('should post match winner notification', async () => {
      // Add live update channel
      await createDiscordChannel({ id: 'live-channel-2', guild_id: 'guild-123', discord_channel_id: 'live-channel-456', name: 'live-updates', channel_name: 'live-updates', send_match_start: true });

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

      expect(result).toHaveProperty('success', true);
      expect(mockChannel.send).toHaveBeenCalled();
    });

    it('should handle tie scenarios', async () => {
      await createDiscordChannel({ id: 'live-channel-3', guild_id: 'guild-123', discord_channel_id: 'live-channel-789', name: 'live-updates', channel_name: 'live-updates', send_match_start: true });

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

      expect(result).toHaveProperty('success', true);
      expect(mockChannel.send).toHaveBeenCalled();
    });
  });

  describe('winner embeds for N-team / FFA / Position results', () => {
    const baseWinner = {
      matchName: 'Big Match',
      winningPlayers: ['<@u1>'],
      team1Score: 0,
      team2Score: 0,
      totalMaps: 3
    };

    it("uses winning_team_name for a 'team' winner and omits the scoreline", async () => {
      const match = await createMatch(game.id, mode.id);
      const { embed } = await announcementHandler.createMatchWinnerEmbed({
        ...baseWinner, matchId: match.id, gameId: game.id, winner: 'team', winningTeamName: 'Gold Team'
      });
      expect(embed.setTitle).toHaveBeenCalledWith(expect.stringContaining('Gold Team Wins'));
      const names = embed.data.fields.flat().map((f: any) => f.name);
      expect(names).not.toContain('📊 Final Score');
    });

    it("renders 'participant' winners without an X - Y scoreline", async () => {
      const match = await createMatch(game.id, mode.id);
      const { embed } = await announcementHandler.createMatchWinnerEmbed({
        ...baseWinner, matchId: match.id, gameId: game.id, winner: 'participant', winningTeamName: 'Speedy'
      });
      expect(embed.setTitle).toHaveBeenCalledWith(expect.stringContaining('Speedy Wins'));
      expect(embed.setDescription).toHaveBeenCalledWith(expect.stringContaining('Winner: **Speedy**'));
      const names = embed.data.fields.flat().map((f: any) => f.name);
      expect(names).not.toContain('📊 Final Score');
    });

    it('keeps the scoreline and tie wording for 2-team results', async () => {
      const match = await createMatch(game.id, mode.id);
      const { embed } = await announcementHandler.createMatchWinnerEmbed({
        ...baseWinner, matchId: match.id, gameId: game.id, winner: 'tie', winningTeamName: '', team1Score: 2, team2Score: 2
      });
      expect(embed.setTitle).toHaveBeenCalledWith(expect.stringContaining('Match Tied'));
      const names = embed.data.fields.flat().map((f: any) => f.name);
      expect(names).toContain('📊 Final Score');
    });

    it('renders many participants as chunked compact fields within the 25-field cap', () => {
      const embed: any = { data: { fields: [{}, {}, {}] }, addFields: vi.fn(function(this: any, f: any[]) { this.data.fields.push(...f); return this; }) };
      const teams = Array.from({ length: 60 }, (_, i) => ({
        team_name: `Player ${i}`,
        participants: [{ username: `a-rather-long-participant-name-${i}` }]
      }));
      announcementHandler.addCompactParticipantFields(embed, teams, false);
      const added = embed.data.fields.slice(3);
      expect(added.length).toBeGreaterThan(1);
      expect(embed.data.fields.length).toBeLessThanOrEqual(23);
      for (const f of added) expect(f.value.length).toBeLessThanOrEqual(1024);
      expect(added.some((f: any) => /[🔵🔴]/u.test(f.name))).toBe(false);
    });
  });

  describe('postTournamentWinnerNotification', () => {
    it('should post tournament winner notification', async () => {
      await createDiscordChannel({ id: 'live-channel-4', guild_id: 'guild-123', discord_channel_id: 'live-channel-999', name: 'live-updates', channel_name: 'live-updates', send_match_start: true });

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

      expect(result).toHaveProperty('success', true);
      expect(mockChannel.send).toHaveBeenCalled();
    });
  });

  describe('postHealthAlert', () => {
    it('should post critical health alerts', async () => {
      await createDiscordChannel({ id: 'health-channel-1', guild_id: 'guild-123', discord_channel_id: 'health-channel-123', name: 'health-alerts', channel_name: 'health-alerts', send_health_alerts: true });

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
      await createDiscordChannel({ id: 'health-channel-2', guild_id: 'guild-123', discord_channel_id: 'health-channel-456', name: 'health-alerts', channel_name: 'health-alerts', send_health_alerts: true });

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
