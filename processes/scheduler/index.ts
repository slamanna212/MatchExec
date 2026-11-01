import { waitForDatabaseReady } from '../../lib/database';
import type { Database } from '../../lib/database/connection';
import * as cron from 'node-cron';
import { createHash } from 'crypto';
import { logger } from '../../src/lib/logger/server';
import { AvatarUpdateJob } from './jobs/update-avatars';
import { UpdateCheckJob } from './jobs/check-for-update';
import { logFeedEvent, purgeFeedEventsOfType, purgeFeedEventsOlderThan } from '../../src/lib/feed-helpers';
import { deleteOrphanedMatchBlobs } from '../../lib/storage';
import { getAppSetting, getDiscordSettings, getSchedulerSettings, setAppSetting } from '../../src/lib/settings';
import { requireLeaderLock, type LeaderLock } from '../../lib/db/leader';
import { db as pgDb, type Executor } from '../../lib/db';
import {
  areAllGamesCompleted, casMatchStatus, listMatchesDueToStart, listMatchesForPlayerReminders, listMatchesWithAnnouncements,
  listMatchGameStatuses, listStaleBattleMatches, listUpcomingMatches,
} from '../../src/lib/matches';
import { parseAnnouncementsField } from '../../src/lib/reminder-helpers';
import {
  enqueueAnnouncement, enqueueHealthAlert, enqueueMatchReminder, enqueueMatchStart, enqueuePlayerReminder,
  hasTimedAnnouncement, matchIdsWithLivePlayerReminder, matchIdsWithLiveReminder, nonOverlapping,
} from '../../src/lib/discord-queues';

/**
 * Token sent as x-internal-token when calling the web API with opt-in auth on.
 * Mirrors getInternalToken() in src/lib/auth.ts (which uses Web Crypto and
 * next/server, so it isn't imported here). Returns null when auth is off.
 */
