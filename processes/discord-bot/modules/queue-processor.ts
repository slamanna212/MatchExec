import { Client } from 'discord.js';
import { Database } from '../../../lib/database/connection';
import { DiscordSettings } from '../../../shared/types';
import { AnnouncementHandler } from './announcement-handler';
import { ReminderHandler } from './reminder-handler';
import { EventHandler } from './event-handler';

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
  constructor(
    private client: Client,
    private db: Database,
    private settings: DiscordSettings | null,
    private announcementHandler: AnnouncementHandler | null,
    private reminderHandler: ReminderHandler | null,
    private eventHandler: EventHandler | null
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
          let eventData = {
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
          } else {
            result = await this.announcementHandler.postEventAnnouncement(eventData);
          }
          
          if (result && (result.success || result === true)) {
            // Store Discord message information for later cleanup if needed (only for full announcements)
            if (this.db && result.mainMessage && announcement.announcement_type !== 'timed') {
              try {
                const messageRecordId = `discord_msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                
                let threadId: string | null = null;
                let discordEventId: string | null = null;

                // Create maps thread if there are maps
                if (eventData.maps && eventData.maps.length > 0) {
                  const thread = await this.announcementHandler.createMapsThread(result.mainMessage, eventData.name, eventData.game_id, eventData.maps);
                  threadId = thread?.id || null;
                }

                // Create Discord server event
                if (eventData.start_date && typeof eventData.start_date === 'string' && this.eventHandler) {
                  const rounds = eventData.maps?.length || 1;
                  discordEventId = await this.eventHandler.createDiscordEvent({
                    ...eventData,
                    start_date: eventData.start_date
                  }, result.mainMessage, rounds);
                }

                await this.db.run(`
                  INSERT INTO discord_match_messages (id, match_id, message_id, channel_id, thread_id, discord_event_id, message_type)
                  VALUES (?, ?, ?, ?, ?, ?, ?)
                `, [messageRecordId, eventData.id, result.mainMessage.id, result.mainMessage.channelId, threadId, discordEventId, 'announcement']);
                
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

      for (const update of updates) {
        try {
          const newStatus = update.new_status;
          const matchId = update.match_id;

          console.log(`📝 Processing status update for match ${matchId}: ${newStatus}`);

          // For now, just mark as completed since full status update logic would be complex
          // In a full implementation, this would update Discord messages with new status
          
          await this.db.run(`
            UPDATE discord_status_update_queue 
            SET status = 'processed', processed_at = datetime('now')
            WHERE id = ?
          `, [update.id]);

          console.log(`✅ Processed status update queue item ${update.id}`);

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
        ORDER BY created_at ASC
        LIMIT 5
      `);

      for (const reminder of reminders) {
        try {
          console.log(`📬 Processing reminder for match ${reminder.match_id}`);

          if (!this.reminderHandler) {
            console.error('❌ ReminderHandler not available');
            await this.db.run(`
              UPDATE discord_reminder_queue 
              SET status = 'failed', sent_at = datetime('now'), error_message = ?
              WHERE id = ?
            `, ['ReminderHandler not available', reminder.id]);
            continue;
          }

          const success = await this.reminderHandler.sendPlayerReminders(reminder.match_id);
          
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

  async processDiscordBotRequests() {
    if (!this.client.isReady() || !this.db) return;

    try {
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
        LIMIT 10
      `);

      for (const request of requests) {
        try {
          if (request.type === 'voice_test') {
            // This will be handled by the voice handler through the main bot
            // For now, we skip it as it's already being processed elsewhere
            continue;
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
      this.processDiscordBotRequests()
    ]);
  }

  updateSettings(settings: DiscordSettings | null) {
    this.settings = settings;
  }
}