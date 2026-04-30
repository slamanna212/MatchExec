import { getDbInstance } from '../../../../../lib/database-init';
import { logger } from '@/lib/logger';
import { apiError, apiOk } from '@/lib/api-response';

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

    return apiOk(modes);
  } catch (error) {
    logger.error('Error fetching game modes:', error);
    return apiError('Failed to fetch game modes');
  }
}