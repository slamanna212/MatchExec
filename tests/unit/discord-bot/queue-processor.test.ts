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

// Mock the discord.js module
// Create a mock EmbedBuilder class with static 'from' method
const createMockEmbed = () => ({
  setTitle: vi.fn().mockReturnThis(),
  setDescription: vi.fn().mockReturnThis(),
  setColor: vi.fn().mockReturnThis(),
  setTimestamp: vi.fn().mockReturnThis(),
  setFooter: vi.fn().mockReturnThis(),
  addFields: vi.fn().mockReturnThis(),
  setImage: vi.fn().mockReturnThis(),
  data: { fields: [] }
});

const MockEmbedBuilder = Object.assign(
  vi.fn().mockImplementation(createMockEmbed),
  { from: vi.fn().mockImplementation(() => createMockEmbed()) }
);

vi.mock('discord.js', () => ({
  Client: vi.fn(() => mockDiscordClient),
  GatewayIntentBits: { Guilds: 1, GuildMessages: 2 },
  Events: { ClientReady: 'ready' },
  EmbedBuilder: MockEmbedBuilder,
  AttachmentBuilder: vi.fn().mockImplementation(() => ({})),
  ButtonBuilder: vi.fn().mockImplementation(() => ({
    setCustomId: vi.fn().mockReturnThis(),
    setLabel: vi.fn().mockReturnThis(),
    setStyle: vi.fn().mockReturnThis()
  })),
  ActionRowBuilder: vi.fn().mockImplementation(() => ({
    addComponents: vi.fn().mockReturnThis()
  })),
  ButtonStyle: { Primary: 1 }
}));

// Import QueueProcessor dynamically in tests
let QueueProcessor: any;

