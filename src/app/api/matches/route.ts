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
    
    // Parse maps JSON for each match
    const parsedMatches = matches.map(match => ({
      ...match,
      maps: match.maps ? (typeof match.maps === 'string' ? JSON.parse(match.maps) : match.maps) : []
    }));
    
    return NextResponse.json(parsedMatches);
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
    
    await db.run(`
      INSERT INTO matches (
        id, name, description, game_id, guild_id, channel_id, max_participants, status, start_date,
        rules, rounds, maps, livestream_link
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      matchId,
      name,
      description || null,
      gameId,
      guildId,
      channelId,
      16, // Default max participants
      'created',
      startDate ? new Date(startDate).toISOString() : null,
      rules || null,
      rounds || null,
      maps && maps.length > 0 ? JSON.stringify(maps) : null,
      livestreamLink || null
    ]);
    
    const match = await db.get(`
      SELECT m.*, g.name as game_name, g.icon_url as game_icon
      FROM matches m
      LEFT JOIN games g ON m.game_id = g.id
      WHERE m.id = ?
    `, [matchId]);
    
    // Parse maps for the returned match
    const parsedMatch = {
      ...match,
      maps: match.maps ? (typeof match.maps === 'string' ? JSON.parse(match.maps) : match.maps) : []
    };
    
    return NextResponse.json(parsedMatch, { status: 201 });
  } catch (error) {
    console.error('Error creating match:', error);
    return NextResponse.json(
      { error: 'Failed to create match' },
      { status: 500 }
    );
  }
}