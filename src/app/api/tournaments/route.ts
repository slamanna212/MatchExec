import { NextRequest, NextResponse } from 'next/server';
import { getDbInstance } from '../../../lib/database-init';
import { Tournament } from '@/shared/types';

interface TournamentDbRow extends Tournament {
  game_name?: string;
  game_icon?: string;
  game_color?: string;
  participant_count?: number;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    
    const db = await getDbInstance();
    
    let query = `
      SELECT
        t.*,
        g.name as game_name,
        g.icon_url as game_icon,
        g.color as game_color,
        CASE
          WHEN t.status IN ('created', 'gather') THEN COUNT(DISTINCT tp.user_id)
          ELSE COUNT(DISTINCT ttm.user_id)
        END as participant_count
      FROM tournaments t
      LEFT JOIN games g ON t.game_id = g.id
      LEFT JOIN tournament_participants tp ON t.id = tp.tournament_id
      LEFT JOIN tournament_teams tt ON t.id = tt.tournament_id
      LEFT JOIN tournament_team_members ttm ON tt.id = ttm.team_id
    `;
    
    const params: string[] = [];
    
    if (status === 'complete') {
      query += ` WHERE t.status = 'complete'`;
    } else {
      // Default behavior: show all tournaments EXCEPT completed ones
      query += ` WHERE t.status != 'complete'`;
    }
    
    query += ` GROUP BY t.id ORDER BY t.start_time ASC`;
    
    const tournaments = await db.all<TournamentDbRow>(query, params);
    
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
    const {
      name,
      description,
      gameId,
      format,
      startDate,
      startTime,
      roundsPerMatch,
      ruleset,
      maxParticipants,
      eventImageUrl
    } = body;
    
    if (!name || !gameId || !format || !roundsPerMatch) {
      return NextResponse.json(
        { error: 'Missing required fields: name, gameId, format, and roundsPerMatch' },
        { status: 400 }
      );
    }
    
    if (!['single-elimination', 'double-elimination'].includes(format)) {
      return NextResponse.json(
        { error: 'Invalid format. Must be single-elimination or double-elimination' },
        { status: 400 }
      );
    }
    
    const db = await getDbInstance();
    const tournamentId = `tournament_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const startDateTime = startDate ? new Date(startDate).toISOString() : null;
    const startTimeOnly = startTime ? new Date(startTime).toISOString() : null;
    
    await db.run(`
      INSERT INTO tournaments (
        id, name, description, game_id, format, status, rounds_per_match,
        ruleset, max_participants, start_date, start_time, event_image_url
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      tournamentId,
      name,
      description || null,
      gameId,
      format,
      'created',
      roundsPerMatch,
      ruleset || 'casual',
      maxParticipants || null,
      startDateTime,
      startTimeOnly,
      eventImageUrl || null
    ]);
    
    const tournament = await db.get<TournamentDbRow>(`
      SELECT 
        t.*, 
        g.name as game_name, 
        g.icon_url as game_icon, 
        g.color as game_color,
        0 as participant_count
      FROM tournaments t
      LEFT JOIN games g ON t.game_id = g.id
      WHERE t.id = ?
    `, [tournamentId]);
    
    console.log(`✅ Tournament created in "created" status: ${name}`);
    
    return NextResponse.json(tournament, { status: 201 });
  } catch (error) {
    console.error('Error creating tournament:', error);
    return NextResponse.json(
      { error: 'Failed to create tournament' },
      { status: 500 }
    );
  }
}