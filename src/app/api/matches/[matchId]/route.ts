import { NextRequest, NextResponse } from 'next/server';
import { getDbInstance } from '../../../../lib/database-init.js';
import { MatchDbRow } from '@/shared/types';

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