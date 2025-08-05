import { NextRequest, NextResponse } from 'next/server';
import { getDbInstance } from '../../../lib/database-init';
import { Match } from '../../../shared/types';

export async function GET() {
  try {
    const db = await getDbInstance();
    const matches = await db.all<Match>(`
      SELECT m.*, g.name as game_name, g.icon_url as game_icon
      FROM matches m
      LEFT JOIN games g ON m.game_id = g.id
      ORDER BY m.created_at DESC
    `);
    
    return NextResponse.json(matches);
  } catch (error) {
    console.error('Error fetching matches:', error);
    return NextResponse.json(
      { error: 'Failed to fetch matches' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, description, gameId, guildId, channelId, maxParticipants } = body;
    
    if (!name || !gameId || !guildId || !channelId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }
    
    const db = await getDbInstance();
    const matchId = `match_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    await db.run(`
      INSERT INTO matches (
        id, name, description, game_id, guild_id, channel_id, max_participants, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      matchId,
      name,
      description || null,
      gameId,
      guildId,
      channelId,
      maxParticipants || 16,
      'created'
    ]);
    
    const match = await db.get<Match>(
      'SELECT * FROM matches WHERE id = ?',
      [matchId]
    );
    
    return NextResponse.json(match, { status: 201 });
  } catch (error) {
    console.error('Error creating match:', error);
    return NextResponse.json(
      { error: 'Failed to create match' },
      { status: 500 }
    );
  }
}