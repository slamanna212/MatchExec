import type { NextRequest, NextResponse } from 'next/server';
import { getDbInstance } from '../../../../../lib/database-init';
import type { MatchDbRow } from '@/shared/types';
import { logger } from '@/lib/logger';
import { apiError, apiOk } from '@/lib/api-response';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ matchId: string }> }
): Promise<NextResponse> {
  try {
    const db = await getDbInstance();
    const { matchId } = await params;
    const { mapCodes } = await request.json();
    
    // Validate input
    if (!mapCodes || typeof mapCodes !== 'object') {
      return apiError('Invalid map codes data', 400);
    }

    // Validate each map code length (max 24 characters)
    for (const [mapId, code] of Object.entries(mapCodes)) {
      if (typeof code !== 'string' || [...code].length > 24) {
        return apiError(`Map code for ${mapId} must be a string with max 24 characters`, 400);
      }
    }

    // Check if match exists
    const existingMatch = await db.get<MatchDbRow>(
      'SELECT id FROM matches WHERE id = ?',
      [matchId]
    );

    if (!existingMatch) {
      return apiError('Match not found', 404);
    }

    // Update match with map codes
    await db.run(
      'UPDATE matches SET map_codes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [JSON.stringify(mapCodes), matchId]
    );

    return apiOk({
      success: true,
      mapCodes
    });
  } catch (error) {
    logger.error('Error saving map codes:', error);
    return apiError('Failed to save map codes');
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ matchId: string }> }
): Promise<NextResponse> {
  try {
    const db = await getDbInstance();
    const { matchId } = await params;
    
    // Get match with map codes
    const match = await db.get<MatchDbRow>(
      'SELECT map_codes FROM matches WHERE id = ?',
      [matchId]
    );
    
    if (!match) {
      return apiError('Match not found', 404);
    }

    const mapCodes = match.map_codes ? JSON.parse(match.map_codes) : {};

    return apiOk({ mapCodes });
  } catch (error) {
    logger.error('Error retrieving map codes:', error);
    return apiError('Failed to retrieve map codes');
  }
}