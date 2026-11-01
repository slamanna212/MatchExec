import type { Client, Message } from 'discord.js';
import type { ScorecardHandler } from './scorecard-handler';
import type { WinnerVoteHandler } from './winner-vote-handler';
import type { StatsReportHandler } from './stats-report-handler';
import { EmbedBuilder, AttachmentBuilder } from 'discord.js';
import { isNull, lte, or, sql, type SQL } from 'drizzle-orm';
import { sendDM, buildCommanderAssignedEmbed } from './dm-builder';
import fs from 'fs';
import path from 'path';
import type { Database } from '../../../lib/database/connection';
import type { DiscordSettings } from '../../../shared/types';
import { getAnyDiscordSettings } from '../../../src/lib/settings';
import type { AnnouncementHandler } from './announcement-handler';
import type { ReminderHandler } from './reminder-handler';
import type { EventHandler } from './event-handler';
import type { VoiceHandler } from './voice-handler';
import type { SettingsManager } from './settings-manager';
import { logger } from '../../../src/lib/logger/server';
import { capTitle } from './utils';
import { cleanMapId } from '../../../src/lib/utils/map-utils';
import { db as pgDb, type Executor } from '../../../lib/db';
import { discordAnnouncementQueue, discordPlayerReminderQueue, discordReminderQueue } from '../../../lib/db/schema';
import { getGameDisplay, getMapNameById } from '../../../src/lib/games';
import {
  alreadyPosted, claimJobs, completeJob, expireOldBotRequests, failJob, makeWorkerId, purgeFinished,
  recordExternalResult, releaseJob, resetAbandonedClaims,
  type CompleteOptions, type ExternalResultQueue, type FailOptions, type QueueName, type QueueRow,
} from '../../../src/lib/discord-queues';

// Queue rows come from the Discord queues module (src/lib/queues): claimed atomically, retried with backoff,
// abandoned claims reset. Match / tournament data still lives in the legacy SQLite database until those
// domains are ported, so each handler reads it separately from the claim (TODO(matches): collapse into joins).

interface MatchEditData {
  id: string;
  name: string;
  description: string;
  game_id: string;
  rules: string;
  maps: string | null;
  livestream_link: string | null;
  start_date: string | null;
  event_image_url: string | null;
}

interface MatchMessageRecord {
  message_id: string;
  channel_id: string;
  thread_id: string | null;
  discord_event_id: string | null;
}

type BotRequest = QueueRow<'botRequest'>;

/**
 * Type for request handler functions
 */
type RequestHandler = (processor: QueueProcessor, request: BotRequest) => Promise<void>;

/**
 * Handles voice channel creation requests
 */
async function handleVoiceChannelCreate(processor: QueueProcessor, request: BotRequest): Promise<void> {
  const requestData = (request.data ?? {}) as {
    matchId?: string; categoryId?: string; blueChannelName?: string; redChannelName?: string;
    isSingleTeam?: boolean; channelNames?: string[];
  };
  const { matchId, categoryId, blueChannelName, redChannelName, isSingleTeam } = requestData;
  // N-team aware: channelNames is the preferred payload shape (one name per
  // team). Falls back to the legacy blueChannelName/redChannelName pair for
  // requests queued by an older version of the caller.
  const channelNames: string[] = Array.isArray(requestData.channelNames) && requestData.channelNames.length > 0
    ? requestData.channelNames
    : [blueChannelName as string, ...(!isSingleTeam && redChannelName ? [redChannelName] : [])];

  logger.debug(`Creating ${channelNames.length} voice channel(s) for match ${matchId} in category ${categoryId}`);

  try {
    const settings = await getAnyDiscordSettings();

    if (!settings?.guild_id) {
      throw new Error('Guild ID not configured');
    }

    const guild = await processor['client'].guilds.fetch(settings.guild_id);

    const channelIds: string[] = [];
    const createdChannels: Array<{ id: string; delete: () => Promise<unknown> }> = [];
    try {
      for (const name of channelNames) {
        const channel = await guild.channels.create({
          name,
          type: 2,
          parent: categoryId,
        });
        createdChannels.push(channel);
        channelIds.push(channel.id);
      }
    } catch (createError) {
      // Don't leave orphaned channels behind when a later creation fails
      for (const created of createdChannels) {
        try {
          await created.delete();
        } catch (cleanupError) {
          logger.warning(`⚠️ Failed to clean up voice channel ${created.id} after partial failure:`, cleanupError instanceof Error ? cleanupError.message : 'Unknown');
        }
      }
      throw createError;
    }

    logger.debug(`✅ Voice channel(s) created: ${channelIds.join(', ')}`);

    await processor['finish']('botRequest', request.id, {
      set: { result: { success: true, channelIds, blueChannelId: channelIds[0], redChannelId: channelIds[1] } },
    });
  } catch (error) {
    logger.error(`❌ Error creating voice channels:`, error);
    // Never replayed: creating channels twice would orphan the first set.
    await processor['fail']('botRequest', request.id, error, {
      permanent: true,
      set: { result: { success: false, message: error instanceof Error ? error.message : 'Unknown error' } },
    });
  }
}

/**
 * Handles voice channel deletion requests
 */
async function handleVoiceChannelDelete(processor: QueueProcessor, request: BotRequest): Promise<void> {
  const { channelId, matchId } = (request.data ?? {}) as { channelId: string; matchId?: string };

  logger.debug(`Deleting voice channel ${channelId} for match ${matchId}`);

  try {
    const channel = await processor['client'].channels.fetch(channelId);
    if (channel) {
      await channel.delete();
      logger.debug(`✅ Voice channel deleted: ${channelId}`);
    }

    await processor['finish']('botRequest', request.id, { set: { result: { success: true } } });
  } catch (error) {
    logger.warning(`⚠️ Error deleting voice channel ${channelId}:`, error instanceof Error ? error.message : 'Unknown');
    await processor['finish']('botRequest', request.id, { set: { result: { success: true, message: 'Channel may already be deleted' } } });
  }
}

/**
 * Handles voice test requests
 */
async function handleVoiceTest(processor: QueueProcessor, request: BotRequest): Promise<void> {
  const { userId, voiceId } = (request.data ?? {}) as { userId: string; voiceId?: string };

  if (processor['processingVoiceTests'].has(userId)) {
    // Another test for this user is running: hand the claim back and pick it up on a later tick
    await processor['release']('botRequest', request.id);
    return;
  }

  processor['processingVoiceTests'].add(userId);

  try {
    if (!processor['voiceHandler']) {
      await processor['fail']('botRequest', request.id, 'Voice handler not available', {
        permanent: true,
        set: { result: { success: false, message: 'Voice handler not available' } },
      });
      logger.error(`❌ Voice handler not available for request ${request.id}`);
      return;
    }

    const result = await processor['voiceHandler'].testVoiceLineForUser(userId, voiceId);

    if (result.success) {
      await processor['finish']('botRequest', request.id, { set: { result } });
    } else {
      await processor['fail']('botRequest', request.id, result.message ?? 'Voice test failed', { permanent: true, set: { result } });
    }
  } finally {
    processor['processingVoiceTests'].delete(userId);
  }
}

/**
 * Registry of request type handlers
 */
async function handleCommanderDM(processor: QueueProcessor, request: BotRequest): Promise<void> {
  const { matchId, discordUserId, team } = (request.data ?? {}) as { matchId: string; discordUserId: string; team: string };

  const match = await processor['db']!.get<{ name: string; game_id: string }>(
    'SELECT name, game_id FROM matches WHERE id = ?',
    [matchId]
  );
  const game = match ? await getGameDisplay(pgDb, match.game_id) : undefined;

  if (match) {
    const embed = buildCommanderAssignedEmbed(match.name, game?.name ?? '', game?.color ?? undefined, team);
    await sendDM(processor['client'], discordUserId, embed);
  }

  await processor['finish']('botRequest', request.id);
}

