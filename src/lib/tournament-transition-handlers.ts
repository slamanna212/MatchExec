/**
 * @module tournament-transition-handlers
 * @description Handlers for tournament status transitions
 *
 * This module provides specialized handlers for each tournament status transition,
 * encapsulating the logic for Discord announcements, team management, and match initialization.
 */

import { logger } from './logger';
import { initializeMatchGames } from './matches';
import type { Database } from '../../lib/database/connection';
import { logFeedEvent } from './feed-helpers';
import { db as pgDb } from '../../lib/db';
import { enqueueAnnouncement, enqueueDeletion, enqueueStatusUpdate } from './discord-queues';

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

  try {
    const row = await db.get<{ name: string }>('SELECT name FROM tournaments WHERE id = ?', [tournamentId]);
    await logFeedEvent({
      eventType: 'tournament_phase_changed',
      priority: 3,
      title: 'Tournament Signups Opened',
      description: `"${row?.name ?? tournamentId}" is now accepting signups`,
      tournamentId,
    });
  } catch (error) {
    logger.error('❌ Error logging tournament gather feed event:', error);
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

  try {
    const row = await db.get<{ name: string }>('SELECT name FROM tournaments WHERE id = ?', [tournamentId]);
    await logFeedEvent({
      eventType: 'tournament_phase_changed',
      priority: 3,
      title: 'Tournament Signups Closed',
      description: `"${row?.name ?? tournamentId}" signups closed, bracket being assigned`,
      tournamentId,
    });
  } catch (error) {
    logger.error('❌ Error logging tournament assign feed event:', error);
  }
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

  try {
    const row = await db.get<{ name: string }>('SELECT name FROM tournaments WHERE id = ?', [tournamentId]);
    await logFeedEvent({
      eventType: 'tournament_started',
      priority: 2,
      title: 'Tournament Started',
      description: `"${row?.name ?? tournamentId}" battles are underway`,
      tournamentId,
    });
  } catch (error) {
    logger.error('❌ Error logging tournament battle feed event:', error);
  }
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

  try {
    const row = await db.get<{ name: string }>('SELECT name FROM tournaments WHERE id = ?', [tournamentId]);
    const name = row?.name ?? tournamentId;
    await logFeedEvent({
      eventType: status === 'complete' ? 'tournament_completed' : 'tournament_cancelled',
      priority: 2,
      title: status === 'complete' ? 'Tournament Completed' : 'Tournament Cancelled',
      description: status === 'complete'
        ? `"${name}" is over`
        : `"${name}" was cancelled`,
      tournamentId,
    });
  } catch (error) {
    logger.error('❌ Error logging tournament end feed event:', error);
  }
}

/**
 * Auto-creates solo teams for individual modes (FFA/Position scoring or team_size = 1)
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

    const participants = await db.all<{ id: string; user_id: string; discord_user_id: string | null; username: string }>(`
      SELECT id, user_id, discord_user_id, username FROM tournament_participants WHERE tournament_id = ?
    `, [tournamentId]);

    if (participants.length === 0) return;

    // Individual modes (FFA / Position scoring, or team_size 1) get one solo team per participant.
    // FFA/Position modes have a NULL team_size, so the scoring_type must be checked as well.
    const tournamentMode = await db.get<{ scoring_type: string | null; team_size: number | null }>(`
      SELECT gm.scoring_type, gm.team_size
      FROM tournaments t
      JOIN game_modes gm ON gm.id = t.game_mode_id AND gm.game_id = t.game_id
      WHERE t.id = ?
    `, [tournamentId]);

    let isIndividualMode = tournamentMode
      ? tournamentMode.scoring_type === 'FFA' || tournamentMode.scoring_type === 'Position' || tournamentMode.team_size === 1
      : false;

    if (!tournamentMode) {
      // Fallback for tournaments without a resolvable mode: any solo mode in the game
      const gameModes = await db.all<{ team_size: number | null }>(`
        SELECT team_size FROM game_modes WHERE game_id = (
          SELECT game_id FROM tournaments WHERE id = ?
        )
      `, [tournamentId]);
      isIndividualMode = gameModes.some(mode => mode.team_size === 1);
    }

    if (isIndividualMode) {
      logger.debug(`🤖 Auto-creating solo teams for ${participants.length} participants`);

      for (const participant of participants) {
        const teamId = `team_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
        const memberId = `member_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

        await db.run(`
          INSERT INTO tournament_teams (id, tournament_id, team_name)
          VALUES (?, ?, ?)
        `, [teamId, tournamentId, participant.username]);

        await db.run(`
          INSERT INTO tournament_team_members (id, team_id, user_id, discord_user_id, username)
          VALUES (?, ?, ?, ?, ?)
        `, [memberId, teamId, participant.user_id, participant.discord_user_id, participant.username]);

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

        await initializeMatchGames(pgDb, match.id); // TODO(tournaments): pass the tx once tournaments are on Postgres

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
  _db: Database,
  tournamentId: string
): Promise<boolean> {
  try {
    const queued = await enqueueAnnouncement(pgDb, { matchId: tournamentId, type: 'tournament', dedupe: ['pending', 'processing'] });

    if (queued) {
      logger.debug('📢 Discord tournament announcement queued for tournament:', tournamentId);
    } else {
      logger.debug('📢 Discord tournament announcement already exists for tournament:', tournamentId);
    }
    return true;
  } catch (error) {
    logger.error('❌ Error queuing Discord tournament announcement:', error);
    return false;
  }
}

// Helper: Queue Discord tournament status update
async function queueDiscordTournamentStatusUpdate(
  _db: Database,
  tournamentId: string,
  newStatus: string
): Promise<boolean> {
  try {
    await enqueueStatusUpdate(pgDb, tournamentId, newStatus);

    logger.debug('🔄 Discord tournament status update queued for tournament:', tournamentId, '-> status:', newStatus);
    return true;
  } catch (error) {
    logger.error('❌ Error queuing Discord tournament status update:', error);
    return false;
  }
}

// Helper: Queue Discord match start
async function queueDiscordMatchStart(
  _db: Database,
  matchId: string
): Promise<boolean> {
  try {
    await enqueueAnnouncement(pgDb, { matchId, type: 'match_start' });

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

    await enqueueDeletion(pgDb, tournamentId);

    logger.debug('🗑️ Discord event deletion queued for tournament:', tournamentId);
    return true;
  } catch (error) {
    logger.error('❌ Error queuing Discord event deletion:', error);
    return false;
  }
}
