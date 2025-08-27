import { NextRequest, NextResponse } from 'next/server';
import { getDbInstance } from '@/lib/database-init';

export async function POST(
  request: NextRequest,
  { params }: { params: { matchId: string } }
) {
  try {
    const { mapId, note } = await request.json();
    
    if (!mapId) {
      return NextResponse.json({ error: 'Map ID is required' }, { status: 400 });
    }

    const db = await getDbInstance();
    
    // Check if the match exists
    const match = await db.get(`SELECT id FROM matches WHERE id = ?`, [params.matchId]);
    if (!match) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    }

    // Update or insert the note for this specific map in this match
    // We need to find the match_game entry for this map
    const matchGame = await db.get(`
      SELECT id FROM match_games 
      WHERE match_id = ? AND map_id = ?
      LIMIT 1
    `, [params.matchId, mapId]);

    if (matchGame) {
      // Update existing match_game record
      await db.run(`
        UPDATE match_games 
        SET notes = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [note || '', matchGame.id]);
    } else {
      // Create a new match_game record for this map note
      // We'll use a simplified structure for just storing notes
      const gameId = `note-${params.matchId}-${mapId}-${Date.now()}`;
      await db.run(`
        INSERT INTO match_games (
          id, match_id, round, participant1_id, participant2_id, 
          map_id, notes, status, created_at, updated_at
        ) VALUES (?, ?, 0, 'system', 'system', ?, ?, 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `, [gameId, params.matchId, mapId, note || '']);
    }

    return NextResponse.json({ success: true, note });
    
  } catch (error) {
    console.error('Error saving map note:', error);
    return NextResponse.json({ error: 'Failed to save map note' }, { status: 500 });
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { matchId: string } }
) {
  try {
    const db = await getDbInstance();
    
    // Get all map notes for this match
    const mapNotes = await db.all(`
      SELECT map_id, notes 
      FROM match_games 
      WHERE match_id = ? AND notes IS NOT NULL AND notes != ''
    `, [params.matchId]);

    const notesMap: Record<string, string> = {};
    mapNotes.forEach((note: { map_id: string; notes: string }) => {
      notesMap[note.map_id] = note.notes;
    });

    return NextResponse.json({ notes: notesMap });
    
  } catch (error) {
    console.error('Error fetching map notes:', error);
    return NextResponse.json({ error: 'Failed to fetch map notes' }, { status: 500 });
  }
}