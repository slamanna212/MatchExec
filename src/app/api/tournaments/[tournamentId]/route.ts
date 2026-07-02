import type { NextRequest} from 'next/server';
import type { NextResponse } from 'next/server';
import { getDbInstance } from '../../../../lib/database-init';
import type { Tournament, TournamentTeam, TournamentTeamMember } from '@/shared/types';
import { logger } from '@/lib/logger';
import { apiError, apiOk } from '@/lib/api-response';
import { validateMaxLength } from '@/lib/utils/validation';

interface TournamentWithDetails extends Tournament {
  game_name?: string;
  game_icon?: string;
  game_color?: string;
  teams?: (TournamentTeam & { members?: TournamentTeamMember[] })[];
  participant_count?: number;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tournamentId: string }> }
): Promise<NextResponse> {
  try {
    const { tournamentId } = await params;
    if (!tournamentId || typeof tournamentId !== 'string' || tournamentId.length > 100) {
      return apiError('Invalid ID', 400);
    }
    const db = await getDbInstance();
    
    // Fetch tournament with game info
    const tournament = await db.get<Tournament & { 
      game_name?: string; 
      game_icon?: string; 
      game_color?: string;
    }>(`
      SELECT t.*, g.name as game_name, g.icon_url as game_icon, g.color as game_color
      FROM tournaments t
      LEFT JOIN games g ON t.game_id = g.id
      WHERE t.id = ?
    `, [tournamentId]);
    
    if (!tournament) {
      return apiError('Tournament not found', 404);
    }

    // Fetch teams and their members
    const teams = await db.all<TournamentTeam & {
      member_id?: string;
      member_user_id?: string;
      member_discord_user_id?: string;
      member_username?: string;
      member_joined_at?: string;
      member_avatar_url?: string;
      member_is_captain?: number;
    }>(`
      SELECT
        tt.*,
        ttm.id as member_id,
        ttm.user_id as member_user_id,
        ttm.discord_user_id as member_discord_user_id,
        ttm.username as member_username,
        ttm.joined_at as member_joined_at,
        ttm.is_captain as member_is_captain,
        (SELECT mp.avatar_url FROM match_participants mp
         WHERE mp.discord_user_id = ttm.discord_user_id
           AND mp.avatar_url IS NOT NULL
         LIMIT 1) as member_avatar_url
      FROM tournament_teams tt
      LEFT JOIN tournament_team_members ttm ON tt.id = ttm.team_id
      WHERE tt.tournament_id = ?
      ORDER BY tt.team_name ASC, ttm.joined_at ASC
    `, [tournamentId]);
    
    // Group members by team
    const teamsMap = new Map<string, TournamentTeam & { members: TournamentTeamMember[] }>();
    
    for (const row of teams) {
      if (!teamsMap.has(row.id)) {
        teamsMap.set(row.id, {
          id: row.id,
          tournament_id: row.tournament_id,
          team_name: row.team_name,
          created_at: row.created_at,
          members: []
        });
      }
      
      // Add member if present
      if (row.member_id) {
        teamsMap.get(row.id)!.members.push({
          id: row.member_id,
          team_id: row.id,
          user_id: row.member_user_id!,
          discord_user_id: row.member_discord_user_id ?? undefined,
          username: row.member_username!,
          avatar_url: row.member_avatar_url ?? undefined,
          joined_at: new Date(row.member_joined_at!),
          is_captain: row.member_is_captain === 1
        });
      }
    }
    
    const participantCountRow = await db.get<{ count: number }>(`
      SELECT
        CASE
          WHEN t.status IN ('created', 'gather') THEN COUNT(DISTINCT tp.user_id)
          ELSE COUNT(DISTINCT ttm.user_id)
        END as count
      FROM tournaments t
      LEFT JOIN tournament_participants tp ON t.id = tp.tournament_id
      LEFT JOIN tournament_teams tt ON t.id = tt.tournament_id
      LEFT JOIN tournament_team_members ttm ON tt.id = ttm.team_id
      WHERE t.id = ?
    `, [tournamentId]);

    const tournamentWithDetails: TournamentWithDetails = {
      ...tournament,
      teams: Array.from(teamsMap.values()),
      participant_count: participantCountRow?.count ?? 0
    };
    
    return apiOk(tournamentWithDetails);
  } catch (error) {
    logger.error('Error fetching tournament:', error);
    return apiError('Failed to fetch tournament');
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ tournamentId: string }> }
): Promise<NextResponse> {
  try {
    const { tournamentId } = await params;
    if (!tournamentId || typeof tournamentId !== 'string' || tournamentId.length > 100) {
      return apiError('Invalid ID', 400);
    }

    const db = await getDbInstance();
    const existing = await db.get<{ id: string; status: string }>('SELECT id, status FROM tournaments WHERE id = ?', [tournamentId]);
    if (!existing) return apiError('Tournament not found', 404);

    const body = await request.json();

    for (const check of [
      validateMaxLength(body.name, 255, 'name'),
      validateMaxLength(body.description, 1000, 'description'),
      validateMaxLength(body.livestreamLink, 500, 'livestreamLink'),
    ]) {
      if (!check.valid) return apiError(check.error, 400);
    }

    const updates: string[] = [];
    const values: unknown[] = [];

    if (body.name !== undefined) { updates.push('name = ?'); values.push(body.name); }
    if (body.description !== undefined) { updates.push('description = ?'); values.push(body.description || null); }
    if (body.startDate !== undefined) { updates.push('start_date = ?'); values.push(body.startDate ? new Date(body.startDate).toISOString() : null); }
    if (body.startTime !== undefined) { updates.push('start_time = ?'); values.push(body.startTime ? new Date(body.startTime).toISOString() : null); }
    if (body.eventImageUrl !== undefined) { updates.push('event_image_url = ?'); values.push(body.eventImageUrl || null); }
    if (body.livestreamLink !== undefined) { updates.push('livestream_link = ?'); values.push(body.livestreamLink || null); }
    if (body.announcements !== undefined) { updates.push('announcements = ?'); values.push(body.announcements ? JSON.stringify(body.announcements) : null); }
    if (body.playerNotifications !== undefined) { updates.push('player_notifications = ?'); values.push(body.playerNotifications === false ? 0 : 1); }
    if (body.allowMatchEditing !== undefined) { updates.push('allow_match_editing = ?'); values.push(body.allowMatchEditing === false ? 0 : 1); }
    if (body.positionScoringOverride !== undefined) { updates.push('position_scoring_override = ?'); values.push(body.positionScoringOverride || null); }

    if (updates.length === 0) return apiError('No valid fields to update', 400);

    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(tournamentId);

    await db.run(`UPDATE tournaments SET ${updates.join(', ')} WHERE id = ?`, values);

    const updated = await db.get<Tournament & { game_name?: string; game_icon?: string; game_color?: string }>(
      `SELECT t.*, g.name as game_name, g.icon_url as game_icon, g.color as game_color
       FROM tournaments t LEFT JOIN games g ON t.game_id = g.id WHERE t.id = ?`,
      [tournamentId]
    );

    return apiOk(updated);
  } catch (error) {
    logger.error('Error updating tournament:', error);
    return apiError('Failed to update tournament');
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ tournamentId: string }> }
): Promise<NextResponse> {
  try {
    const { tournamentId } = await params;
    if (!tournamentId || typeof tournamentId !== 'string' || tournamentId.length > 100) {
      return apiError('Invalid ID', 400);
    }
    const db = await getDbInstance();
    
    // Check if tournament exists and get event image for cleanup
    const existingTournament = await db.get<Tournament & { event_image_url?: string }>(
      'SELECT id, event_image_url FROM tournaments WHERE id = ?',
      [tournamentId]
    );

    if (!existingTournament) {
      return apiError('Tournament not found', 404);
    }

    // Check if tournament has active matches
    const activeMatches = await db.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM matches
       WHERE tournament_id = ? AND status NOT IN ('complete', 'cancelled')`,
      [tournamentId]
    );

    if (activeMatches && activeMatches.count > 0) {
      return apiError('Cannot delete tournament with active matches', 400);
    }

    // Queue Discord deletions for all tournament matches before deleting the tournament
    try {
      const tournamentMatches = await db.all<{ id: string }>(`
        SELECT id FROM matches WHERE tournament_id = ?
      `, [tournamentId]);

      if (tournamentMatches.length > 0) {
        logger.debug(`🗑️ Queueing Discord deletions for ${tournamentMatches.length} tournament matches`);

        for (const match of tournamentMatches) {
          const matchDeletionId = `deletion_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`; // NOSONAR: non-security internal ID generation
          await db.run(`
            INSERT INTO discord_deletion_queue (id, match_id, status)
            VALUES (?, ?, 'pending')
          `, [matchDeletionId, match.id]);
        }

        logger.debug(`✅ Discord deletions queued for ${tournamentMatches.length} tournament matches`);
      }
    } catch (error) {
      logger.error('❌ Error queuing Discord deletions for tournament matches:', error);
    }

    // Queue Discord message deletion for the tournament itself
    try {
      const deletionId = `deletion_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`; // NOSONAR: non-security internal ID generation
      await db.run(`
        INSERT INTO discord_deletion_queue (id, match_id, status)
        VALUES (?, ?, 'pending')
      `, [deletionId, tournamentId]);

      logger.debug('🗑️ Discord deletion queued for tournament:', tournamentId);
    } catch (error) {
      logger.error('❌ Error queuing Discord deletion:', error);
    }

    // Clean up event image if it exists
    if (existingTournament.event_image_url) {
      try {
        const response = await fetch(`${process.env.PUBLIC_URL || 'http://localhost:3000'}/api/upload/event-image?imageUrl=${encodeURIComponent(existingTournament.event_image_url)}`, {
          method: 'DELETE',
        });
        if (response.ok) {
          logger.debug(`✅ Cleaned up event image for tournament: ${tournamentId}`);
        }
      } catch (error) {
        logger.error('Error cleaning up event image:', error);
      }
    }

    // Delete the tournament (CASCADE will handle related records)
    await db.run('DELETE FROM tournaments WHERE id = ?', [tournamentId]);
    
    logger.debug(`✅ Tournament deleted: ${tournamentId}`);
    
    return apiOk({ success: true });
  } catch (error) {
    logger.error('Error deleting tournament:', error);
    return apiError('Failed to delete tournament');
  }
}