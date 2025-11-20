import type { Client, Message } from 'discord.js';
import { EmbedBuilder, AttachmentBuilder } from 'discord.js';
import fs from 'fs';
import path from 'path';
import type { Database } from '../../../lib/database/connection';
import type { DiscordSettings } from '../../../shared/types';
import type { AnnouncementHandler } from './announcement-handler';
import type { ReminderHandler } from './reminder-handler';
import type { EventHandler } from './event-handler';
import type { VoiceHandler } from './voice-handler';
import type { SettingsManager } from './settings-manager';
import { logger } from '../../../src/lib/logger/server';

// Interfaces for different queue types - matching existing DB structure

interface QueuedDeletion {
  id: string;
  match_id: string;
  created_at: string;
}

interface QueuedStatusUpdate {
  id: string;
  match_id: string;
  new_status: string;
  created_at: string;
}

interface QueuedReminder {
  id: string;
  match_id: string;
  reminder_time: string;
  created_at: string;
}

interface QueuedScoreNotification {
  id: string;
  match_id: string;
  game_id: string;
  map_id: string;
  game_number: number;
  winner: 'team1' | 'team2';
  winning_team_name: string;
  winning_players: string;
  created_at: string;
}

interface QueuedVoiceAnnouncement {
  id: string;
  match_id: string;
  announcement_type: 'welcome' | 'nextround' | 'finish';
  blue_team_voice_channel: string | null;
  red_team_voice_channel: string | null;
  first_team: 'blue' | 'red';
  created_at: string;
}

interface QueuedMapCode {
  id: string;
  match_id: string;
  map_name: string;
  map_code: string;
  created_at: string;
}

interface QueuedMatchWinner {
  id: string;
  match_id: string;
  match_name: string;
  game_id: string;
  winner: 'team1' | 'team2' | 'tie' | 'tournament';
  winning_team_name: string;
  winning_players: string;
  team1_score: number;
  team2_score: number;
  total_maps: number;
  created_at: string;
}

interface BotRequest {
  id: string;
  type: string;
  data: string;
  created_at: string;
}

/**
 * Type for request handler functions
 */
type RequestHandler = (processor: QueueProcessor, request: BotRequest) => Promise<void>;

/**
 * Handles voice channel creation requests
 */
async function handleVoiceChannelCreate(processor: QueueProcessor, request: BotRequest): Promise<void> {
  const requestData = JSON.parse(request.data);
  const { matchId, categoryId, blueChannelName, redChannelName, isSingleTeam } = requestData;

  logger.debug(`Creating voice channel${isSingleTeam ? '' : 's'} for match ${matchId} in category ${categoryId}`);

  // Mark as processing
  const updateResult = await processor['db'].run(`
    UPDATE discord_bot_requests
    SET status = 'processing', updated_at = datetime('now')
    WHERE id = ? AND status = 'pending'
  `, [request.id]);

  if (updateResult.changes === 0) {
    return;
  }

  try {
    const settings = await processor['db'].get<{ guild_id: string }>(`SELECT guild_id FROM discord_settings LIMIT 1`);

    if (!settings?.guild_id) {
      throw new Error('Guild ID not configured');
    }

    const guild = await processor['client'].guilds.fetch(settings.guild_id);

    const blueChannel = await guild.channels.create({
      name: blueChannelName,
      type: 2,
      parent: categoryId,
    });

    let redChannel;
    if (!isSingleTeam && redChannelName) {
      redChannel = await guild.channels.create({
        name: redChannelName,
        type: 2,
        parent: categoryId,
      });
      logger.debug(`✅ Voice channels created: ${blueChannel.id}, ${redChannel.id}`);
    } else {
      logger.debug(`✅ Voice channel created: ${blueChannel.id}`);
    }

    await processor['db'].run(`
      UPDATE discord_bot_requests
      SET status = 'completed', result = ?, updated_at = datetime('now')
      WHERE id = ?
    `, [
      JSON.stringify({ success: true, blueChannelId: blueChannel.id, redChannelId: redChannel?.id }),
      request.id
    ]);
  } catch (error) {
    logger.error(`❌ Error creating voice channels:`, error);
    await processor['db'].run(`
      UPDATE discord_bot_requests
      SET status = 'failed', result = ?, updated_at = datetime('now')
      WHERE id = ?
    `, [
      JSON.stringify({ success: false, message: error instanceof Error ? error.message : 'Unknown error' }),
      request.id
    ]);
  }
}

/**
 * Handles voice channel deletion requests
 */
