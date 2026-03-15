// @ts-nocheck - Database method calls have complex typing issues
import { waitForDatabaseReady } from '../../lib/database';
import * as cron from 'node-cron';
import type { SchedulerSettings } from '../../shared/types';
import { logger } from '../../src/lib/logger/server';
import { AvatarUpdateJob } from './jobs/update-avatars';

class MatchExecScheduler {
  private isRunning = false;
  private db: unknown;
  private cronJobs: cron.ScheduledTask[] = [];
  private avatarUpdateJob: AvatarUpdateJob | null = null;

  async start() {
    logger.debug('🕐 Starting MatchExec Scheduler...');
    
    try {
      // Wait for database to be ready (migrated and seeded)
      logger.debug('⏳ Waiting for database to be ready...');
      this.db = await waitForDatabaseReady();

      this.isRunning = true;

      // Send initial heartbeat for health monitoring
      try {
        const now = new Date().toISOString();
        await this.db.run(
          `UPDATE app_settings SET setting_value = ?, updated_at = CURRENT_TIMESTAMP
           WHERE setting_key = ?`,
          [now, 'scheduler_last_heartbeat']
        );
        logger.debug('💓 Initial scheduler heartbeat sent');
      } catch (error) {
        logger.error('Failed to send initial scheduler heartbeat:', error);
      }

      // Load and start cron jobs
      await this.loadSchedulerSettings();
      
      logger.debug('✅ Scheduler started successfully');
      
      this.keepAlive();

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      logger.error('❌ Failed to start scheduler:', { message: errorMessage, stack: errorStack });
      process.exit(1);
    }
  }

  private async loadSchedulerSettings() {
    try {
      // @ts-expect-error - Database get method typed as unknown
      const settings = (await this.db.get(
        'SELECT * FROM scheduler_settings WHERE id = 1'
      )) as SchedulerSettings | null;

      if (!settings) {
        logger.debug('⚠️ No scheduler settings found, using defaults');
        // Use default settings if none exist
        const defaultSettings = {
          match_check_cron: '0 */1 * * * *',
          cleanup_check_cron: '0 0 2 * * *',
          channel_refresh_cron: '0 0 0 * * *'
        };
        
        this.startCronJob('Match Check & Reminders', defaultSettings.match_check_cron, this.checkMatchStartTimes.bind(this));
        this.startCronJob('Data Cleanup', defaultSettings.cleanup_check_cron, this.cleanupOldMatches.bind(this));

        // Initialize and run avatar update job every 2 hours
        this.avatarUpdateJob = new AvatarUpdateJob(this.db);
        this.startCronJob('Avatar Update', '0 */2 * * *', this.avatarUpdateJob.updateAvatars.bind(this.avatarUpdateJob));

        logger.debug(`✅ Loaded ${this.cronJobs.length} scheduled tasks with default settings`);
        return;
      }

      // Stop existing cron jobs
      this.cronJobs.forEach(job => job.stop());
      this.cronJobs = [];

      // Start new cron jobs based on settings
      this.startCronJob('Match Check & Reminders', settings.match_check_cron, this.checkMatchStartTimes.bind(this));
      this.startCronJob('Data Cleanup', settings.cleanup_check_cron, this.cleanupOldMatches.bind(this));
      if (settings.channel_refresh_cron) {
        this.startCronJob('Channel Refresh', settings.channel_refresh_cron, this.refreshChannelNames.bind(this));
      }
      // Run voice channel cleanup every 5 minutes
      this.startCronJob('Voice Channel Cleanup', '*/5 * * * *', this.cleanupVoiceChannels.bind(this));

      // Initialize and run avatar update job every 2 hours
      this.avatarUpdateJob = new AvatarUpdateJob(this.db);
      this.startCronJob('Avatar Update', '0 */2 * * *', this.avatarUpdateJob.updateAvatars.bind(this.avatarUpdateJob));

      logger.debug(`✅ Loaded ${this.cronJobs.length} scheduled tasks`);
    } catch (error) {
      logger.error('❌ Failed to load scheduler settings:', error);
    }
  }

