import { waitForDatabaseReady } from '../../lib/database';
import type { Database } from '../../lib/database/connection';
import * as cron from 'node-cron';
import type { SchedulerSettings } from '../../shared/types';
import { logger } from '../../src/lib/logger/server';
import { AvatarUpdateJob } from './jobs/update-avatars';
import { UpdateCheckJob } from './jobs/check-for-update';
import { logFeedEvent } from '../../src/lib/feed-helpers';

interface AnnouncementItem {
  id?: string;
  value: number;
  unit: 'minutes' | 'hours' | 'days';
}

class MatchExecScheduler {
  private isRunning = false;
  private _db: Database | null = null;
  private cronJobs: cron.ScheduledTask[] = [];
  private avatarUpdateJob: AvatarUpdateJob | null = null;
  private updateCheckJob: UpdateCheckJob | null = null;

  /** Returns the database connection, throwing if it has not been initialised yet. */
  private get db(): Database {
    if (!this._db) throw new Error('Database not initialised — call start() first');
    return this._db;
  }

  /** Allows tests to inject a mock database without calling start(). */
  private set db(value: Database) {
    this._db = value;
  }

  async start() {
    logger.debug('🕐 Starting MatchExec Scheduler...');
    
    try {
      // Wait for database to be ready (migrated and seeded)
      logger.debug('⏳ Waiting for database to be ready...');
      this._db = await waitForDatabaseReady();

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
      const settings = (await this.db.get(
        'SELECT * FROM scheduler_settings WHERE id = 1'
      )) as SchedulerSettings | null;

      if (!settings) {
        logger.debug('⚠️ No scheduler settings found, using defaults');
        // Use default settings if none exist
        const defaultSettings = {
          match_check_cron: '0 */1 * * * *',
          channel_refresh_cron: '0 0 0 * * *'
        };

        this.startCronJob('Match Check & Reminders', defaultSettings.match_check_cron, this.checkMatchStartTimes.bind(this));
        this.startCronJob('Feed Cleanup', '0 0 2 * * *', this.runFeedCleanup.bind(this));

        // Initialize and run avatar update job every 2 hours
        this.avatarUpdateJob = new AvatarUpdateJob(this.db);
        this.startCronJob('Avatar Update', '0 */2 * * *', this.avatarUpdateJob.updateAvatars.bind(this.avatarUpdateJob));

        // Check for updates daily at 9am UTC
        this.updateCheckJob = new UpdateCheckJob(this.db);
        this.startCronJob('Update Check', '0 0 9 * * *', this.updateCheckJob.checkForUpdate.bind(this.updateCheckJob));

        logger.debug(`✅ Loaded ${this.cronJobs.length} scheduled tasks with default settings`);
        return;
      }

      // Stop existing cron jobs
      this.cronJobs.forEach(job => job.stop());
      this.cronJobs = [];

      // Start new cron jobs based on settings
      this.startCronJob('Match Check & Reminders', settings.match_check_cron, this.checkMatchStartTimes.bind(this));
      this.startCronJob('Feed Cleanup', '0 0 2 * * *', this.runFeedCleanup.bind(this));
      if (settings.channel_refresh_cron) {
        this.startCronJob('Channel Refresh', settings.channel_refresh_cron, this.refreshChannelNames.bind(this));
      }

      // Initialize and run avatar update job every 2 hours
      this.avatarUpdateJob = new AvatarUpdateJob(this.db);
      this.startCronJob('Avatar Update', '0 */2 * * *', this.avatarUpdateJob.updateAvatars.bind(this.avatarUpdateJob));

      // Check for updates daily at 9am UTC
      this.updateCheckJob = new UpdateCheckJob(this.db);
      this.startCronJob('Update Check', '0 0 9 * * *', this.updateCheckJob.checkForUpdate.bind(this.updateCheckJob));

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
    const matchesToStart = await this.db.all<{ id: string; name: string }>(
      `SELECT id, name FROM matches
       WHERE status = 'assign'
       AND start_date <= ?
       AND start_date IS NOT NULL`,
      [now.toISOString()]
    );

    for (const match of matchesToStart) {
      logger.debug(`🏆 Starting battle phase for match: ${match.name}`);
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

    const matchesToComplete = await this.db.all<{ id: string; name: string }>(
      `SELECT id, name FROM matches
       WHERE status = 'battle'
       AND updated_at < ?`,
      [thresholdTime.toISOString()]
    );

    for (const match of matchesToComplete) {
      const statusResult = await this.db.get<{ total: number; completed: number }>(
        `SELECT COUNT(*) as total,
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
         FROM match_games WHERE match_id = ?`,
        [match.id]
      );
      const allScored = !statusResult || statusResult.total === 0 || statusResult.completed === statusResult.total;

      if (!allScored) {
        logger.debug(`⏭️ Skipping auto-complete for match ${match.name} — not all maps scored`);
        continue;
      }

      logger.debug(`⏰ Auto-completing match that has been in battle phase too long: ${match.name}`);
      await this.db.run(
        'UPDATE matches SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        ['complete', match.id]
      );
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
      const discordSettings = await this.db.get<{ match_reminder_minutes: number }>(
        'SELECT match_reminder_minutes FROM discord_settings WHERE id = 1'
      );

      if (!discordSettings?.match_reminder_minutes) {
        logger.debug('⚠️ No Discord reminder settings found, skipping reminder queue');
        return;
      }

      const reminderMinutes = discordSettings.match_reminder_minutes;

      // Find matches that have start times and need reminders
      const upcomingMatches = await this.db.all<{ id: string; name: string; start_date: string }>(
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
          const reminderId = `reminder_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`; // NOSONAR: non-security internal ID generation

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
      const discordSettings = await this.db.get<{ player_reminder_minutes: number }>(
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
      const upcomingMatches = await this.db.all<{ id: string; name: string; start_date: string }>(
        `SELECT m.id, m.name, m.start_date
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

        // If reminder time is already past but match hasn't started yet, fire immediately
        const effectiveReminderTime = reminderTime > new Date() ? reminderTime : new Date();

        // Create a single queue entry per match; the processor calls sendPlayerReminders(matchId)
        // which sends to all participants at once — one entry per participant would cause N×N duplicates
        const reminderId = `player_reminder_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`; // NOSONAR: non-security internal ID generation

        await this.db.run(`
          INSERT INTO discord_player_reminder_queue (id, match_id, user_id, reminder_type, reminder_time, scheduled_for, status)
          VALUES (?, ?, 'all', 'player_reminder', ?, ?, 'pending')
        `, [reminderId, match.id, effectiveReminderTime.toISOString(), effectiveReminderTime.toISOString()]);

        logger.debug(`📱 Queued player reminder DMs for match: ${match.name} at ${effectiveReminderTime.toISOString()}`);
      }
    } catch (error) {
      logger.error('❌ Error queueing player reminders:', error);
    }
  }


  private async queueMatchStartNotification(matchId: string): Promise<boolean> {
    try {
      // Generate unique ID for the queue entry  
      const notificationId = `match_start_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`; // NOSONAR: non-security internal ID generation
      
      // Add to Discord match start notification queue that the bot will process
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
  private parseAnnouncementsField(announcements: unknown, matchName: string): AnnouncementItem[] | null {
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
  private async hasExistingAnnouncement(matchId: string, announcement: AnnouncementItem): Promise<boolean> {
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
  private async processMatchAnnouncements(match: { id: string; name: string; start_date: string; announcements: string }): Promise<void> {
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
      const matchesWithAnnouncements = await this.db.all<{ id: string; name: string; start_date: string; announcements: string }>(`
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

  private async queueTimedAnnouncement(matchId: string, announcement: AnnouncementItem, scheduledFor: Date): Promise<boolean> {
    try {
      // Generate unique ID for the announcement queue entry
      const announcementId = `announce_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`; // NOSONAR: non-security internal ID generation

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

  private async runFeedCleanup() {
    await this.cleanupStaleScoringNotifications();
    await this.cleanupFeedEvents();
  }

  private async cleanupStaleScoringNotifications() {
    try {
      const scoringResult = await this.db.run(
        `DELETE FROM activity_feed
         WHERE event_type = 'match_scoring_required'
         AND created_at < datetime('now', '-1 day')`
      );
      if ((scoringResult.changes ?? 0) > 0) {
        logger.info(`🧹 Removed ${scoringResult.changes} stale map scoring notification(s) older than 24 hours`);
      }

      const matchingResult = await this.db.run(
        `DELETE FROM activity_feed
         WHERE event_type = 'scorecard_player_matching_required'
         AND created_at < datetime('now', '-1 day')`
      );
      if ((matchingResult.changes ?? 0) > 0) {
        logger.info(`🧹 Removed ${matchingResult.changes} stale scorecard player matching notification(s) older than 24 hours`);
      }
    } catch (error) {
      logger.error('❌ Error cleaning up stale action notifications:', error);
    }
  }

  private async cleanupFeedEvents() {
    try {
      const setting = await this.db.get<{ setting_value: string }>(
        "SELECT setting_value FROM app_settings WHERE setting_key = 'feed_retention_days'"
      );
      const retentionDays = parseInt(setting?.setting_value ?? '180', 10);
      if (isNaN(retentionDays) || retentionDays <= 0) return;

      const result = await this.db.run(
        `DELETE FROM activity_feed WHERE created_at < datetime('now', '-' || ? || ' days')`,
        [retentionDays]
      );
      if ((result.changes ?? 0) > 0) {
        logger.info(`🧹 Feed cleanup: deleted ${result.changes} events older than ${retentionDays} days`);
      }
    } catch (error) {
      logger.error('❌ Error cleaning up feed events:', error);
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

    // Check discord bot heartbeat every 2 minutes
    setInterval(async () => {
      if (this.isRunning) {
        await this.checkDiscordBotHeartbeat();
      }
    }, 120000); // Every 2 minutes
  }

  private async checkDiscordBotHeartbeat(): Promise<void> { // NOSONAR typescript:S3776
    const DISCORD_BOT_TIMEOUT_THRESHOLD = 10 * 60 * 1000; // 10 minutes
    const RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour
    const ALERT_TYPE = 'discord_bot_heartbeat_missing';

    try {
      const result = await this.db.get<{ setting_value: string }>(
        'SELECT setting_value FROM app_settings WHERE setting_key = ?',
        ['discord_bot_last_heartbeat']
      );

      if (!result?.setting_value) {
        logger.debug('No discord bot heartbeat found in database yet');
        return;
      }

      const lastHeartbeat = new Date(result.setting_value);
      const now = new Date();
      const timeSinceHeartbeat = now.getTime() - lastHeartbeat.getTime();

      if (timeSinceHeartbeat <= DISCORD_BOT_TIMEOUT_THRESHOLD) return;

      // Rate limit: check if we already sent this alert recently
      const rateLimitRow = await this.db.get<{ last_sent_at: string }>(
        'SELECT last_sent_at FROM health_alerts_sent WHERE alert_type = ?',
        [ALERT_TYPE]
      );

      if (rateLimitRow?.last_sent_at) {
        const timeSinceLastAlert = now.getTime() - new Date(rateLimitRow.last_sent_at).getTime();
        if (timeSinceLastAlert <= RATE_LIMIT_WINDOW) {
          logger.debug(`Discord bot health alert rate-limited: ${ALERT_TYPE}`);
          return;
        }
      }

      const minutesAgo = Math.floor(timeSinceHeartbeat / 60000);
      const title = 'Discord Bot Not Responding';
      const description = `The Discord bot has not sent a heartbeat in ${minutesAgo} minutes. Last heartbeat: ${lastHeartbeat.toISOString()}`;

      // Log to activity feed immediately (regardless of bot state)
      await logFeedEvent({
        eventType: 'health_alert',
        priority: 1,
        title,
        description,
      });

      // Enqueue Discord alert — the bot will post it when/if it recovers
      const alertId = `health_alert_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`; // NOSONAR: non-security internal ID generation
      await this.db.run(
        `INSERT INTO discord_health_alert_queue (id, severity, title, description, status)
         VALUES (?, ?, ?, ?, 'pending')`,
        [alertId, 'critical', title, description]
      );

      // Update rate limit
      await this.db.run(
        `INSERT INTO health_alerts_sent (alert_type, last_sent_at)
         VALUES (?, CURRENT_TIMESTAMP)
         ON CONFLICT(alert_type) DO UPDATE SET last_sent_at = CURRENT_TIMESTAMP`,
        [ALERT_TYPE]
      );

      logger.info(`Discord bot health alert queued: ${title}`);
    } catch (error) {
      logger.error('Error checking discord bot heartbeat:', error);
    }
  }

  async stop() {
    logger.info('🛑 Stopping scheduler...');
    this.isRunning = false;

    // Stop all cron jobs
    this.cronJobs.forEach(job => job.stop());
    this.cronJobs = [];

    // Close database connection
    if (this._db) {
      try {
        await this._db.close();
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
      const baseUrl = process.env.PUBLIC_URL || 'http://localhost:3000';
      const response = await fetch(`${baseUrl}/api/channels/refresh-names`, {
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