import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { getDbInstance } from '@/lib/database-init';
import type { MatchGame } from '../../../../../../shared/types';
import { logger } from '@/lib/logger';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ matchId: string }> }
) {
  try {
    const { matchId } = await params;
    const { mapId, note } = await request.json();
    
    if (!mapId) {
      return NextResponse.json({ error: 'Map ID is required' }, { status: 400 });
    }

    const db = await getDbInstance();
    
    // Check if the match exists
    const match = await db.get(`SELECT id FROM matches WHERE id = ?`, [matchId]);
    if (!match) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    }

    // Check if there's already a match_game entry for this map (from scoring system)
    const matchGame = await db.get(`
      SELECT id FROM match_games 
      WHERE match_id = ? AND map_id = ? AND round > 0
      LIMIT 1
    `, [matchId, mapId]) as Pick<MatchGame, 'id'> | undefined;

    if (matchGame) {
      // Update existing match_game record with the note
      await db.run(`
        UPDATE match_games 
        SET notes = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [note || '', matchGame.id]);
    } else {
      // No scoring entry exists yet, create a temporary note-only entry
      // This will be cleaned up when the scoring system initializes
      const gameId = `note-${matchId}-${mapId}-${Date.now()}`;
      await db.run(`
        INSERT INTO match_games (
          id, match_id, round, participant1_id, participant2_id, 
          map_id, notes, status, created_at, updated_at
        ) VALUES (?, ?, 0, 'system', 'system', ?, ?, 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `, [gameId, matchId, mapId, note || '']);
    }

    return NextResponse.json({ success: true, note });
    
  } catch (error) {
    logger.error('Error saving map note:', error);
    return NextResponse.json({ error: 'Failed to save map note' }, { status: 500 });
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ matchId: string }> }
) {
  try {
    const { matchId } = await params;
    const db = await getDbInstance();
    
    // Get all map notes for this match
    const mapNotes = await db.all(`
      SELECT map_id, notes 
      FROM match_games 
      WHERE match_id = ? AND notes IS NOT NULL AND notes != ''
    `, [matchId]) as { map_id: string; notes: string }[];

    const notesMap: Record<string, string> = {};
    mapNotes.forEach((note) => {
      notesMap[note.map_id] = note.notes;
    });

    return NextResponse.json({ notes: notesMap });
    
  } catch (error) {
    logger.error('Error fetching map notes:', error);
    return NextResponse.json({ error: 'Failed to fetch map notes' }, { status: 500 });
  }
}