  private startCronJob(name: string, cronExpression: string, task: () => Promise<void>) {
    try {
      if (cron.validate(cronExpression)) {
        const job = cron.schedule(cronExpression, async () => {
          logger.debug(`🔄 Running ${name}...`);
          try {
            await task();
            logger.debug(`✅ ${name} completed`);
          } catch (error) {
            logger.error(`❌ ${name} failed:`, error);
          }
        }, {
          timezone: 'UTC'
        });
        
        this.cronJobs.push(job);
        logger.debug(`📅 Scheduled ${name}: ${cronExpression}`);
      } else {
        logger.error(`❌ Invalid cron expression for ${name}: ${cronExpression}`);
      }
    } catch (error) {
      logger.error(`❌ Failed to schedule ${name}:`, error);
    }
  }

  private async checkMatchStartTimes() {
    // Check for matches that should transition from 'assign' to 'battle' at their scheduled start time
    const now = new Date();
    // @ts-expect-error - Database all method typed as unknown
    const matchesToStart = await this.db.all(
      `SELECT * FROM matches 
       WHERE status = 'assign' 
       AND start_date <= ? 
       AND start_date IS NOT NULL`,
      [now.toISOString()]
    );

    for (const match of matchesToStart) {
      logger.debug(`🏆 Starting battle phase for match: ${match.name}`);
      // @ts-expect-error - Database run method typed as unknown
      // @ts-expect-error - Database run method typed as unknown
    await this.db.run(
        'UPDATE matches SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        ['battle', match.id]
      );
      
      // Queue Discord notification for match starting
      await this.queueMatchStartNotification(match.id);
    }

    // Check for matches that should be auto-completed (battle phase lasting too long)
    await this.handleMatchCompletion();

    // Also handle match reminders during the same check
    await this.handleMatchReminders();

    // Handle timed announcements
    await this.handleTimedAnnouncements();
  }

  private async handleMatchCompletion() {
    // Auto-complete matches that have been in battle phase for too long
    // This prevents matches from staying in battle indefinitely
    const autoCompleteThresholdHours = 24; // Matches in battle for more than 24 hours will be auto-completed
    const thresholdTime = new Date();
    thresholdTime.setHours(thresholdTime.getHours() - autoCompleteThresholdHours);

    // @ts-expect-error - Database all method typed as unknown
    const matchesToComplete = await this.db.all(
      `SELECT * FROM matches 
       WHERE status = 'battle' 
       AND updated_at < ?`,
      [thresholdTime.toISOString()]
    );

    for (const match of matchesToComplete) {
      logger.debug(`⏰ Auto-completing match that has been in battle phase too long: ${match.name}`);
      // @ts-expect-error - Database run method typed as unknown
      // @ts-expect-error - Database run method typed as unknown
    await this.db.run(
        'UPDATE matches SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        ['complete', match.id]
      );
      
      // You could add additional logic here like:
      // - Queue Discord notification for match completion
      // - Generate match results/reports
      // - Clean up related data
    }

    if (matchesToComplete.length > 0) {
      logger.debug(`✅ Auto-completed ${matchesToComplete.length} matches that exceeded battle phase time limit`);
    }
  }

  private async handleMatchReminders() {
    // Check for matches that need reminder queue entries created
    await this.queueMatchReminders();

    // Check for matches that need player reminder DMs
    await this.queuePlayerReminders();
  }