async function handleVoiceChannelDelete(processor: QueueProcessor, request: BotRequest): Promise<void> {
  const requestData = JSON.parse(request.data);
  const { channelId, matchId } = requestData;

  logger.debug(`Deleting voice channel ${channelId} for match ${matchId}`);

  const updateResult = await processor['db'].run(`
    UPDATE discord_bot_requests
    SET status = 'processing', updated_at = datetime('now')
    WHERE id = ? AND status = 'pending'
  `, [request.id]);

  if (updateResult.changes === 0) {
    return;
  }

  try {
    const channel = await processor['client'].channels.fetch(channelId);
    if (channel) {
      await channel.delete();
      logger.debug(`✅ Voice channel deleted: ${channelId}`);
    }

    await processor['db'].run(`
      UPDATE discord_bot_requests
      SET status = 'completed', result = ?, updated_at = datetime('now')
      WHERE id = ?
    `, [JSON.stringify({ success: true }), request.id]);
  } catch (error) {
    logger.warning(`⚠️ Error deleting voice channel ${channelId}:`, error instanceof Error ? error.message : 'Unknown');
    await processor['db'].run(`
      UPDATE discord_bot_requests
      SET status = 'completed', result = ?, updated_at = datetime('now')
      WHERE id = ?
    `, [JSON.stringify({ success: true, message: 'Channel may already be deleted' }), request.id]);
  }
}

/**
 * Handles voice test requests
 */
async function handleVoiceTest(processor: QueueProcessor, request: BotRequest): Promise<void> {
  const requestData = JSON.parse(request.data);
  const { userId, voiceId } = requestData;

  if (processor['processingVoiceTests'].has(userId)) {
    return;
  }

  processor['processingVoiceTests'].add(userId);

  const updateResult = await processor['db'].run(`
    UPDATE discord_bot_requests
    SET status = 'processing', updated_at = datetime('now')
    WHERE id = ? AND status = 'pending'
  `, [request.id]);

  if (updateResult.changes === 0) {
    processor['processingVoiceTests'].delete(userId);
    return;
  }

  try {
    if (!processor['voiceHandler']) {
      await processor['db'].run(`
        UPDATE discord_bot_requests
        SET status = 'failed', result = ?, updated_at = datetime('now')
        WHERE id = ?
      `, [JSON.stringify({ success: false, message: 'Voice handler not available' }), request.id]);
      logger.error(`❌ Voice handler not available for request ${request.id}`);
      return;
    }

    const result = await processor['voiceHandler'].testVoiceLineForUser(userId, voiceId);

    await processor['db'].run(`
      UPDATE discord_bot_requests
      SET status = ?, result = ?, updated_at = datetime('now')
      WHERE id = ?
    `, [result.success ? 'completed' : 'failed', JSON.stringify(result), request.id]);
  } finally {
    processor['processingVoiceTests'].delete(userId);
  }
}

/**
 * Registry of request type handlers
 */
