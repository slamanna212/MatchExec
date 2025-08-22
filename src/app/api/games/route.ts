import { NextResponse } from 'next/server';
import { getDbInstance } from '../../../lib/database-init';

export async function GET() {
  try {
    const db = await getDbInstance();
    
    const games = await db.all(`
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
        g.cover_url as coverUrl,
        COUNT(DISTINCT gm.name) as mapCount,
        COUNT(DISTINCT gmo.id) as modeCount
      FROM games g
      LEFT JOIN game_maps gm ON g.id = gm.game_id
      LEFT JOIN game_modes gmo ON g.id = gmo.game_id
      GROUP BY g.id, g.name, g.genre, g.developer, g.description, g.min_players, g.max_players, g.supports_all_modes, g.icon_url, g.cover_url
      ORDER BY g.name
    `);

    return NextResponse.json(games);
  } catch (error) {
    console.error('Error fetching games:', error);
    return NextResponse.json(
      { error: 'Failed to fetch games' },
      { status: 500 }
    );
  }
}