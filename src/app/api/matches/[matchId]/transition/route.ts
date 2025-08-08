import { NextRequest, NextResponse } from 'next/server';
import { getDbInstance } from '../../../../../lib/database-init';
import { MATCH_FLOW_STEPS } from '../../../../../../shared/types';

// Queue a Discord announcement request that the Discord bot will process
async function queueDiscordAnnouncement(matchId: string): Promise<boolean> {
  try {
    const db = await getDbInstance();
    
    // Add to announcement queue
    await db.run(`
      INSERT OR IGNORE INTO discord_announcement_queue (match_id, status)
      VALUES (?, 'pending')
    `, [matchId]);
    
    console.log('📢 Discord announcement queued for match:', matchId);
    return true;
  } catch (error) {
    console.error('❌ Error queuing Discord announcement:', error);
    return false;
  }
}

// Queue a Discord status update request that the Discord bot will process
async function queueDiscordStatusUpdate(matchId: string, newStatus: string): Promise<boolean> {
  try {
    const db = await getDbInstance();
    
    // Generate unique ID for the queue entry
    const updateId = `discord_update_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Add to status update queue
    await db.run(`
      INSERT INTO discord_status_update_queue (id, match_id, new_status, status)
      VALUES (?, ?, ?, 'pending')
    `, [updateId, matchId, newStatus]);
    
    console.log('🔄 Discord status update queued for match:', matchId, '-> status:', newStatus);
    return true;
  } catch (error) {
    console.error('❌ Error queuing Discord status update:', error);
    return false;
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ matchId: string }> }
) {
  try {
    const { matchId } = await params;
    const { newStatus } = await request.json();

    if (!newStatus || !MATCH_FLOW_STEPS[newStatus as keyof typeof MATCH_FLOW_STEPS]) {
      return NextResponse.json(
        { error: 'Invalid status provided' },
        { status: 400 }
      );
    }

    const db = await getDbInstance();
    
    // Get current match data
    const currentMatch = await db.get(`
      SELECT * FROM matches WHERE id = ?
    `, [matchId]);

    if (!currentMatch) {
      return NextResponse.json(
        { error: 'Match not found' },
        { status: 404 }
      );
    }

    // Validate status transition (basic flow validation)
    const currentStep = MATCH_FLOW_STEPS[currentMatch.status as keyof typeof MATCH_FLOW_STEPS];
    const newStep = MATCH_FLOW_STEPS[newStatus as keyof typeof MATCH_FLOW_STEPS];

    if (newStep.progress < currentStep.progress && newStatus !== 'cancelled') {
      return NextResponse.json(
        { error: 'Cannot move backwards in match flow' },
        { status: 400 }
      );
    }

    // Update match status
    await db.run(`
      UPDATE matches 
      SET status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [newStatus, matchId]);

    console.log(`🔄 Match ${matchId} transitioned from ${currentMatch.status} to ${newStatus}`);

    // Trigger Discord announcement when entering "gather" stage
    if (newStatus === 'gather') {
      try {
        const discordSuccess = await queueDiscordAnnouncement(matchId);
        
        if (discordSuccess) {
          console.log(`📢 Discord announcement queued for match entering gather stage: ${matchId}`);
        } else {
          console.warn(`⚠️ Failed to queue Discord announcement for match: ${matchId}`);
        }
      } catch (discordError) {
        console.error('❌ Error queuing Discord announcement:', discordError);
        // Don't fail the API request if Discord queueing fails
      }
    }

    // Trigger Discord status update when entering "assign" stage (close signups)
    if (newStatus === 'assign') {
      try {
        const discordUpdateSuccess = await queueDiscordStatusUpdate(matchId, newStatus);
        
        if (discordUpdateSuccess) {
          console.log(`🔄 Discord status update queued for match entering assign stage: ${matchId}`);
        } else {
          console.warn(`⚠️ Failed to queue Discord status update for match: ${matchId}`);
        }
      } catch (discordError) {
        console.error('❌ Error queuing Discord status update:', discordError);
        // Don't fail the API request if Discord queueing fails
      }
    }

    // Get updated match data
    const updatedMatch = await db.get(`
      SELECT m.*, g.name as game_name, g.icon_url as game_icon
      FROM matches m
      LEFT JOIN games g ON m.game_id = g.id
      WHERE m.id = ?
    `, [matchId]);

    // Parse maps for the returned match
    const parsedMatch = {
      ...updatedMatch,
      maps: updatedMatch.maps ? (typeof updatedMatch.maps === 'string' ? JSON.parse(updatedMatch.maps) : updatedMatch.maps) : []
    };

    return NextResponse.json(parsedMatch);

  } catch (error) {
    console.error('Error transitioning match status:', error);
    return NextResponse.json(
      { error: 'Failed to transition match status' },
      { status: 500 }
    );
  }
}