describe('QueueProcessor', () => {
  let queueProcessor: any;
  let db: any;
  let game: any;
  let mode: any;
  let mockAnnouncementHandler: any;
  let mockReminderHandler: any;
  let mockEventHandler: any;
  let mockVoiceHandler: any;

  beforeAll(async () => {
    // Dynamically import QueueProcessor AFTER mocks are set up
    const queueModule = await import('../../../processes/discord-bot/modules/queue-processor');
    QueueProcessor = queueModule.QueueProcessor;
  });

  beforeEach(async () => {
    resetDiscordMocks();
    db = getTestDb();
    const testData = await seedBasicTestData();
    game = testData.game;
    mode = testData.mode;

    // Insert Discord settings
    await db.run(`
      INSERT INTO discord_settings (guild_id, bot_token, announcements_channel_id)
      VALUES (?, ?, ?)
    `, ['guild-123', 'test-bot-token', 'channel-123']);

    // Create mock handlers
    mockAnnouncementHandler = {
      postEventAnnouncement: vi.fn().mockResolvedValue({ success: true, mainMessage: { id: 'msg-123', channelId: 'channel-123' } }),
      postTimedReminder: vi.fn().mockResolvedValue({ success: true }),
      postMatchStartAnnouncement: vi.fn().mockResolvedValue({ success: true }),
      createMapsThread: vi.fn().mockResolvedValue({ id: 'thread-123' }),
      postMapScoreNotification: vi.fn().mockResolvedValue({ success: true }),
      postMatchWinnerNotification: vi.fn().mockResolvedValue({ success: true }),
      postTournamentWinnerNotification: vi.fn().mockResolvedValue({ success: true })
    };

    mockReminderHandler = {
      sendPlayerReminders: vi.fn().mockResolvedValue(true),
      sendMapCodePMs: vi.fn().mockResolvedValue(true)
    };

    mockEventHandler = {
      createDiscordEvent: vi.fn().mockResolvedValue('event-123'),
      deleteDiscordEvent: vi.fn().mockResolvedValue(undefined)
    };

    mockVoiceHandler = {
      playTeamAnnouncements: vi.fn().mockResolvedValue({ success: true }),
      updateFirstTeam: vi.fn().mockResolvedValue(undefined),
      testVoiceLineForUser: vi.fn().mockResolvedValue({ success: true, channelId: 'voice-123' })
    };

    queueProcessor = new QueueProcessor(
      mockDiscordClient as any,
      db,
      { guild_id: 'guild-123' } as any,
      mockAnnouncementHandler as any,
      mockReminderHandler as any,
      mockEventHandler as any,
      mockVoiceHandler as any,
      null
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('processAnnouncementQueue', () => {
    it('should process pending announcements', async () => {
      const match = await createMatch(game.id, mode.id);

      // Insert announcement queue entry
      await db.run(`
        INSERT INTO discord_announcement_queue (id, match_id, status, created_at)
        VALUES (?, ?, 'pending', datetime('now'))
      `, ['announcement-1', match.id]);

      await queueProcessor.processAnnouncementQueue();

      // Check that announcement was processed
      const announcement = await db.get(`
        SELECT status FROM discord_announcement_queue WHERE id = ?
      `, ['announcement-1']);

      expect(announcement.status).toBe('completed');
    });

    it('should mark entries as completed after processing', async () => {
      const match = await createMatch(game.id, mode.id);

      await db.run(`
        INSERT INTO discord_announcement_queue (id, match_id, status, created_at)
        VALUES (?, ?, 'pending', datetime('now'))
      `, ['announcement-2', match.id]);

      await queueProcessor.processAnnouncementQueue();

      const announcement = await db.get(`
        SELECT status, posted_at FROM discord_announcement_queue WHERE id = ?
      `, ['announcement-2']);

      expect(announcement.status).toBe('completed');
      expect(announcement.posted_at).not.toBeNull();
    });

    it('should handle errors gracefully', async () => {
      const match = await createMatch(game.id, mode.id);

      // Make the announcement handler throw an error
      mockAnnouncementHandler.postEventAnnouncement.mockRejectedValue(new Error('Test error'));

      await db.run(`
        INSERT INTO discord_announcement_queue (id, match_id, status, created_at)
        VALUES (?, ?, 'pending', datetime('now'))
      `, ['announcement-3', match.id]);

      // This should not throw
      await expect(queueProcessor.processAnnouncementQueue()).resolves.not.toThrow();

      // Check that announcement was marked as failed
      const announcement = await db.get(`
        SELECT status FROM discord_announcement_queue WHERE id = ?
      `, ['announcement-3']);

      expect(announcement.status).toBe('failed');
    });

    it('should skip already-processed entries', async () => {
      const match = await createMatch(game.id, mode.id);

      // Create a completed announcement
      await db.run(`
        INSERT INTO discord_announcement_queue (id, match_id, status, created_at, posted_at)
        VALUES (?, ?, 'completed', datetime('now'), datetime('now'))
      `, ['announcement-4', match.id]);

      await queueProcessor.processAnnouncementQueue();

      // Should still be completed (not re-processed)
      const announcement = await db.get(`
        SELECT status FROM discord_announcement_queue WHERE id = ?
      `, ['announcement-4']);

      expect(announcement.status).toBe('completed');
    });
  });

  describe('processVoiceAnnouncementQueue', () => {
    it('should play voice announcements', async () => {
      const match = await createMatch(game.id, mode.id);

      await db.run(`
        INSERT INTO discord_voice_announcement_queue
        (id, match_id, announcement_type, blue_team_voice_channel, red_team_voice_channel, first_team, status, created_at, retry_count)
        VALUES (?, ?, 'welcome', 'voice-1', 'voice-2', 'blue', 'pending', datetime('now', '-1 minute'), 0)
      `, ['voice-announcement-1', match.id]);

      await queueProcessor.processVoiceAnnouncementQueue();

      const announcement = await db.get(`
        SELECT status FROM discord_voice_announcement_queue WHERE id = ?
      `, ['voice-announcement-1']);

      expect(announcement.status).toBe('completed');
    });

    it('should handle timeout and retry logic', async () => {
      const match = await createMatch(game.id, mode.id);

      // Make the voice handler fail on subsequent processing
      mockVoiceHandler.playTeamAnnouncements.mockResolvedValue({ success: false, message: 'Test failure' });

      // Create a voice announcement stuck in processing with timeout
      // Set created_at far in the past so the delay check passes
      await db.run(`
        INSERT INTO discord_voice_announcement_queue
        (id, match_id, announcement_type, blue_team_voice_channel, red_team_voice_channel, first_team, status, created_at, retry_count, timeout_at)
        VALUES (?, ?, 'welcome', 'voice-1', 'voice-2', 'blue', 'processing', datetime('now', '-5 minutes'), 1, datetime('now', '-3 minutes'))
      `, ['voice-announcement-timeout', match.id]);

      await queueProcessor.processVoiceAnnouncementQueue();

      const announcement = await db.get(`
        SELECT status, retry_count FROM discord_voice_announcement_queue WHERE id = ?
      `, ['voice-announcement-timeout']);

      // The timeout handling sets it to pending, then the pending processing picks it up
      // Since voiceHandler fails, it should be marked as failed
      expect(announcement.status).toBe('failed');
      expect(announcement.retry_count).toBe(2);
    });

    it('should fail after max retries', async () => {
      const match = await createMatch(game.id, mode.id);

      // Create a voice announcement that has reached max retries
      await db.run(`
        INSERT INTO discord_voice_announcement_queue
        (id, match_id, announcement_type, blue_team_voice_channel, red_team_voice_channel, first_team, status, created_at, retry_count, timeout_at)
        VALUES (?, ?, 'welcome', 'voice-1', 'voice-2', 'blue', 'processing', datetime('now', '-10 minutes'), 3, datetime('now', '-3 minutes'))
      `, ['voice-announcement-max-retry', match.id]);

      await queueProcessor.processVoiceAnnouncementQueue();

      const announcement = await db.get(`
        SELECT status FROM discord_voice_announcement_queue WHERE id = ?
      `, ['voice-announcement-max-retry']);

      expect(announcement.status).toBe('failed');
    });
  });

  describe('processReminderQueue', () => {
    it('should send DM reminders', async () => {
      const match = await createMatch(game.id, mode.id, { start_date: new Date().toISOString() });

      await db.run(`
        INSERT INTO discord_reminder_queue (id, match_id, reminder_type, minutes_before, reminder_time, scheduled_for, status, created_at)
        VALUES (?, ?, 'match_start', 10, datetime('now', '-1 minute'), datetime('now', '-1 minute'), 'pending', datetime('now'))
      `, ['reminder-1', match.id]);

      await queueProcessor.processReminderQueue();

      const reminder = await db.get(`
        SELECT status FROM discord_reminder_queue WHERE id = ?
      `, ['reminder-1']);

      expect(reminder.status).toBe('completed');
    });

    it('should not send reminders scheduled for the future', async () => {
      const match = await createMatch(game.id, mode.id);

      await db.run(`
        INSERT INTO discord_reminder_queue (id, match_id, reminder_type, minutes_before, reminder_time, scheduled_for, status, created_at)
        VALUES (?, ?, 'match_start', 60, datetime('now', '+1 hour'), datetime('now', '+1 hour'), 'pending', datetime('now'))
      `, ['reminder-future', match.id]);

      await queueProcessor.processReminderQueue();

      const reminder = await db.get(`
        SELECT status FROM discord_reminder_queue WHERE id = ?
      `, ['reminder-future']);

      // Should still be pending since time hasn't arrived
      expect(reminder.status).toBe('pending');
    });
  });

  describe('processPlayerReminderQueue', () => {
    it('should send player reminders when notifications enabled', async () => {
      const match = await createMatch(game.id, mode.id, {
        player_notifications: 1,
        start_date: new Date().toISOString()
      });

      await db.run(`
        INSERT INTO discord_player_reminder_queue (id, match_id, user_id, reminder_type, reminder_time, scheduled_for, status, created_at)
        VALUES (?, ?, 'user-123', 'player_dm', datetime('now', '-1 minute'), datetime('now', '-1 minute'), 'pending', datetime('now'))
      `, ['player-reminder-1', match.id]);

      await queueProcessor.processPlayerReminderQueue();

      const reminder = await db.get(`
        SELECT status FROM discord_player_reminder_queue WHERE id = ?
      `, ['player-reminder-1']);

      expect(reminder.status).toBe('completed');
    });

    it('should skip player reminders when notifications disabled', async () => {
      const match = await createMatch(game.id, mode.id, {
        player_notifications: 0
      });

      await db.run(`
        INSERT INTO discord_player_reminder_queue (id, match_id, user_id, reminder_type, reminder_time, scheduled_for, status, created_at)
        VALUES (?, ?, 'user-456', 'player_dm', datetime('now', '-1 minute'), datetime('now', '-1 minute'), 'pending', datetime('now'))
      `, ['player-reminder-disabled', match.id]);

      await queueProcessor.processPlayerReminderQueue();

      const reminder = await db.get(`
        SELECT status FROM discord_player_reminder_queue WHERE id = ?
      `, ['player-reminder-disabled']);

      // Should be completed but not actually sent
      expect(reminder.status).toBe('completed');
    });
  });

  describe('processDeletionQueue', () => {
    it('should delete Discord messages for match', async () => {
      const match = await createMatch(game.id, mode.id);

      // Create message tracking record
      await db.run(`
        INSERT INTO discord_match_messages (id, match_id, message_id, channel_id, message_type)
        VALUES (?, ?, ?, ?, 'announcement')
      `, ['msg-record-1', match.id, 'message-123', 'channel-123']);

      // Mock channel fetch
      const mockChannel = createMockChannel();
      mockDiscordClient.channels.fetch.mockResolvedValue(mockChannel);

      // Queue deletion
      await db.run(`
        INSERT INTO discord_deletion_queue (id, match_id, status, created_at)
        VALUES (?, ?, 'pending', datetime('now'))
      `, ['deletion-1', match.id]);

      await queueProcessor.processDeletionQueue();

      const deletion = await db.get(`
        SELECT status FROM discord_deletion_queue WHERE id = ?
      `, ['deletion-1']);

      expect(deletion.status).toBe('completed');

      // Check that message record was deleted
      const messageRecord = await db.get(`
        SELECT * FROM discord_match_messages WHERE id = ?
      `, ['msg-record-1']);

      expect(messageRecord).toBeUndefined();
    });
  });


  describe('processScoreNotificationQueue', () => {
    it('should post score notifications', async () => {
      const match = await createMatch(game.id, mode.id);

      await db.run(`
        INSERT INTO discord_score_notification_queue
        (id, match_id, game_id, map_id, game_number, winner, winning_team_name, winning_players, status, created_at)
        VALUES (?, ?, ?, 'map-1', 1, 'team1', 'Blue Team', '[]', 'pending', datetime('now'))
      `, ['score-notif-1', match.id, game.id]);

      await queueProcessor.processScoreNotificationQueue();

      const notification = await db.get(`
        SELECT status FROM discord_score_notification_queue WHERE id = ?
      `, ['score-notif-1']);

      expect(notification.status).toBe('completed');
    });
  });

  describe('processMapCodeQueue', () => {
    it('should send map code PMs to participants', async () => {
      const match = await createMatch(game.id, mode.id);

      await db.run(`
        INSERT INTO discord_map_code_queue (id, match_id, user_id, map_name, map_code, status, created_at)
        VALUES (?, ?, 'user-123', 'Test Map', 'TESTCODE123', 'pending', datetime('now'))
      `, ['map-code-1', match.id]);

      await queueProcessor.processMapCodeQueue();

      const mapCode = await db.get(`
        SELECT status FROM discord_map_code_queue WHERE id = ?
      `, ['map-code-1']);

      expect(mapCode.status).toBe('completed');
    });
  });

  describe('processMatchWinnerNotificationQueue', () => {
    it('should post match winner notification', async () => {
      const match = await createMatch(game.id, mode.id);

      await db.run(`
        INSERT INTO discord_match_winner_queue
        (id, match_id, match_name, game_id, winner, winning_team_name, winning_players, team1_score, team2_score, total_maps, status, created_at)
        VALUES (?, ?, 'Test Match', ?, 'team1', 'Blue Team', '[]', 3, 1, 4, 'pending', datetime('now'))
      `, ['winner-notif-1', match.id, game.id]);

      await queueProcessor.processMatchWinnerNotificationQueue();

      const notification = await db.get(`
        SELECT status FROM discord_match_winner_queue WHERE id = ?
      `, ['winner-notif-1']);

      expect(notification.status).toBe('completed');
    });
  });

  describe('processDiscordBotRequests', () => {
    it('should process voice channel creation requests', async () => {
      const match = await createMatch(game.id, mode.id);

      const requestData = {
        matchId: match.id,
        categoryId: 'category-123',
        blueChannelName: 'Blue Team',
        redChannelName: 'Red Team',
        isSingleTeam: false
      };

      await db.run(`
        INSERT INTO discord_bot_requests (id, type, data, status, created_at)
        VALUES (?, 'voice_channel_create', ?, 'pending', datetime('now'))
      `, ['bot-request-1', JSON.stringify(requestData)]);

      // Mock guild and channel creation
      const mockGuild = {
        channels: {
          create: vi.fn().mockResolvedValue({ id: 'new-channel-id' })
        }
      };
      mockDiscordClient.guilds.fetch.mockResolvedValue(mockGuild);

      await queueProcessor.processDiscordBotRequests();

      const request = await db.get(`
        SELECT status, result FROM discord_bot_requests WHERE id = ?
      `, ['bot-request-1']);

      expect(request.status).toBe('completed');
      const result = JSON.parse(request.result);
      expect(result.success).toBe(true);
    });

    it('should clean up old completed requests', async () => {
      // Create an old completed request (older than 1 hour)
      await db.run(`
        INSERT INTO discord_bot_requests (id, type, data, status, created_at, updated_at)
        VALUES (?, 'voice_test', '{}', 'completed', datetime('now', '-2 hours'), datetime('now', '-2 hours'))
      `, ['old-request']);

      await queueProcessor.processDiscordBotRequests();

      // Should be deleted
      const request = await db.get(`
        SELECT * FROM discord_bot_requests WHERE id = ?
      `, ['old-request']);

      expect(request).toBeUndefined();
    });
  });

  describe('processAllQueues', () => {
    it('should process all queue types in parallel', async () => {
      const match = await createMatch(game.id, mode.id, {
        start_date: new Date().toISOString(),
        player_notifications: 1
      });

      // Add entries to multiple queues
      await db.run(`
        INSERT INTO discord_announcement_queue (id, match_id, status, created_at)
        VALUES (?, ?, 'pending', datetime('now'))
      `, ['all-announcement', match.id]);

      await db.run(`
        INSERT INTO discord_reminder_queue (id, match_id, reminder_type, minutes_before, reminder_time, scheduled_for, status, created_at)
        VALUES (?, ?, 'match_start', 10, datetime('now', '-1 minute'), datetime('now', '-1 minute'), 'pending', datetime('now'))
      `, ['all-reminder', match.id]);

      await queueProcessor.processAllQueues();

      // Both should be completed
      const announcement = await db.get(`SELECT status FROM discord_announcement_queue WHERE id = ?`, ['all-announcement']);
      const reminder = await db.get(`SELECT status FROM discord_reminder_queue WHERE id = ?`, ['all-reminder']);

      expect(announcement.status).toBe('completed');
      expect(reminder.status).toBe('completed');
    });
  });
});
