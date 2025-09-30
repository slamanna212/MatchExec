import { NextRequest, NextResponse } from 'next/server';
import { getDbInstance } from '../../../../../lib/database-init';
import { TOURNAMENT_FLOW_STEPS, Tournament } from '@/shared/types';
import { logger } from '@/lib/logger';

// Queue a Discord match start announcement request that the Discord bot will process
async function queueDiscordMatchStart(matchId: string): Promise<boolean> {
  try {
    const db = await getDbInstance();

    // Generate unique ID for the announcement queue entry
    const announcementId = `announce_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

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

// Queue a Discord tournament announcement request that the Discord bot will process
async function queueDiscordTournamentAnnouncement(tournamentId: string): Promise<boolean> {
  try {
    const db = await getDbInstance();

    // Check if already exists first to prevent duplicates
    const existing = await db.get(`
      SELECT id FROM discord_announcement_queue
      WHERE match_id = ? AND announcement_type = 'tournament' AND status IN ('pending', 'posted')
    `, [tournamentId]);

    if (existing) {
      logger.debug('📢 Discord tournament announcement already exists for tournament:', tournamentId);
      return true;
    }

    // Generate unique ID for the announcement queue entry
    const announcementId = `announce_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Add to announcement queue with 'tournament' type
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

// Queue a Discord status update request that the Discord bot will process
async function queueDiscordTournamentStatusUpdate(tournamentId: string, newStatus: string): Promise<boolean> {
  try {
    const db = await getDbInstance();

    // Generate unique ID for the queue entry
    const updateId = `discord_tournament_update_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Add to status update queue
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

// Queue Discord event deletion for a tournament
async function queueDiscordEventDeletion(tournamentId: string): Promise<boolean> {
  try {
    const db = await getDbInstance();

    // Check if there's a Discord event for this tournament
    const eventRecord = await db.get<{ discord_event_id: string | null }>(`
      SELECT discord_event_id FROM discord_match_messages
      WHERE match_id = ? AND discord_event_id IS NOT NULL
    `, [tournamentId]);

    if (!eventRecord?.discord_event_id) {
      logger.debug('ℹ️ No Discord event found for tournament:', tournamentId);
      return true; // Not an error - tournament might not have an event
    }

    // Generate unique ID for the deletion queue entry
    const deletionId = `deletion_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Add to deletion queue
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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tournamentId: string }> }
) {
  try {
    const { tournamentId } = await params;
    const { newStatus } = await request.json();

    if (!newStatus || !TOURNAMENT_FLOW_STEPS[newStatus as keyof typeof TOURNAMENT_FLOW_STEPS]) {
      return NextResponse.json(
        { error: 'Invalid status provided' },
        { status: 400 }
      );
    }

    const db = await getDbInstance();
    
    // Get current tournament data
    const currentTournament = await db.get<Tournament>(` 
      SELECT * FROM tournaments WHERE id = ?
    `, [tournamentId]);

    if (!currentTournament) {
      return NextResponse.json(
        { error: 'Tournament not found' },
        { status: 404 }
      );
    }

    // Validate status transition (basic flow validation)
    const currentStep = TOURNAMENT_FLOW_STEPS[currentTournament.status as keyof typeof TOURNAMENT_FLOW_STEPS];
    const newStep = TOURNAMENT_FLOW_STEPS[newStatus as keyof typeof TOURNAMENT_FLOW_STEPS];

    if (newStep.progress < currentStep.progress && newStatus !== 'cancelled') {
      return NextResponse.json(
        { error: 'Cannot move backwards in tournament flow' },
        { status: 400 }
      );
    }

    // Additional validation for specific transitions
    if (newStatus === 'battle') {
      // Check if teams are assigned for tournament to start battle phase
      const teamCount = await db.get<{ count: number }>(`
        SELECT COUNT(*) as count FROM tournament_teams WHERE tournament_id = ?
      `, [tournamentId]);
      
      const memberCount = await db.get<{ count: number }>(`
        SELECT COUNT(*) as count FROM tournament_team_members ttm
        JOIN tournament_teams tt ON ttm.team_id = tt.id
        WHERE tt.tournament_id = ?
      `, [tournamentId]);
      
      if (!teamCount || teamCount.count < 2) {
        return NextResponse.json(
          { error: 'At least 2 teams are required to start tournament battles' },
          { status: 400 }
        );
      }

      if (!memberCount || memberCount.count === 0) {
        return NextResponse.json(
          { error: 'Teams must have members assigned before starting tournament battles' },
          { status: 400 }
        );
      }
    }

    // Update tournament status
    await db.run(`
      UPDATE tournaments 
      SET status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [newStatus, tournamentId]);

    logger.debug(`🏆 Tournament ${tournamentId} transitioned from ${currentTournament.status} to ${newStatus}`);

    // Handle status-specific actions
    switch (newStatus) {
      case 'gather':
        logger.debug(`📝 Tournament ${tournamentId} is now open for team signups`);
        
        // Queue Discord announcement for tournament signup
        const discordSuccess = await queueDiscordTournamentAnnouncement(tournamentId);
        if (!discordSuccess) {
          logger.warning('⚠️ Failed to queue Discord announcement for tournament:', tournamentId);
        }
        break;
        
      case 'assign':
        logger.debug(`🎯 Tournament ${tournamentId} signups closed, ready for bracket assignment`);

        // Queue Discord status update when entering "assign" stage (close signups)
        try {
          const discordUpdateSuccess = await queueDiscordTournamentStatusUpdate(tournamentId, newStatus);

          if (discordUpdateSuccess) {
            logger.debug(`🔄 Discord tournament status update queued for tournament entering assign stage: ${tournamentId}`);
          } else {
            logger.warning(`⚠️ Failed to queue Discord tournament status update for tournament: ${tournamentId}`);
          }
        } catch (discordError) {
          logger.error('❌ Error queuing Discord tournament status update:', discordError);
          // Don't fail the API request if Discord queueing fails
        }
        break;
        
      case 'battle':
        logger.debug(`⚔️ Tournament ${tournamentId} started - transitioning first round matches to battle`);

        // Transition all first round matches to battle status with proper notifications
        try {
          const firstRoundMatches = await db.all<{id: string, name: string}>(`
            SELECT m.id, m.name
            FROM matches m
            JOIN tournament_matches tm ON m.id = tm.match_id
            WHERE tm.tournament_id = ? AND tm.round = 1 AND m.status = 'assign'
          `, [tournamentId]);

          for (const match of firstRoundMatches) {
            try {
              // Update match status to battle
              await db.run(`
                UPDATE matches
                SET status = 'battle', updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
              `, [match.id]);

              // Queue Discord match start notification
              await queueDiscordMatchStart(match.id);

              // Initialize match games for scoring
              const { initializeMatchGames } = await import('../../../../../lib/scoring-functions');
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
          // Don't fail the tournament transition if match transitions fail
        }
        break;
        
      case 'complete':
        logger.debug(`🏆 Tournament ${tournamentId} has been completed`);

        // Queue Discord event deletion for completed tournament
        try {
          await queueDiscordEventDeletion(tournamentId);
        } catch (error) {
          logger.error('❌ Error queuing Discord event deletion for completed tournament:', error);
        }
        break;

      case 'cancelled':
        logger.debug(`❌ Tournament ${tournamentId} has been cancelled`);

        // Queue Discord event deletion for cancelled tournament
        try {
          await queueDiscordEventDeletion(tournamentId);
        } catch (error) {
          logger.error('❌ Error queuing Discord event deletion for cancelled tournament:', error);
        }
        break;
    }

    // Get updated tournament data with game info
    const updatedTournament = await db.get<Tournament & {
      game_name?: string;
      game_icon?: string; 
      game_color?: string;
      participant_count?: number;
    }>(`
      SELECT 
        t.*, 
        g.name as game_name, 
        g.icon_url as game_icon, 
        g.color as game_color,
        COUNT(DISTINCT ttm.user_id) as participant_count
      FROM tournaments t
      LEFT JOIN games g ON t.game_id = g.id
      LEFT JOIN tournament_teams tt ON t.id = tt.tournament_id
      LEFT JOIN tournament_team_members ttm ON tt.id = ttm.team_id
      WHERE t.id = ?
      GROUP BY t.id
    `, [tournamentId]);

    return NextResponse.json(updatedTournament);

  } catch (error) {
    logger.error('Error transitioning tournament status:', error);
    return NextResponse.json(
      { error: 'Failed to transition tournament status' },
      { status: 500 }
    );
  }
}