  private async queueMatchReminders() {
    try {
      // Get Discord settings to know the reminder minutes
      // @ts-expect-error - Database get method typed as unknown
      const discordSettings = await this.db.get(
        'SELECT match_reminder_minutes FROM discord_settings WHERE id = 1'
      );

      if (!discordSettings?.match_reminder_minutes) {
        logger.debug('⚠️ No Discord reminder settings found, skipping reminder queue');
        return;
      }

      const reminderMinutes = discordSettings.match_reminder_minutes;

      // Find matches that have start times and need reminders
      const upcomingMatches = await this.db.all(
        `SELECT m.id, m.name, m.start_date
         FROM matches m
         WHERE m.start_date IS NOT NULL
         AND m.status IN ('created', 'gather', 'assign', 'battle')
         AND datetime(m.start_date) > datetime('now')
         AND NOT EXISTS (
           SELECT 1 FROM discord_reminder_queue drq
           WHERE drq.match_id = m.id
           AND drq.status != 'failed'
         )`
      );

      if (upcomingMatches.length === 0) {
        logger.debug('ℹ️ No matches need reminder queue entries');
        return;
      }

      logger.debug(`🔍 Found ${upcomingMatches.length} match(es) that need reminders`);

      let queuedCount = 0;
      let skippedCount = 0;

      for (const match of upcomingMatches) {
        const startDate = new Date(match.start_date);
        const reminderTime = new Date(startDate.getTime() - (reminderMinutes * 60 * 1000));

        // Only queue if reminder time is in the future
        if (reminderTime > new Date()) {
          const reminderId = `reminder_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

          // @ts-expect-error - Database run method typed as unknown
          await this.db.run(`
            INSERT OR IGNORE INTO discord_reminder_queue (id, match_id, reminder_type, minutes_before, reminder_time, scheduled_for, status)
            VALUES (?, ?, 'match_reminder', ?, ?, ?, 'pending')
          `, [reminderId, match.id, reminderMinutes, reminderTime.toISOString(), reminderTime.toISOString()]);

          logger.debug(`📅 Queued reminder for match: ${match.name} at ${reminderTime.toISOString()}`);
          queuedCount++;
        } else {
          logger.debug(`⏭️ Skipped match ${match.name} - reminder time ${reminderTime.toISOString()} is in the past`);
          skippedCount++;
        }
      }

      logger.debug(`✅ Queued ${queuedCount} reminder(s), skipped ${skippedCount}`);
    } catch (error) {
      logger.error('❌ Error queueing match reminders:', error);
    }
  }


  private async queuePlayerReminders() {
    try {
      // Get Discord settings to know the player reminder minutes
      // @ts-expect-error - Database get method typed as unknown
      const discordSettings = await this.db.get(
        'SELECT player_reminder_minutes FROM discord_settings WHERE id = 1'
      );
      
      if (!discordSettings?.player_reminder_minutes) {
        logger.debug('⚠️ No player reminder settings found, skipping player reminder queue');
        return;
      }

      const reminderMinutes = discordSettings.player_reminder_minutes;

      // Find matches that have player_notifications enabled, start times, and need reminders
      // Compute threshold in JS to avoid template literal injection into SQL
      const lookAheadMs = (reminderMinutes + 60) * 60 * 1000;
      const thresholdDate = new Date(Date.now() + lookAheadMs).toISOString();
      const upcomingMatches = await this.db.all(
        `SELECT m.id, m.name, m.start_date, m.player_notifications
         FROM matches m
         WHERE m.start_date IS NOT NULL
         AND m.player_notifications = 1
         AND m.status IN ('gather', 'assign', 'battle')
         AND datetime(m.start_date) <= datetime(?)
         AND NOT EXISTS (
           SELECT 1 FROM discord_player_reminder_queue dprq
           WHERE dprq.match_id = m.id
           AND dprq.status != 'failed'
         )`,
        [thresholdDate]
      );

      for (const match of upcomingMatches) {
        const startDate = new Date(match.start_date);
        const reminderTime = new Date(startDate.getTime() - (reminderMinutes * 60 * 1000));
        
        // Only queue if reminder time is in the future
        if (reminderTime > new Date()) {
          // Get all participants for this match
          const participants = await this.db.all(
            'SELECT user_id FROM match_participants WHERE match_id = ?',
            [match.id]
          );
          
          // Create reminder queue entry for each participant
          for (const participant of participants) {
            const reminderId = `player_reminder_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
            
            // @ts-expect-error - Database run method typed as unknown
      // @ts-expect-error - Database run method typed as unknown
    await this.db.run(`
              INSERT INTO discord_player_reminder_queue (id, match_id, user_id, reminder_type, reminder_time, scheduled_for, status)
              VALUES (?, ?, ?, 'player_reminder', ?, ?, 'pending')
            `, [reminderId, match.id, participant.user_id, reminderTime.toISOString(), reminderTime.toISOString()]);
          }
          
          logger.debug(`📱 Queued player reminder DMs for match: ${match.name} (${participants.length} participants) at ${reminderTime.toISOString()}`);
        }
      }
    } catch (error) {
      logger.error('❌ Error queueing player reminders:', error);
    }
  }


  private async queueMatchStartNotification(matchId: string): Promise<boolean> {
    try {
      // Generate unique ID for the queue entry  
      const notificationId = `match_start_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
      
      // Add to Discord match start notification queue that the bot will process
      // @ts-expect-error - Database run method typed as unknown
      // @ts-expect-error - Database run method typed as unknown
    await this.db.run(`
        INSERT INTO discord_match_start_queue (id, match_id, status)
        VALUES (?, ?, 'pending')
      `, [notificationId, matchId]);
      
      logger.debug('🏁 Discord match start notification queued for match:', matchId);
      return true;
    } catch (error) {
      logger.error('❌ Error queuing Discord match start notification:', error);
      return false;
    }
  }

  /**
   * Parse announcements field into array
   */
  private parseAnnouncementsField(announcements: unknown, matchName: string): unknown[] | null {
    if (typeof announcements === 'string') {
      try {
        return JSON.parse(announcements);
      } catch {
        logger.debug(`⚠️ Skipping match ${matchName} - announcements field is not valid JSON`);
        return null;
      }
    }

    if (typeof announcements === 'number' || typeof announcements === 'boolean') {
      if (announcements) {
        return [
          { id: 'default_1hour', value: 1, unit: 'hours' },
          { id: 'default_30min', value: 30, unit: 'minutes' }
        ];
      }
      return null;
    }

    logger.debug(`⚠️ Skipping match ${matchName} - announcements field is not an array`);
    return null;
  }

  /**
   * Calculate announcement time offset
   */
  private calculateAnnouncementOffset(value: number, unit: 'minutes' | 'hours' | 'days'): number {
    switch (unit) {
      case 'minutes':
        return value * 60 * 1000;
      case 'hours':
        return value * 60 * 60 * 1000;
      case 'days':
        return value * 24 * 60 * 60 * 1000;
      default:
        return 0;
    }
  }

  /**
   * Check if announcement already exists in queue
   */
  private async hasExistingAnnouncement(matchId: string, announcement: unknown): Promise<boolean> {
    const existingAnnouncement = await this.db.get(`
      SELECT id FROM discord_announcement_queue
      WHERE match_id = ? AND announcement_type = 'timed'
      AND announcement_data = ?
      AND status NOT IN ('failed')
    `, [matchId, JSON.stringify(announcement)]);

    return !!existingAnnouncement;
  }

  /**
   * Process announcements for a single match
   */
  private async processMatchAnnouncements(match: { id: string; name: string; start_date: string; announcements: unknown }): Promise<void> {
    const announcements = this.parseAnnouncementsField(match.announcements, match.name);
    if (!announcements) return;

    if (!Array.isArray(announcements)) {
      logger.debug(`⚠️ Skipping match ${match.name} - announcements is not an array`);
      return;
    }

    const matchStartTime = new Date(match.start_date);
    const now = new Date();
    const lookAheadMs = 2 * 60 * 60 * 1000;  // 2 hours
    const catchUpMs   = 30 * 60 * 1000;        // 30 minutes

    for (const announcement of announcements) {
      const { value, unit } = announcement;
      const millisecondsOffset = this.calculateAnnouncementOffset(value, unit);
      const announcementTime = new Date(matchStartTime.getTime() - millisecondsOffset);

      const isUpcoming = announcementTime <= new Date(now.getTime() + lookAheadMs);
      const isNotTooOld = announcementTime >= new Date(now.getTime() - catchUpMs);

      if (isUpcoming && isNotTooOld) {
        const exists = await this.hasExistingAnnouncement(match.id, announcement);
        if (!exists) {
          logger.debug(`📢 Sending timed announcement for match: ${match.name} (${value} ${unit} before start)`);
          await this.queueTimedAnnouncement(match.id, announcement, announcementTime);
        }
      }
    }
  }

  private async handleTimedAnnouncements() {
    try {
      // Include matches whose start_date is within 30 minutes ago (catch-up window)
      // to avoid permanently missing announcements that fired just before match start.
      const matchesWithAnnouncements = await this.db.all(`
        SELECT id, name, start_date, announcements
        FROM matches
        WHERE announcements IS NOT NULL
        AND start_date IS NOT NULL
        AND status IN ('created', 'gather', 'assign')
        AND datetime(start_date) >= datetime('now', '-30 minutes')
      `);

      for (const match of matchesWithAnnouncements) {
        try {
          await this.processMatchAnnouncements(match);
        } catch (parseError) {
          logger.error(`❌ Error parsing announcements for match ${match.id}:`, parseError);
        }
      }
    } catch (error) {
      logger.error('❌ Error handling timed announcements:', error);
    }
  }

  private async queueTimedAnnouncement(matchId: string, announcement: unknown, scheduledFor: Date): Promise<boolean> {
    try {
      // Generate unique ID for the announcement queue entry
      const announcementId = `announce_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

      // @ts-expect-error - Database run method typed as unknown
      // @ts-expect-error - Database run method typed as unknown
    await this.db.run(`
        INSERT INTO discord_announcement_queue (
          id, match_id, status, announcement_type, announcement_data, scheduled_for
        ) VALUES (?, ?, 'pending', 'timed', ?, ?)
      `, [announcementId, matchId, JSON.stringify(announcement), scheduledFor.toISOString()]);

      logger.debug(`📢 Queued timed announcement for match: ${matchId} (${announcement.value} ${announcement.unit} before, scheduled for ${scheduledFor.toISOString()})`);
      return true;
    } catch (error) {
      logger.error('❌ Error queuing timed announcement:', error);
      return false;
    }
  }

  private async cleanupOldMatches() {
    // Clean up matches completed more than 30 days ago
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const result = await this.db.run(
      `DELETE FROM matches 
       WHERE status = 'complete' 
       AND updated_at < ?`,
      [thirtyDaysAgo.toISOString()]
    );

    if (result.changes > 0) {
      logger.debug(`🗑️ Cleaned up ${result.changes} old matches`);
    }
  }



  private keepAlive() {
    // Keep the process alive and persist heartbeat for health monitoring
    setInterval(async () => {
      if (this.isRunning) {
        logger.debug('🕐 Scheduler heartbeat');

        // Persist heartbeat timestamp to database for health monitoring
        try {
          const now = new Date().toISOString();
          await this.db.run(
            `UPDATE app_settings SET setting_value = ?, updated_at = CURRENT_TIMESTAMP
             WHERE setting_key = ?`,
            [now, 'scheduler_last_heartbeat']
          );
        } catch (error) {
          logger.error('Failed to persist scheduler heartbeat:', error);
        }
      }
    }, 300000); // Every 5 minutes
  }

  async stop() {
    logger.info('🛑 Stopping scheduler...');
    this.isRunning = false;

    // Stop all cron jobs
    this.cronJobs.forEach(job => job.stop());
    this.cronJobs = [];

    // Close database connection
    if (this.db) {
      try {
        await (this.db as { close: () => Promise<void> }).close();
        logger.info('✅ Database connection closed');
      } catch (error) {
        logger.error('Error closing database connection:', error);
      }
    }

    logger.info('✅ Scheduler shutdown complete');
  }

  async reloadSettings() {
    logger.debug('🔄 Reloading scheduler settings...');
    await this.loadSchedulerSettings();
  }

  private async refreshChannelNames() {
    try {
      logger.debug('🔄 Starting scheduled channel name refresh...');
      
      // Call the channel refresh API
      const response = await fetch('http://localhost:3000/api/channels/refresh-names', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const result = await response.json();
        logger.debug(`✅ Channel refresh completed: ${result.updated_count}/${result.total_channels} channels updated`);
        
        if (result.errors && result.errors.length > 0) {
          logger.warning('⚠️ Some channels had errors during refresh:', result.errors);
        }
      } else {
        logger.error('❌ Channel refresh API returned error:', response.status);
      }
    } catch (error) {
      logger.error('❌ Error during scheduled channel refresh:', error);
    }
  }

  private async cleanupVoiceChannels() {
    try {
      logger.debug('🔄 Starting voice channel cleanup...');

      // Get Discord settings to know the cleanup delay
      // @ts-expect-error - Database get method typed as unknown
      const discordSettings = await this.db.get(
        'SELECT voice_channel_cleanup_delay_minutes FROM discord_settings WHERE id = 1'
      );

      const cleanupDelayMinutes = discordSettings?.voice_channel_cleanup_delay_minutes || 10;

      // Calculate the threshold time in JavaScript to avoid SQL injection
      const thresholdTime = new Date();
      thresholdTime.setMinutes(thresholdTime.getMinutes() - cleanupDelayMinutes);

      // Find matches that completed/cancelled and are past the cleanup delay
      // @ts-expect-error - Database all method typed as unknown
      const matchesForCleanup = await this.db.all(`
        SELECT DISTINCT m.id, m.name, m.status, m.updated_at
        FROM matches m
        INNER JOIN auto_voice_channels avc ON m.id = avc.match_id
        WHERE m.status IN ('complete', 'cancelled')
        AND datetime(m.updated_at) <= datetime(?)
        LIMIT 10
      `, [thresholdTime.toISOString()]);

      if (matchesForCleanup.length === 0) {
        logger.debug('ℹ️ No voice channels ready for cleanup');
        return;
      }

      logger.debug(`🗑️ Found ${matchesForCleanup.length} matches with voice channels ready for cleanup`);

      // Import and use the voice channel manager to delete channels
      const { deleteMatchVoiceChannels } = await import('../../src/lib/voice-channel-manager');

      for (const match of matchesForCleanup) {
        try {
          const success = await deleteMatchVoiceChannels(match.id);

          if (success) {
            logger.debug(`✅ Cleaned up voice channels for match: ${match.name} (${match.id})`);
          } else {
            logger.warning(`⚠️ Failed to cleanup voice channels for match: ${match.name} (${match.id})`);
          }
        } catch (error) {
          logger.error(`❌ Error cleaning up voice channels for match ${match.id}:`, error);
        }
      }

      logger.debug(`✅ Voice channel cleanup completed`);

      // Also check for orphaned voice channels (match was manually deleted)
      // @ts-expect-error - Database all method typed as unknown
      const orphanedChannels = await this.db.all(`
        SELECT avc.id, avc.match_id, avc.channel_id, avc.team_name
        FROM auto_voice_channels avc
        WHERE avc.match_id NOT IN (SELECT id FROM matches)
      `);

      if (orphanedChannels.length > 0) {
        logger.info(`🗑️ Found ${orphanedChannels.length} orphaned voice channels (from deleted matches)`);

        // Import voice channel manager for cleanup
        const { deleteMatchVoiceChannels } = await import('../../src/lib/voice-channel-manager');

        // Group orphaned channels by match_id
        const orphanedByMatch = orphanedChannels.reduce((acc: Map<string, typeof orphanedChannels>, channel) => {
          if (!acc.has(channel.match_id)) {
            acc.set(channel.match_id, []);
          }
          acc.get(channel.match_id)!.push(channel);
          return acc;
        }, new Map());

        // Clean up each orphaned match's voice channels
        for (const [matchId, channels] of orphanedByMatch.entries()) {
          try {
            const success = await deleteMatchVoiceChannels(matchId);
            if (success) {
              logger.info(`✅ Cleaned up ${channels.length} orphaned voice channel(s) for deleted match: ${matchId}`);
            } else {
              logger.warning(`⚠️ Failed to cleanup orphaned voice channels for match: ${matchId}`);
            }
          } catch (error) {
            logger.error(`❌ Error cleaning up orphaned voice channels for match ${matchId}:`, error);
          }
        }
      } else {
        logger.debug('ℹ️ No orphaned voice channels found');
      }

    } catch (error) {
      logger.error('❌ Error during voice channel cleanup:', error);
    }
  }
}

// Create and start the scheduler
const scheduler = new MatchExecScheduler();

// Handle process signals
process.on('SIGINT', async () => {
  logger.debug('🛑 Received SIGINT, shutting down gracefully...');
  await scheduler.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.debug('🛑 Received SIGTERM, shutting down gracefully...');
  await scheduler.stop();
  process.exit(0);
});

// Start the scheduler
scheduler.start().catch(logger.error);

export { MatchExecScheduler };