import { Client } from 'discord.js';
import { Database } from '../../../lib/database/connection';
import { DiscordSettings } from '../../../shared/types';

// Interfaces for different queue types
interface QueuedAnnouncement {
  id: string;
  match_id?: string;
  data?: string;
  announcement_type?: string;
  announcement_data?: string;
  created_at: string;
}

interface QueuedDeletion {
  id: string;
  data: string;
  created_at: string;
}

interface QueuedStatusUpdate {
  id: string;
  match_id: string;
  data: string;
  created_at: string;
}

interface QueuedReminder {
  id: string;
  match_id: string;
  data: string;
  created_at: string;
}

export class QueueProcessor {
  constructor(
    private client: Client,
    private db: Database,
    private settings: DiscordSettings | null,
    private announcementHandler: any,
    private reminderHandler: any,
    private eventHandler: any
  ) {}

  async processAnnouncementQueue() {
    if (!this.client.isReady() || !this.db) return;

    try {
      const announcements = await this.db.all<QueuedAnnouncement>(`
        SELECT id, match_id, data, announcement_type, announcement_data, created_at
        FROM discord_announcement_queue
        WHERE status = 'pending'
        ORDER BY created_at ASC
        LIMIT 5
      `);

      for (const announcement of announcements) {
        try {
          let eventData;
          
          if (announcement.announcement_type === 'timed' && announcement.match_id) {
            // For timed announcements, fetch match data from database
            const match = await this.db.get(`
              SELECT m.*, g.name as game_name, g.icon_url as game_icon
              FROM matches m
              LEFT JOIN games g ON m.game_id = g.id  
              WHERE m.id = ?
            `, [announcement.match_id]);
            
            if (!match) {
              console.error(`❌ Match not found for timed announcement: ${announcement.match_id}`);
              await this.db.run(`
                UPDATE discord_announcement_queue 
                SET status = 'failed', posted_at = datetime('now')
                WHERE id = ?
              `, [announcement.id]);
              continue;
            }
            
            // Parse maps if they exist
            let maps = [];
            if (match.maps) {
              try {
                maps = JSON.parse(match.maps);
              } catch (e) {
                console.warn('Could not parse maps for match:', match.id);
              }
            }
            
            // Convert database format to announcement format
            eventData = {
              id: match.id,
              name: match.name,
              description: match.description,
              game_id: match.game_id,
              game_name: match.game_name,
              game_icon: match.game_icon,
              start_date: match.start_date,
              livestream_link: match.livestream_link,
              rules: match.rules,
              maps: maps,
              event_image_url: match.event_image_url,
              max_participants: match.max_participants
            };
            
            // Add timing info to the event data for display
            const timingData = JSON.parse(announcement.announcement_data || '{}');
            eventData._timingInfo = timingData;
            
          } else {
            // Standard announcement with embedded data
            eventData = JSON.parse(announcement.data || '{}');
          }
          
          // Use different posting methods based on announcement type
          let result;
          if (announcement.announcement_type === 'timed') {
            result = await this.announcementHandler.postTimedReminder(eventData);
          } else {
            result = await this.announcementHandler.postEventAnnouncement(eventData);
          }
          
          if (result && result.success) {
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
                if (eventData.start_date && typeof eventData.start_date === 'string') {
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

            // Mark as completed
            await this.db.run(`
              UPDATE discord_announcement_queue 
              SET status = 'completed', posted_at = datetime('now')
              WHERE id = ?
            `, [announcement.id]);

            console.log(`✅ Processed announcement queue item ${announcement.id}`);
          } else {
            // Mark as failed
            await this.db.run(`
              UPDATE discord_announcement_queue 
              SET status = 'failed', posted_at = datetime('now')
              WHERE id = ?
            `, [announcement.id]);

            console.log(`❌ Failed to process announcement queue item ${announcement.id}`);
          }
        } catch (error) {
          console.error(`❌ Error processing announcement ${announcement.id}:`, error);
          
          // Mark as failed
          await this.db.run(`
            UPDATE discord_announcement_queue 
            SET status = 'failed', posted_at = datetime('now')
            WHERE id = ?
          `, [announcement.id]);
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
        SELECT id, data, created_at
        FROM discord_deletion_queue
        WHERE status = 'pending'
        ORDER BY created_at ASC
        LIMIT 10
      `);

      for (const deletion of deletions) {
        try {
          const deletionData = JSON.parse(deletion.data);
          const { matchId } = deletionData;

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
              if (record.discord_event_id) {
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
            SET status = 'completed', processed_at = datetime('now')
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
        SELECT id, match_id, data, created_at
        FROM discord_status_update_queue
        WHERE status = 'pending'
        ORDER BY created_at ASC
        LIMIT 5
      `);

      for (const update of updates) {
        try {
          const updateData = JSON.parse(update.data);
          const { newStatus, matchId } = updateData;

          console.log(`📝 Processing status update for match ${matchId}: ${newStatus}`);

          // For now, just mark as completed since full status update logic would be complex
          // In a full implementation, this would update Discord messages with new status
          
          await this.db.run(`
            UPDATE discord_status_update_queue 
            SET status = 'completed', processed_at = datetime('now')
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
        SELECT id, match_id, data, created_at
        FROM discord_reminder_queue
        WHERE status = 'pending'
        ORDER BY created_at ASC
        LIMIT 5
      `);

      for (const reminder of reminders) {
        try {
          console.log(`📬 Processing reminder for match ${reminder.match_id}`);

          const success = await this.reminderHandler.sendPlayerReminders(reminder.match_id);
          
          // Mark as completed or failed based on result
          const status = success ? 'completed' : 'failed';
          await this.db.run(`
            UPDATE discord_reminder_queue 
            SET status = ?, processed_at = datetime('now')
            WHERE id = ?
          `, [status, reminder.id]);

          const resultIcon = success ? '✅' : '❌';
          console.log(`${resultIcon} Processed reminder queue item ${reminder.id} for match ${reminder.match_id}`);

        } catch (error) {
          console.error(`❌ Error processing reminder ${reminder.id}:`, error);
          
          await this.db.run(`
            UPDATE discord_reminder_queue 
            SET status = 'failed', processed_at = datetime('now')
            WHERE id = ?
          `, [reminder.id]);
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