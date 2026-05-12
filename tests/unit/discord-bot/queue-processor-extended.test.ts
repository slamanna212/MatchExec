import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { mockDiscordClient, resetDiscordMocks, createMockChannel } from '../../mocks/discord';
import { getTestDb } from '../../utils/test-db';
import { seedBasicTestData, createMatch } from '../../utils/fixtures';

vi.mock('../../../src/lib/logger/server', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn(), critical: vi.fn() },
}));

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
    setStyle: vi.fn().mockReturnThis(),
  })),
  ActionRowBuilder: vi.fn().mockImplementation(() => ({
    addComponents: vi.fn().mockReturnThis(),
  })),
  ButtonStyle: { Primary: 1 },
}));

 
let QueueProcessor: any;

describe('QueueProcessor — Extended', () => {
   
  let queueProcessor: any;
  let db: ReturnType<typeof getTestDb>;
  let game: { id: string };
  let mode: { id: string };
   
  let mockAnnouncementHandler: any;
   
  let mockReminderHandler: any;
   
  let mockEventHandler: any;
   
  let mockVoiceHandler: any;

  beforeAll(async () => {
    const mod = await import('../../../processes/discord-bot/modules/queue-processor');
    QueueProcessor = mod.QueueProcessor;
  });

  beforeEach(async () => {
    resetDiscordMocks();
    db = getTestDb();
    const testData = await seedBasicTestData();
    game = testData.game;
    mode = testData.mode;

    await db.run(
      `INSERT INTO discord_settings (guild_id, bot_token, announcements_channel_id)
       VALUES (?, ?, ?)`,
      ['guild-ext', 'tok-ext', 'chan-ext']
    );

    mockAnnouncementHandler = {
      postEventAnnouncement: vi.fn().mockResolvedValue({ success: true, mainMessage: { id: 'msg-ext', channelId: 'chan-ext' } }),
      postTimedReminder: vi.fn().mockResolvedValue({ success: true }),
      postMatchStartAnnouncement: vi.fn().mockResolvedValue({ success: true }),
      createMapsThread: vi.fn().mockResolvedValue({ id: 'thread-ext' }),
      postMapScoreNotification: vi.fn().mockResolvedValue({ success: true }),
      postMatchWinnerNotification: vi.fn().mockResolvedValue({ success: true }),
      postTournamentWinnerNotification: vi.fn().mockResolvedValue({ success: true }),
    };

    mockReminderHandler = {
      sendPlayerReminders: vi.fn().mockResolvedValue(true),
      sendMapCodePMs: vi.fn().mockResolvedValue(true),
    };

    mockEventHandler = {
      createDiscordEvent: vi.fn().mockResolvedValue('event-ext'),
      deleteDiscordEvent: vi.fn().mockResolvedValue(undefined),
    };

    mockVoiceHandler = {
      playTeamAnnouncements: vi.fn().mockResolvedValue({ success: true }),
      updateFirstTeam: vi.fn().mockResolvedValue(undefined),
      testVoiceLineForUser: vi.fn().mockResolvedValue({ success: true, channelId: 'voice-ext' }),
    };

     
    queueProcessor = new QueueProcessor(
      mockDiscordClient,
      db,
      { guild_id: 'guild-ext' },
      mockAnnouncementHandler,
      mockReminderHandler,
      mockEventHandler,
      mockVoiceHandler,
      null
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('processAnnouncementQueue — extended', () => {
    it('processes multiple pending announcements in one pass', async () => {
      const m1 = await createMatch(game.id, mode.id);
      const m2 = await createMatch(game.id, mode.id);

      await db.run(
        `INSERT INTO discord_announcement_queue (id, match_id, status, created_at)
         VALUES ('ann-ext-1', ?, 'pending', datetime('now')), ('ann-ext-2', ?, 'pending', datetime('now'))`,
        [m1.id, m2.id]
      );

      await queueProcessor.processAnnouncementQueue();

      const r1 = await db.get<{ status: string }>(
        `SELECT status FROM discord_announcement_queue WHERE id = 'ann-ext-1'`
      );
      const r2 = await db.get<{ status: string }>(
        `SELECT status FROM discord_announcement_queue WHERE id = 'ann-ext-2'`
      );
      expect(r1?.status).toBe('completed');
      expect(r2?.status).toBe('completed');
    });

    it('marks entry failed when postEventAnnouncement rejects', async () => {
      const match = await createMatch(game.id, mode.id);
      mockAnnouncementHandler.postEventAnnouncement.mockRejectedValueOnce(new Error('Network error'));

      await db.run(
        `INSERT INTO discord_announcement_queue (id, match_id, status, created_at)
         VALUES ('ann-ext-fail', ?, 'pending', datetime('now'))`,
        [match.id]
      );

      await queueProcessor.processAnnouncementQueue();

      const row = await db.get<{ status: string }>(
        `SELECT status FROM discord_announcement_queue WHERE id = 'ann-ext-fail'`
      );
      expect(row?.status).toBe('failed');
    });

    it('skips future-scheduled timed announcements', async () => {
      const match = await createMatch(game.id, mode.id);

      await db.run(
        `INSERT INTO discord_announcement_queue
           (id, match_id, status, announcement_type, announcement_data, scheduled_for, created_at)
         VALUES ('ann-future', ?, 'pending', 'timed', '{}', datetime('now', '+2 hours'), datetime('now'))`,
        [match.id]
      );

      await queueProcessor.processAnnouncementQueue();

      const row = await db.get<{ status: string }>(
        `SELECT status FROM discord_announcement_queue WHERE id = 'ann-future'`
      );
      expect(row?.status).toBe('pending');
      expect(mockAnnouncementHandler.postTimedReminder).not.toHaveBeenCalled();
    });

    it('does not re-process completed announcements', async () => {
      const match = await createMatch(game.id, mode.id);

      await db.run(
        `INSERT INTO discord_announcement_queue (id, match_id, status, created_at, posted_at)
         VALUES ('ann-done', ?, 'completed', datetime('now'), datetime('now'))`,
        [match.id]
      );

      await queueProcessor.processAnnouncementQueue();

      expect(mockAnnouncementHandler.postEventAnnouncement).not.toHaveBeenCalled();
    });
  });

  describe('processDeletionQueue — extended', () => {
    it('marks deletion completed even when no messages to delete', async () => {
      const match = await createMatch(game.id, mode.id);

      await db.run(
        `INSERT INTO discord_deletion_queue (id, match_id, status, created_at)
         VALUES ('del-ext-1', ?, 'pending', datetime('now'))`,
        [match.id]
      );

      await queueProcessor.processDeletionQueue();

      const row = await db.get<{ status: string }>(
        `SELECT status FROM discord_deletion_queue WHERE id = 'del-ext-1'`
      );
      expect(row?.status).toBe('completed');
    });

    it('deletes the tracked message record after processing', async () => {
      const match = await createMatch(game.id, mode.id);

      await db.run(
        `INSERT INTO discord_match_messages (id, match_id, message_id, channel_id, message_type)
         VALUES ('msg-del-ext', ?, 'msg-111', 'chan-ext', 'announcement')`,
        [match.id]
      );

      const mockChannel = createMockChannel();
      mockDiscordClient.channels.fetch.mockResolvedValue(mockChannel);

      await db.run(
        `INSERT INTO discord_deletion_queue (id, match_id, status, created_at)
         VALUES ('del-ext-2', ?, 'pending', datetime('now'))`,
        [match.id]
      );

      await queueProcessor.processDeletionQueue();

      const msgRow = await db.get(
        `SELECT id FROM discord_match_messages WHERE id = 'msg-del-ext'`
      );
      expect(msgRow).toBeUndefined();
    });

    it('skips already-completed deletion entries', async () => {
      const match = await createMatch(game.id, mode.id);

      await db.run(
        `INSERT INTO discord_deletion_queue (id, match_id, status, created_at)
         VALUES ('del-done', ?, 'completed', datetime('now'))`,
        [match.id]
      );

      await queueProcessor.processDeletionQueue();

      expect(mockDiscordClient.channels.fetch).not.toHaveBeenCalled();
    });
  });

  describe('processStatusUpdateQueue — extended', () => {
    it('marks status update completed after processing', async () => {
      const match = await createMatch(game.id, mode.id);

      await db.run(
        `INSERT INTO discord_status_update_queue (id, match_id, new_status, created_at)
         VALUES ('status-ext-1', ?, 'gather', datetime('now'))`,
        [match.id]
      );

      await queueProcessor.processStatusUpdateQueue();

      const row = await db.get<{ status: string }>(
        `SELECT status FROM discord_status_update_queue WHERE id = 'status-ext-1'`
      );
      expect(row?.status).toBe('completed');
    });

    it('processes multiple status updates in sequence', async () => {
      const m1 = await createMatch(game.id, mode.id);
      const m2 = await createMatch(game.id, mode.id);

      await db.run(
        `INSERT INTO discord_status_update_queue (id, match_id, new_status, created_at)
         VALUES ('su-ext-1', ?, 'gather', datetime('now')), ('su-ext-2', ?, 'battle', datetime('now'))`,
        [m1.id, m2.id]
      );

      await queueProcessor.processStatusUpdateQueue();

      for (const id of ['su-ext-1', 'su-ext-2']) {
        const row = await db.get<{ status: string }>(
          `SELECT status FROM discord_status_update_queue WHERE id = ?`, [id]
        );
        expect(row?.status).toBe('completed');
      }
    });
  });

  describe('processScoreNotificationQueue — extended', () => {
    it('marks score notification failed when handler rejects', async () => {
      const match = await createMatch(game.id, mode.id);
      mockAnnouncementHandler.postMapScoreNotification.mockRejectedValueOnce(new Error('Post failed'));

      await db.run(
        `INSERT INTO discord_score_notification_queue
           (id, match_id, game_id, map_id, game_number, winner, winning_team_name, winning_players, status, created_at)
         VALUES ('score-ext-fail', ?, ?, 'map-ext', 1, 'team1', 'Blue', '[]', 'pending', datetime('now'))`,
        [match.id, game.id]
      );

      await queueProcessor.processScoreNotificationQueue();

      const row = await db.get<{ status: string }>(
        `SELECT status FROM discord_score_notification_queue WHERE id = 'score-ext-fail'`
      );
      expect(row?.status).toBe('failed');
    });

    it('processes multiple score notifications', async () => {
      const match = await createMatch(game.id, mode.id);

      for (let i = 1; i <= 3; i++) {
        await db.run(
          `INSERT INTO discord_score_notification_queue
             (id, match_id, game_id, map_id, game_number, winner, winning_team_name, winning_players, status, created_at)
           VALUES (?, ?, ?, 'map-${i}', ?, 'team1', 'Blue', '[]', 'pending', datetime('now'))`,
          [`score-multi-${i}`, match.id, game.id, i]
        );
      }

      await queueProcessor.processScoreNotificationQueue();

      const rows = await db.all<{ status: string }>(
        `SELECT status FROM discord_score_notification_queue WHERE match_id = ?`,
        [match.id]
      );
      expect(rows.every(r => (r as { status: string }).status === 'completed')).toBe(true);
    });
  });

  describe('processMapCodeQueue — extended', () => {
    it('calls sendMapCodePMs and marks row completed', async () => {
      const match = await createMatch(game.id, mode.id);

      await db.run(
        `INSERT INTO discord_map_code_queue (id, match_id, map_name, map_code, status, created_at)
         VALUES ('mapcode-ext-1', ?, 'Hanamura', 'TESTCODE', 'pending', datetime('now'))`,
        [match.id]
      );

      await queueProcessor.processMapCodeQueue();

      const row = await db.get<{ status: string }>(
        `SELECT status FROM discord_map_code_queue WHERE id = 'mapcode-ext-1'`
      );
      expect(row?.status).toBe('completed');
      expect(mockReminderHandler.sendMapCodePMs).toHaveBeenCalled();
    });

    it('skips already-completed map code entries', async () => {
      const match = await createMatch(game.id, mode.id);

      await db.run(
        `INSERT INTO discord_map_code_queue (id, match_id, map_name, map_code, status, created_at)
         VALUES ('mapcode-done', ?, 'Route 66', 'DONE', 'completed', datetime('now'))`,
        [match.id]
      );

      await queueProcessor.processMapCodeQueue();

      expect(mockReminderHandler.sendMapCodePMs).not.toHaveBeenCalled();
    });
  });

  describe('processDiscordBotRequests — extended', () => {
    it('cleans up old completed requests older than 1 hour', async () => {
      await db.run(
        `INSERT INTO discord_bot_requests (id, type, data, status, created_at, updated_at)
         VALUES ('old-done', 'voice_test', '{}', 'completed', datetime('now', '-2 hours'), datetime('now', '-2 hours'))`
      );

      await queueProcessor.processDiscordBotRequests();

      const row = await db.get(`SELECT id FROM discord_bot_requests WHERE id = 'old-done'`);
      expect(row).toBeUndefined();
    });

    it('handles voice channel delete request', async () => {
      const deleteData = { channelId: 'chan-to-delete' };

      const mockGuild = {
        channels: {
          fetch: vi.fn().mockResolvedValue({ delete: vi.fn().mockResolvedValue(undefined) }),
        },
      };
      mockDiscordClient.guilds.fetch.mockResolvedValue(mockGuild);

      await db.run(
        `INSERT INTO discord_bot_requests (id, type, data, status, created_at)
         VALUES ('del-req-1', 'voice_channel_delete', ?, 'pending', datetime('now'))`,
        [JSON.stringify(deleteData)]
      );

      await queueProcessor.processDiscordBotRequests();

      const row = await db.get<{ status: string }>(
        `SELECT status FROM discord_bot_requests WHERE id = 'del-req-1'`
      );
      expect(row?.status).toBe('completed');
    });
  });
});
