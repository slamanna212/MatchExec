import { getDbInstance } from '../../../../lib/database-init';
import { logger } from '@/lib/logger';
import { apiError, apiOk } from '@/lib/api-response';

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
      return apiError('Game not found', 404);
    }

    return apiOk(game);
  } catch (error) {
    logger.error('Error fetching game:', error);
    return apiError('Failed to fetch game');
  }
}
