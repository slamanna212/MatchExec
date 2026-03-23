import { getDbInstance } from './database-init';
import { logger } from './logger';
import { VoiceChannelService } from './voice-channel-service';
import { MapCodeService } from './map-code-service';
import { queueDiscordDeletion } from './scoring-functions';
import { deleteMatchVoiceChannels } from './voice-channel-manager';
import { logFeedEvent } from './feed-helpers';

async function getMatchName(matchId: string): Promise<string> {
  try {
    const db = await getDbInstance();
    const row = await db.get<{ name: string }>('SELECT name FROM matches WHERE id = ?', [matchId]);
    return row?.name ?? matchId;
  } catch {
    return matchId;
  }
}

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

  try {
    const name = await getMatchName(matchId);
    await logFeedEvent({
      eventType: 'match_phase_changed',
      priority: 3,
      title: 'Match Signups Opened',
      description: `"${name}" is now accepting signups`,
      matchId,
    });
  } catch (error) {
    logger.error('❌ Error logging gather feed event:', error);
  }
}

/**
 * Handles match transition to "assign" status
 * Queues Discord status update to close signups and creates voice channels
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

  // Create voice channels so they're ready when match starts
  try {
    await VoiceChannelService.setupMatchVoiceChannels(matchId);
  } catch (error) {
    logger.error('❌ Error setting up voice channels:', error);
  }

  try {
    const name = await getMatchName(matchId);
    await logFeedEvent({
      eventType: 'match_phase_changed',
      priority: 3,
      title: 'Match Signups Closed',
      description: `"${name}" signups closed, teams being assigned`,
      matchId,
    });
  } catch (error) {
    logger.error('❌ Error logging assign feed event:', error);
  }
}

/**
 * Handles match transition to "battle" status
 * Queues welcome voice announcement, match start announcements, initializes games, sends map codes
 */
export async function handleBattleTransition(matchId: string): Promise<void> {
  // Queue welcome voice announcement (voice channels already created in assign transition)
  try {
    await VoiceChannelService.queueVoiceAnnouncement(matchId, 'welcome');
  } catch (error) {
    logger.error('❌ Error queuing welcome voice announcement:', error);
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

  // Log feed events for match started and scoring required
  try {
    const db = await getDbInstance();
    const matchData = await db.get<{ name: string; maps: string }>(
      'SELECT name, maps FROM matches WHERE id = ?',
      [matchId]
    );
    const name = matchData?.name ?? matchId;
    const mapCount = matchData?.maps ? JSON.parse(matchData.maps).length : 1;

    await logFeedEvent({
      eventType: 'match_started',
      priority: 2,
      title: 'Match Started',
      description: `"${name}" is now live`,
      matchId,
    });

    await logFeedEvent({
      eventType: 'match_scoring_required',
      priority: 2,
      title: 'Map Scoring Required',
      description: `"${name}" needs scoring (${mapCount} map${mapCount !== 1 ? 's' : ''})`,
      matchId,
      metadata: { mapCount },
    });
  } catch (error) {
    logger.error('❌ Error logging battle feed events:', error);
  }
}

/**
 * Handles tournament transition to "assign" status
 * Queues Discord status updates for all tournament matches to close signups
 */
export async function handleTournamentAssignTransition(tournamentId: string): Promise<void> {
  try {
    const db = await getDbInstance();

    // Get all matches for this tournament
    const matches = await db.all<{ id: string }>(`
      SELECT id FROM matches WHERE tournament_id = ?
    `, [tournamentId]);

    if (matches.length === 0) {
      logger.debug(`No matches found for tournament: ${tournamentId}`);
      return;
    }

    logger.debug(`Queueing Discord status updates for ${matches.length} tournament matches`);

    // Queue Discord status update for each match
    for (const match of matches) {
      try {
        const discordUpdateSuccess = await queueDiscordStatusUpdate(match.id, 'assign');

        if (discordUpdateSuccess) {
          logger.debug(`🔄 Discord status update queued for tournament match: ${match.id}`);
        } else {
          logger.warning(`⚠️ Failed to queue Discord status update for tournament match: ${match.id}`);
        }
      } catch (error) {
        logger.error(`❌ Error queuing Discord status update for tournament match ${match.id}:`, error);
        // Continue processing other matches even if one fails
      }
    }

    logger.info(`✅ Queued Discord status updates for ${matches.length} tournament matches`);
  } catch (error) {
    logger.error('❌ Error handling tournament assign transition:', error);
    // Don't throw - just log the error
  }
}

/**
 * Handles match transition to "complete" status
 * Queues Discord deletion and cleans up voice channels
 */
export async function handleCompleteTransition(matchId: string): Promise<void> {
  try {
    // Queue Discord message/event deletion
    await queueDiscordDeletion(matchId);
    logger.debug(`🗑️ Discord deletion queued for completed match: ${matchId}`);
  } catch (error) {
    logger.error('❌ Error queuing Discord deletion for completed match:', error);
  }

  // Clean up voice channels
  try {
    await deleteMatchVoiceChannels(matchId);
    logger.debug(`🔇 Voice channels deleted for completed match: ${matchId}`);
  } catch (error) {
    logger.error('❌ Error deleting voice channels for completed match:', error);
  }

  try {
    const name = await getMatchName(matchId);
    await logFeedEvent({
      eventType: 'match_completed',
      priority: 2,
      title: 'Match Completed',
      description: `"${name}" has finished`,
      matchId,
    });
  } catch (error) {
    logger.error('❌ Error logging complete feed event:', error);
  }
}

/**
 * Handles match transition to "cancelled" status
 * Queues Discord deletion and cleans up voice channels
 */
export async function handleCancelledTransition(matchId: string): Promise<void> {
  try {
    // Queue Discord message/event deletion
    await queueDiscordDeletion(matchId);
    logger.debug(`🗑️ Discord deletion queued for cancelled match: ${matchId}`);
  } catch (error) {
    logger.error('❌ Error queuing Discord deletion for cancelled match:', error);
  }

  // Clean up voice channels
  try {
    await deleteMatchVoiceChannels(matchId);
    logger.debug(`🔇 Voice channels deleted for cancelled match: ${matchId}`);
  } catch (error) {
    logger.error('❌ Error deleting voice channels for cancelled match:', error);
  }

  try {
    const name = await getMatchName(matchId);
    await logFeedEvent({
      eventType: 'match_cancelled',
      priority: 2,
      title: 'Match Cancelled',
      description: `"${name}" was cancelled`,
      matchId,
    });
  } catch (error) {
    logger.error('❌ Error logging cancelled feed event:', error);
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
    case 'complete':
      await handleCompleteTransition(matchId);
      break;
    case 'cancelled':
      await handleCancelledTransition(matchId);
      break;
    default:
      logger.debug(`No special handling needed for status: ${newStatus}`);
  }
}