const REQUEST_HANDLERS: Record<string, RequestHandler> = {
  'voice_channel_create': handleVoiceChannelCreate,
  'voice_channel_delete': handleVoiceChannelDelete,
  'voice_test': handleVoiceTest,
  'commander_dm': handleCommanderDM,
};

interface TournamentMessageData {
  message_id: string;
  channel_id: string;
  message_type: string;
}

/**
 * Fetches tournament messages from database
 */
async function fetchTournamentMessages(db: Database, tournamentId: string): Promise<TournamentMessageData[]> {
  return await db.all<TournamentMessageData>(`
    SELECT message_id, channel_id, message_type
    FROM discord_match_messages
    WHERE match_id = ? AND message_type = 'announcement'
  `, [tournamentId]);
}

/**
 * Updates embed to show signups closed
 */
function buildClosedSignupEmbed(existingEmbed: EmbedBuilder | null): EmbedBuilder {
  const updatedEmbed = existingEmbed ? EmbedBuilder.from(existingEmbed) : new EmbedBuilder();

  const existingFields = updatedEmbed.data.fields || [];
  const signupStatusFieldIndex = existingFields.findIndex(field => field.name === '📋 Signup Status');

  if (signupStatusFieldIndex === -1) {
    updatedEmbed.addFields([{
      name: '📋 Signup Status',
      value: '🔒 **Team signups are now closed**',
      inline: false
    }]);
    logger.debug(`📝 Added signup closure field to tournament embed`);
  } else {
    logger.debug(`📋 Signup status field already exists, not adding duplicate`);
  }

  return updatedEmbed;
}

/**
 * Recreates attachment for event image
 */
