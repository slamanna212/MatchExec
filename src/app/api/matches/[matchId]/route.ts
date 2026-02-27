import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { getDbInstance } from '../../../../lib/database-init';
import type { MatchDbRow } from '@/shared/types';
import { logger } from '@/lib/logger';
import { parseMatchResponse } from '../helpers';
import type { Database } from '@/lib/database/connection';

function getMatchEditPermissionError(existingMatch: { status: string; tournament_allow_match_editing?: number }): { error: string; status: number } | null {
  if (['battle', 'complete', 'cancelled'].includes(existingMatch.status)) {
    return { error: 'Match cannot be edited once it has started', status: 403 };
  }
  if (existingMatch.tournament_allow_match_editing === 0) {
    return { error: 'Match editing is disabled for this tournament', status: 403 };
  }
  return null;
}

function validateMatchName(name: unknown): string | null {
  if (!name || typeof name !== 'string' || name.trim() === '') return 'Name is required';
  return null;
}

function prepareMapsJson(maps: unknown): string | null {
  if (Array.isArray(maps) && maps.length > 0) return JSON.stringify(maps);
  return null;
}

async function queueDiscordMatchEdit(db: Database, matchId: string): Promise<void> {
  const announcementMsg = await db.get('SELECT id FROM discord_match_messages WHERE match_id = ? AND message_type = ?', [matchId, 'announcement']);
  if (!announcementMsg) return;
  const editQueueId = crypto.randomUUID();
  await db.run(`INSERT INTO discord_match_edit_queue (id, match_id, status) VALUES (?, ?, 'pending')`, [editQueueId, matchId]);
  logger.debug('📝 Discord edit queued for match:', matchId);
}

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
      tournament_allow_match_editing?: number;
    }>(`
      SELECT m.*,
        g.name as game_name, g.icon_url as game_icon, g.color as game_color, g.map_codes_supported,
        t.allow_match_editing as tournament_allow_match_editing
      FROM matches m
      LEFT JOIN games g ON m.game_id = g.id
      LEFT JOIN tournaments t ON m.tournament_id = t.id
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
      map_codes_supported: Boolean(match.map_codes_supported),
      // NULL (non-tournament match) → true, 1 → true, 0 → false
      tournament_allow_match_editing: match.tournament_allow_match_editing !== 0
    };
    
    return NextResponse.json(parsedMatch);
  } catch (error) {
    logger.error('Error fetching match:', error);
    return NextResponse.json(
      { error: 'Failed to fetch match' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ matchId: string }> }
) {
  try {
    const db = await getDbInstance();
    const { matchId } = await params;

    const existingMatch = await db.get<MatchDbRow & { tournament_allow_match_editing?: number }>(
      `SELECT m.id, m.status, m.tournament_id, t.allow_match_editing as tournament_allow_match_editing
       FROM matches m
       LEFT JOIN tournaments t ON m.tournament_id = t.id
       WHERE m.id = ?`,
      [matchId]
    );
    if (!existingMatch) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    }

    const permError = getMatchEditPermissionError(existingMatch);
    if (permError) {
      return NextResponse.json({ error: permError.error }, { status: permError.status });
    }

    const body = await request.json();
    const { name, description, startDate, rules, rounds, livestreamLink, maps } = body;

    const nameError = validateMatchName(name);
    if (nameError) {
      return NextResponse.json({ error: nameError }, { status: 400 });
    }

    const startDateTime = startDate ? new Date(startDate).toISOString() : null;
    const mapsJson = prepareMapsJson(maps);

    const updateResult = await db.run(`
      UPDATE matches
      SET name = ?, description = ?, start_date = ?, start_time = ?, rules = ?,
          rounds = ?, livestream_link = ?, maps = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      (name as string).trim(),
      description || null,
      startDateTime,
      startDateTime,
      rules || null,
      rounds || null,
      livestreamLink || null,
      mapsJson,
      matchId
    ]);

    if (updateResult.changes === 0) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    }

    // Queue Discord embed update if announcement message exists
    try {
      await queueDiscordMatchEdit(db, matchId);
    } catch (error) {
      logger.error('❌ Error queuing Discord edit:', error);
    }

    const updatedMatch = await db.get<MatchDbRow & {
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

    if (!updatedMatch) {
      return NextResponse.json({ error: 'Failed to retrieve updated match' }, { status: 500 });
    }

    return NextResponse.json({
      ...parseMatchResponse(updatedMatch),
      map_codes_supported: Boolean(updatedMatch.map_codes_supported)
    });
  } catch (error) {
    logger.error('Error updating match:', error);
    return NextResponse.json({ error: 'Failed to update match' }, { status: 500 });
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
      const deletionId = `deletion_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
      await db.run(`
        INSERT INTO discord_deletion_queue (id, match_id, status)
        VALUES (?, ?, 'pending')
      `, [deletionId, matchId]);
      
      logger.debug('🗑️ Discord deletion queued for match:', matchId);
    } catch (error) {
      logger.error('❌ Error queuing Discord deletion:', error);
    }
    
    // Clean up event image if it exists
    if (existingMatch.event_image_url) {
      try {
        const response = await fetch(`${process.env.PUBLIC_URL || 'http://localhost:3000'}/api/upload/event-image?imageUrl=${encodeURIComponent(existingMatch.event_image_url)}`, {
          method: 'DELETE',
        });
        if (response.ok) {
          logger.debug(`✅ Cleaned up event image for match: ${matchId}`);
        }
      } catch (error) {
        logger.error('Error cleaning up event image:', error);
      }
    }

    // Delete the match (CASCADE will handle related records)
    // Note: Voice channels will be cleaned up by the scheduler when it detects orphaned channels
    await db.run('DELETE FROM matches WHERE id = ?', [matchId]);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Error deleting match:', error);
    return NextResponse.json(
      { error: 'Failed to delete match' },
      { status: 500 }
    );
  }
}