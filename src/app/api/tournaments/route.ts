import { NextRequest, NextResponse } from 'next/server';
import { getDbInstance } from '../../../lib/database-init';
import { Tournament } from '../../../shared/types';

export async function GET() {
  try {
    const db = await getDbInstance();
    const tournaments = await db.all<Tournament>(`
      SELECT t.*, g.name as game_name, g.icon_url as game_icon
      FROM tournaments t
      LEFT JOIN games g ON t.game_id = g.id
      ORDER BY t.created_at DESC
    `);
    
    return NextResponse.json(tournaments);
  } catch (error) {
    console.error('Error fetching tournaments:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tournaments' },
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
    const tournamentId = `tournament_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    await db.run(`
      INSERT INTO tournaments (
        id, name, description, game_id, guild_id, channel_id, max_participants, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      tournamentId,
      name,
      description || null,
      gameId,
      guildId,
      channelId,
      maxParticipants || 16,
      'created'
    ]);
    
    const tournament = await db.get<Tournament>(
      'SELECT * FROM tournaments WHERE id = ?',
      [tournamentId]
    );
    
    return NextResponse.json(tournament, { status: 201 });
  } catch (error) {
    console.error('Error creating tournament:', error);
    return NextResponse.json(
      { error: 'Failed to create tournament' },
      { status: 500 }
    );
  }
}