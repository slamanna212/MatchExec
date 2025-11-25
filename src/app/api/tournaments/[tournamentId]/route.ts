import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { getDbInstance } from '../../../../lib/database-init';
import type { Tournament, TournamentTeam, TournamentTeamMember } from '@/shared/types';
import { logger } from '@/lib/logger';

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
) {
  try {
    const db = await getDbInstance();
    const { tournamentId } = await params;
    
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
      return NextResponse.json(
        { error: 'Tournament not found' },
        { status: 404 }
      );
    }
    
    // Fetch teams and their members
    const teams = await db.all<TournamentTeam & { 
      member_id?: string;
      member_user_id?: string;
      member_username?: string;
      member_joined_at?: string;
    }>(`
      SELECT 
        tt.*,
        ttm.id as member_id,
        ttm.user_id as member_user_id,
        ttm.username as member_username,
        ttm.joined_at as member_joined_at
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
          username: row.member_username!,
          joined_at: new Date(row.member_joined_at!)
        });
      }
    }
    
    const tournamentWithDetails: TournamentWithDetails = {
      ...tournament,
      teams: Array.from(teamsMap.values()),
      participant_count: Array.from(teamsMap.values()).reduce((total, team) => total + team.members.length, 0)
    };
    
    return NextResponse.json(tournamentWithDetails);
  } catch (error) {
    logger.error('Error fetching tournament:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tournament' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ tournamentId: string }> }
) {
  try {
    const db = await getDbInstance();
    const { tournamentId } = await params;
    
    // Check if tournament exists and get event image for cleanup
    const existingTournament = await db.get<Tournament & { event_image_url?: string }>(
      'SELECT id, event_image_url FROM tournaments WHERE id = ?',
      [tournamentId]
    );

    if (!existingTournament) {
      return NextResponse.json(
        { error: 'Tournament not found' },
        { status: 404 }
      );
    }
    
    // Check if tournament has active matches
    const activeMatches = await db.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM matches 
       WHERE tournament_id = ? AND status NOT IN ('complete', 'cancelled')`,
      [tournamentId]
    );
    
    if (activeMatches && activeMatches.count > 0) {
      return NextResponse.json(
        { error: 'Cannot delete tournament with active matches' },
        { status: 400 }
      );
    }

    // Queue Discord deletions for all tournament matches before deleting the tournament
    try {
      const tournamentMatches = await db.all<{ id: string }>(`
        SELECT id FROM matches WHERE tournament_id = ?
      `, [tournamentId]);

      if (tournamentMatches.length > 0) {
        logger.debug(`🗑️ Queueing Discord deletions for ${tournamentMatches.length} tournament matches`);

        for (const match of tournamentMatches) {
          const matchDeletionId = `deletion_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
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
      const deletionId = `deletion_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
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
    
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Error deleting tournament:', error);
    return NextResponse.json(
      { error: 'Failed to delete tournament' },
      { status: 500 }
    );
  }
}