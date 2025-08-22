import { NextRequest, NextResponse } from 'next/server';
import { getDbInstance } from '../../../../../lib/database-init';
import { MatchDbRow } from '@/shared/types';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ matchId: string }> }
) {
  try {
    const db = await getDbInstance();
    const { matchId } = await params;
    const { mapCodes } = await request.json();
    
    // Validate input
    if (!mapCodes || typeof mapCodes !== 'object') {
      return NextResponse.json(
        { error: 'Invalid map codes data' },
        { status: 400 }
      );
    }
    
    // Validate each map code length (max 24 characters)
    for (const [mapId, code] of Object.entries(mapCodes)) {
      if (typeof code !== 'string' || code.length > 24) {
        return NextResponse.json(
          { error: `Map code for ${mapId} must be a string with max 24 characters` },
          { status: 400 }
        );
      }
    }
    
    // Check if match exists
    const existingMatch = await db.get<MatchDbRow>(
      'SELECT id FROM matches WHERE id = ?',
      [matchId]
    );
    
    if (!existingMatch) {
      return NextResponse.json(
        { error: 'Match not found' },
        { status: 404 }
      );
    }
    
    // Update match with map codes
    await db.run(
      'UPDATE matches SET map_codes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [JSON.stringify(mapCodes), matchId]
    );
    
    return NextResponse.json({ 
      success: true,
      mapCodes 
    });
  } catch (error) {
    console.error('Error saving map codes:', error);
    return NextResponse.json(
      { error: 'Failed to save map codes' },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ matchId: string }> }
) {
  try {
    const db = await getDbInstance();
    const { matchId } = await params;
    
    // Get match with map codes
    const match = await db.get<MatchDbRow>(
      'SELECT map_codes FROM matches WHERE id = ?',
      [matchId]
    );
    
    if (!match) {
      return NextResponse.json(
        { error: 'Match not found' },
        { status: 404 }
      );
    }
    
    const mapCodes = match.map_codes ? JSON.parse(match.map_codes) : {};
    
    return NextResponse.json({ 
      mapCodes 
    });
  } catch (error) {
    console.error('Error retrieving map codes:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve map codes' },
      { status: 500 }
    );
  }
}