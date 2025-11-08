import { getDbInstance } from './database-init';
import { logger } from './logger';
import { VoiceChannelService } from './voice-channel-service';
import { MapCodeService } from './map-code-service';

/**
 * Queue a Discord announcement request that the Discord bot will process
 */
async function queueDiscordAnnouncement(matchId: string): Promise<boolean> {
  try {
    const db = await getDbInstance();

    // Check if already exists first to prevent duplicates
    const existing = await db.get(`
      SELECT id FROM discord_announcement_queue
      WHERE match_id = ? AND announcement_type = 'standard' AND status IN ('pending', 'posted')
    `, [matchId]);

    if (existing) {
      logger.debug('📢 Discord announcement already exists for match:', matchId);
      return true;
    }

    // Generate unique ID for the announcement queue entry
    const announcementId = `announce_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

    // Add to announcement queue with explicit 'standard' type
    await db.run(`
      INSERT INTO discord_announcement_queue (id, match_id, announcement_type, status)
      VALUES (?, ?, 'standard', 'pending')
    `, [announcementId, matchId]);

    logger.debug('📢 Discord announcement queued for match:', matchId);
    return true;
  } catch (error) {
    logger.error('❌ Error queuing Discord announcement:', error);
    return false;
  }
}

/**
 * Queue a Discord status update request that the Discord bot will process
 */
async function queueDiscordStatusUpdate(matchId: string, newStatus: string): Promise<boolean> {
  try {
    const db = await getDbInstance();

    // Generate unique ID for the queue entry
    const updateId = `discord_update_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

    // Add to status update queue
    await db.run(`
      INSERT INTO discord_status_update_queue (id, match_id, new_status, status)
      VALUES (?, ?, ?, 'pending')
    `, [updateId, matchId, newStatus]);

    logger.debug('🔄 Discord status update queued for match:', matchId, '-> status:', newStatus);
    return true;
  } catch (error) {
    logger.error('❌ Error queuing Discord status update:', error);
    return false;
  }
}

/**
 * Queue a Discord match start announcement request that the Discord bot will process
 */
async function queueDiscordMatchStart(matchId: string): Promise<boolean> {
  try {
    const db = await getDbInstance();

    // Generate unique ID for the announcement queue entry
    const announcementId = `announce_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

    // Add to main announcement queue with match_start type
    await db.run(`
      INSERT OR IGNORE INTO discord_announcement_queue (id, match_id, announcement_type, status)
      VALUES (?, ?, 'match_start', 'pending')
    `, [announcementId, matchId]);

    logger.debug('🚀 Discord match start announcement queued for match:', matchId);
    return true;
  } catch (error) {
    logger.error('❌ Error queuing Discord match start announcement:', error);
    return false;
  }
}

/**
 * Handles match transition to "gather" status
 * Queues Discord announcement to let users know they can sign up
 */
export async function handleGatherTransition(matchId: string): Promise<void> {
  try {
    const db = await getDbInstance();

    // Check if an announcement is already queued to prevent duplicates
    const existingAnnouncement = await db.get(`
      SELECT id FROM discord_announcement_queue
      WHERE match_id = ? AND (announcement_type IS NULL OR announcement_type = 'standard') AND status IN ('pending', 'posted')
    `, [matchId]);

    if (!existingAnnouncement) {
      const discordSuccess = await queueDiscordAnnouncement(matchId);

      if (discordSuccess) {
        logger.debug(`📢 Discord announcement queued for match entering gather stage: ${matchId}`);
      } else {
        logger.warning(`⚠️ Failed to queue Discord announcement for match: ${matchId}`);
      }
    } else {
      logger.debug(`📢 Discord announcement already queued for match: ${matchId}, skipping duplicate`);
    }
  } catch (error) {
    logger.error('❌ Error handling gather transition:', error);
    // Don't throw - just log the error
  }
}

/**
 * Handles match transition to "assign" status
 * Queues Discord status update to close signups
 */
export async function handleAssignTransition(matchId: string): Promise<void> {
  try {
    const discordUpdateSuccess = await queueDiscordStatusUpdate(matchId, 'assign');

    if (discordUpdateSuccess) {
      logger.debug(`🔄 Discord status update queued for match entering assign stage: ${matchId}`);
    } else {
      logger.warning(`⚠️ Failed to queue Discord status update for match: ${matchId}`);
    }
  } catch (error) {
    logger.error('❌ Error handling assign transition:', error);
    // Don't throw - just log the error
  }
}

/**
 * Handles match transition to "battle" status
 * Creates voice channels, queues announcements, initializes games, sends map codes
 */
export async function handleBattleTransition(matchId: string): Promise<void> {
  // Set up voice channels and welcome announcement
  try {
    await VoiceChannelService.setupBattleVoice(matchId);
  } catch (error) {
    logger.error('❌ Error setting up battle voice:', error);
  }

  // Queue Discord match start announcement
  try {
    const discordMatchStartSuccess = await queueDiscordMatchStart(matchId);

    if (discordMatchStartSuccess) {
      logger.debug(`🚀 Discord match start notification queued for match entering battle stage: ${matchId}`);
    } else {
      logger.warning(`⚠️ Failed to queue Discord match start notification for match: ${matchId}`);
    }
  } catch (error) {
    logger.error('❌ Error queuing Discord match start notification:', error);
  }

  // Initialize match games for all maps
  try {
    const { initializeMatchGames } = await import('./scoring-functions');
    await initializeMatchGames(matchId);
    logger.debug(`🎮 Match games initialized for all maps in match: ${matchId}`);
  } catch (error) {
    logger.error('❌ Error initializing match games:', error);
  }

  // Send map codes for the first map
  try {
    const success = await MapCodeService.processFirstMapCode(matchId);

    if (success) {
      logger.debug(`✅ First map code processed for match: ${matchId}`);
    }
  } catch (error) {
    logger.error('❌ Error processing first map code:', error);
  }
}

/**
 * Routes match status transitions to the appropriate handler
 */
export async function handleStatusTransition(matchId: string, newStatus: string): Promise<void> {
  switch (newStatus) {
    case 'gather':
      await handleGatherTransition(matchId);
      break;
    case 'assign':
      await handleAssignTransition(matchId);
      break;
    case 'battle':
      await handleBattleTransition(matchId);
      break;
    default:
      logger.debug(`No special handling needed for status: ${newStatus}`);
  }
}
