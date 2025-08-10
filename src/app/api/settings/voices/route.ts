import { NextResponse } from 'next/server';
import { getDbInstance } from '../../../../lib/database-init';

interface Voice {
  id: string;
  name: string;
  path: string;
  created_at: string;
  updated_at: string;
}

export async function GET() {
  try {
    const db = await getDbInstance();
    
    const voices = await db.all<Voice>(`
      SELECT id, name, path, created_at, updated_at
      FROM voices
      ORDER BY name ASC
    `);

    return NextResponse.json(voices);
  } catch (error) {
    console.error('Error fetching voices:', error);
    return NextResponse.json(
      { error: 'Failed to fetch voices' },
      { status: 500 }
    );
  }
}