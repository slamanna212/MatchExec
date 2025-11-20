import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { getDbInstance } from '../../../../../lib/database-init';
import type { MatchDbRow } from '@/shared/types';
import { MATCH_FLOW_STEPS } from '@/shared/types';
import { logger } from '@/lib/logger';
import { handleStatusTransition } from '@/lib/transition-handlers';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ matchId: string }> }
) {
  try {
    const { matchId } = await params;
    const { newStatus } = await request.json();

    // Validate new status
    if (!newStatus || !MATCH_FLOW_STEPS[newStatus as keyof typeof MATCH_FLOW_STEPS]) {
      return NextResponse.json(
        { error: 'Invalid status provided' },
        { status: 400 }
      );
    }

    const db = await getDbInstance();

    // Get current match data
    const currentMatch = await db.get<MatchDbRow>('SELECT * FROM matches WHERE id = ?', [matchId]);

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

    // Update match status in database
    await db.run(`
      UPDATE matches
      SET status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [newStatus, matchId]);

    logger.debug(`🔄 Match ${matchId} transitioned from ${currentMatch.status} to ${newStatus}`);

    // Handle status-specific transition logic (Discord, voice, announcements, etc.)
    await handleStatusTransition(matchId, newStatus);

    // Get updated match data with game information
    const updatedMatch = await db.get<MatchDbRow>(`
      SELECT m.*, g.name as game_name, g.icon_url as game_icon, g.color as game_color
      FROM matches m
      LEFT JOIN games g ON m.game_id = g.id
      WHERE m.id = ?
    `, [matchId]);

    // Parse maps for the returned match
    let maps = [];
    if (updatedMatch?.maps) {
      maps = typeof updatedMatch.maps === 'string' ? JSON.parse(updatedMatch.maps) : updatedMatch.maps;
    }

    const parsedMatch = {
      ...(updatedMatch || {}),
      maps
    };

    return NextResponse.json(parsedMatch);

  } catch (error) {
    logger.error('Error transitioning match status:', error);
    return NextResponse.json(
      { error: 'Failed to transition match status' },
      { status: 500 }
    );
  }
}