function getInternalApiToken(): string | null {
  if (process.env.INTERNAL_API_TOKEN) return process.env.INTERNAL_API_TOKEN;
  if (!process.env.ADMIN_PASSWORD) return null;
  const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
  const secret = process.env.AUTH_SECRET || sha256(process.env.ADMIN_PASSWORD);
  return sha256(`${secret}:internal`);
}

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
  private leaderLock: LeaderLock | null = null;

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

      // Exactly one scheduler per database: hold a Postgres advisory lock for the life of the process (exits if held)
      this.leaderLock = await requireLeaderLock('scheduler', { log: (message) => logger.critical(message) });

      this.isRunning = true;

      // Send initial heartbeat for health monitoring
      try {
        const now = new Date().toISOString();
        await setAppSetting('scheduler_last_heartbeat', now);
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
      const settings = await getSchedulerSettings();

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
        this.avatarUpdateJob = new AvatarUpdateJob();
        this.startCronJob('Avatar Update', '0 */2 * * *', this.avatarUpdateJob.updateAvatars.bind(this.avatarUpdateJob));

        // Check for updates daily at 9am UTC
        this.updateCheckJob = new UpdateCheckJob();
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
      this.avatarUpdateJob = new AvatarUpdateJob();
      this.startCronJob('Avatar Update', '0 */2 * * *', this.avatarUpdateJob.updateAvatars.bind(this.avatarUpdateJob));

      // Check for updates daily at 9am UTC
      this.updateCheckJob = new UpdateCheckJob();
      this.startCronJob('Update Check', '0 0 9 * * *', this.updateCheckJob.checkForUpdate.bind(this.updateCheckJob));

      logger.debug(`✅ Loaded ${this.cronJobs.length} scheduled tasks`);
    } catch (error) {
      logger.error('❌ Failed to load scheduler settings:', error);
    }
  }

  private startCronJob(name: string, cronExpression: string, task: () => Promise<void>) {
    try {
      if (cron.validate(cronExpression)) {
        // A tick never starts while the previous run of the same job is still going.
        const run = nonOverlapping(async () => {
          logger.debug(`🔄 Running ${name}...`);
          await task();
          logger.debug(`✅ ${name} completed`);
        }, (error) => logger.error(`❌ ${name} failed:`, error));
        const job = cron.schedule(cronExpression, async () => {
          if (!(await run())) logger.warning(`⏭️ Skipping ${name}: previous run still in progress`);
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
    const matchesToStart = await listMatchesDueToStart(pgDb, now);

    for (const match of matchesToStart) {
      logger.debug(`🏆 Starting battle phase for match: ${match.name}`);
      // Compare-and-set the status and queue the Discord notification in one transaction
      await pgDb.transaction(async (tx) => {
        if (await casMatchStatus(tx, match.id, 'assign', 'battle')) {
          await this.queueMatchStartNotification(tx, match.id);
        }
      });
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

    const matchesToComplete = await listStaleBattleMatches(pgDb, thresholdTime);
    let completed = 0;

    for (const match of matchesToComplete) {
      if (!(await areAllGamesCompleted(pgDb, match.id)) && (await listMatchGameStatuses(pgDb, match.id)).length > 0) {
        logger.debug(`⏭️ Skipping auto-complete for match ${match.name} — not all maps scored`);
        continue;
      }

      logger.debug(`⏰ Auto-completing match that has been in battle phase too long: ${match.name}`);
      if (await casMatchStatus(pgDb, match.id, 'battle', 'complete')) completed++;
    }

    if (completed > 0) {
      logger.debug(`✅ Auto-completed ${completed} matches that exceeded battle phase time limit`);
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
      const discordSettings = await getDiscordSettings();

      if (!discordSettings?.match_reminder_minutes) {
        logger.debug('⚠️ No Discord reminder settings found, skipping reminder queue');
        return;
      }

      const reminderMinutes = discordSettings.match_reminder_minutes;

      // Find matches that have start times and need reminders
      const candidateMatches = await listUpcomingMatches(pgDb, new Date());
      const alreadyQueued = await matchIdsWithLiveReminder(pgDb, candidateMatches.map((m) => m.id));
      const upcomingMatches = candidateMatches.filter((m) => !alreadyQueued.has(m.id));

      if (upcomingMatches.length === 0) {
        logger.debug('ℹ️ No matches need reminder queue entries');
        return;
      }

      logger.debug(`🔍 Found ${upcomingMatches.length} match(es) that need reminders`);

      let queuedCount = 0;
      let skippedCount = 0;

      for (const match of upcomingMatches) {
        const reminderTime = new Date(match.start_date.getTime() - (reminderMinutes * 60 * 1000));

        // Only queue if reminder time is in the future
        if (reminderTime > new Date()) {
          // The partial unique index (match_id, reminder_type) makes a concurrent duplicate a no-op
          await enqueueMatchReminder(pgDb, { matchId: match.id, minutesBefore: reminderMinutes, reminderTime });

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
      const discordSettings = await getDiscordSettings();
      
      if (!discordSettings?.player_reminder_minutes) {
        logger.debug('⚠️ No player reminder settings found, skipping player reminder queue');
        return;
      }

      const reminderMinutes = discordSettings.player_reminder_minutes;

      // Find matches that have player_notifications enabled, start times, and need reminders
      // Compute threshold in JS to avoid template literal injection into SQL
      const lookAheadMs = (reminderMinutes + 60) * 60 * 1000;
      const candidateMatches = await listMatchesForPlayerReminders(pgDb, new Date(Date.now() + lookAheadMs));
      const alreadyQueued = await matchIdsWithLivePlayerReminder(pgDb, candidateMatches.map((m) => m.id));
      const upcomingMatches = candidateMatches.filter((m) => !alreadyQueued.has(m.id));

      for (const match of upcomingMatches) {
        const reminderTime = new Date(match.start_date.getTime() - (reminderMinutes * 60 * 1000));

        // If reminder time is already past but match hasn't started yet, fire immediately
        const effectiveReminderTime = reminderTime > new Date() ? reminderTime : new Date();

        // Create a single queue entry per match; the processor calls sendPlayerReminders(matchId)
        // which sends to all participants at once — one entry per participant would cause N×N duplicates
        await enqueuePlayerReminder(pgDb, { matchId: match.id, reminderTime: effectiveReminderTime });

        logger.debug(`📱 Queued player reminder DMs for match: ${match.name} at ${effectiveReminderTime.toISOString()}`);
      }
    } catch (error) {
      logger.error('❌ Error queueing player reminders:', error);
    }
  }


  private async queueMatchStartNotification(ex: Executor, matchId: string): Promise<boolean> {
    try {
      // Add to the Discord match start notification queue that the bot will process (same transaction as the status flip)
      await enqueueMatchStart(ex, matchId);

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
    const parsed = parseAnnouncementsField(announcements);
    if (!parsed) logger.debug(`⚠️ Skipping match ${matchName} - announcements field is not a valid list`);
    return parsed as AnnouncementItem[] | null;
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
    return hasTimedAnnouncement(pgDb, matchId, announcement as unknown as Record<string, unknown>);
  }

  /**
   * Process announcements for a single match
   */
  private async processMatchAnnouncements(match: { id: string; name: string; start_date: Date | string; announcements: unknown }): Promise<void> {
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
      const matchesWithAnnouncements = await listMatchesWithAnnouncements(pgDb, new Date(Date.now() - 30 * 60 * 1000));

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
      await enqueueAnnouncement(pgDb, {
        matchId,
        type: 'timed',
        data: announcement as unknown as Record<string, unknown>,
        scheduledFor,
      });

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
    await this.cleanupOrphanedUploads();
  }

  private async cleanupStaleScoringNotifications() {
    try {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const scoring = await purgeFeedEventsOfType(pgDb, 'match_scoring_required', cutoff);
      if (scoring > 0) {
        logger.info(`🧹 Removed ${scoring} stale map scoring notification(s) older than 24 hours`);
      }

      const matching = await purgeFeedEventsOfType(pgDb, 'scorecard_player_matching_required', cutoff);
      if (matching > 0) {
        logger.info(`🧹 Removed ${matching} stale scorecard player matching notification(s) older than 24 hours`);
      }
    } catch (error) {
      logger.error('❌ Error cleaning up stale action notifications:', error);
    }
  }

  private async cleanupFeedEvents() {
    try {
      const retentionDays = parseInt((await getAppSetting('feed_retention_days')) ?? '180', 10);
      if (isNaN(retentionDays) || retentionDays <= 0) return;

      const deleted = await purgeFeedEventsOlderThan(pgDb, retentionDays);
      if (deleted > 0) {
        logger.info(`🧹 Feed cleanup: deleted ${deleted} events older than ${retentionDays} days`);
      }
    } catch (error) {
      logger.error('❌ Error cleaning up feed events:', error);
    }
  }

  /** Uploaded files whose match is gone (deleted directly or through a tournament cascade). */
  private async cleanupOrphanedUploads() {
    try {
      const deleted = await deleteOrphanedMatchBlobs(pgDb);
      if (deleted > 0) {
        logger.info(`🧹 Upload cleanup: deleted ${deleted} file(s) belonging to deleted matches`);
      }
    } catch (error) {
      logger.error('❌ Error cleaning up orphaned uploads:', error);
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
          await setAppSetting('scheduler_last_heartbeat', now);
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
      const botHeartbeat = await getAppSetting('discord_bot_last_heartbeat');

      if (!botHeartbeat) {
        logger.debug('No discord bot heartbeat found in database yet');
        return;
      }

      const lastHeartbeat = new Date(botHeartbeat);
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
      await enqueueHealthAlert(pgDb, { severity: 'critical', title, description });

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

    await this.leaderLock?.release().catch(() => {});
    this.leaderLock = null;

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
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const internalToken = getInternalApiToken();
      if (internalToken) {
        headers['x-internal-token'] = internalToken;
      }
      const response = await fetch(`${baseUrl}/api/channels/refresh-names`, {
        method: 'POST',
        headers,
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