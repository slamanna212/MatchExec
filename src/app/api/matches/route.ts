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
    const { 
      name, 
      description, 
      gameId, 
      startDate,
      livestreamLink,
      rules,
      rounds,
      maps
    } = body;
    
    if (!name || !gameId) {
      return NextResponse.json(
        { error: 'Missing required fields: name and gameId' },
        { status: 400 }
      );
    }
    
    const db = await getDbInstance();
    const matchId = `match_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // For now, use placeholder values for Discord fields until they're configured
    const guildId = 'placeholder_guild';
    const channelId = 'placeholder_channel';
    
    // Build description with additional match info
    let fullDescription = description || '';
    if (livestreamLink) {
      fullDescription += `\n\nLivestream: ${livestreamLink}`;
    }
    if (rules) {
      fullDescription += `\nRules: ${rules}`;
    }
    if (rounds) {
      fullDescription += `\nRounds: ${rounds}`;
    }
    if (maps && maps.length > 0) {
      fullDescription += `\nMaps: ${maps.join(', ')}`;
    }
    
    await db.run(`
      INSERT INTO matches (
        id, name, description, game_id, guild_id, channel_id, max_participants, status, start_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      matchId,
      name,
      fullDescription.trim() || null,
      gameId,
      guildId,
      channelId,
      16, // Default max participants
      'created',
      startDate ? new Date(startDate).toISOString() : null
    ]);
    
    const match = await db.get(`
      SELECT m.*, g.name as game_name, g.icon_url as game_icon
      FROM matches m
      LEFT JOIN games g ON m.game_id = g.id
      WHERE m.id = ?
    `, [matchId]);
    
    return NextResponse.json(match, { status: 201 });
  } catch (error) {
    console.error('Error creating match:', error);
    return NextResponse.json(
      { error: 'Failed to create match' },
      { status: 500 }
    );
  }
}