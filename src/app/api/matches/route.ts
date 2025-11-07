import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { getDbInstance } from '../../../lib/database-init';
import type { MatchDbRow } from '@/shared/types';
import { logger } from '@/lib/logger';
import { safeJSONParse } from '@/lib/utils/validation';
import {
  validateMatchRequest,
  prepareMatchData,
  insertMatchToDatabase,
  parseMatchResponse,
  type MatchRequestBody
} from './helpers';


export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    
    const db = await getDbInstance();
    
    let query = `
      SELECT m.*, g.name as game_name, g.icon_url as game_icon, g.max_signups as max_participants, g.color as game_color, g.map_codes_supported,
             t.name as tournament_name, tm.round as tournament_round, tm.bracket_type as tournament_bracket_type,
             gm.name as map_name,
             COUNT(DISTINCT mp.id) as participant_count
      FROM matches m
      LEFT JOIN games g ON m.game_id = g.id
      LEFT JOIN tournament_matches tm ON m.id = tm.match_id
      LEFT JOIN tournaments t ON tm.tournament_id = t.id
      LEFT JOIN game_maps gm ON m.map_id = gm.id AND m.game_id = gm.game_id
      LEFT JOIN match_participants mp ON m.id = mp.match_id
    `;
    
    const params: string[] = [];
    
    if (status === 'complete') {
      query += ` WHERE m.status = 'complete'`;
    } else {
      // Default behavior: show all matches EXCEPT completed ones
      query += ` WHERE m.status != 'complete'`;
    }

    query += ` GROUP BY m.id ORDER BY m.start_time ASC`;
    
    const matches = await db.all<MatchDbRow>(query, params);

    // Parse maps and map codes JSON for each match
    const parsedMatches = matches.map(match => ({
      ...match,
      maps: match.maps ? safeJSONParse(typeof match.maps === 'string' ? match.maps : null, match.map_id ? [match.map_id] : []) : (match.map_id ? [match.map_id] : []),
      map_codes: safeJSONParse(typeof match.map_codes === 'string' ? match.map_codes : null, {})
    }));

    return NextResponse.json(parsedMatches);
  } catch (error) {
    logger.error('Error fetching matches:', error);
    return NextResponse.json(
      { error: 'Failed to fetch matches' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: MatchRequestBody = await request.json();

    // Validate request
    const validation = validateMatchRequest(body);
    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      );
    }

    const db = await getDbInstance();

    // Prepare match data
    const preparedData = await prepareMatchData(body, db);

    // Insert match into database
    await insertMatchToDatabase(db, body, preparedData);

    // Fetch and parse the created match
    const match = await db.get<MatchDbRow>(`
      SELECT m.*, g.name as game_name, g.icon_url as game_icon, g.color as game_color, g.map_codes_supported
      FROM matches m
      LEFT JOIN games g ON m.game_id = g.id
      WHERE m.id = ?
    `, [preparedData.matchId]);

    const parsedMatch = parseMatchResponse(match);

    // Log match creation
    logger.debug('DEBUG - Match creation data:', {
      startDate: body.startDate,
      announcementCount: body.announcements?.length || 0
    });

    if (body.announcements && body.announcements.length > 0) {
      logger.debug(`📅 Match created with ${body.announcements.length} timed announcements - scheduler will process them`);
    }

    logger.debug(`✅ Match created in "created" status: ${body.name}`);

    return NextResponse.json(parsedMatch, { status: 201 });
  } catch (error) {
    logger.error('Error creating match:', error);
    return NextResponse.json(
      { error: 'Failed to create match' },
      { status: 500 }
    );
  }
}