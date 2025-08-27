import { NextRequest, NextResponse } from 'next/server';
import { getDbInstance } from '../../../../lib/database-init';
import { MatchDbRow } from '@/shared/types';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ matchId: string }> }
) {
  try {
    const db = await getDbInstance();
    const { matchId } = await params;
    
    // Fetch match with game info including map_codes_supported
    const match = await db.get<MatchDbRow & { 
      game_name?: string; 
      game_icon?: string; 
      game_color?: string; 
      map_codes_supported?: number;
    }>(`
      SELECT m.*, g.name as game_name, g.icon_url as game_icon, g.color as game_color, g.map_codes_supported
      FROM matches m
      LEFT JOIN games g ON m.game_id = g.id
      WHERE m.id = ?
    `, [matchId]);
    
    if (!match) {
      return NextResponse.json(
        { error: 'Match not found' },
        { status: 404 }
      );
    }
    
    // Parse JSON fields and convert SQLite integers to booleans
    const parsedMatch = {
      ...match,
      maps: match.maps ? JSON.parse(match.maps) : [],
      map_codes: match.map_codes ? JSON.parse(match.map_codes) : {},
      map_codes_supported: Boolean(match.map_codes_supported)
    };
    
    return NextResponse.json(parsedMatch);
  } catch (error) {
    console.error('Error fetching match:', error);
    return NextResponse.json(
      { error: 'Failed to fetch match' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ matchId: string }> }
) {
  try {
    const db = await getDbInstance();
    const { matchId } = await params;
    
    // Check if match exists and get event image for cleanup
    const existingMatch = await db.get<MatchDbRow>(
      'SELECT id, event_image_url FROM matches WHERE id = ?',
      [matchId]
    );
    
    if (!existingMatch) {
      return NextResponse.json(
        { error: 'Match not found' },
        { status: 404 }
      );
    }
    
    // Queue Discord message deletion before deleting the match
    try {
      const deletionId = `deletion_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await db.run(`
        INSERT INTO discord_deletion_queue (id, match_id, status)
        VALUES (?, ?, 'pending')
      `, [deletionId, matchId]);
      
      console.log('🗑️ Discord deletion queued for match:', matchId);
    } catch (error) {
      console.error('❌ Error queuing Discord deletion:', error);
    }
    
    // Clean up event image if it exists
    if (existingMatch.event_image_url) {
      try {
        const response = await fetch(`${process.env.PUBLIC_URL || 'http://localhost:3000'}/api/upload/event-image?imageUrl=${encodeURIComponent(existingMatch.event_image_url)}`, {
          method: 'DELETE',
        });
        if (response.ok) {
          console.log(`✅ Cleaned up event image for match: ${matchId}`);
        }
      } catch (error) {
        console.error('Error cleaning up event image:', error);
      }
    }
    
    // Delete the match (CASCADE will handle related records)
    await db.run('DELETE FROM matches WHERE id = ?', [matchId]);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting match:', error);
    return NextResponse.json(
      { error: 'Failed to delete match' },
      { status: 500 }
    );
  }
}