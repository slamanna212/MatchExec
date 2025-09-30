import { NextResponse } from 'next/server';
import { getDbInstance } from '../../../../../lib/database-init';
import { logger } from '@/lib/logger';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ gameId: string }> }
) {
  try {
    const db = await getDbInstance();
    const { gameId } = await params;
    
    const modes = await db.all(`
      SELECT 
        id,
        name,
        description
      FROM game_modes
      WHERE game_id = ?
      ORDER BY name ASC
    `, [gameId]);

    return NextResponse.json(modes);
  } catch (error) {
    logger.error('Error fetching game modes:', error);
    return NextResponse.json(
      { error: 'Failed to fetch game modes' },
      { status: 500 }
    );
  }
}