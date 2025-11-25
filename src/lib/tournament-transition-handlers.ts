/**
 * @module tournament-transition-handlers
 * @description Handlers for tournament status transitions
 *
 * This module provides specialized handlers for each tournament status transition,
 * encapsulating the logic for Discord announcements, team management, and match initialization.
 */

import { logger } from './logger';
import type { Database } from '../../lib/database/connection';

/**
 * Handles the transition to "gather" status (tournament open for signups)
 *
 * @param db - Database instance
 * @param tournamentId - ID of the tournament
 * @returns Promise that resolves when transition is complete
 *
 * @example
 * await handleGatherTransition(db, 'tournament_123');
 */
export async function handleGatherTransition(
  db: Database,
  tournamentId: string
): Promise<void> {
  logger.debug(`📝 Tournament ${tournamentId} is now open for team signups`);

  // Queue Discord announcement for tournament signup
  const discordSuccess = await queueDiscordTournamentAnnouncement(db, tournamentId);
  if (!discordSuccess) {
    logger.warning('⚠️ Failed to queue Discord announcement for tournament:', tournamentId);
  }
}

/**
 * Handles the transition to "assign" status (signups closed, ready for bracket assignment)
 *
 * Automatically creates solo teams for games with team_size = 1 if no teams exist.
 * Queues Discord status update to close signups.
 *
 * @param db - Database instance
 * @param tournamentId - ID of the tournament
 * @returns Promise that resolves when transition is complete
 */
export async function handleAssignTransition(
  db: Database,
  tournamentId: string
): Promise<void> {
  logger.debug(`🎯 Tournament ${tournamentId} signups closed, ready for bracket assignment`);

  await autoCreateSoloTeams(db, tournamentId);
  await queueDiscordTournamentStatusUpdate(db, tournamentId, 'assign');
}

/**
 * Handles the transition to "battle" status (tournament started)
 *
 * Transitions all first round matches to battle status, queues match start notifications,
 * and initializes match games for scoring.
 *
 * @param db - Database instance
 * @param tournamentId - ID of the tournament
 * @returns Promise that resolves when transition is complete
 */
export async function handleBattleTransition(
  db: Database,
  tournamentId: string
): Promise<void> {
  logger.debug(`⚔️ Tournament ${tournamentId} started - transitioning first round matches to battle`);

  await transitionFirstRoundMatches(db, tournamentId);
}

/**
 * Handles the transition to "complete" or "cancelled" status
 *
 * Queues Discord event deletion for the tournament.
 *
 * @param db - Database instance
 * @param tournamentId - ID of the tournament
 * @param status - Either 'complete' or 'cancelled'
 * @returns Promise that resolves when transition is complete
 */
export async function handleEndTransition(
  db: Database,
  tournamentId: string,
  status: 'complete' | 'cancelled'
): Promise<void> {
  logger.debug(status === 'complete'
    ? `🏆 Tournament ${tournamentId} has been completed`
    : `❌ Tournament ${tournamentId} has been cancelled`
  );

  await queueDiscordEventDeletion(db, tournamentId);
}

/**
 * Auto-creates solo teams for games with team_size = 1
 *
 * Checks if the game supports solo play (team_size = 1) and automatically
 * creates one team per participant if no teams exist.
 *
 * @param db - Database instance
 * @param tournamentId - ID of the tournament
 * @returns Promise that resolves when teams are created
 * @private
 */
async function autoCreateSoloTeams(
  db: Database,
  tournamentId: string
): Promise<void> {
  try {
    const existingTeamCount = await db.get<{ count: number }>(`
      SELECT COUNT(*) as count FROM tournament_teams WHERE tournament_id = ?
    `, [tournamentId]);

    if (existingTeamCount && existingTeamCount.count > 0) return;

    const participants = await db.all<{ id: string; user_id: string; username: string }>(`
      SELECT id, user_id, username FROM tournament_participants WHERE tournament_id = ?
    `, [tournamentId]);

    if (participants.length === 0) return;

    const gameModes = await db.all<{ team_size: number }>(`
      SELECT team_size FROM game_modes WHERE game_id = (
        SELECT game_id FROM tournaments WHERE id = ?
      )
    `, [tournamentId]);

    const hasSoloMode = gameModes.some((mode: { team_size: number }) => mode.team_size === 1);

    if (hasSoloMode) {
      logger.debug(`🤖 Auto-creating solo teams for ${participants.length} participants`);

      for (const participant of participants) {
        const teamId = `team_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
        const memberId = `member_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

        await db.run(`
          INSERT INTO tournament_teams (id, tournament_id, team_name)
          VALUES (?, ?, ?)
        `, [teamId, tournamentId, participant.username]);

        await db.run(`
          INSERT INTO tournament_team_members (id, team_id, user_id, username)
          VALUES (?, ?, ?, ?)
        `, [memberId, teamId, participant.user_id, participant.username]);

        await db.run(`
          UPDATE tournament_participants SET team_assignment = ? WHERE id = ?
        `, [teamId, participant.id]);
      }

      logger.debug(`✅ Created ${participants.length} solo teams automatically`);
    }
  } catch (error) {
    logger.error('❌ Error auto-creating solo teams:', error);
  }
}

