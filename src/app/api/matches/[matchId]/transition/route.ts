import type {NextResponse,  NextRequest} from 'next/server';
import { getDbInstance } from '../../../../../lib/database-init';
import type { MatchDbRow } from '@/shared/types';
import { MATCH_FLOW_STEPS } from '@/shared/types';
import { logger } from '@/lib/logger';
import { handleStatusTransition } from '@/lib/transition-handlers';
import { areAllGamesCompleted, determineMatchWinner, resolveWinnerEntity } from '@/lib/scoring-functions';
import { apiError, apiOk } from '@/lib/api-response';

/** Allowed match status transitions. 'complete' and 'cancelled' are terminal. */
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  created: ['gather', 'cancelled'],
  gather: ['assign', 'cancelled'],
  assign: ['battle', 'cancelled'],
  battle: ['complete', 'cancelled'],
  complete: [],
  cancelled: [],
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ matchId: string }> }
): Promise<NextResponse> {
  try {
    const { matchId } = await params;
    if (!matchId || typeof matchId !== 'string' || matchId.length > 100) {
      return apiError('Invalid ID', 400);
    }
    const { newStatus, force } = await request.json();

    // Validate new status
    if (!newStatus || !MATCH_FLOW_STEPS[newStatus as keyof typeof MATCH_FLOW_STEPS]) {
      return apiError('Invalid status provided', 400);
    }

    const db = await getDbInstance();

    // Get current match data
    const currentMatch = await db.get<MatchDbRow>('SELECT * FROM matches WHERE id = ?', [matchId]);

    if (!currentMatch) {
      return apiError('Match not found', 404);
    }

    // Explicit transition map: complete/cancelled are terminal and same-status is rejected.
    if (currentMatch.status === newStatus) {
      return apiError(`Match is already in "${newStatus}" status`, 400);
    }
    const allowed = ALLOWED_TRANSITIONS[currentMatch.status] ?? [];
    if (!allowed.includes(newStatus)) {
      return apiError(`Cannot transition match from "${currentMatch.status}" to "${newStatus}"`, 400);
    }

    // Compare-and-set on the current status so concurrent requests can't both transition
    // (and therefore can't both fire the transition side effects).
    let updateResult;
    if (newStatus === 'complete') {
      if (!force) {
        const allScored = await areAllGamesCompleted(db, matchId);
        if (!allScored) {
          return apiError('Cannot complete match: not all maps have been scored', 400);
        }
      }
      const winnerTeam = await determineMatchWinner(db, matchId);
      updateResult = await db.run(
        `UPDATE matches SET status = 'complete', winner_team = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = ?`,
        [winnerTeam, matchId, currentMatch.status]
      );
    } else {
      updateResult = await db.run(
        `UPDATE matches SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = ?`,
        [newStatus, matchId, currentMatch.status]
      );
    }
    if (!updateResult.changes) {
      return apiError('Match status changed concurrently; please retry', 409);
    }

    logger.debug(`🔄 Match ${matchId} transitioned from ${currentMatch.status} to ${newStatus}`);

    // Handle status-specific transition logic (Discord, voice, announcements, etc.)
    await handleStatusTransition(matchId, newStatus);

    // Get updated match data with game information
    const updatedMatch = await db.get<MatchDbRow & {
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

    // Parse maps for the returned match
    let maps = [];
    if (updatedMatch?.maps) {
      maps = typeof updatedMatch.maps === 'string' ? JSON.parse(updatedMatch.maps) : updatedMatch.maps;
    }

    const winnerEntity = await resolveWinnerEntity(db, matchId);

    const parsedMatch = {
      ...(updatedMatch || {}),
      winner_entity_type: winnerEntity.type,
      maps,
      map_codes: updatedMatch?.map_codes ? JSON.parse(updatedMatch.map_codes as string) : {},
      map_codes_supported: Boolean(updatedMatch?.map_codes_supported),
      tournament_allow_match_editing: updatedMatch?.tournament_allow_match_editing !== 0
    };

    return apiOk(parsedMatch);

  } catch (error) {
    logger.error('Error transitioning match status:', error);
    return apiError('Failed to transition match status');
  }
}