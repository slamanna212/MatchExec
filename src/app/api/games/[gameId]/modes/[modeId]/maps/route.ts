import { NextResponse } from 'next/server';
import { getDbInstance } from '../../../../../../../lib/database-init';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ gameId: string; modeId: string }> }
) {
  try {
    const db = await getDbInstance();
    const { gameId, modeId } = await params;
    
    const maps = await db.all(`
      SELECT 
        gm.id,
        gm.name,
        gm.mode_id as modeId,
        gm.image_url as imageUrl
      FROM game_maps gm
      WHERE gm.game_id = ? AND gm.mode_id = ?
      ORDER BY gm.name
    `, [gameId, modeId]);

    return NextResponse.json(maps);
  } catch (error) {
    console.error('Error fetching maps for mode:', error);
    return NextResponse.json(
      { error: 'Failed to fetch maps for mode' },
      { status: 500 }
    );
  }
}