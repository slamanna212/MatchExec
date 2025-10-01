import { NextResponse } from 'next/server';
import { getDbInstance } from '../../../../lib/database-init';
import { logger } from '@/lib/logger';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ gameId: string }> }
) {
  try {
    const db = await getDbInstance();
    const { gameId } = await params;

    const game = await db.get(`
      SELECT
        g.id,
        g.name,
        g.genre,
        g.developer,
        g.description,
        g.min_players as minPlayers,
        g.max_players as maxPlayers,
        g.supports_all_modes as supportsAllModes,
        g.icon_url as iconUrl,
        g.cover_url as coverUrl
      FROM games g
      WHERE g.id = ?
    `, [gameId]);

    if (!game) {
      return NextResponse.json(
        { error: 'Game not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(game);
  } catch (error) {
    logger.error('Error fetching game:', error);
    return NextResponse.json(
      { error: 'Failed to fetch game' },
      { status: 500 }
    );
  }
}
