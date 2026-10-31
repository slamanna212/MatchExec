import type { NextRequest, NextResponse } from 'next/server';
import { getDbInstance } from '@/lib/database-init';
import { withTransaction } from '@/lib/transaction';
import { logger } from '@/lib/logger';
import { apiError, apiOk } from '@/lib/api-response';

/**
 * Setup-phase persistence for Position/racing matches.
 *
 * GET  -> { participants: [{ id, username, avatar_url, grid_position, qualifying_time_ms }] }
 *         ordered by saved grid position (unsaved participants last, by join time).
 * PUT  -> body { gridOrder?: string[]; qualifyingTimes?: Record<participantId, number|null> }
 *         gridOrder: participant ids in starting order (position = index + 1).
 *         qualifyingTimes: lap time in milliseconds (null clears).
 *         Every id must belong to the match. Only allowed in gather/assign (409 otherwise).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ matchId: string }> }
): Promise<NextResponse> {
  try {
    const { matchId } = await params;
    const db = await getDbInstance();
    const match = await db.get<{ id: string }>('SELECT id FROM matches WHERE id = ?', [matchId]);
    if (!match) return apiError('Match not found', 404);

    const participants = await db.all(
      `SELECT id, username, avatar_url, grid_position, qualifying_time_ms
       FROM match_participants WHERE match_id = ?
       ORDER BY grid_position IS NULL, grid_position ASC, joined_at ASC`,
      [matchId]
    );
    return apiOk({ participants });
  } catch (error) {
    logger.error('Error fetching setup data:', error);
    return apiError('Failed to fetch setup data');
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ matchId: string }> }
): Promise<NextResponse> {
  try {
    const { matchId } = await params;
    const body = await request.json();
    const { gridOrder, qualifyingTimes } = body ?? {};

    if (gridOrder === undefined && qualifyingTimes === undefined) {
      return apiError('Nothing to save', 400);
    }

    const db = await getDbInstance();
    const match = await db.get<{ status: string }>('SELECT status FROM matches WHERE id = ?', [matchId]);
    if (!match) return apiError('Match not found', 404);
    if (match.status !== 'gather' && match.status !== 'assign') {
      return apiError(`Setup can only be changed while the match is in gather or assign (current: ${match.status})`, 409);
    }

    const rows = await db.all<{ id: string }>('SELECT id FROM match_participants WHERE match_id = ?', [matchId]);
    const valid = new Set(rows.map(r => r.id));

    if (gridOrder !== undefined) {
      if (!Array.isArray(gridOrder) || gridOrder.some(id => typeof id !== 'string')) {
        return apiError('gridOrder must be an array of participant ids', 400);
      }
      if (new Set(gridOrder).size !== gridOrder.length) {
        return apiError('gridOrder contains duplicate participant ids', 400);
      }
      if (gridOrder.some((id: string) => !valid.has(id))) {
        return apiError('gridOrder contains participants that do not belong to this match', 400);
      }
    }

    if (qualifyingTimes !== undefined) {
      if (qualifyingTimes === null || typeof qualifyingTimes !== 'object' || Array.isArray(qualifyingTimes)) {
        return apiError('qualifyingTimes must be an object keyed by participant id', 400);
      }
      for (const [id, ms] of Object.entries(qualifyingTimes as Record<string, unknown>)) {
        if (!valid.has(id)) {
          return apiError('qualifyingTimes contains participants that do not belong to this match', 400);
        }
        if (ms !== null && (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0)) {
          return apiError('qualifyingTimes values must be non-negative numbers or null', 400);
        }
      }
    }

    await withTransaction(db, async () => {
      if (gridOrder !== undefined) {
        await db.run('UPDATE match_participants SET grid_position = NULL WHERE match_id = ?', [matchId]);
        for (let i = 0; i < gridOrder.length; i++) {
          await db.run(
            'UPDATE match_participants SET grid_position = ? WHERE id = ? AND match_id = ?',
            [i + 1, gridOrder[i], matchId]
          );
        }
      }
      if (qualifyingTimes !== undefined) {
        for (const [id, ms] of Object.entries(qualifyingTimes as Record<string, number | null>)) {
          await db.run(
            'UPDATE match_participants SET qualifying_time_ms = ? WHERE id = ? AND match_id = ?',
            [ms === null ? null : Math.round(ms), id, matchId]
          );
        }
      }
    });

    return apiOk({ success: true });
  } catch (error) {
    logger.error('Error saving setup data:', error);
    return apiError('Failed to save setup data');
  }
}
