import { NextResponse } from 'next/server';
import { getDbInstance } from '@/lib/database-init';
import { Game } from '@/shared/types';

export async function GET() {
  try {
    const db = await getDbInstance();
    const games = await db.all<Game>('SELECT * FROM games ORDER BY name');
    return NextResponse.json(games);
  } catch (error) {
    console.error('Error fetching games:', error);
    return NextResponse.json(
      { error: 'Failed to fetch games' },
      { status: 500 }
    );
  }
}