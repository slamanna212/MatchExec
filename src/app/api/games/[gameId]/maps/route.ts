import { NextResponse } from 'next/server';
import { getDbInstance } from '../../../../../lib/database-init';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ gameId: string }> }
) {
  try {
    const db = await getDbInstance();
    const { gameId } = await params;
    
    console.log('[DEBUG] Fetching maps for gameId:', gameId);
    
    // For CS2, use a special query to group by map name and show supported modes
    if (gameId === 'cs2') {
      console.log('[DEBUG] Using CS2 special handling');
      try {
        const maps = await db.all(`
          SELECT DISTINCT
            MIN(gm.id) as id,
            gm.name,
            gm.image_url as imageUrl,
            gm.location,
            GROUP_CONCAT(DISTINCT gmo.name) as modeName,
            'Supports: ' || GROUP_CONCAT(DISTINCT gmo.name) as modeDescription,
            GROUP_CONCAT(DISTINCT gmo.name) as supportedModes
          FROM game_maps gm
          LEFT JOIN game_modes gmo ON gm.mode_id = gmo.id
          WHERE gm.game_id = ?
          GROUP BY gm.name, gm.image_url, gm.location
          ORDER BY gm.name ASC
        `, [gameId]);
        
        console.log('[DEBUG] CS2 maps result:', maps);
        return NextResponse.json(maps);
      } catch (cs2Error) {
        console.error('[ERROR] CS2 query failed:', cs2Error);
        throw cs2Error;
      }
    }
    
    // Check if this game supports all modes
    const gameInfo = await db.get<{ supportsAllModes: boolean }>(`
      SELECT supports_all_modes as supportsAllModes
      FROM games
      WHERE id = ?
    `, [gameId]);

    let maps;
    
    if (gameInfo?.supportsAllModes) {
      // For games that support all modes, show unique maps only (deduplicated)
      maps = await db.all(`
        SELECT DISTINCT
          MIN(gm.id) as id,
          gm.name,
          MIN(gm.mode_id) as modeId,
          gm.image_url as imageUrl,
          gm.location,
          'All Modes' as modeName,
          'Available for all game modes' as modeDescription
        FROM game_maps gm
        WHERE gm.game_id = ?
        GROUP BY gm.name, gm.image_url, gm.location
        ORDER BY gm.name ASC
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