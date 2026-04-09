import { getDbInstance } from '@/lib/database-init';
import { logger } from '@/lib/logger';
import type { GameStatDefinition } from '@/shared/types';
import { apiError, apiOk } from '@/lib/api-response';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ gameId: string }> }
) {
  try {
    const { gameId } = await params;
    const db = await getDbInstance();

    const stats = await db.all<GameStatDefinition>(
      'SELECT id, game_id, name, display_name, stat_type, category, sort_order, is_primary, format FROM game_stat_definitions WHERE game_id = ? ORDER BY sort_order ASC',
      [gameId]
    );

    return apiOk(stats || []);
  } catch (error) {
    logger.error('Error fetching game stats:', error);
    return apiError('Failed to fetch game stats');
  }
}
