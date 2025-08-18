import { Client, EmbedBuilder, AttachmentBuilder } from 'discord.js';
import fs from 'fs';
import path from 'path';
import { Database } from '../../../lib/database/connection';
import { DiscordSettings } from '../../../shared/types';
import { AnnouncementHandler } from './announcement-handler';
import { ReminderHandler } from './reminder-handler';
import { EventHandler } from './event-handler';
import { VoiceHandler } from './voice-handler';

// Interfaces for different queue types - matching existing DB structure
interface QueuedAnnouncement {
  id: string;
  match_id?: string;
  announcement_type?: string;
  announcement_data?: string;
  created_at: string;
}

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

export class QueueProcessor {
  private processingVoiceTests = new Set<string>(); // Track users currently processing voice tests

  constructor(
    private client: Client,
    private db: Database,
    private settings: DiscordSettings | null,
    private announcementHandler: AnnouncementHandler | null,
    private reminderHandler: ReminderHandler | null,
    private eventHandler: EventHandler | null,
    private voiceHandler: VoiceHandler | null = null
  ) {}

  async processAnnouncementQueue() {
    if (!this.client.isReady() || !this.db) return;

    try {
      // Use the original approach - JOIN with matches table to get all needed data
      const announcements = await this.db.all<{
        id: string;
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
        SELECT daq.id, daq.match_id, daq.announcement_type, daq.announcement_data,
               m.name, m.description, m.game_id, m.max_participants, m.guild_id, 
               m.maps, m.livestream_link, m.event_image_url, m.start_date, m.rules
        FROM discord_announcement_queue daq
        JOIN matches m ON daq.match_id = m.id
        WHERE daq.status = 'pending'
        ORDER BY daq.created_at ASC
        LIMIT 5
      `);

      for (const announcement of announcements) {
        try {
          // Parse maps if they exist
          let maps: string[] = [];
          if (announcement.maps) {
            try {
              maps = JSON.parse(announcement.maps);
            } catch (e) {
              maps = [];
            }
          }

          // Build event data object
          let eventData: any = {
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

          // Handle timed announcements with special timing info
          if (announcement.announcement_type === 'timed' && announcement.announcement_data) {
            try {
              const timingData = JSON.parse(announcement.announcement_data);
              eventData._timingInfo = timingData;
            } catch (e) {
              console.warn('Could not parse timing data for timed announcement:', announcement.id);
            }
          }
          
          if (!this.announcementHandler) {
            console.error('❌ AnnouncementHandler not available');
            await this.db.run(`
              UPDATE discord_announcement_queue 
              SET status = 'failed', posted_at = datetime('now'), error_message = ?
              WHERE id = ?
            `, ['AnnouncementHandler not available', announcement.id]);
            continue;
          }

          // Post the announcement
          let result;
          if (announcement.announcement_type === 'timed') {
            result = await this.announcementHandler.postTimedReminder(eventData);
          } else if (announcement.announcement_type === 'match_start') {
            result = await this.announcementHandler.postMatchStartAnnouncement(eventData);
          } else {
            result = await this.announcementHandler.postEventAnnouncement(eventData);
          }
          
          if (result && (result === true || (typeof result === 'object' && result.success))) {
            // Store Discord message information for later cleanup if needed (only for full announcements)
            if (this.db && typeof result === 'object' && 'mainMessage' in result && result.mainMessage && announcement.announcement_type !== 'timed') {
              try {
                const messageRecordId = `discord_msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                
                let threadId: string | null = null;
                let discordEventId: string | null = null;

                // Create maps thread if there are maps
                if (eventData.maps && eventData.maps.length > 0) {
                  const thread = await this.announcementHandler.createMapsThread((result as any).mainMessage, eventData.name, eventData.game_id, eventData.maps);
                  threadId = thread?.id || null;
                }

                // Create Discord server event
                if (eventData.start_date && typeof eventData.start_date === 'string' && this.eventHandler) {
                  const rounds = eventData.maps?.length || 1;
                  discordEventId = await this.eventHandler.createDiscordEvent({
                    ...eventData,
                    start_date: eventData.start_date
                  }, (result as any).mainMessage, rounds);
                }

                await this.db.run(`
                  INSERT INTO discord_match_messages (id, match_id, message_id, channel_id, thread_id, discord_event_id, message_type)
                  VALUES (?, ?, ?, ?, ?, ?, ?)
                `, [messageRecordId, eventData.id, (result as any).mainMessage.id, (result as any).mainMessage.channelId, threadId, discordEventId, 'announcement']);
                
                console.log(`✅ Stored Discord message tracking for match: ${eventData.id}`);
              } catch (error) {
                console.error('❌ Error storing Discord message tracking:', error);
              }
            }

            // Mark as posted using CURRENT_TIMESTAMP like the original
            await this.db.run(`
              UPDATE discord_announcement_queue 
              SET status = 'posted', posted_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `, [announcement.id]);

            console.log(`✅ Posted announcement for: ${announcement.name}`);
          } else {
            // Mark as failed
            await this.db.run(`
              UPDATE discord_announcement_queue 
              SET status = 'failed', error_message = 'Failed to post announcement'
              WHERE id = ?
            `, [announcement.id]);

            console.log(`❌ Failed to post announcement for: ${announcement.name}`);
          }
        } catch (error) {
          console.error(`❌ Error processing announcement ${announcement.id}:`, error);
          
          // Mark as failed
          await this.db.run(`
            UPDATE discord_announcement_queue 
            SET status = 'failed', posted_at = datetime('now'), error_message = ?
            WHERE id = ?
          `, [error instanceof Error ? error.message : 'Unknown error', announcement.id]);
        }
      }
    } catch (error) {
      console.error('❌ Error processing announcement queue:', error);
    }
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

          let deletedCount = 0;

          for (const record of messages) {
            try {
              // Delete the Discord message
              const channel = await this.client.channels.fetch(record.channel_id);
              if (channel?.isTextBased() && 'messages' in channel) {
                await channel.messages.delete(record.message_id);
                deletedCount++;
                console.log(`🗑️ Deleted message ${record.message_id} from channel ${record.channel_id}`);
              }

              // Delete thread if exists
              if (record.thread_id) {
                try {
                  const thread = await this.client.channels.fetch(record.thread_id);
                  if (thread?.isThread()) {
                    await thread.delete();
                    console.log(`🗑️ Deleted thread ${record.thread_id}`);
                  }
                } catch (error) {
                  console.warn(`⚠️ Could not delete thread ${record.thread_id}:`, (error as Error)?.message);
                }
              }

              // Delete Discord event if exists
              if (record.discord_event_id && this.eventHandler) {
                const success = await this.eventHandler.deleteDiscordEvent(record.discord_event_id);
                if (success) {
                  console.log(`🗑️ Deleted Discord event ${record.discord_event_id}`);
                }
              }

            } catch (error) {
              console.warn(`⚠️ Could not delete message ${record.message_id}:`, (error as Error)?.message);
            }
          }

          // Clean up message tracking records
          await this.db.run(`
            DELETE FROM discord_match_messages WHERE match_id = ?
          `, [matchId]);

          // Mark deletion as completed
          await this.db.run(`
            UPDATE discord_deletion_queue 
            SET status = 'processed', processed_at = datetime('now')
            WHERE id = ?
          `, [deletion.id]);

          console.log(`✅ Processed deletion queue item ${deletion.id} - deleted ${deletedCount} messages`);

        } catch (error) {
          console.error(`❌ Error processing deletion ${deletion.id}:`, error);
          
          // Mark as failed
          await this.db.run(`
            UPDATE discord_deletion_queue 
            SET status = 'failed', processed_at = datetime('now')
            WHERE id = ?
          `, [deletion.id]);
        }
      }
    } catch (error) {
      console.error('❌ Error processing deletion queue:', error);
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
        console.log(`🔄 Processing ${updates.length} status update(s) from queue`);
      }

      for (const update of updates) {
        try {
          const newStatus = update.new_status;
          const matchId = update.match_id;

          console.log(`📝 Processing status update for match ${matchId}: ${newStatus}`);

          // Update Discord messages based on the new status
          let success = false;
          
          try {
            if (newStatus === 'assign') {
              // When transitioning to 'assign' (signups closed), remove signup buttons
              success = await this.updateMatchMessagesForSignupClosure(matchId);
            } else {
              // For other status changes, just log for now
              console.log(`📝 Status update to ${newStatus} - no Discord message changes needed`);
              success = true;
            }
          } catch (error) {
            console.error(`❌ Error updating Discord messages for status ${newStatus}:`, error);
            success = false;
          }
          
          // Mark as completed or failed based on result
          const finalStatus = success ? 'processed' : 'failed';
          const errorMessage = success ? null : 'Failed to update Discord messages';
          
          await this.db.run(`
            UPDATE discord_status_update_queue 
            SET status = ?, processed_at = datetime('now'), error_message = ?
            WHERE id = ?
          `, [finalStatus, errorMessage, update.id]);

          const statusIcon = success ? '✅' : '❌';
          console.log(`${statusIcon} Processed status update queue item ${update.id} for match ${matchId}`);

        } catch (error) {
          console.error(`❌ Error processing status update ${update.id}:`, error);
          
          await this.db.run(`
            UPDATE discord_status_update_queue 
            SET status = 'failed', processed_at = datetime('now')
            WHERE id = ?
          `, [update.id]);
        }
      }
    } catch (error) {
      console.error('❌ Error processing status update queue:', error);
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

      for (const reminder of reminders) {
        try {
          console.log(`📬 Processing reminder for match ${reminder.match_id}`);

          if (!this.announcementHandler) {
            console.error('❌ AnnouncementHandler not available');
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

          // Calculate actual time difference for display
          const now = new Date();
          const matchStart = new Date(matchData.start_date);
          const timeDiffMs = matchStart.getTime() - now.getTime();
          const timeDiffMinutes = Math.round(timeDiffMs / (1000 * 60));
          
          let timingInfo = { value: timeDiffMinutes, unit: 'minutes' };
          
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
          
          // Mark as completed or failed based on result
          const status = success ? 'sent' : 'failed';
          await this.db.run(`
            UPDATE discord_reminder_queue 
            SET status = ?, sent_at = datetime('now')
            WHERE id = ?
          `, [status, reminder.id]);

          const resultIcon = success ? '✅' : '❌';
          console.log(`${resultIcon} Processed reminder queue item ${reminder.id} for match ${reminder.match_id}`);

        } catch (error) {
          console.error(`❌ Error processing reminder ${reminder.id}:`, error);
          
          await this.db.run(`
            UPDATE discord_reminder_queue 
            SET status = 'failed', sent_at = datetime('now'), error_message = ?
            WHERE id = ?
          `, [error instanceof Error ? error.message : 'Unknown error', reminder.id]);
        }
      }
    } catch (error) {
      console.error('❌ Error processing reminder queue:', error);
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
          console.log(`📱 Processing player reminder DMs for match ${reminder.match_id}`);

          if (!this.reminderHandler) {
            console.error('❌ ReminderHandler not available');
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
            console.log(`⏭️ Player notifications disabled for match ${matchSettings.name}, skipping DMs`);
            // Mark as completed since this is expected behavior
            await this.db.run(`
              UPDATE discord_player_reminder_queue 
              SET status = 'skipped', sent_at = datetime('now')
              WHERE id = ?
            `, [reminder.id]);
            continue;
          }

          // Send DMs to players (only if notifications are enabled)
          const success = await this.reminderHandler.sendPlayerReminders(reminder.match_id);
          
          // Mark as completed or failed based on result
          const status = success ? 'sent' : 'failed';
          await this.db.run(`
            UPDATE discord_player_reminder_queue 
            SET status = ?, sent_at = datetime('now')
            WHERE id = ?
          `, [status, reminder.id]);

          const resultIcon = success ? '✅' : '❌';
          console.log(`${resultIcon} Processed player reminder queue item ${reminder.id} for match ${reminder.match_id}`);

        } catch (error) {
          console.error(`❌ Error processing player reminder ${reminder.id}:`, error);
          
          await this.db.run(`
            UPDATE discord_player_reminder_queue 
            SET status = 'failed', sent_at = datetime('now'), error_message = ?
            WHERE id = ?
          `, [error instanceof Error ? error.message : 'Unknown error', reminder.id]);
        }
      }
    } catch (error) {
      console.error('❌ Error processing player reminder queue:', error);
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
      
      // Process voice test requests and other bot requests
      const requests = await this.db.all<{
        id: string;
        type: string;
        data: string;
        created_at: string;
      }>(`
        SELECT id, type, data, created_at
        FROM discord_bot_requests
        WHERE status = 'pending'
        ORDER BY created_at ASC
        LIMIT 5
      `);

      for (const request of requests) {
        try {
          if (request.type === 'voice_test') {
            // Parse the request data
            const requestData = JSON.parse(request.data);
            const { userId, voiceId } = requestData;
            
            // Check if we're already processing a voice test for this user
            if (this.processingVoiceTests.has(userId)) {
              console.log(`⏭️ Voice test already being processed for user ${userId}, skipping request ${request.id}`);
              continue;
            }
            
            console.log(`🔊 Processing voice test request ${request.id} for user ${userId}`);
            
            // Mark user as being processed
            this.processingVoiceTests.add(userId);
            
            // Immediately mark the request as processing to prevent duplicate processing
            const updateResult = await this.db.run(`
              UPDATE discord_bot_requests
              SET status = 'processing', updated_at = datetime('now')
              WHERE id = ? AND status = 'pending'
            `, [request.id]);
            
            if (updateResult.changes === 0) {
              console.log(`⏭️ Request ${request.id} was already processed by another queue cycle, skipping`);
              this.processingVoiceTests.delete(userId);
              continue;
            }
            
            try {
              // Get the voice handler from the bot instance
              if (!this.voiceHandler) {
                await this.db.run(`
                  UPDATE discord_bot_requests
                  SET status = 'failed', result = ?, updated_at = datetime('now')
                  WHERE id = ?
                `, [
                  JSON.stringify({ success: false, message: 'Voice handler not available' }),
                  request.id
                ]);
                console.error(`❌ Voice handler not available for request ${request.id}`);
                continue;
              }
              
              // Process the voice test
              const result = await this.voiceHandler.testVoiceLineForUser(userId, voiceId);
              
              // Update the request with the final result
              await this.db.run(`
                UPDATE discord_bot_requests
                SET status = ?, result = ?, updated_at = datetime('now')
                WHERE id = ?
              `, [
                result.success ? 'completed' : 'failed',
                JSON.stringify(result),
                request.id
              ]);
              
              const statusIcon = result.success ? '✅' : '❌';
              console.log(`${statusIcon} Processed voice test request ${request.id}: ${result.message}`);
              
            } finally {
              // Always remove user from processing set
              this.processingVoiceTests.delete(userId);
            }
          }
          
          // Handle other request types here in the future
          
        } catch (error) {
          console.error(`❌ Error processing request ${request.id}:`, error);
          
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
      console.error('❌ Error processing Discord bot requests:', error);
    }
  }

  async processAllQueues() {
    await Promise.all([
      this.processAnnouncementQueue(),
      this.processDeletionQueue(), 
      this.processStatusUpdateQueue(),
      this.processReminderQueue(),
      this.processPlayerReminderQueue(),
      this.processDiscordBotRequests()
    ]);
  }

  private async updateMatchMessagesForSignupClosure(matchId: string): Promise<boolean> {
    if (!this.client.isReady() || !this.db) {
      console.log(`❌ Cannot update messages - client ready: ${this.client.isReady()}, db: ${!!this.db}`);
      return false;
    }

    try {
      console.log(`🔍 Looking for Discord messages to update for match ${matchId}`);
      
      // Get match data with image info for recreating attachments
      const matchData = await this.db.get<{
        event_image_url?: string;
      }>(`
        SELECT event_image_url
        FROM matches
        WHERE id = ?
      `, [matchId]);
      
      // Get all announcement messages for this match
      const messages = await this.db.all<{
        message_id: string;
        channel_id: string;
        message_type: string;
      }>(`
        SELECT message_id, channel_id, message_type
        FROM discord_match_messages
        WHERE match_id = ? AND message_type = 'announcement'
      `, [matchId]);

      console.log(`🔍 Found ${messages.length} Discord messages for match ${matchId}`);

      if (messages.length === 0) {
        // Let's check if there are ANY messages for this match
        const allMessages = await this.db.all<{
          message_id: string;
          channel_id: string;
          message_type: string;
        }>(`
          SELECT message_id, channel_id, message_type
          FROM discord_match_messages
          WHERE match_id = ?
        `, [matchId]);
        
        console.log(`🔍 Total messages for match ${matchId}: ${allMessages.length}`);
        if (allMessages.length > 0) {
          console.log(`🔍 Message types found:`, allMessages.map(m => m.message_type));
        }
        
        console.log(`⚠️ No announcement-type Discord messages found for match ${matchId}`);
        return true; // Not an error if no messages exist
      }

      let successCount = 0;

      for (const messageRecord of messages) {
        try {
          // Fetch the Discord channel
          const channel = await this.client.channels.fetch(messageRecord.channel_id);
          
          if (!channel?.isTextBased() || !('messages' in channel)) {
            console.warn(`⚠️ Channel ${messageRecord.channel_id} is not a text channel`);
            continue;
          }

          // Fetch the Discord message
          const message = await channel.messages.fetch(messageRecord.message_id);
          
          if (!message) {
            console.warn(`⚠️ Message ${messageRecord.message_id} not found in channel ${messageRecord.channel_id}`);
            continue;
          }

          console.log(`🔍 SIGNUP CLOSURE DEBUG - Message ${messageRecord.message_id}:`);
          console.log(`🔍 Original message has ${message.embeds.length} embeds`);
          console.log(`🔍 Original message has ${message.attachments.size} attachments`);
          
          if (message.embeds[0]) {
            console.log(`🔍 Original embed data:`, JSON.stringify(message.embeds[0].data, null, 2));
          }
          
          if (message.attachments.size > 0) {
            console.log(`🔍 Original attachments:`, Array.from(message.attachments.values()).map(a => ({
              id: a.id,
              name: a.name,
              url: a.url,
              proxyURL: a.proxyURL
            })));
          }

          // Create updated embed - copy the existing embed exactly but add signups closed message
          const updatedEmbed = message.embeds[0] ? 
            EmbedBuilder.from(message.embeds[0]) : new EmbedBuilder();
          
          console.log(`🔍 Embed before modification:`, JSON.stringify(updatedEmbed.data, null, 2));
          
          // Keep the image in the embed - don't remove it
          // The key is to NOT provide any files in the edit options, which prevents the duplicate image above
          if (updatedEmbed.data.image?.url) {
            console.log(`🔍 Found image URL: ${updatedEmbed.data.image.url} - keeping it in embed`);
          } else {
            console.log(`🔍 No image found in embed`);
          }
          
          // Just add a simple signups closed message at the bottom, don't change anything else
          const existingFields = updatedEmbed.data.fields || [];
          const signupStatusFieldIndex = existingFields.findIndex(field => field.name === '📋 Signup Status');
          
          if (signupStatusFieldIndex === -1) {
            console.log(`🔍 Adding signup status field`);
            // Add new field at the bottom
            updatedEmbed.addFields([{
              name: '📋 Signup Status',
              value: '🔒 **Signups are now closed**',
              inline: false
            }]);
          } else {
            console.log(`🔍 Signup status field already exists at index ${signupStatusFieldIndex}`);
          }

          console.log(`🔍 Embed after modification:`, JSON.stringify(updatedEmbed.data, null, 2));

          // Recreate attachment if there's an event image to prevent Discord from stripping it
          let attachment: AttachmentBuilder | undefined;
          if (matchData?.event_image_url && matchData.event_image_url.trim()) {
            try {
              // Convert URL path to file system path for local files
              const imagePath = path.join(process.cwd(), 'public', matchData.event_image_url.replace(/^\//, ''));
              
              if (fs.existsSync(imagePath)) {
                // Create attachment for the event image
                attachment = new AttachmentBuilder(imagePath, {
                  name: `event_image.${path.extname(imagePath).slice(1)}`
                });
                
                // Update embed to use attachment://filename to reference the reattached image
                updatedEmbed.setImage(`attachment://event_image.${path.extname(imagePath).slice(1)}`);
                
                console.log(`🔍 Recreated attachment for image: ${matchData.event_image_url}`);
              } else {
                console.warn(`⚠️ Event image not found for reattachment: ${imagePath}`);
              }
            } catch (error) {
              console.error(`❌ Error recreating attachment for ${matchData.event_image_url}:`, error);
            }
          }

          const editOptions: any = {
            content: null, // Explicitly clear any content that might cause image display
            embeds: [updatedEmbed],
            components: [], // This removes all buttons
            files: attachment ? [attachment] : [] // Include recreated attachment if available
          };
          
          console.log(`🔍 Edit options:`, JSON.stringify(editOptions, null, 2));

          // Remove all action rows (signup buttons) but keep everything else the same
          await message.edit(editOptions);
          
          console.log(`🔍 Message edit completed for ${messageRecord.message_id}`);

          successCount++;
          console.log(`✅ Updated Discord message ${messageRecord.message_id} - removed signup button`);

        } catch (error) {
          console.error(`❌ Failed to update Discord message ${messageRecord.message_id}:`, error);
        }
      }

      if (successCount === 0) {
        console.error(`❌ Failed to update any Discord messages for match ${matchId}`);
        return false;
      }

      console.log(`✅ Successfully updated ${successCount} Discord message(s) for match ${matchId} - signup buttons removed`);
      return true;

    } catch (error) {
      console.error(`❌ Error updating Discord messages for signup closure:`, error);
      return false;
    }
  }

  updateSettings(settings: DiscordSettings | null) {
    this.settings = settings;
  }

  updateVoiceHandler(voiceHandler: VoiceHandler | null) {
    this.voiceHandler = voiceHandler;
  }
}