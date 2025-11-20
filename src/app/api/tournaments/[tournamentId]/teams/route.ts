import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { getDbInstance } from '../../../../../lib/database-init';
import type { TournamentTeam, TournamentTeamMember } from '@/shared/types';
import { logger } from '@/lib/logger';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tournamentId: string }> }
) {
  try {
    const db = await getDbInstance();
    const { tournamentId } = await params;
    
    // Check if tournament exists
    const tournament = await db.get(
      'SELECT id FROM tournaments WHERE id = ?',
      [tournamentId]
    );
    
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
    
    return NextResponse.json(Array.from(teamsMap.values()));
  } catch (error) {
    logger.error('Error fetching tournament teams:', error);
    return NextResponse.json(
      { error: 'Failed to fetch teams' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tournamentId: string }> }
) {
  try {
    const body = await request.json();
    const { teamName } = body;
    const { tournamentId } = await params;
    
    if (!teamName || teamName.trim().length === 0) {
      return NextResponse.json(
        { error: 'Team name is required' },
        { status: 400 }
      );
    }
    
    const db = await getDbInstance();
    
    // Check if tournament exists
    const tournament = await db.get(
      'SELECT id FROM tournaments WHERE id = ?',
      [tournamentId]
    );
    
    if (!tournament) {
      return NextResponse.json(
        { error: 'Tournament not found' },
        { status: 404 }
      );
    }
    
    // Check if team name already exists in this tournament
    const existingTeam = await db.get(
      'SELECT id FROM tournament_teams WHERE tournament_id = ? AND team_name = ?',
      [tournamentId, teamName.trim()]
    );
    
    if (existingTeam) {
      return NextResponse.json(
        { error: 'Team name already exists in this tournament' },
        { status: 409 }
      );
    }
    
    const teamId = `team_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    
    await db.run(`
      INSERT INTO tournament_teams (id, tournament_id, team_name)
      VALUES (?, ?, ?)
    `, [teamId, tournamentId, teamName.trim()]);
    
    const team = await db.get<TournamentTeam>(`
      SELECT * FROM tournament_teams WHERE id = ?
    `, [teamId]);
    
    return NextResponse.json({ ...team, members: [] }, { status: 201 });
  } catch (error) {
    logger.error('Error creating team:', error);
    return NextResponse.json(
      { error: 'Failed to create team' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ tournamentId: string }> }
) {
  try {
    const body = await request.json();
    const { teams } = body; // Array of { teamId, members: [{ userId, username }] }
    const { tournamentId } = await params;
    
    if (!teams || !Array.isArray(teams)) {
      return NextResponse.json(
        { error: 'Invalid team assignments data' },
        { status: 400 }
      );
    }
    
    const db = await getDbInstance();
    
    // Check if tournament exists
    const tournament = await db.get(
      'SELECT id FROM tournaments WHERE id = ?',
      [tournamentId]
    );
    
    if (!tournament) {
      return NextResponse.json(
        { error: 'Tournament not found' },
        { status: 404 }
      );
    }
    
    // Clear all existing team member assignments for this tournament
    await db.run(`
      DELETE FROM tournament_team_members
      WHERE team_id IN (
        SELECT id FROM tournament_teams WHERE tournament_id = ?
      )
    `, [tournamentId]);

    // Reset all participants in this tournament to reserve status
    await db.run(`
      UPDATE tournament_participants
      SET team_assignment = NULL
      WHERE tournament_id = ?
    `, [tournamentId]);

    // Add new team member assignments
    for (const team of teams) {
      if (team.members && team.members.length > 0) {
        for (const member of team.members) {
          const memberId = `member_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

          // Get discord_user_id from tournament_participants
          const participant = await db.get<{ discord_user_id: string }>(`
            SELECT discord_user_id
            FROM tournament_participants
            WHERE tournament_id = ? AND user_id = ?
          `, [tournamentId, member.userId]);

          await db.run(`
            INSERT INTO tournament_team_members (id, team_id, user_id, discord_user_id, username)
            VALUES (?, ?, ?, ?, ?)
          `, [memberId, team.teamId, member.userId, participant?.discord_user_id || null, member.username]);

          // Update the participant's team assignment
          await db.run(`
            UPDATE tournament_participants
            SET team_assignment = ?
            WHERE tournament_id = ? AND user_id = ?
          `, [team.teamId, tournamentId, member.userId]);
        }
      }
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Error updating team assignments:', error);
    return NextResponse.json(
      { error: 'Failed to update team assignments' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ tournamentId: string }> }
) {
  try {
    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get('teamId');
    const { tournamentId } = await params;
    
    if (!teamId) {
      return NextResponse.json(
        { error: 'Team ID is required' },
        { status: 400 }
      );
    }
    
    const db = await getDbInstance();
    
    // Check if team exists and belongs to this tournament
    const team = await db.get(
      'SELECT id FROM tournament_teams WHERE id = ? AND tournament_id = ?',
      [teamId, tournamentId]
    );
    
    if (!team) {
      return NextResponse.json(
        { error: 'Team not found' },
        { status: 404 }
      );
    }
    
    // Delete the team (CASCADE will handle team members)
    await db.run('DELETE FROM tournament_teams WHERE id = ?', [teamId]);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Error deleting team:', error);
    return NextResponse.json(
      { error: 'Failed to delete team' },
      { status: 500 }
    );
  }
}