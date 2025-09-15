import { Client, EmbedBuilder, AttachmentBuilder } from 'discord.js';
import fs from 'fs';
import path from 'path';
import { Database } from '../../../lib/database/connection';
import { DiscordSettings } from '../../../shared/types';
import { AnnouncementHandler } from './announcement-handler';
import { ReminderHandler } from './reminder-handler';
import { EventHandler } from './event-handler';
import { VoiceHandler } from './voice-handler';
import { SettingsManager } from './settings-manager';

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
  winner: 'team1' | 'team2' | 'tie';
  winning_team_name: string;
  winning_players: string;
  team1_score: number;
  team2_score: number;
  total_maps: number;
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
    private voiceHandler: VoiceHandler | null = null,
    private settingsManager: SettingsManager | null = null
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
               COALESCE(m.name, t.name) as name, 
               COALESCE(m.description, t.description) as description, 
               COALESCE(m.game_id, t.game_id) as game_id, 
               COALESCE(m.max_participants, t.max_participants) as max_participants, 
               COALESCE(m.guild_id, ds.guild_id) as guild_id, 
               m.maps, m.livestream_link, m.event_image_url, 
               COALESCE(m.start_date, t.start_time) as start_date, 
               COALESCE(m.rules, 'casual') as rules
        FROM discord_announcement_queue daq
        LEFT JOIN matches m ON daq.match_id = m.id AND daq.announcement_type != 'tournament'
        LEFT JOIN tournaments t ON daq.match_id = t.id AND daq.announcement_type = 'tournament'
        LEFT JOIN discord_settings ds ON daq.announcement_type = 'tournament'
        WHERE daq.status = 'pending' AND (m.id IS NOT NULL OR t.id IS NOT NULL)
        ORDER BY daq.created_at ASC
        LIMIT 5
      `);

      for (const announcement of announcements) {
        try {
          // Immediately mark as processing to prevent duplicate processing by concurrent queue cycles
          const updateResult = await this.db.run(`
            UPDATE discord_announcement_queue 
            SET status = 'processing', posted_at = datetime('now')
            WHERE id = ? AND status = 'pending'
          `, [announcement.id]);
          
          if (updateResult.changes === 0) {
            continue;
          }

          // Parse maps if they exist
          let maps: string[] = [];
          if (announcement.maps) {
            try {
              maps = JSON.parse(announcement.maps);
            } catch {
              maps = [];
            }
          }

          // Build event data object
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

          // Handle timed announcements with special timing info
          if (announcement.announcement_type === 'timed' && announcement.announcement_data) {
            try {
              const timingData = JSON.parse(announcement.announcement_data);
              eventData._timingInfo = timingData;
            } catch {
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
            result = await this.announcementHandler.postTimedReminder(eventData as any);
          } else if (announcement.announcement_type === 'match_start') {
            result = await this.announcementHandler.postMatchStartAnnouncement(eventData as any);
          } else {
            result = await this.announcementHandler.postEventAnnouncement(eventData as any);
          }
          
          if (result && typeof result === 'object' && result.success) {
            // Store Discord message information for later cleanup if needed (only for full announcements)
            if (this.db && typeof result === 'object' && 'mainMessage' in result && result.mainMessage && announcement.announcement_type !== 'timed') {
              try {
                const messageRecordId = `discord_msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                
                let threadId: string | null = null;
                let discordEventId: string | null = null;

                // Create maps thread if there are maps
                const maps = eventData.maps as string[];
                if (maps && maps.length > 0) {
                  const thread = await this.announcementHandler.createMapsThread(
                    (result as Record<string, unknown>).mainMessage as any, 
                    eventData.name as string, 
                    eventData.game_id as string, 
                    maps, 
                    eventData.id as string
                  );
                  threadId = thread?.id || null;
                }

                // Create Discord server event
                if (eventData.start_date && typeof eventData.start_date === 'string' && this.eventHandler) {
                  const rounds = maps?.length || 1;
                  discordEventId = await this.eventHandler.createDiscordEvent(
                    eventData as any,
                    (result as Record<string, unknown>).mainMessage as any, 
                    rounds
                  );
                }

                await this.db.run(`
                  INSERT INTO discord_match_messages (id, match_id, message_id, channel_id, thread_id, discord_event_id, message_type)
                  VALUES (?, ?, ?, ?, ?, ?, ?)
                `, [messageRecordId, eventData.id as string, ((result as Record<string, unknown>).mainMessage as any).id, ((result as Record<string, unknown>).mainMessage as any).channelId, threadId, discordEventId, 'announcement']);
                
              } catch (error) {
                console.error('❌ Error storing Discord message tracking:', error);
              }
            }

            // Mark as completed using CURRENT_TIMESTAMP like the original
            await this.db.run(`
              UPDATE discord_announcement_queue 
              SET status = 'completed', posted_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `, [announcement.id]);

          } else {
            // Mark as failed
            await this.db.run(`
              UPDATE discord_announcement_queue 
              SET status = 'failed', error_message = 'Failed to post announcement'
              WHERE id = ?
            `, [announcement.id]);

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


          for (const record of messages) {
            try {
              // Delete the Discord message
              const channel = await this.client.channels.fetch(record.channel_id);
              if (channel?.isTextBased() && 'messages' in channel) {
                await channel.messages.delete(record.message_id);
              }

              // Delete thread if exists
              if (record.thread_id) {
                try {
                  const thread = await this.client.channels.fetch(record.thread_id);
                  if (thread?.isThread()) {
                    await thread.delete();
                  }
                } catch (error) {
                  console.warn(`⚠️ Could not delete thread ${record.thread_id}:`, (error as Error)?.message);
                }
              }

              // Delete Discord event if exists
              if (record.discord_event_id && this.eventHandler) {
                const success = await this.eventHandler.deleteDiscordEvent(record.discord_event_id);
                if (success) {
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
              success = await this.updateMatchMessagesForSignupClosure(matchId);
            } else {
              // For other status changes, just log for now
              success = true;
            }
          } catch (error) {
            console.error(`❌ Error updating Discord messages for status ${newStatus}:`, error);
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
          
          // Mark as completed or failed based on result
          const status = success ? 'completed' : 'failed';
          await this.db.run(`
            UPDATE discord_reminder_queue 
            SET status = ?, sent_at = datetime('now')
            WHERE id = ?
          `, [status, reminder.id]);


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
              continue;
            }
            
            
            // Mark user as being processed
            this.processingVoiceTests.add(userId);
            
            // Immediately mark the request as processing to prevent duplicate processing
            const updateResult = await this.db.run(`
              UPDATE discord_bot_requests
              SET status = 'processing', updated_at = datetime('now')
              WHERE id = ? AND status = 'pending'
            `, [request.id]);
            
            if (updateResult.changes === 0) {
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
            console.error('❌ AnnouncementHandler not available');
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
            console.warn('Could not parse winning players JSON for notification:', notification.id);
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

            console.log(`✅ Score notification sent for match ${notification.match_id}, game ${notification.game_number}`);
          } else {
            // Mark as failed
            await this.db.run(`
              UPDATE discord_score_notification_queue 
              SET status = 'failed', error_message = 'Failed to post score notification'
              WHERE id = ?
            `, [notification.id]);

            console.error(`❌ Failed to post score notification for ${notification.id}`);
          }
        } catch (error) {
          console.error(`❌ Error processing score notification ${notification.id}:`, error);
          
          // Mark as failed
          await this.db.run(`
            UPDATE discord_score_notification_queue 
            SET status = 'failed', sent_at = datetime('now'), error_message = ?
            WHERE id = ?
          `, [error instanceof Error ? error.message : 'Unknown error', notification.id]);
        }
      }
    } catch (error) {
      console.error('❌ Error processing score notification queue:', error);
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

          if (!this.voiceHandler) {
            console.error('❌ VoiceHandler not available');
            await this.db.run(`
              UPDATE discord_voice_announcement_queue 
              SET status = 'failed', completed_at = datetime('now'), error_message = ?
              WHERE id = ?
            `, ['VoiceHandler not available', announcement.id]);
            continue;
          }

          console.log(`🔊 Processing ${announcement.announcement_type} voice announcement for match ${announcement.match_id}`);

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

            console.log(`✅ Voice announcement completed for match ${announcement.match_id}: ${announcement.announcement_type}`);
          } else {
            // Mark as failed
            await this.db.run(`
              UPDATE discord_voice_announcement_queue 
              SET status = 'failed', completed_at = datetime('now'), error_message = ?
              WHERE id = ?
            `, [result.message, announcement.id]);

            console.error(`❌ Failed to play voice announcement for ${announcement.id}: ${result.message}`);
          }
        } catch (error) {
          console.error(`❌ Error processing voice announcement ${announcement.id}:`, error);
          
          // Mark as failed
          await this.db.run(`
            UPDATE discord_voice_announcement_queue 
            SET status = 'failed', completed_at = datetime('now'), error_message = ?
            WHERE id = ?
          `, [error instanceof Error ? error.message : 'Unknown error', announcement.id]);
        }
      }
    } catch (error) {
      console.error('❌ Error processing voice announcement queue:', error);
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
            console.error('❌ ReminderHandler not available');
            await this.db.run(`
              UPDATE discord_map_code_queue 
              SET status = 'failed', processed_at = datetime('now'), error_message = ?
              WHERE id = ?
            `, ['ReminderHandler not available', mapCodeRequest.id]);
            continue;
          }

          console.log(`📱 Processing map code PMs for match ${mapCodeRequest.match_id}, map: ${mapCodeRequest.map_name}`);

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

            console.log(`✅ Map code PMs sent for match ${mapCodeRequest.match_id}, map: ${mapCodeRequest.map_name}`);
          } else {
            // Mark as failed
            await this.db.run(`
              UPDATE discord_map_code_queue 
              SET status = 'failed', processed_at = datetime('now'), error_message = ?
              WHERE id = ?
            `, ['Failed to send map code PMs', mapCodeRequest.id]);

            console.error(`❌ Failed to send map code PMs for ${mapCodeRequest.id}`);
          }
        } catch (error) {
          console.error(`❌ Error processing map code request ${mapCodeRequest.id}:`, error);
          
          // Mark as failed
          await this.db.run(`
            UPDATE discord_map_code_queue 
            SET status = 'failed', processed_at = datetime('now'), error_message = ?
            WHERE id = ?
          `, [error instanceof Error ? error.message : 'Unknown error', mapCodeRequest.id]);
        }
      }
    } catch (error) {
      console.error('❌ Error processing map code queue:', error);
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
            console.error('❌ AnnouncementHandler not available');
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
            console.warn('Could not parse winning players JSON for winner notification:', notification.id);
          }

          // Build winner notification data
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
          console.log(`⏱️ Waiting 15 seconds before sending match winner notification for ${notification.match_name}`);
          await new Promise(resolve => setTimeout(resolve, 15000));
          
          // Post the match winner notification
          const result = await this.announcementHandler.postMatchWinnerNotification(winnerData);
          
          if (result && typeof result === 'object' && result.success) {
            // Mark as completed
            await this.db.run(`
              UPDATE discord_match_winner_queue 
              SET status = 'completed', sent_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `, [notification.id]);

            console.log(`🏆 Match winner notification sent: ${notification.winning_team_name} wins ${notification.match_name}`);
          } else {
            // Mark as failed
            await this.db.run(`
              UPDATE discord_match_winner_queue 
              SET status = 'failed', error_message = 'Failed to post match winner notification'
              WHERE id = ?
            `, [notification.id]);

            console.error(`❌ Failed to post match winner notification for ${notification.id}`);
          }
        } catch (error) {
          console.error(`❌ Error processing match winner notification ${notification.id}:`, error);
          
          // Mark as failed
          await this.db.run(`
            UPDATE discord_match_winner_queue 
            SET status = 'failed', sent_at = datetime('now'), error_message = ?
            WHERE id = ?
          `, [error instanceof Error ? error.message : 'Unknown error', notification.id]);
        }
      }
    } catch (error) {
      console.error('❌ Error processing match winner notification queue:', error);
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
        
        if (allMessages.length > 0) {
        }
        
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

          
          if (message.embeds[0]) {
          }
          
          if (message.attachments.size > 0) {
          }

          // Create updated embed - copy the existing embed exactly but add signups closed message
          const updatedEmbed = message.embeds[0] ? 
            EmbedBuilder.from(message.embeds[0]) : new EmbedBuilder();
          
          
          // Keep the image in the embed - don't remove it
          // The key is to NOT provide any files in the edit options, which prevents the duplicate image above
          if (updatedEmbed.data.image?.url) {
          } else {
          }
          
          // Just add a simple signups closed message at the bottom, don't change anything else
          const existingFields = updatedEmbed.data.fields || [];
          const signupStatusFieldIndex = existingFields.findIndex(field => field.name === '📋 Signup Status');
          
          if (signupStatusFieldIndex === -1) {
            // Add new field at the bottom
            updatedEmbed.addFields([{
              name: '📋 Signup Status',
              value: '🔒 **Signups are now closed**',
              inline: false
            }]);
          } else {
          }


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
                
              } else {
                console.warn(`⚠️ Event image not found for reattachment: ${imagePath}`);
              }
            } catch (error) {
              console.error(`❌ Error recreating attachment for ${matchData.event_image_url}:`, error);
            }
          }

          const editOptions: Record<string, unknown> = {
            content: null, // Explicitly clear any content that might cause image display
            embeds: [updatedEmbed],
            components: [], // This removes all buttons
            files: attachment ? [attachment] : [] // Include recreated attachment if available
          };
          

          // Remove all action rows (signup buttons) but keep everything else the same
          await message.edit(editOptions);
          

          successCount++;

        } catch (error) {
          console.error(`❌ Failed to update Discord message ${messageRecord.message_id}:`, error);
        }
      }

      if (successCount === 0) {
        console.error(`❌ Failed to update any Discord messages for match ${matchId}`);
        return false;
      }

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