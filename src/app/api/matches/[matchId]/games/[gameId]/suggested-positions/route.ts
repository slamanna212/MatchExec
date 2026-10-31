import type { NextRequest, NextResponse } from 'next/server';
import { getDbInstance } from '@/lib/database-init';
import { logger } from '@/lib/logger';
import { apiError, apiOk } from '@/lib/api-response';

/**
 * Parse a stored suggestion and keep only well-formed entries
 * (participantId -> positive integer). Stored data came from AI output, so it
 * is re-checked here before being handed to the UI.
 */
function parseSuggestion(raw: string | null): Record<string, number> | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const out: Record<string, number> = {};
    for (const [participantId, position] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof position === 'number' && Number.isInteger(position) && position >= 1) {
        out[participantId] = position;
      }
    }
    return Object.keys(out).length > 0 ? out : null;
  } catch {
    return null;
  }
}

/**
 * GET /api/matches/[matchId]/games/[gameId]/suggested-positions
 * Returns { suggestions: Record<participantId, position> | null }. The latest
 * approved/auto_approved submission that carries a suggestion wins. Suggestions
 * are never official results; the admin confirms them in the scoring UI.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ matchId: string; gameId: string }> }
): Promise<NextResponse> {
  try {
    const { matchId, gameId } = await params;
    const db = await getDbInstance();

    const game = await db.get<{ id: string }>(
      'SELECT id FROM match_games WHERE id = ? AND match_id = ?',
      [gameId, matchId]
    );
    if (!game) return apiError('Game not found for this match', 404);

    const rows = await db.all<{ suggested_positions: string | null }>(
      `SELECT suggested_positions
       FROM scorecard_submissions
       WHERE match_id = ? AND match_game_id = ?
         AND review_status IN ('approved', 'auto_approved')
         AND suggested_positions IS NOT NULL
       ORDER BY created_at DESC, rowid DESC`,
      [matchId, gameId]
    );

    for (const row of rows) {
      const suggestions = parseSuggestion(row.suggested_positions);
      if (suggestions) return apiOk({ suggestions });
    }

    return apiOk({ suggestions: null });
  } catch (error) {
    logger.error('Error getting suggested positions:', error);
    return apiError(error instanceof Error ? error.message : 'Failed to get suggested positions');
  }
}
