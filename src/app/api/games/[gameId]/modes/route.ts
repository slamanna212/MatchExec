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
        gm.id,
        gm.name,
        gm.description,
        gm.team_size,
        g.max_players
      FROM game_modes gm
      JOIN games g ON gm.game_id = g.id
      WHERE gm.game_id = ?
      ORDER BY gm.name ASC
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