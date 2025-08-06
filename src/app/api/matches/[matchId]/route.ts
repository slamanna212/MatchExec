import { NextRequest, NextResponse } from 'next/server';
import { getDbInstance } from '../../../../lib/database-init';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ matchId: string }> }
) {
  try {
    const db = await getDbInstance();
    const { matchId } = await params;
    
    // Check if match exists
    const existingMatch = await db.get(
      'SELECT id FROM matches WHERE id = ?',
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