/**
 * Transitions all first round matches to battle status
 *
 * Updates match status, queues Discord notifications, and initializes match games.
 *
 * @param db - Database instance
 * @param tournamentId - ID of the tournament
 * @returns Promise that resolves when all matches are transitioned
 * @private
 */
async function transitionFirstRoundMatches(
  db: Database,
  tournamentId: string
): Promise<void> {
  try {
    const firstRoundMatches = await db.all<{id: string, name: string}>(`
      SELECT m.id, m.name
      FROM matches m
      JOIN tournament_matches tm ON m.id = tm.match_id
      WHERE tm.tournament_id = ? AND tm.round = 1 AND m.status = 'assign'
    `, [tournamentId]);

    for (const match of firstRoundMatches) {
      try {
        await db.run(`
          UPDATE matches
          SET status = 'battle', updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `, [match.id]);

        await queueDiscordMatchStart(db, match.id);

        const { initializeMatchGames } = await import('./scoring-functions');
        await initializeMatchGames(match.id);

        logger.debug(`🚀 Started match with notifications: ${match.name}`);
      } catch (matchError) {
        logger.error(`❌ Error starting match ${match.id}:`, matchError);
      }
    }

    if (firstRoundMatches.length > 0) {
      logger.debug(`✅ Started ${firstRoundMatches.length} first round matches`);
    }
  } catch (error) {
    logger.error('❌ Error starting first round matches:', error);
  }
}

// Helper: Queue Discord tournament announcement
async function queueDiscordTournamentAnnouncement(
  db: Database,
  tournamentId: string
): Promise<boolean> {
  try {
    const existing = await db.get(`
      SELECT id FROM discord_announcement_queue
      WHERE match_id = ? AND announcement_type = 'tournament' AND status IN ('pending', 'posted')
    `, [tournamentId]);

    if (existing) {
      logger.debug('📢 Discord tournament announcement already exists for tournament:', tournamentId);
      return true;
    }

    const announcementId = `announce_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

    await db.run(`
      INSERT INTO discord_announcement_queue (id, match_id, announcement_type, status)
      VALUES (?, ?, 'tournament', 'pending')
    `, [announcementId, tournamentId]);

    logger.debug('📢 Discord tournament announcement queued for tournament:', tournamentId);
    return true;
  } catch (error) {
    logger.error('❌ Error queuing Discord tournament announcement:', error);
    return false;
  }
}

// Helper: Queue Discord tournament status update
async function queueDiscordTournamentStatusUpdate(
  db: Database,
  tournamentId: string,
  newStatus: string
): Promise<boolean> {
  try {
    const updateId = `discord_tournament_update_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

    await db.run(`
      INSERT INTO discord_status_update_queue (id, match_id, new_status, status)
      VALUES (?, ?, ?, 'pending')
    `, [updateId, tournamentId, newStatus]);

    logger.debug('🔄 Discord tournament status update queued for tournament:', tournamentId, '-> status:', newStatus);
    return true;
  } catch (error) {
    logger.error('❌ Error queuing Discord tournament status update:', error);
    return false;
  }
}

// Helper: Queue Discord match start
async function queueDiscordMatchStart(
  db: Database,
  matchId: string
): Promise<boolean> {
  try {
    const announcementId = `announce_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

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

// Helper: Queue Discord event deletion
async function queueDiscordEventDeletion(
  db: Database,
  tournamentId: string
): Promise<boolean> {
  try {
    const eventRecord = await db.get<{ discord_event_id: string | null }>(`
      SELECT discord_event_id FROM discord_match_messages
      WHERE match_id = ? AND discord_event_id IS NOT NULL
    `, [tournamentId]);

    if (!eventRecord?.discord_event_id) {
      logger.debug('ℹ️ No Discord event found for tournament:', tournamentId);
      return true;
    }

    const deletionId = `deletion_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

    await db.run(`
      INSERT INTO discord_deletion_queue (id, match_id, status)
      VALUES (?, ?, 'pending')
    `, [deletionId, tournamentId]);

    logger.debug('🗑️ Discord event deletion queued for tournament:', tournamentId);
    return true;
  } catch (error) {
    logger.error('❌ Error queuing Discord event deletion:', error);
    return false;
  }
}
