import { NextRequest, NextResponse } from 'next/server';
import { getDbInstance } from '../../../../../lib/database-init';
import { TOURNAMENT_FLOW_STEPS, Tournament } from '@/shared/types';

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
      console.log('📢 Discord tournament announcement already exists for tournament:', tournamentId);
      return true;
    }
    
    // Generate unique ID for the announcement queue entry
    const announcementId = `announce_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Add to announcement queue with 'tournament' type
    await db.run(`
      INSERT INTO discord_announcement_queue (id, match_id, announcement_type, status)
      VALUES (?, ?, 'tournament', 'pending')
    `, [announcementId, tournamentId]);
    
    console.log('📢 Discord tournament announcement queued for tournament:', tournamentId);
    return true;
  } catch (error) {
    console.error('❌ Error queuing Discord tournament announcement:', error);
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

    console.log(`🏆 Tournament ${tournamentId} transitioned from ${currentTournament.status} to ${newStatus}`);

    // Handle status-specific actions
    switch (newStatus) {
      case 'gather':
        console.log(`📝 Tournament ${tournamentId} is now open for team signups`);
        
        // Queue Discord announcement for tournament signup
        const discordSuccess = await queueDiscordTournamentAnnouncement(tournamentId);
        if (!discordSuccess) {
          console.warn('⚠️ Failed to queue Discord announcement for tournament:', tournamentId);
        }
        break;
        
      case 'assign':
        console.log(`🎯 Tournament ${tournamentId} signups closed, ready for bracket assignment`);
        break;
        
      case 'battle':
        console.log(`⚔️ Tournament ${tournamentId} matches can now be generated and played`);
        break;
        
      case 'complete':
        console.log(`🏆 Tournament ${tournamentId} has been completed`);
        break;
        
      case 'cancelled':
        console.log(`❌ Tournament ${tournamentId} has been cancelled`);
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
    console.error('Error transitioning tournament status:', error);
    return NextResponse.json(
      { error: 'Failed to transition tournament status' },
      { status: 500 }
    );
  }
}