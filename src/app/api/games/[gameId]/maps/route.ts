import { NextResponse } from 'next/server';
import { getDbInstance } from '../../../../../lib/database-init';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ gameId: string }> }
) {
  try {
    const db = await getDbInstance();
    const { gameId } = await params;
    
    // Check if this game supports all modes
    const gameInfo = await db.get(`
      SELECT supports_all_modes as supportsAllModes
      FROM games
      WHERE id = ?
    `, [gameId]);

    let maps;
    
    if (gameInfo?.supportsAllModes) {
      // For games that support all modes, show all map-mode combinations
      maps = await db.all(`
        SELECT 
          gm.id,
          gm.name,
          gm.mode_id as modeId,
          gm.image_url as imageUrl,
          gm.location,
          gmo.name as modeName,
          gmo.description as modeDescription
        FROM game_maps gm
        LEFT JOIN game_modes gmo ON gm.mode_id = gmo.id
        WHERE gm.game_id = ?
        ORDER BY gm.name ASC, gmo.name ASC
      `, [gameId]);
    } else {
      // For games with specific mode-map combinations, show all combinations
      maps = await db.all(`
        SELECT 
          gm.id,
          gm.name,
          gm.mode_id as modeId,
          gm.image_url as imageUrl,
          gm.location,
          gmo.name as modeName,
          gmo.description as modeDescription
        FROM game_maps gm
        LEFT JOIN game_modes gmo ON gm.mode_id = gmo.id
        WHERE gm.game_id = ?
        ORDER BY gm.name ASC
      `, [gameId]);
    }

    return NextResponse.json(maps);
  } catch (error) {
    console.error('Error fetching maps:', error);
    return NextResponse.json(
      { error: 'Failed to fetch maps' },
      { status: 500 }
    );
  }
}