const REQUEST_HANDLERS: Record<string, RequestHandler> = {
  'voice_channel_create': handleVoiceChannelCreate,
  'voice_channel_delete': handleVoiceChannelDelete,
  'voice_test': handleVoiceTest
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

  constructor(
    private client: Client,
    private db: Database,
    private settings: DiscordSettings | null,
    private announcementHandler: AnnouncementHandler | null,
    private reminderHandler: ReminderHandler | null,
    private eventHandler: EventHandler | null,
    private voiceHandler: VoiceHandler | null = null,
    private settingsManager: SettingsManager | null = null
  ) {}

  async processAnnouncementQueue() {
    if (!this.client.isReady() || !this.db) return;

    try {
      const announcements = await this.fetchPendingAnnouncements();

      for (const announcement of announcements) {
        await this.processSingleAnnouncement(announcement);
      }
    } catch (error) {
      logger.error('❌ Error processing announcement queue:', error);
    }
  }

  private async fetchPendingAnnouncements() {
    return await this.db!.all<{
      announcement_id: string;
      match_id: string;
      name: string;
      description: string;
      game_id: string;
      max_participants: number;
      guild_id: string;
      maps?: string;
      livestream_link?: string;
      event_image_url?: string;
      start_date?: string;
      rules?: 'competitive' | 'casual';
      announcement_type?: string;
      announcement_data?: string;
    }>(`
      SELECT daq.id as announcement_id, daq.match_id, daq.announcement_type, daq.announcement_data,
             COALESCE(m.name, t.name) as name,
             COALESCE(m.description, t.description) as description,
             COALESCE(m.game_id, t.game_id) as game_id,
             COALESCE(m.max_participants, t.max_participants) as max_participants,
             COALESCE(m.guild_id, ds.guild_id) as guild_id,
             m.maps, m.livestream_link, COALESCE(m.event_image_url, t.event_image_url) as event_image_url,
             COALESCE(m.start_date, t.start_time) as start_date,
             COALESCE(m.rules, 'casual') as rules
      FROM discord_announcement_queue daq
      LEFT JOIN matches m ON daq.match_id = m.id AND (daq.announcement_type IS NULL OR daq.announcement_type IN ('standard', 'match_start'))
      LEFT JOIN tournaments t ON daq.match_id = t.id AND daq.announcement_type = 'tournament'
      LEFT JOIN discord_settings ds ON daq.announcement_type = 'tournament'
      WHERE daq.status = 'pending' AND (m.id IS NOT NULL OR t.id IS NOT NULL)
      ORDER BY daq.created_at ASC
      LIMIT 5
    `);
  }

  private async processSingleAnnouncement(announcement: any) {
    try {
      logger.debug(`🚀 Processing announcement ${announcement.announcement_id} for match ${announcement.match_id} (type: ${announcement.announcement_type})`);

      const wasMarkedAsProcessing = await this.markAnnouncementAsProcessing(announcement.announcement_id);
      if (!wasMarkedAsProcessing) {
        return;
      }

      if (!this.announcementHandler) {
        await this.markAnnouncementAsFailed(announcement.announcement_id, 'AnnouncementHandler not available');
        return;
      }

      const eventData = this.buildEventData(announcement);
      const result = await this.postAnnouncementByType(announcement.announcement_type, eventData);

      if (result?.success) {
        await this.handleSuccessfulAnnouncement(announcement, result, eventData);
      } else {
        await this.markAnnouncementAsFailed(announcement.announcement_id, 'Failed to post announcement');
      }
    } catch (error) {
      logger.error(`❌ Error processing announcement ${announcement.announcement_id}:`, error);
      await this.markAnnouncementAsFailed(
        announcement.announcement_id,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  private async markAnnouncementAsProcessing(announcementId: string): Promise<boolean> {
    const updateResult = await this.db!.run(`
      UPDATE discord_announcement_queue
      SET status = 'processing', posted_at = datetime('now')
      WHERE id = ? AND status = 'pending'
    `, [announcementId]);

    return updateResult.changes !== 0;
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
      try {
        const timingData = JSON.parse(announcement.announcement_data);
        eventData._timingInfo = timingData;
      } catch {
        logger.warning('Could not parse timing data for timed announcement:', announcement.announcement_id);
      }
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
      const messageRecordId = `discord_msg_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
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
    await this.db!.run(`
      UPDATE discord_announcement_queue
      SET status = 'completed', posted_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [announcementId]);
  }

  private async markAnnouncementAsFailed(announcementId: string, errorMessage: string) {
    logger.error(`❌ ${errorMessage}`);
    await this.db!.run(`
      UPDATE discord_announcement_queue
      SET status = 'failed', posted_at = datetime('now'), error_message = ?
      WHERE id = ?
    `, [errorMessage, announcementId]);
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
  private async processSingleDeletion(deletion: QueuedDeletion): Promise<void> {
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
    await this.db.run(`
      UPDATE discord_deletion_queue
      SET status = 'completed', processed_at = datetime('now')
      WHERE id = ?
    `, [deletion.id]);
  }

  async processDeletionQueue() {
    if (!this.client.isReady() || !this.db) return;

    try {
      const deletions = await this.db.all<QueuedDeletion>(`
        SELECT id, match_id, created_at
        FROM discord_deletion_queue
        WHERE status = 'pending'
        ORDER BY created_at ASC
        LIMIT 10
      `);

      for (const deletion of deletions) {
        try {
          await this.processSingleDeletion(deletion);
        } catch (error) {
          logger.error(`❌ Error processing deletion ${deletion.id}:`, error);

          // Mark as failed
          await this.db.run(`
            UPDATE discord_deletion_queue
            SET status = 'failed', processed_at = datetime('now')
            WHERE id = ?
          `, [deletion.id]);
        }
      }
    } catch (error) {
      logger.error('❌ Error processing deletion queue:', error);
    }
  }

  async processStatusUpdateQueue() {
    if (!this.client.isReady() || !this.db) return;

    try {
      const updates = await this.db.all<QueuedStatusUpdate>(`
        SELECT id, match_id, new_status, created_at
        FROM discord_status_update_queue
        WHERE status = 'pending'
        ORDER BY created_at ASC
        LIMIT 5
      `);

      if (updates.length > 0) {
      }

      for (const update of updates) {
        try {
          const newStatus = update.new_status;
          const matchId = update.match_id;


          // Update Discord messages based on the new status
          let success = false;
          
          try {
            if (newStatus === 'assign') {
              // When transitioning to 'assign' (signups closed), remove signup buttons
              // Check if this is a tournament or match
              const isTournament = matchId.startsWith('tournament_');
              if (isTournament) {
                success = await this.updateTournamentMessagesForSignupClosure(matchId);
              } else {
                success = await this.updateMatchMessagesForSignupClosure(matchId);
              }
            } else {
              // For other status changes, just log for now
              success = true;
            }
          } catch (error) {
            logger.error(`❌ Error updating Discord messages for status ${newStatus}:`, error);
            success = false;
          }
          
          // Mark as completed or failed based on result
          const finalStatus = success ? 'completed' : 'failed';
          const errorMessage = success ? null : 'Failed to update Discord messages';
          
          await this.db.run(`
            UPDATE discord_status_update_queue 
            SET status = ?, processed_at = datetime('now'), error_message = ?
            WHERE id = ?
          `, [finalStatus, errorMessage, update.id]);


        } catch (error) {
          logger.error(`❌ Error processing status update ${update.id}:`, error);
          
          await this.db.run(`
            UPDATE discord_status_update_queue 
            SET status = 'failed', processed_at = datetime('now')
            WHERE id = ?
          `, [update.id]);
        }
      }
    } catch (error) {
      logger.error('❌ Error processing status update queue:', error);
    }
  }

  async processReminderQueue() {
    if (!this.client.isReady() || !this.db) return;

    try {
      const reminders = await this.db.all<QueuedReminder>(`
        SELECT id, match_id, reminder_time, created_at
        FROM discord_reminder_queue
        WHERE status = 'pending'
        AND datetime(reminder_time) <= datetime('now')
        ORDER BY created_at ASC
        LIMIT 5
      `);

      if (reminders.length === 0) {
        logger.debug('ℹ️ No reminders ready to send');
        return;
      }

      logger.debug(`📬 Processing ${reminders.length} reminder(s)`);

      for (const reminder of reminders) {
        try {

          if (!this.announcementHandler) {
            logger.error('❌ AnnouncementHandler not available');
            await this.db.run(`
              UPDATE discord_reminder_queue
              SET status = 'failed', sent_at = datetime('now'), error_message = ?
              WHERE id = ?
            `, ['AnnouncementHandler not available', reminder.id]);
            continue;
          }

          // Get match data for timed reminder
          const matchData = await this.db.get<{
            id: string;
            name: string;
            description: string;
            game_id: string;
            start_date: string;
            event_image_url?: string;
          }>(`
            SELECT id, name, description, game_id, start_date, event_image_url
            FROM matches WHERE id = ?
          `, [reminder.match_id]);

          if (!matchData) {
            throw new Error('Match not found');
          }

          logger.debug(`📨 Sending reminder for match: ${matchData.name}`);

          // Calculate actual time difference for display
          const now = new Date();
          const matchStart = new Date(matchData.start_date);
          const timeDiffMs = matchStart.getTime() - now.getTime();
          const timeDiffMinutes = Math.round(timeDiffMs / (1000 * 60));

          let timingInfo: { value: number; unit: 'minutes' | 'hours' | 'days' } = { value: timeDiffMinutes, unit: 'minutes' };

          // Convert to hours if more than 90 minutes
          if (timeDiffMinutes > 90) {
            const hours = Math.round(timeDiffMinutes / 60);
            timingInfo = { value: hours, unit: 'hours' };
          }

          // Send timed reminder to channels (not player DMs)
          const success = await this.announcementHandler.postTimedReminder({
            ...matchData,
            _timingInfo: timingInfo
          });

          if (success) {
            logger.debug(`✅ Reminder sent successfully for match: ${matchData.name}`);
          } else {
            logger.warning(`⚠️ Failed to send reminder for match: ${matchData.name}`);
          }

          // Mark as completed or failed based on result
          const status = success ? 'completed' : 'failed';
          await this.db.run(`
            UPDATE discord_reminder_queue
            SET status = ?, sent_at = datetime('now')
            WHERE id = ?
          `, [status, reminder.id]);


        } catch (error) {
          logger.error(`❌ Error processing reminder ${reminder.id}:`, error);

          await this.db.run(`
            UPDATE discord_reminder_queue
            SET status = 'failed', sent_at = datetime('now'), error_message = ?
            WHERE id = ?
          `, [error instanceof Error ? error.message : 'Unknown error', reminder.id]);
        }
      }
    } catch (error) {
      logger.error('❌ Error processing reminder queue:', error);
    }
  }

  async processPlayerReminderQueue() {
    if (!this.client.isReady() || !this.db) return;

    try {
      const playerReminders = await this.db.all<{
        id: string;
        match_id: string;
        reminder_time: string;
        created_at: string;
      }>(`
        SELECT id, match_id, reminder_time, created_at
        FROM discord_player_reminder_queue
        WHERE status = 'pending' 
        AND datetime(reminder_time) <= datetime('now')
        ORDER BY created_at ASC
        LIMIT 5
      `);

      for (const reminder of playerReminders) {
        try {

          if (!this.reminderHandler) {
            logger.error('❌ ReminderHandler not available');
            await this.db.run(`
              UPDATE discord_player_reminder_queue 
              SET status = 'failed', sent_at = datetime('now'), error_message = ?
              WHERE id = ?
            `, ['ReminderHandler not available', reminder.id]);
            continue;
          }

          // Check if player notifications are enabled for this match
          const matchSettings = await this.db.get<{
            player_notifications: number;
            name: string;
          }>(`
            SELECT player_notifications, name FROM matches WHERE id = ?
          `, [reminder.match_id]);

          if (!matchSettings) {
            throw new Error('Match not found');
          }

          if (!matchSettings.player_notifications) {
            // Mark as completed since this is expected behavior
            await this.db.run(`
              UPDATE discord_player_reminder_queue 
              SET status = 'completed', sent_at = datetime('now')
              WHERE id = ?
            `, [reminder.id]);
            continue;
          }

          // Send DMs to players (only if notifications are enabled)
          const success = await this.reminderHandler.sendPlayerReminders(reminder.match_id);
          
          // Mark as completed or failed based on result
          const status = success ? 'completed' : 'failed';
          await this.db.run(`
            UPDATE discord_player_reminder_queue 
            SET status = ?, sent_at = datetime('now')
            WHERE id = ?
          `, [status, reminder.id]);


        } catch (error) {
          logger.error(`❌ Error processing player reminder ${reminder.id}:`, error);
          
          await this.db.run(`
            UPDATE discord_player_reminder_queue 
            SET status = 'failed', sent_at = datetime('now'), error_message = ?
            WHERE id = ?
          `, [error instanceof Error ? error.message : 'Unknown error', reminder.id]);
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
      await this.db.run(`
        DELETE FROM discord_bot_requests
        WHERE status IN ('completed', 'failed')
        AND datetime(updated_at, '+1 hour') < datetime('now')
      `);

      // Clean up really old pending/processing requests (older than 5 minutes)
      await this.db.run(`
        UPDATE discord_bot_requests
        SET status = 'failed', result = ?, updated_at = datetime('now')
        WHERE status IN ('pending', 'processing')
        AND datetime(created_at, '+5 minutes') < datetime('now')
      `, [JSON.stringify({ success: false, message: 'Request abandoned - too old' })]);

      // Process bot requests
      const requests = await this.db.all<BotRequest>(`
        SELECT id, type, data, created_at
        FROM discord_bot_requests
        WHERE status = 'pending'
        ORDER BY created_at ASC
        LIMIT 5
      `);

      for (const request of requests) {
        try {
          // Use registry to handle request types
          const handler = REQUEST_HANDLERS[request.type];

          if (handler) {
            await handler(this, request);
          } else {
            logger.warning(`⚠️ Unknown request type: ${request.type}`);
          }

        } catch (error) {
          logger.error(`❌ Error processing request ${request.id}:`, error);

          // Mark request as failed
          await this.db.run(`
            UPDATE discord_bot_requests
            SET status = 'failed', result = ?, updated_at = datetime('now')
            WHERE id = ?
          `, [
            JSON.stringify({ success: false, message: error instanceof Error ? error.message : 'Unknown error' }),
            request.id
          ]);
        }
      }
    } catch (error) {
      logger.error('❌ Error processing Discord bot requests:', error);
    }
  }

  async processScoreNotificationQueue() {
    if (!this.client.isReady() || !this.db) return;

    try {
      const scoreNotifications = await this.db.all<QueuedScoreNotification>(`
        SELECT id, match_id, game_id, map_id, game_number, winner, 
               winning_team_name, winning_players, created_at
        FROM discord_score_notification_queue
        WHERE status = 'pending'
        ORDER BY created_at ASC
        LIMIT 5
      `);

      for (const notification of scoreNotifications) {
        try {
          // Immediately mark as processing to prevent duplicate processing
          const updateResult = await this.db.run(`
            UPDATE discord_score_notification_queue 
            SET status = 'processing', sent_at = datetime('now')
            WHERE id = ? AND status = 'pending'
          `, [notification.id]);
          
          if (updateResult.changes === 0) {
            continue;
          }

          if (!this.announcementHandler) {
            logger.error('❌ AnnouncementHandler not available');
            await this.db.run(`
              UPDATE discord_score_notification_queue 
              SET status = 'failed', sent_at = datetime('now'), error_message = ?
              WHERE id = ?
            `, ['AnnouncementHandler not available', notification.id]);
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

          // Parse winning players from JSON
          let winningPlayers: string[] = [];
          try {
            winningPlayers = JSON.parse(notification.winning_players);
          } catch {
            logger.warning('Could not parse winning players JSON for notification:', notification.id);
          }

          // Build score notification data
          const scoreData = {
            matchId: notification.match_id,
            matchName: matchData.name,
            gameId: notification.game_id,
            gameNumber: notification.game_number,
            mapId: notification.map_id,
            winner: notification.winner,
            winningTeamName: notification.winning_team_name,
            winningPlayers: winningPlayers
          };

          // Post the score notification
          const result = await this.announcementHandler.postMapScoreNotification(scoreData);
          
          if (result && typeof result === 'object' && result.success) {
            // Mark as completed
            await this.db.run(`
              UPDATE discord_score_notification_queue 
              SET status = 'completed', sent_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `, [notification.id]);

            logger.debug(`✅ Score notification sent for match ${notification.match_id}, game ${notification.game_number}`);
          } else {
            // Mark as failed
            await this.db.run(`
              UPDATE discord_score_notification_queue 
              SET status = 'failed', error_message = 'Failed to post score notification'
              WHERE id = ?
            `, [notification.id]);

            logger.error(`❌ Failed to post score notification for ${notification.id}`);
          }
        } catch (error) {
          logger.error(`❌ Error processing score notification ${notification.id}:`, error);
          
          // Mark as failed
          await this.db.run(`
            UPDATE discord_score_notification_queue 
            SET status = 'failed', sent_at = datetime('now'), error_message = ?
            WHERE id = ?
          `, [error instanceof Error ? error.message : 'Unknown error', notification.id]);
        }
      }
    } catch (error) {
      logger.error('❌ Error processing score notification queue:', error);
    }
  }

  async processVoiceAnnouncementQueue() {
    if (!this.client.isReady() || !this.db) return;

    try {
      const voiceAnnouncements = await this.db.all<QueuedVoiceAnnouncement>(`
        SELECT id, match_id, announcement_type, blue_team_voice_channel, 
               red_team_voice_channel, first_team, created_at
        FROM discord_voice_announcement_queue
        WHERE status = 'pending'
        ORDER BY created_at ASC
        LIMIT 5
      `);

      for (const announcement of voiceAnnouncements) {
        try {
          // Immediately mark as processing to prevent duplicate processing
          const updateResult = await this.db.run(`
            UPDATE discord_voice_announcement_queue
            SET status = 'processing', updated_at = datetime('now')
            WHERE id = ? AND status = 'pending'
          `, [announcement.id]);
          
          if (updateResult.changes === 0) {
            continue;
          }

          // Check if this is a welcome announcement and if delay should be applied
          if (announcement.announcement_type === 'welcome') {
            // Get match start delay setting from discord_settings
            const settings = await this.db.get<{ match_start_delay_seconds?: number }>(`
              SELECT match_start_delay_seconds FROM discord_settings LIMIT 1
            `);

            const delaySecs = settings?.match_start_delay_seconds ?? 45;

            // Calculate if delay has elapsed
            const createdAt = new Date(`${announcement.created_at  }Z`).getTime();
            const now = Date.now();
            const elapsedSecs = (now - createdAt) / 1000;

            if (elapsedSecs < delaySecs) {
              // Delay hasn't elapsed yet, mark back as pending
              await this.db.run(`
                UPDATE discord_voice_announcement_queue
                SET status = 'pending', updated_at = datetime('now')
                WHERE id = ?
              `, [announcement.id]);

              logger.debug(`⏰ Welcome announcement for match ${announcement.match_id} delayed (${Math.ceil(delaySecs - elapsedSecs)}s remaining)`);
              continue;
            }
          }

          if (!this.voiceHandler) {
            logger.error('❌ VoiceHandler not available');
            await this.db.run(`
              UPDATE discord_voice_announcement_queue
              SET status = 'failed', completed_at = datetime('now'), error_message = ?
              WHERE id = ?
            `, ['VoiceHandler not available', announcement.id]);
            continue;
          }

          logger.debug(`🔊 Processing ${announcement.announcement_type} voice announcement for match ${announcement.match_id}`);

          // Play the team announcements sequentially
          const result = await this.voiceHandler.playTeamAnnouncements(
            announcement.blue_team_voice_channel,
            announcement.red_team_voice_channel,
            announcement.announcement_type,
            announcement.first_team
          );

          if (result.success) {
            // Update the alternation tracker
            await this.voiceHandler.updateFirstTeam(announcement.match_id, announcement.first_team);

            // Mark as completed
            await this.db.run(`
              UPDATE discord_voice_announcement_queue
              SET status = 'completed', completed_at = datetime('now')
              WHERE id = ?
            `, [announcement.id]);

            logger.debug(`✅ Voice announcement completed for match ${announcement.match_id}: ${announcement.announcement_type}`);
          } else {
            // Mark as failed
            await this.db.run(`
              UPDATE discord_voice_announcement_queue 
              SET status = 'failed', completed_at = datetime('now'), error_message = ?
              WHERE id = ?
            `, [result.message, announcement.id]);

            logger.error(`❌ Failed to play voice announcement for ${announcement.id}: ${result.message}`);
          }
        } catch (error) {
          logger.error(`❌ Error processing voice announcement ${announcement.id}:`, error);
          
          // Mark as failed
          await this.db.run(`
            UPDATE discord_voice_announcement_queue
            SET status = 'failed', completed_at = datetime('now'), error_message = ?
            WHERE id = ?
          `, [error instanceof Error ? error.message : 'Unknown error', announcement.id]);
        }
      }
    } catch (error) {
      logger.error('❌ Error processing voice announcement queue:', error);
    }
  }

  async processMapCodeQueue() {
    if (!this.client.isReady() || !this.db) return;

    try {
      const mapCodes = await this.db.all<QueuedMapCode>(`
        SELECT id, match_id, map_name, map_code, created_at
        FROM discord_map_code_queue
        WHERE status = 'pending'
        ORDER BY created_at ASC
        LIMIT 5
      `);

      for (const mapCodeRequest of mapCodes) {
        try {
          // Immediately mark as processing to prevent duplicate processing
          const updateResult = await this.db.run(`
            UPDATE discord_map_code_queue 
            SET status = 'processing', processed_at = datetime('now')
            WHERE id = ? AND status = 'pending'
          `, [mapCodeRequest.id]);
          
          if (updateResult.changes === 0) {
            continue;
          }

          if (!this.reminderHandler) {
            logger.error('❌ ReminderHandler not available');
            await this.db.run(`
              UPDATE discord_map_code_queue 
              SET status = 'failed', processed_at = datetime('now'), error_message = ?
              WHERE id = ?
            `, ['ReminderHandler not available', mapCodeRequest.id]);
            continue;
          }

          logger.debug(`📱 Processing map code PMs for match ${mapCodeRequest.match_id}, map: ${mapCodeRequest.map_name}`);

          // Send map code PMs via the reminder handler
          const result = await this.reminderHandler.sendMapCodePMs(
            mapCodeRequest.match_id,
            mapCodeRequest.map_name,
            mapCodeRequest.map_code
          );

          if (result) {
            // Mark as completed
            await this.db.run(`
              UPDATE discord_map_code_queue 
              SET status = 'completed', processed_at = datetime('now')
              WHERE id = ?
            `, [mapCodeRequest.id]);

            logger.debug(`✅ Map code PMs sent for match ${mapCodeRequest.match_id}, map: ${mapCodeRequest.map_name}`);
          } else {
            // Mark as failed
            await this.db.run(`
              UPDATE discord_map_code_queue 
              SET status = 'failed', processed_at = datetime('now'), error_message = ?
              WHERE id = ?
            `, ['Failed to send map code PMs', mapCodeRequest.id]);

            logger.error(`❌ Failed to send map code PMs for ${mapCodeRequest.id}`);
          }
        } catch (error) {
          logger.error(`❌ Error processing map code request ${mapCodeRequest.id}:`, error);
          
          // Mark as failed
          await this.db.run(`
            UPDATE discord_map_code_queue 
            SET status = 'failed', processed_at = datetime('now'), error_message = ?
            WHERE id = ?
          `, [error instanceof Error ? error.message : 'Unknown error', mapCodeRequest.id]);
        }
      }
    } catch (error) {
      logger.error('❌ Error processing map code queue:', error);
    }
  }

  async processMatchWinnerNotificationQueue() {
    if (!this.client.isReady() || !this.db) return;

    try {
      const winnerNotifications = await this.db.all<QueuedMatchWinner>(`
        SELECT id, match_id, match_name, game_id, winner, winning_team_name, 
               winning_players, team1_score, team2_score, total_maps, created_at
        FROM discord_match_winner_queue
        WHERE status = 'pending'
        ORDER BY created_at ASC
        LIMIT 5
      `);

      for (const notification of winnerNotifications) {
        try {
          // Immediately mark as processing to prevent duplicate processing
          const updateResult = await this.db.run(`
            UPDATE discord_match_winner_queue 
            SET status = 'processing', sent_at = datetime('now')
            WHERE id = ? AND status = 'pending'
          `, [notification.id]);
          
          if (updateResult.changes === 0) {
            continue;
          }

          if (!this.announcementHandler) {
            logger.error('❌ AnnouncementHandler not available');
            await this.db.run(`
              UPDATE discord_match_winner_queue 
              SET status = 'failed', sent_at = datetime('now'), error_message = ?
              WHERE id = ?
            `, ['AnnouncementHandler not available', notification.id]);
            continue;
          }

          // Parse winning players from JSON
          let winningPlayers: string[] = [];
          try {
            winningPlayers = JSON.parse(notification.winning_players);
          } catch {
            logger.warning('Could not parse winning players JSON for winner notification:', notification.id);
          }

          let result;

          // Check if this is a tournament winner notification (winner field = 'tournament')
          if (notification.winner === 'tournament') {
            // Build tournament winner notification data
            const tournamentData = {
              tournamentId: notification.match_id, // We stored tournament ID in match_id
              tournamentName: notification.match_name.replace('🏆 ', ''), // Remove trophy emoji
              gameId: notification.game_id,
              winner: notification.match_id, // Tournament ID
              winningTeamName: notification.winning_team_name,
              winningPlayers: winningPlayers,
              format: (notification.team2_score === 1 ? 'double-elimination' : 'single-elimination') as 'double-elimination' | 'single-elimination', // Decoded from team2_score
              totalParticipants: notification.team1_score // Stored in team1_score
            };

            logger.debug(`🏆 Sending tournament winner notification for ${tournamentData.tournamentName}`);

            // Post the tournament winner notification (no delay needed for tournaments)
            result = await this.announcementHandler.postTournamentWinnerNotification(tournamentData);
          } else {
            // Build regular match winner notification data
            const winnerData = {
              matchId: notification.match_id,
              matchName: notification.match_name,
              gameId: notification.game_id,
              winner: notification.winner,
              winningTeamName: notification.winning_team_name,
              winningPlayers: winningPlayers,
              team1Score: notification.team1_score,
              team2Score: notification.team2_score,
              totalMaps: notification.total_maps
            };

            // Wait 15 seconds to ensure last map winner embed goes out first
            logger.debug(`⏱️ Waiting 15 seconds before sending match winner notification for ${notification.match_name}`);
            await new Promise(resolve => setTimeout(resolve, 15000));

            // Post the match winner notification
            result = await this.announcementHandler.postMatchWinnerNotification(winnerData);
          }
          
          if (result && typeof result === 'object' && result.success) {
            // Mark as completed
            await this.db.run(`
              UPDATE discord_match_winner_queue 
              SET status = 'completed', sent_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `, [notification.id]);

            logger.debug(`🏆 Match winner notification sent: ${notification.winning_team_name} wins ${notification.match_name}`);
          } else {
            // Mark as failed
            await this.db.run(`
              UPDATE discord_match_winner_queue 
              SET status = 'failed', error_message = 'Failed to post match winner notification'
              WHERE id = ?
            `, [notification.id]);

            logger.error(`❌ Failed to post match winner notification for ${notification.id}`);
          }
        } catch (error) {
          logger.error(`❌ Error processing match winner notification ${notification.id}:`, error);
          
          // Mark as failed
          await this.db.run(`
            UPDATE discord_match_winner_queue 
            SET status = 'failed', sent_at = datetime('now'), error_message = ?
            WHERE id = ?
          `, [error instanceof Error ? error.message : 'Unknown error', notification.id]);
        }
      }
    } catch (error) {
      logger.error('❌ Error processing match winner notification queue:', error);
    }
  }

  async processAllQueues() {
    await Promise.all([
      this.processAnnouncementQueue(),
      this.processDeletionQueue(), 
      this.processStatusUpdateQueue(),
      this.processReminderQueue(),
      this.processPlayerReminderQueue(),
      this.processScoreNotificationQueue(),
      this.processVoiceAnnouncementQueue(),
      this.processMapCodeQueue(),
      this.processMatchWinnerNotificationQueue(),
      this.processDiscordBotRequests()
    ]);
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