function recreateAttachment(eventImageUrl: string | null | undefined, updatedEmbed: EmbedBuilder): AttachmentBuilder | undefined {
  if (!eventImageUrl || !eventImageUrl.trim()) {
    return undefined;
  }

  try {
    const imagePath = path.join(process.cwd(), 'public', eventImageUrl.replace(/^\//, ''));

    if (!fs.existsSync(imagePath)) {
      logger.warning(`⚠️ Tournament image not found for reattachment: ${imagePath}`);
      return undefined;
    }

    const ext = path.extname(imagePath).slice(1);
    const attachment = new AttachmentBuilder(imagePath, {
      name: `tournament_image.${ext}`
    });

    updatedEmbed.setImage(`attachment://tournament_image.${ext}`);
    logger.debug(`📎 Recreated attachment for tournament image: ${imagePath}`);

    return attachment;
  } catch (error) {
    logger.error(`❌ Error recreating attachment for ${eventImageUrl}:`, error);
    return undefined;
  }
}

export class QueueProcessor {
  private processingVoiceTests = new Set<string>(); // Track users currently processing voice tests
  private scorecardHandler: ScorecardHandler | null = null;
  private winnerVoteHandler: WinnerVoteHandler | null = null;
  private statsReportHandler: StatsReportHandler | null = null;
  private readonly workerId = makeWorkerId('discord-bot');
  private ticking = false;

  constructor(
    private client: Client,
    private db: Database,
    private settings: DiscordSettings | null,
    private announcementHandler: AnnouncementHandler | null,
    private reminderHandler: ReminderHandler | null,
    private eventHandler: EventHandler | null,
    private voiceHandler: VoiceHandler | null = null,
    private settingsManager: SettingsManager | null = null,
    /** Postgres connection used for the queue tables (injectable for tests). */
    private queueDb: Executor = pgDb
  ) {}

  setScorecardHandler(handler: ScorecardHandler) {
    this.scorecardHandler = handler;
  }

  setWinnerVoteHandler(handler: WinnerVoteHandler) {
    this.winnerVoteHandler = handler;
  }

  setStatsReportHandler(handler: StatsReportHandler) {
    this.statsReportHandler = handler;
  }

  // ─── Queue worker contract helpers (claim / complete / fail / release) ─────────────────────────

  private claim<N extends QueueName>(queue: N, limit = 5, where?: SQL): Promise<QueueRow<N>[]> {
    return claimJobs(this.queueDb, queue, { limit, workerId: this.workerId, where });
  }

  private finish(queue: QueueName, id: string, opts?: CompleteOptions) {
    return completeJob(this.queueDb, queue, id, opts);
  }

  private fail(queue: QueueName, id: string, error: unknown, opts?: FailOptions) {
    return failJob(this.queueDb, queue, id, error, opts);
  }

  private release(queue: QueueName, id: string, delayMs = 0) {
    return releaseJob(this.queueDb, queue, id, delayMs);
  }

  /** Remember the Discord message id on the job right after posting, so a retry never double-posts. */
  private async recordPosted(queue: ExternalResultQueue, id: string, messageId: unknown) {
    if (typeof messageId === 'string' && messageId) {
      await recordExternalResult(this.queueDb, queue, id, messageId);
    }
  }

  async processAnnouncementQueue() {
    if (!this.client.isReady() || !this.db) return;

    try {
      const due = or(isNull(discordAnnouncementQueue.scheduled_for), lte(discordAnnouncementQueue.scheduled_for, sql`now()`));
      const announcements = await this.claim('announcement', 5, due);

      for (const announcement of announcements) {
        await this.processSingleAnnouncement(announcement);
      }
    } catch (error) {
      logger.error('❌ Error processing announcement queue:', error);
    }
  }

  /** Match (or tournament) data for a claimed announcement; undefined when it no longer exists. */
  private async fetchAnnouncementContext(queued: QueueRow<'announcement'>) {
    type Context = {
      name: string; description: string; game_id: string; max_participants: number; guild_id?: string;
      maps?: string; livestream_link?: string; event_image_url?: string; start_date?: string;
      rules?: 'competitive' | 'casual';
    };
    if (queued.announcement_type === 'tournament') {
      const t = await this.db.get<Omit<Context, 'guild_id' | 'rules'>>(
        `SELECT name, description, game_id, max_participants, event_image_url, start_time AS start_date
         FROM tournaments WHERE id = ?`,
        [queued.match_id]
      );
      if (!t) return undefined;
      const settings = await getAnyDiscordSettings(pgDb);
      return { ...t, guild_id: settings?.guild_id, rules: 'casual' } as Context;
    }
    return await this.db.get<Context>(
      `SELECT name, description, game_id, max_participants, guild_id, maps, livestream_link, event_image_url, start_date,
              COALESCE(rules, 'casual') AS rules
       FROM matches WHERE id = ?`,
      [queued.match_id]
    );
  }

  private async processSingleAnnouncement(queued: QueueRow<'announcement'>) {
    const announcementId = queued.id;
    try {
      logger.debug(`🚀 Processing announcement ${announcementId} for match ${queued.match_id} (type: ${queued.announcement_type})`);

      if (alreadyPosted(queued)) {
        logger.debug(`⏭️ Announcement ${announcementId} was already posted (message ${queued.external_message_id}); completing`);
        await this.markAnnouncementAsCompleted(announcementId);
        return;
      }

      const context = await this.fetchAnnouncementContext(queued);
      if (!context) {
        await this.markAnnouncementAsFailed(announcementId, 'Match or tournament not found');
        return;
      }

      if (!this.announcementHandler) {
        await this.markAnnouncementAsFailed(announcementId, 'AnnouncementHandler not available');
        return;
      }

      const announcement = { ...context, announcement_id: announcementId, match_id: queued.match_id, announcement_type: queued.announcement_type ?? undefined, announcement_data: queued.announcement_data };
      const eventData = this.buildEventData(announcement);
      const result = await this.postAnnouncementByType(queued.announcement_type ?? undefined, eventData);

      if (result?.success) {
        await this.recordPosted('announcement', announcementId, result.mainMessage?.id ?? result.messageId);
        await this.handleSuccessfulAnnouncement(announcement, result, eventData);
      } else {
        await this.markAnnouncementAsFailed(announcementId, 'Failed to post announcement', true);
      }
    } catch (error) {
      logger.error(`❌ Error processing announcement ${announcementId}:`, error);
      await this.markAnnouncementAsFailed(
        announcementId,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  private buildEventData(announcement: any): Record<string, unknown> {
    const maps = this.parseAnnouncementMaps(announcement.maps);

    const eventData: Record<string, unknown> = {
      id: announcement.match_id,
      name: announcement.name,
      description: announcement.description || 'No description provided',
      game_id: announcement.game_id,
      type: announcement.rules || 'casual',
      maps: maps,
      max_participants: announcement.max_participants,
      guild_id: announcement.guild_id,
      livestream_link: announcement.livestream_link,
      event_image_url: announcement.event_image_url,
      start_date: announcement.start_date
    };

    this.addTimingInfoIfNeeded(eventData, announcement);

    return eventData;
  }

  private parseAnnouncementMaps(mapsJson: string | undefined): string[] {
    if (!mapsJson) return [];

    try {
      return JSON.parse(mapsJson);
    } catch {
      return [];
    }
  }

  private addTimingInfoIfNeeded(eventData: Record<string, unknown>, announcement: any): void {
    if (announcement.announcement_type === 'timed' && announcement.announcement_data) {
      // announcement_data is jsonb: already an object
      eventData._timingInfo = announcement.announcement_data;
    }
  }

  private async postAnnouncementByType(announcementType: string | undefined, eventData: Record<string, unknown>): Promise<any> {
    if (announcementType === 'timed') {
      return await this.announcementHandler!.postTimedReminder(eventData as any);
    }

    if (announcementType === 'match_start') {
      return await this.announcementHandler!.postMatchStartAnnouncement(eventData as any);
    }

    return await this.announcementHandler!.postEventAnnouncement(eventData as any);
  }

  private async handleSuccessfulAnnouncement(announcement: any, result: any, eventData: Record<string, unknown>) {
    const shouldStoreMessage = result.mainMessage && announcement.announcement_type !== 'timed';

    if (shouldStoreMessage) {
      await this.storeDiscordMessageTracking(announcement, result, eventData);
    }

    await this.markAnnouncementAsCompleted(announcement.announcement_id);
  }

  private async storeDiscordMessageTracking(announcement: any, result: any, eventData: Record<string, unknown>) {
    try {
      const messageRecordId = `discord_msg_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`; // NOSONAR: non-security internal ID generation
      const threadId = await this.createMapsThreadIfNeeded(result.mainMessage, eventData);
      const discordEventId = await this.createDiscordEventIfNeeded(eventData, result.mainMessage);

      await this.db!.run(`
        INSERT INTO discord_match_messages (id, match_id, message_id, channel_id, thread_id, discord_event_id, message_type)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
        messageRecordId,
        eventData.id as string,
        result.mainMessage.id,
        result.mainMessage.channelId,
        threadId,
        discordEventId,
        'announcement'
      ]);
    } catch (error) {
      logger.error('❌ Error storing Discord message tracking:', error);
    }
  }

  private async createMapsThreadIfNeeded(mainMessage: any, eventData: Record<string, unknown>): Promise<string | null> {
    const maps = eventData.maps as string[];

    if (!maps || maps.length === 0) {
      return null;
    }

    const thread = await this.announcementHandler!.createMapsThread(
      mainMessage,
      eventData.name as string,
      eventData.game_id as string,
      maps,
      eventData.id as string
    );

    return thread?.id || null;
  }

  private async createDiscordEventIfNeeded(eventData: Record<string, unknown>, mainMessage: any): Promise<string | null> {
    const hasStartDate = eventData.start_date && typeof eventData.start_date === 'string';

    if (!hasStartDate || !this.eventHandler) {
      return null;
    }

    const maps = eventData.maps as string[];
    const rounds = maps?.length || 1;

    return await this.eventHandler.createDiscordEvent(eventData as any, mainMessage, rounds);
  }

  private async markAnnouncementAsCompleted(announcementId: string) {
    await this.finish('announcement', announcementId, { set: { posted_at: new Date() } });
  }

  private async markAnnouncementAsFailed(announcementId: string, errorMessage: string, permanent = false) {
    logger.error(`❌ ${errorMessage}`);
    await this.fail('announcement', announcementId, errorMessage, { permanent, set: { posted_at: new Date() } });
  }

  /**
   * Delete a Discord message
   */
  private async deleteDiscordMessage(messageId: string, channelId: string): Promise<void> {
    const channel = await this.client.channels.fetch(channelId);
    if (channel?.isTextBased() && 'messages' in channel) {
      await channel.messages.delete(messageId);
    }
  }

  /**
   * Delete a Discord thread
   */
  private async deleteDiscordThread(threadId: string): Promise<void> {
    try {
      const thread = await this.client.channels.fetch(threadId);
      if (thread?.isThread()) {
        await thread.delete();
      }
    } catch (error) {
      logger.warning(`⚠️ Could not delete thread ${threadId}:`, (error as Error)?.message);
    }
  }

  /**
   * Process a single match message record deletion
   */
  private async processMatchMessageDeletion(record: {
    message_id: string;
    channel_id: string;
    thread_id: string | null;
    discord_event_id: string | null;
    message_type: string;
  }): Promise<void> {
    try {
      // Delete the Discord message
      await this.deleteDiscordMessage(record.message_id, record.channel_id);

      // Delete thread if exists
      if (record.thread_id) {
        await this.deleteDiscordThread(record.thread_id);
      }

      // Delete Discord event if exists
      if (record.discord_event_id && this.eventHandler) {
        await this.eventHandler.deleteDiscordEvent(record.discord_event_id);
      }
    } catch (error) {
      logger.warning(`⚠️ Could not delete message ${record.message_id}:`, (error as Error)?.message);
    }
  }

  /**
   * Process deletion for a single match
   */
  private async processSingleDeletion(deletion: QueueRow<'deletion'>): Promise<void> {
    if (!this.db) return;

    const matchId = deletion.match_id;

    // Get all Discord messages for this match
    const messages = await this.db.all<{
      message_id: string;
      channel_id: string;
      thread_id: string | null;
      discord_event_id: string | null;
      message_type: string;
    }>(`
      SELECT message_id, channel_id, thread_id, discord_event_id, message_type
      FROM discord_match_messages
      WHERE match_id = ?
    `, [matchId]);

    // Delete each message
    for (const record of messages) {
      await this.processMatchMessageDeletion(record);
    }

    // Clean up message tracking records
    await this.db.run('DELETE FROM discord_match_messages WHERE match_id = ?', [matchId]);

    // Mark deletion as completed
    await this.finish('deletion', deletion.id);
  }

  async processDeletionQueue() {
    if (!this.client.isReady() || !this.db) return;

    try {
      const deletions = await this.claim('deletion', 10);

      for (const deletion of deletions) {
        try {
          await this.processSingleDeletion(deletion);
        } catch (error) {
          logger.error(`❌ Error processing deletion ${deletion.id}:`, error);
          await this.fail('deletion', deletion.id, error);
        }
      }
    } catch (error) {
      logger.error('❌ Error processing deletion queue:', error);
    }
  }

  private async processSingleStatusUpdate(update: QueueRow<'statusUpdate'>): Promise<void> {
    let success = false;
    try {
      if (update.new_status === 'assign') {
        const isTournament = update.match_id.startsWith('tournament_');
        success = isTournament
          ? await this.updateTournamentMessagesForSignupClosure(update.match_id)
          : await this.updateMatchMessagesForSignupClosure(update.match_id);
      } else {
        success = true;
      }
    } catch (error) {
      logger.error(`❌ Error updating Discord messages for status ${update.new_status}:`, error);
    }

    if (success) {
      await this.finish('statusUpdate', update.id);
    } else {
      await this.fail('statusUpdate', update.id, 'Failed to update Discord messages');
    }
  }

  async processStatusUpdateQueue() {
    if (!this.client.isReady() || !this.db) return;

    try {
      const updates = await this.claim('statusUpdate', 5);

      for (const update of updates) {
        try {
          await this.processSingleStatusUpdate(update);
        } catch (error) {
          logger.error(`❌ Error processing status update ${update.id}:`, error);
          await this.fail('statusUpdate', update.id, error);
        }
      }
    } catch (error) {
      logger.error('❌ Error processing status update queue:', error);
    }
  }

  private calcTimingInfo(startDate: string): { value: number; unit: 'minutes' | 'hours' | 'days' } {
    const diffMinutes = Math.round((new Date(startDate).getTime() - Date.now()) / 60000);
    if (diffMinutes > 90) return { value: Math.round(diffMinutes / 60), unit: 'hours' };
    return { value: diffMinutes, unit: 'minutes' };
  }


  private async processSingleReminder(reminder: QueueRow<'reminder'>): Promise<void> {
    if (alreadyPosted(reminder)) {
      await this.finish('reminder', reminder.id, { set: { sent_at: new Date() } });
      return;
    }

    if (!this.announcementHandler) {
      await this.fail('reminder', reminder.id, 'AnnouncementHandler not available', { set: { sent_at: new Date() } });
      return;
    }

    const matchData = await this.db!.get<{
      id: string; name: string; description: string; game_id: string;
      start_date: string; status: string; event_image_url?: string;
    }>('SELECT id, name, description, game_id, start_date, status, event_image_url FROM matches WHERE id = ?', [reminder.match_id]);

    if (!matchData) throw new Error('Match not found');

    if (matchData.status === 'complete' || matchData.status === 'cancelled') {
      logger.debug(`⏭️ Skipping stale reminder for match ${matchData.name} (status: ${matchData.status})`);
      await this.finish('reminder', reminder.id, { set: { sent_at: new Date() } });
      return;
    }

    if (new Date(matchData.start_date) <= new Date()) {
      logger.debug(`⏭️ Skipping stale reminder for match ${matchData.name} (start time has passed)`);
      await this.finish('reminder', reminder.id, { set: { sent_at: new Date() } });
      return;
    }

    logger.debug(`📨 Sending reminder for match: ${matchData.name}`);
    const result = await this.announcementHandler.postTimedReminder({ ...matchData, _timingInfo: this.calcTimingInfo(matchData.start_date) });

    if (result) {
      logger.debug(`✅ Reminder sent successfully for match: ${matchData.name}`);
      await this.recordPosted('reminder', reminder.id, typeof result === 'object' ? result.messageId : undefined);
      await this.finish('reminder', reminder.id, { set: { sent_at: new Date() } });
    } else {
      logger.warning(`⚠️ Failed to send reminder for match: ${matchData.name}`);
      await this.fail('reminder', reminder.id, 'Failed to send reminder', { permanent: true, set: { sent_at: new Date() } });
    }
  }

  async processReminderQueue() {
    if (!this.client.isReady() || !this.db) return;

    try {
      const reminders = await this.claim('reminder', 5, lte(discordReminderQueue.reminder_time, sql`now()`));

      if (reminders.length === 0) { logger.debug('ℹ️ No reminders ready to send'); return; }
      logger.debug(`📬 Processing ${reminders.length} reminder(s)`);

      for (const reminder of reminders) {
        try {
          await this.processSingleReminder(reminder);
        } catch (error) {
          logger.error(`❌ Error processing reminder ${reminder.id}:`, error);
          await this.fail('reminder', reminder.id, error, { set: { sent_at: new Date() } });
        }
      }
    } catch (error) {
      logger.error('❌ Error processing reminder queue:', error);
    }
  }

  private async processSinglePlayerReminder(reminder: QueueRow<'playerReminder'>): Promise<void> {
    if (!this.reminderHandler) {
      await this.fail('playerReminder', reminder.id, 'ReminderHandler not available', { set: { sent_at: new Date() } });
      return;
    }

    const matchSettings = await this.db!.get<{
      player_notifications: number; name: string; status: string; start_date: string;
    }>('SELECT player_notifications, name, status, start_date FROM matches WHERE id = ?', [reminder.match_id]);

    if (!matchSettings) throw new Error('Match not found');

    const markCompleted = () => this.finish('playerReminder', reminder.id, { set: { sent_at: new Date() } });

    if (!matchSettings.player_notifications) { await markCompleted(); return; }
    if (matchSettings.status === 'complete' || matchSettings.status === 'cancelled') {
      logger.debug(`⏭️ Skipping stale player reminder for match ${matchSettings.name} (status: ${matchSettings.status})`);
      await markCompleted(); return;
    }
    if (new Date(matchSettings.start_date) <= new Date()) {
      logger.debug(`⏭️ Skipping stale player reminder for match ${matchSettings.name} (start time has passed)`);
      await markCompleted(); return;
    }

    const success = await this.reminderHandler.sendPlayerReminders(reminder.match_id);
    if (success) {
      await markCompleted();
    } else {
      // DM fan-out is not idempotent: never replay a partially delivered batch
      await this.fail('playerReminder', reminder.id, 'Failed to send player reminders', { permanent: true, set: { sent_at: new Date() } });
    }
  }

  async processPlayerReminderQueue() {
    if (!this.client.isReady() || !this.db) return;

    try {
      const playerReminders = await this.claim('playerReminder', 5, lte(discordPlayerReminderQueue.reminder_time, sql`now()`));

      for (const reminder of playerReminders) {
        try {
          await this.processSinglePlayerReminder(reminder);
        } catch (error) {
          logger.error(`❌ Error processing player reminder ${reminder.id}:`, error);
          await this.fail('playerReminder', reminder.id, error, { permanent: true, set: { sent_at: new Date() } });
        }
      }
    } catch (error) {
      logger.error('❌ Error processing player reminder queue:', error);
    }
  }

  async processDiscordBotRequests() {
    if (!this.client.isReady() || !this.db) return;

    try {
      // Clean up old completed/failed requests older than 1 hour
      await purgeFinished(this.queueDb, 'botRequest', 60 * 60_000, 'updated_at');

      // Requests nobody is waiting for any more (older than 5 minutes) fail with an explanatory result
      await expireOldBotRequests(this.queueDb, 5 * 60_000);

      // Process bot requests
      const requests = await this.claim('botRequest', 5);

      for (const request of requests) {
        try {
          // Use registry to handle request types
          const handler = REQUEST_HANDLERS[request.type];

          if (handler) {
            await handler(this, request);
          } else {
            logger.warning(`⚠️ Unknown request type: ${request.type}`);
            await this.fail('botRequest', request.id, `Unknown request type: ${request.type}`, {
              permanent: true,
              set: { result: { success: false, message: `Unknown request type: ${request.type}` } },
            });
          }

        } catch (error) {
          logger.error(`❌ Error processing request ${request.id}:`, error);

          // Bot requests are RPC calls the web side stopped waiting for: fail, never replay
          await this.fail('botRequest', request.id, error, {
            permanent: true,
            set: { result: { success: false, message: error instanceof Error ? error.message : 'Unknown error' } },
          });
        }
      }
    } catch (error) {
      logger.error('❌ Error processing Discord bot requests:', error);
    }
  }

  async processScoreNotificationQueue() {
    if (!this.client.isReady() || !this.db) return;

    try {
      const scoreNotifications = await this.claim('scoreNotification', 5);

      for (const notification of scoreNotifications) {
        try {
          if (alreadyPosted(notification)) {
            await this.finish('scoreNotification', notification.id, { set: { sent_at: new Date() } });
            continue;
          }

          if (!this.announcementHandler) {
            logger.error('❌ AnnouncementHandler not available');
            await this.fail('scoreNotification', notification.id, 'AnnouncementHandler not available', { set: { sent_at: new Date() } });
            continue;
          }

          // Get match name for the notification
          const matchData = await this.db.get<{
            name: string;
          }>(`
            SELECT name FROM matches WHERE id = ?
          `, [notification.match_id]);

          if (!matchData) {
            throw new Error('Match not found');
          }

          // Build score notification data (winning_players is a jsonb array)
          const scoreData = {
            matchId: notification.match_id,
            matchName: matchData.name,
            gameId: notification.game_id,
            gameNumber: notification.game_number ?? 0,
            mapId: notification.map_id ?? '',
            winner: notification.winner as 'team1' | 'team2',
            winningTeamName: notification.winning_team_name ?? '',
            winningPlayers: notification.winning_players ?? []
          };

          // Post the score notification
          const result = await this.announcementHandler.postMapScoreNotification(scoreData);

          if (result && typeof result === 'object' && result.success) {
            await this.recordPosted('scoreNotification', notification.id, result.messageId);
            await this.finish('scoreNotification', notification.id, { set: { sent_at: new Date() } });

            logger.debug(`✅ Score notification sent for match ${notification.match_id}, game ${notification.game_number}`);
          } else {
            await this.fail('scoreNotification', notification.id, 'Failed to post score notification', { permanent: true });

            logger.error(`❌ Failed to post score notification for ${notification.id}`);
          }
        } catch (error) {
          logger.error(`❌ Error processing score notification ${notification.id}:`, error);
          await this.fail('scoreNotification', notification.id, error);
        }
      }
    } catch (error) {
      logger.error('❌ Error processing score notification queue:', error);
    }
  }

  private async processSingleVoiceAnnouncement(announcement: QueueRow<'voiceAnnouncement'>): Promise<void> {
    try {
      if (announcement.announcement_type === 'welcome') {
        const settings = await getAnyDiscordSettings();
        const delaySecs = settings?.match_start_delay_seconds ?? 45;
        const elapsedSecs = (Date.now() - announcement.created_at.getTime()) / 1000;
        if (elapsedSecs < delaySecs) {
          await this.release('voiceAnnouncement', announcement.id, Math.ceil(delaySecs - elapsedSecs) * 1000);
          logger.debug(`⏰ Welcome announcement for match ${announcement.match_id} delayed (${Math.ceil(delaySecs - elapsedSecs)}s remaining)`);
          return;
        }
      }

      if (!this.voiceHandler) {
        logger.error('❌ VoiceHandler not available');
        await this.fail('voiceAnnouncement', announcement.id, 'VoiceHandler not available', { set: { completed_at: new Date() } });
        return;
      }

      logger.debug(`🔊 Processing ${announcement.announcement_type} voice announcement for match ${announcement.match_id}${announcement.attempts > 1 ? ` (attempt ${announcement.attempts})` : ''}`);

      const firstTeam = (announcement.first_team ?? 'blue') as 'blue' | 'red';
      const result = await this.voiceHandler.playTeamAnnouncements(
        announcement.blue_team_voice_channel,
        announcement.red_team_voice_channel,
        announcement.announcement_type as 'welcome' | 'nextround' | 'finish',
        firstTeam,
        announcement.match_id
      );

      if (result.success) {
        await this.voiceHandler.updateFirstTeam(announcement.match_id, firstTeam);
        await this.finish('voiceAnnouncement', announcement.id, { set: { completed_at: new Date() } });
        logger.debug(`✅ Voice announcement completed for match ${announcement.match_id}: ${announcement.announcement_type}`);
      } else {
        await this.fail('voiceAnnouncement', announcement.id, result.message, { permanent: true, set: { completed_at: new Date() } });
        logger.error(`❌ Failed to play voice announcement for ${announcement.id}: ${result.message}`);
      }
    } catch (error) {
      logger.error(`❌ Error processing voice announcement ${announcement.id}:`, error);
      // Audio may have partially played: do not replay (a timeout / crash is retried by the abandoned-claim reset)
      await this.fail('voiceAnnouncement', announcement.id, error, { permanent: true, set: { completed_at: new Date() } });
    }
  }

  async processVoiceAnnouncementQueue() {
    if (!this.client.isReady() || !this.db) return;

    try {
      // Finished rows are kept for an hour, then removed
      await purgeFinished(this.queueDb, 'voiceAnnouncement', 60 * 60_000, 'updated_at');

      // Timed-out claims (worker crashed / hung mid-playback) are reset by resetAbandonedClaims in processAllQueues
      const voiceAnnouncements = await this.claim('voiceAnnouncement', 5);

      for (const announcement of voiceAnnouncements) {
        await this.processSingleVoiceAnnouncement(announcement);
      }
    } catch (error) {
      logger.error('❌ Error processing voice announcement queue:', error);
    }
  }

  private async processSingleMapCode(mapCodeRequest: QueueRow<'mapCode'>): Promise<void> {
    if (!this.reminderHandler) {
      await this.fail('mapCode', mapCodeRequest.id, 'ReminderHandler not available');
      return;
    }

    logger.debug(`📱 Processing map code PMs for match ${mapCodeRequest.match_id}, map: ${mapCodeRequest.map_name}`);
    const result = await this.reminderHandler.sendMapCodePMs(mapCodeRequest.match_id, mapCodeRequest.map_name ?? '', mapCodeRequest.map_code ?? '');

    if (result) {
      await this.finish('mapCode', mapCodeRequest.id);
      logger.debug(`✅ Map code PMs sent for match ${mapCodeRequest.match_id}, map: ${mapCodeRequest.map_name}`);
    } else {
      // DM fan-out is not idempotent: never replay a partially delivered batch
      await this.fail('mapCode', mapCodeRequest.id, 'Failed to send map code PMs', { permanent: true });
      logger.error(`❌ Failed to send map code PMs for ${mapCodeRequest.id}`);
    }
  }

  async processMapCodeQueue() {
    if (!this.client.isReady() || !this.db) return;

    try {
      const mapCodes = await this.claim('mapCode', 5);

      for (const mapCodeRequest of mapCodes) {
        try {
          await this.processSingleMapCode(mapCodeRequest);
        } catch (error) {
          logger.error(`❌ Error processing map code request ${mapCodeRequest.id}:`, error);
          await this.fail('mapCode', mapCodeRequest.id, error, { permanent: true });
        }
      }
    } catch (error) {
      logger.error('❌ Error processing map code queue:', error);
    }
  }

  async processMatchWinnerNotificationQueue() {
    if (!this.client.isReady() || !this.db) return;

    try {
      const winnerNotifications = await this.claim('matchWinner', 5);

      for (const notification of winnerNotifications) {
        // Gate: for regular matches, wait until all map win notifications have been queued
        // (discord_notified = 1 on all match_games). This prevents the match winner from
        // firing before map win messages in stats-enabled matches where map notifications
        // are held until stats are assigned. Bypass after 30 min to prevent permanent blockage.
        if (notification.winner !== 'tournament') {
          try {
            const mapStatus = await this.db.get<{ total: number; notified: number }>(
              `SELECT COUNT(*) as total,
                      SUM(CASE WHEN discord_notified = 1 THEN 1 ELSE 0 END) as notified
               FROM match_games WHERE match_id = ?`,
              [notification.match_id]
            );
            const allNotified = !mapStatus || mapStatus.total === 0 || (mapStatus.notified ?? 0) >= mapStatus.total;
            const ageMinutes = (Date.now() - notification.created_at.getTime()) / 60000;
            if (!allNotified && ageMinutes < 30) {
              logger.debug(`⏳ Waiting for map notifications before match winner: ${notification.match_name} (${mapStatus?.notified ?? 0}/${mapStatus?.total ?? 0} maps notified)`);
              // Not ready yet: hand the claim back without spending an attempt
              await this.release('matchWinner', notification.id, 10_000);
              continue;
            }
          } catch (error) {
            logger.error(`❌ Error checking map notifications for match winner ${notification.id}:`, error);
            await this.fail('matchWinner', notification.id, error);
            continue;
          }
        }

        try {
          if (alreadyPosted(notification)) {
            await this.finish('matchWinner', notification.id, { set: { sent_at: new Date() } });
            continue;
          }

          if (!this.announcementHandler) {
            logger.error('❌ AnnouncementHandler not available');
            await this.fail('matchWinner', notification.id, 'AnnouncementHandler not available', { set: { sent_at: new Date() } });
            continue;
          }

          const winningPlayers = notification.winning_players ?? [];
          const matchName = notification.match_name ?? '';
          const winningTeamName = notification.winning_team_name ?? '';

          let result;

          // Check if this is a tournament winner notification (winner field = 'tournament')
          if (notification.winner === 'tournament') {
            // Build tournament winner notification data
            const tournamentData = {
              tournamentId: notification.match_id, // We stored tournament ID in match_id
              tournamentName: matchName.replace('🏆 ', ''), // Remove trophy emoji
              gameId: notification.game_id ?? '',
              winner: notification.match_id, // Tournament ID
              winningTeamName,
              winningPlayers: winningPlayers,
              format: (notification.team2_score === 1 ? 'double-elimination' : 'single-elimination') as 'double-elimination' | 'single-elimination', // Decoded from team2_score
              totalParticipants: notification.team1_score ?? 0 // Stored in team1_score
            };

            logger.debug(`🏆 Sending tournament winner notification for ${tournamentData.tournamentName}`);

            // Post the tournament winner notification (no delay needed for tournaments)
            result = await this.announcementHandler.postTournamentWinnerNotification(tournamentData);
          } else {
            // Build regular match winner notification data
            const winnerData = {
              matchId: notification.match_id,
              matchName,
              gameId: notification.game_id ?? '',
              winner: notification.winner as 'team1' | 'team2' | 'tie',
              winningTeamName,
              winningPlayers: winningPlayers,
              team1Score: notification.team1_score ?? 0,
              team2Score: notification.team2_score ?? 0,
              totalMaps: notification.total_maps ?? 0
            };

            // Wait 15 seconds to ensure last map winner embed goes out first
            logger.debug(`⏱️ Waiting 15 seconds before sending match winner notification for ${matchName}`);
            await new Promise(resolve => setTimeout(resolve, 15000));

            // Post the match winner notification
            result = await this.announcementHandler.postMatchWinnerNotification(winnerData);
          }

          if (result && typeof result === 'object' && result.success) {
            await this.recordPosted('matchWinner', notification.id, result.messageId);
            await this.finish('matchWinner', notification.id, { set: { sent_at: new Date() } });

            logger.debug(`🏆 Match winner notification sent: ${notification.winning_team_name} wins ${notification.match_name}`);
          } else {
            await this.fail('matchWinner', notification.id, 'Failed to post match winner notification', { permanent: true });

            logger.error(`❌ Failed to post match winner notification for ${notification.id}`);
          }
        } catch (error) {
          logger.error(`❌ Error processing match winner notification ${notification.id}:`, error);
          await this.fail('matchWinner', notification.id, error, { set: { sent_at: new Date() } });
        }
      }
    } catch (error) {
      logger.error('❌ Error processing match winner notification queue:', error);
    }
  }

  private updateEmbedTimeFields(embed: EmbedBuilder, startDate: string): void {
    const startTime = new Date(startDate);
    const unixTimestamp = Math.floor(startTime.getTime() / 1000);

    const fields = embed.data.fields || [];
    const timeIdx = fields.findIndex(f => f.name === '🕐 Match Time');
    const countdownIdx = fields.findIndex(f => f.name === '⏰ Countdown');

    const timeField = { name: '🕐 Match Time', value: `<t:${unixTimestamp}:F>`, inline: true };
    const countdownField = { name: '⏰ Countdown', value: `<t:${unixTimestamp}:R>`, inline: true };

    if (timeIdx !== -1) {
      fields[timeIdx] = timeField;
    }
    if (countdownIdx !== -1) {
      fields[countdownIdx] = countdownField;
    }
    if (timeIdx === -1 && countdownIdx === -1) {
      embed.addFields(timeField, countdownField);
    }
  }

  private async updateEmbedMapsField(
    embed: EmbedBuilder,
    mapsJson: string | null
  ): Promise<{ maps: string[]; changed: boolean }> {
    let maps: string[] = [];
    if (mapsJson) {
      try {
        maps = JSON.parse(mapsJson);
      } catch {
        // ignore parse error
      }
    }

    const fields = embed.data.fields || [];
    const mapsIdx = fields.findIndex(f => f.name === '🗺️ Maps');

    if (maps.length > 0) {
      const mapNames: string[] = [];
      for (const mapId of maps) {
        const baseMapId = cleanMapId(mapId);
        mapNames.push((await getMapNameById(pgDb, baseMapId)) ?? baseMapId);
      }

      const mapsValue = mapNames.map(n => `**${n}**`).join('\n');
      const existingMapsValue = mapsIdx !== -1 ? fields[mapsIdx].value : null;
      const changed = existingMapsValue !== mapsValue;

      if (mapsIdx !== -1) {
        fields[mapsIdx] = { name: '🗺️ Maps', value: mapsValue, inline: false };
      } else {
        embed.addFields({ name: '🗺️ Maps', value: mapsValue, inline: false });
      }
      return { maps, changed };
    } 
      let changed = false;
      if (mapsIdx !== -1) {
        fields.splice(mapsIdx, 1);
        changed = true;
      }
      return { maps, changed };
    
  }

  private async updateMatchScheduledEvent(
    matchId: string,
    matchData: MatchEditData,
    messageRecord: MatchMessageRecord
  ): Promise<void> {
    if (!messageRecord.discord_event_id || !matchData.start_date || !this.settings?.guild_id) return;

    try {
      const guild = await this.client.guilds.fetch(this.settings.guild_id);
      const scheduledEvent = await guild.scheduledEvents.fetch(messageRecord.discord_event_id);
      if (scheduledEvent) {
        const startTime = new Date(matchData.start_date);
        const durationMinutes = (this.settings?.event_duration_minutes || 45);
        const endTime = new Date(startTime.getTime() + durationMinutes * 60 * 1000);

        await scheduledEvent.edit({
          name: matchData.name,
          scheduledStartTime: startTime,
          scheduledEndTime: endTime
        });
        logger.debug(`✅ Updated Discord scheduled event for match ${matchId}`);
      }
    } catch (eventError) {
      logger.warning(`⚠️ Could not update Discord scheduled event for match ${matchId}:`, (eventError as Error)?.message);
    }
  }

  private async updateMatchAnnouncementEmbed(
    matchId: string,
    matchData: MatchEditData,
    messageRecord: MatchMessageRecord
  ): Promise<void> {
    try {
      const channel = await this.fetchTextChannel(messageRecord.channel_id);
      if (!channel) return;

      const message = await channel.messages.fetch(messageRecord.message_id);
      if (!message || message.embeds.length === 0) return;

      const existingEmbed = EmbedBuilder.from(message.embeds[0]);

      existingEmbed.setTitle(capTitle(matchData.name));
      if (matchData.description) {
        existingEmbed.setDescription(matchData.description);
      }

      if (matchData.start_date) {
        this.updateEmbedTimeFields(existingEmbed, matchData.start_date);
      }

      const { maps, changed: mapsChanged } = await this.updateEmbedMapsField(existingEmbed, matchData.maps);

      const attachment = this.createEventAttachment(matchData.event_image_url ?? undefined, existingEmbed);

      await message.edit({
        content: null,
        embeds: [existingEmbed],
        components: message.components,
        files: attachment ? [attachment] : []
      });

      logger.debug(`✅ Updated Discord embed for match ${matchId}`);

      if (mapsChanged) {
        if (messageRecord.thread_id) {
          await this.deleteDiscordThread(messageRecord.thread_id);
        }

        let newThreadId: string | null = null;
        if (maps.length > 0 && this.announcementHandler) {
          const newThread = await this.announcementHandler.createMapsThread(
            message,
            matchData.name,
            matchData.game_id,
            maps,
            matchId
          );
          newThreadId = newThread?.id ?? null;
        }

        await this.db!.run(`
          UPDATE discord_match_messages SET thread_id = ?
          WHERE match_id = ? AND message_type = 'announcement'
        `, [newThreadId, matchId]);
      }
    } catch (embedError) {
      logger.error(`❌ Error updating embed for match ${matchId}:`, embedError);
    }
  }

  private async processSingleMatchEdit(edit: QueueRow<'matchEdit'>): Promise<void> {
    const matchId = edit.match_id;

    const matchData = await this.db!.get<MatchEditData>(`
      SELECT id, name, description, game_id, rules, maps, livestream_link, start_date, event_image_url
      FROM matches WHERE id = ?
    `, [matchId]);

    if (!matchData) {
      throw new Error(`Match ${matchId} not found`);
    }

    const messageRecord = await this.db!.get<MatchMessageRecord>(`
      SELECT message_id, channel_id, thread_id, discord_event_id
      FROM discord_match_messages
      WHERE match_id = ? AND message_type = 'announcement'
      LIMIT 1
    `, [matchId]);

    if (messageRecord) {
      await this.updateMatchAnnouncementEmbed(matchId, matchData, messageRecord);
      await this.updateMatchScheduledEvent(matchId, matchData, messageRecord);
    }

    await this.finish('matchEdit', edit.id);
  }

  async processMatchEditQueue() {
    if (!this.client.isReady() || !this.db) return;

    try {
      const edits = await this.claim('matchEdit', 5);

      for (const edit of edits) {
        try {
          await this.processSingleMatchEdit(edit);
        } catch (error) {
          logger.error(`❌ Error processing match edit ${edit.id}:`, error);
          await this.fail('matchEdit', edit.id, error);
        }
      }
    } catch (error) {
      logger.error('❌ Error processing match edit queue:', error);
    }
  }

  /**
   * One pass over every queue. A pass never starts while the previous one is still running (no overlapping ticks),
   * and claims left behind by a crashed worker are reset first.
   */
  async processAllQueues() {
    if (this.ticking) {
      logger.debug('⏭️ Queue tick skipped: previous tick still running');
      return;
    }
    this.ticking = true;
    try {
      try {
        await resetAbandonedClaims(this.queueDb);
      } catch (error) {
        logger.error('❌ Error resetting abandoned queue claims:', error);
      }

      await Promise.all([
        this.processAnnouncementQueue(),
        this.processDeletionQueue(),
        this.processStatusUpdateQueue(),
        this.processReminderQueue(),
        this.processPlayerReminderQueue(),
        this.processScoreNotificationQueue(),
        this.processVoiceAnnouncementQueue(),
        this.processMatchWinnerNotificationQueue(),
        this.processDiscordBotRequests(),
        this.processMatchEditQueue(),
        this.processHealthAlertQueue(),
        this.processStatsReportQueue(),
        // Must run in order: map code → winner vote → scorecard
        this.processMapCodeQueue()
          .then(() => this.processWinnerVoteQueue())
          .then(() => this.processScorecardPromptQueue()),
      ]);
    } finally {
      this.ticking = false;
    }
  }

  async processStatsReportQueue() {
    if (!this.client.isReady() || !this.db || !this.statsReportHandler) return;

    try {
      const pending = await this.claim('statsReport', 3);

      for (const item of pending) {
        try {
          await this.statsReportHandler.processMatch(item.match_id);
          await this.finish('statsReport', item.id);
        } catch (err) {
          logger.error(`Error processing stats report queue item ${item.id}:`, err);
          await this.fail('statsReport', item.id, err);
        }
      }
    } catch (error) {
      logger.error('❌ Error processing stats report queue:', error);
    }
  }

  async processHealthAlertQueue() {
    if (!this.client.isReady() || !this.db || !this.announcementHandler) return;

    try {
      const pending = await this.claim('healthAlert', 5);

      for (const item of pending) {
        try {
          if (alreadyPosted(item)) {
            await this.finish('healthAlert', item.id, { set: { posted_at: new Date() } });
            continue;
          }

          const messageId = await this.announcementHandler.postHealthAlert({
            severity: item.severity as 'critical' | 'warning',
            title: item.title,
            description: item.description ?? item.title,
          });
          await this.recordPosted('healthAlert', item.id, messageId);

          await this.finish('healthAlert', item.id, { set: { posted_at: new Date() } });
        } catch (err) {
          logger.error(`Error processing health alert queue item ${item.id}:`, err);
          await this.fail('healthAlert', item.id, err);
        }
      }
    } catch (error) {
      logger.error('❌ Error processing health alert queue:', error);
    }
  }

  async processScorecardPromptQueue() {
    if (!this.client.isReady() || !this.db || !this.scorecardHandler) return;

    try {
      const pending = await this.claim('scorecardPrompt', 5);

      for (const item of pending) {
        try {
          if (alreadyPosted(item)) {
            await this.finish('scorecardPrompt', item.id, { status: 'sent' });
            continue;
          }
          const sent = await this.scorecardHandler.sendScorecardPrompts(
            item.match_id,
            item.match_game_id,
            item.map_name || ''
          );
          if (!sent) {
            logger.debug(`No scorecard prompts sent for match ${item.match_id} (no eligible commanders)`);
          }
          await this.finish('scorecardPrompt', item.id, { status: 'sent' });
        } catch (err) {
          logger.error(`Error processing scorecard prompt queue item ${item.id}:`, err);
          // DM fan-out is not idempotent: never replay a partially delivered batch
          await this.fail('scorecardPrompt', item.id, err, { permanent: true });
        }
      }
    } catch (error) {
      logger.error('❌ Error processing scorecard prompt queue:', error);
    }
  }

  async processWinnerVoteQueue() {
    if (!this.client.isReady() || !this.db || !this.winnerVoteHandler) return;

    try {
      const pending = await this.claim('winnerVote', 5);

      for (const item of pending) {
        try {
          if (alreadyPosted(item)) {
            await this.finish('winnerVote', item.id, { status: 'sent' });
            continue;
          }
          const sent = await this.winnerVoteHandler.sendWinnerVotePrompts(
            item.match_id,
            item.match_game_id,
            item.map_name || ''
          );
          if (sent) {
            await this.finish('winnerVote', item.id, { status: 'sent' });
          } else {
            logger.debug(`No winner vote prompts sent for match ${item.match_id} (no eligible commanders)`);
            await this.fail('winnerVote', item.id, 'No winner vote prompts sent (no eligible commanders)', { permanent: true });
          }
        } catch (err) {
          logger.error(`Error processing winner vote queue item ${item.id}:`, err);
          // DM fan-out is not idempotent: never replay a partially delivered batch
          await this.fail('winnerVote', item.id, err, { permanent: true });
        }
      }
    } catch (error) {
      logger.error('❌ Error processing winner vote queue:', error);
    }
  }

  private async updateMatchMessagesForSignupClosure(matchId: string): Promise<boolean> {
    if (!this.client.isReady() || !this.db) {
      return false;
    }

    try {
      const matchData = await this.fetchMatchImageData(matchId);
      const messages = await this.fetchMatchAnnouncementMessages(matchId);

      if (messages.length === 0) {
        return true; // Not an error if no messages exist
      }

      const successCount = await this.updateMessagesForClosure(messages, matchData?.event_image_url);

      if (successCount === 0) {
        logger.error(`❌ Failed to update any Discord messages for match ${matchId}`);
        return false;
      }

      return true;
    } catch (error) {
      logger.error(`❌ Error updating Discord messages for signup closure:`, error);
      return false;
    }
  }

  private async fetchMatchImageData(matchId: string): Promise<{ event_image_url?: string } | undefined> {
    return await this.db!.get<{ event_image_url?: string }>(`
      SELECT event_image_url
      FROM matches
      WHERE id = ?
    `, [matchId]);
  }

  private async fetchMatchAnnouncementMessages(matchId: string): Promise<Array<{ message_id: string; channel_id: string; message_type: string }>> {
    return await this.db!.all<{
      message_id: string;
      channel_id: string;
      message_type: string;
    }>(`
      SELECT message_id, channel_id, message_type
      FROM discord_match_messages
      WHERE match_id = ? AND message_type = 'announcement'
    `, [matchId]);
  }

  private async updateMessagesForClosure(
    messages: Array<{ message_id: string; channel_id: string; message_type: string }>,
    eventImageUrl?: string
  ): Promise<number> {
    let successCount = 0;

    for (const messageRecord of messages) {
      try {
        const channel = await this.fetchTextChannel(messageRecord.channel_id);
        if (!channel) continue;

        const message = await channel.messages.fetch(messageRecord.message_id);
        if (!message) {
          logger.warning(`⚠️ Message ${messageRecord.message_id} not found in channel ${messageRecord.channel_id}`);
          continue;
        }

        const updatedEmbed = this.createClosedSignupEmbed(message);
        const attachment = this.createEventAttachment(eventImageUrl, updatedEmbed);

        await message.edit({
          content: null,
          embeds: [updatedEmbed],
          components: [],
          files: attachment ? [attachment] : []
        });

        successCount++;
      } catch (error) {
        logger.error(`❌ Failed to update Discord message ${messageRecord.message_id}:`, error);
      }
    }

    return successCount;
  }

  private async fetchTextChannel(channelId: string) {
    const channel = await this.client.channels.fetch(channelId);

    if (!channel?.isTextBased() || !('messages' in channel)) {
      logger.warning(`⚠️ Channel ${channelId} is not a text channel`);
      return null;
    }

    return channel;
  }

  private createClosedSignupEmbed(message: Message): EmbedBuilder {
    const updatedEmbed = message.embeds[0] ?
      EmbedBuilder.from(message.embeds[0]) : new EmbedBuilder();

    const existingFields = updatedEmbed.data.fields || [];
    const signupStatusFieldIndex = existingFields.findIndex(field => field.name === '📋 Signup Status');

    if (signupStatusFieldIndex === -1) {
      updatedEmbed.addFields([{
        name: '📋 Signup Status',
        value: '🔒 **Signups are now closed**',
        inline: false
      }]);
    }

    return updatedEmbed;
  }

  private createEventAttachment(eventImageUrl: string | undefined, embed: EmbedBuilder): AttachmentBuilder | undefined {
    if (!eventImageUrl || !eventImageUrl.trim()) {
      return undefined;
    }

    try {
      const imagePath = path.join(process.cwd(), 'public', eventImageUrl.replace(/^\//, ''));

      if (fs.existsSync(imagePath)) {
        const extension = path.extname(imagePath).slice(1);
        const fileName = `event_image.${extension}`;

        embed.setImage(`attachment://${fileName}`);

        return new AttachmentBuilder(imagePath, { name: fileName });
      } 
        logger.warning(`⚠️ Event image not found for reattachment: ${imagePath}`);
      
    } catch (error) {
      logger.error(`❌ Error recreating attachment for ${eventImageUrl}:`, error);
    }

    return undefined;
  }

  private async updateTournamentMessagesForSignupClosure(tournamentId: string): Promise<boolean> {
    if (!this.client.isReady() || !this.db) {
      return false;
    }

    try {
      logger.debug(`🔄 Updating tournament messages for signup closure: ${tournamentId}`);

      const tournamentData = await this.fetchTournamentImageData(tournamentId);
      const messages = await fetchTournamentMessages(this.db, tournamentId);

      logger.debug(`📝 Found ${messages.length} tournament messages to update`);

      if (messages.length === 0) {
        return true; // Not an error if no messages exist
      }

      const successCount = await this.updateTournamentMessagesBatch(messages, tournamentData);

      return this.evaluateUpdateSuccess(successCount, messages.length, tournamentId);
    } catch (error) {
      logger.error(`❌ Error updating Discord tournament messages for signup closure:`, error);
      return false;
    }
  }

  private async fetchTournamentImageData(tournamentId: string) {
    return await this.db!.get<{ event_image_url?: string }>(`
      SELECT event_image_url FROM tournaments WHERE id = ?
    `, [tournamentId]);
  }

  private async updateTournamentMessagesBatch(messages: any[], tournamentData: any): Promise<number> {
    let successCount = 0;

    for (const messageRecord of messages) {
      const success = await this.updateSingleTournamentMessage(messageRecord, tournamentData);
      if (success) {
        successCount++;
      }
    }

    return successCount;
  }

  private async updateSingleTournamentMessage(messageRecord: any, tournamentData: any): Promise<boolean> {
    try {
      const message = await this.fetchTournamentDiscordMessage(messageRecord);
      if (!message) {
        return false;
      }

      logger.debug(`🔄 Updating tournament message ${messageRecord.message_id}`);

      const updatedEmbed = this.buildUpdatedTournamentEmbed(message);
      const attachment = recreateAttachment(tournamentData?.event_image_url, updatedEmbed);

      await this.editTournamentMessage(message, updatedEmbed, attachment);

      logger.debug(`✅ Successfully updated tournament message ${messageRecord.message_id}`);
      return true;
    } catch (error) {
      logger.error(`❌ Failed to update Discord tournament message ${messageRecord.message_id}:`, error);
      return false;
    }
  }

  private async fetchTournamentDiscordMessage(messageRecord: any) {
    const channel = await this.client.channels.fetch(messageRecord.channel_id);

    if (!channel?.isTextBased() || !('messages' in channel)) {
      logger.warning(`⚠️ Channel ${messageRecord.channel_id} is not a text channel`);
      return null;
    }

    const message = await channel.messages.fetch(messageRecord.message_id);

    if (!message) {
      logger.warning(`⚠️ Message ${messageRecord.message_id} not found in channel ${messageRecord.channel_id}`);
      return null;
    }

    return message;
  }

  private buildUpdatedTournamentEmbed(message: any): EmbedBuilder {
    const existingEmbed = message.embeds[0] ? EmbedBuilder.from(message.embeds[0]) : null;
    return buildClosedSignupEmbed(existingEmbed);
  }

  private async editTournamentMessage(message: any, updatedEmbed: EmbedBuilder, attachment: any) {
    const editOptions: Record<string, unknown> = {
      content: null,
      embeds: [updatedEmbed],
      components: [],
      files: attachment ? [attachment] : []
    };

    logger.debug(`🔄 Editing tournament message with ${attachment ? 'attachment' : 'no attachment'}`);

    await message.edit(editOptions);
  }

  private evaluateUpdateSuccess(successCount: number, totalCount: number, tournamentId: string): boolean {
    if (successCount === 0) {
      logger.error(`❌ Failed to update any Discord messages for tournament ${tournamentId}`);
      return false;
    }

    logger.debug(`✅ Successfully updated ${successCount}/${totalCount} tournament messages for ${tournamentId}`);
    return true;
  }

  updateSettings(settings: DiscordSettings | null) {
    this.settings = settings;
  }

  updateVoiceHandler(voiceHandler: VoiceHandler | null) {
    this.voiceHandler = voiceHandler;
  }
}
