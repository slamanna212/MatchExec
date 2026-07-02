import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { getDbInstance } from '../../../lib/database-init';
import type { Tournament } from '@/shared/types';
import { logger } from '@/lib/logger';
import type { Database } from '@/lib/database/connection';
import { validateMaxLength, validateNumberRange, validateEnum } from '@/lib/utils/validation';
import { logFeedEvent } from '@/lib/feed-helpers';
import { apiError, apiOk } from '@/lib/api-response';

const RULESET_VALUES = ['casual', 'competitive'] as const;

interface TournamentBody {
  name: string;
  description?: string;
  gameId: string;
  gameModeId: string;
  format: string;
  startDate?: string;
  startTime?: string;
  roundsPerMatch: number;
  ruleset?: string;
  maxParticipants?: number;
  eventImageUrl?: string;
  allowPlayerTeamSelection?: boolean;
  allowMatchEditing?: boolean;
  statsEnabled?: boolean;
  announcements?: Array<{ id: string; value: number; unit: 'minutes' | 'hours' | 'days' }>;
  playerNotifications?: boolean;
  livestreamLink?: string;
}

function validateTournamentBody(body: Partial<TournamentBody>): string | null {
  if (!body.name || !body.gameId || !body.gameModeId || !body.format || !body.roundsPerMatch) {
    return 'Missing required fields: name, gameId, gameModeId, format, and roundsPerMatch';
  }
  if (!['single-elimination', 'double-elimination', 'cumulative-points'].includes(body.format)) {
    return 'Invalid format. Must be single-elimination, double-elimination, or cumulative-points';
  }

  for (const check of [
    validateMaxLength(body.name, 255, 'name'),
    validateMaxLength(body.description, 1000, 'description'),
    validateEnum(body.ruleset, RULESET_VALUES, 'ruleset'),
    validateNumberRange(body.roundsPerMatch, 1, 9, 'roundsPerMatch'),
    validateNumberRange(body.maxParticipants, 4, 256, 'maxParticipants'),
  ]) {
    if (!check.valid) return check.error;
  }

  return null;
}

async function validateGameModeId(db: Database, gameId: string, gameModeId: string): Promise<string | null> {
  if (gameId === 'overwatch2' && gameModeId.startsWith('ow2-')) {
    if (gameModeId !== 'ow2-5v5' && gameModeId !== 'ow2-6v6') {
      return 'Invalid Overwatch 2 team size option';
    }
    return null;
  }
  const gameMode = await db.get<{ id: string }>('SELECT id FROM game_modes WHERE id = ? AND game_id = ?', [gameModeId, gameId]);
  if (!gameMode) return 'Invalid game mode ID or game mode does not belong to the selected game';
  return null;
}

function buildTournamentInsertValues(body: TournamentBody, tournamentId: string, startDateTime: string | null, startTimeOnly: string | null) {
  return [
    tournamentId,
    body.name,
    body.description || null,
    body.gameId,
    body.gameModeId,
    body.format,
    'created',
    body.roundsPerMatch,
    body.ruleset || 'casual',
    body.maxParticipants || null,
    startDateTime,
    startTimeOnly,
    body.eventImageUrl || null,
    body.allowPlayerTeamSelection ? 1 : 0,
    body.allowMatchEditing === false ? 0 : 1,
    body.statsEnabled ? 1 : 0,
    body.announcements ? JSON.stringify(body.announcements) : null,
    body.playerNotifications === false ? 0 : 1,
    body.livestreamLink || null,
  ];
}

interface TournamentDbRow extends Tournament {
  game_name?: string;
  game_icon?: string;
  game_color?: string;
  participant_count?: number;
  has_bracket?: boolean;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const limitParam = searchParams.get('limit');
    const offsetParam = searchParams.get('offset');
    const limit = limitParam ? parseInt(limitParam, 10) : null;
    const offset = offsetParam ? parseInt(offsetParam, 10) : 0;

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
        END as participant_count,
        CASE
          WHEN EXISTS (
            SELECT 1 FROM tournament_matches tm WHERE tm.tournament_id = t.id
          ) THEN 1
          ELSE 0
        END as has_bracket
      FROM tournaments t
      LEFT JOIN games g ON t.game_id = g.id
      LEFT JOIN tournament_participants tp ON t.id = tp.tournament_id
      LEFT JOIN tournament_teams tt ON t.id = tt.tournament_id
      LEFT JOIN tournament_team_members ttm ON tt.id = ttm.team_id
    `;

    const params: (string | number)[] = [];

    if (status === 'complete') {
      query += ` WHERE t.status = 'complete'`;
    } else {
      // Default behavior: show all tournaments EXCEPT completed ones
      query += ` WHERE t.status != 'complete'`;
    }

    query += ` GROUP BY t.id ORDER BY t.updated_at DESC`;

    if (limit !== null) {
      query += ` LIMIT ? OFFSET ?`;
      params.push(limit, offset);
    }

    const tournaments = await db.all<TournamentDbRow>(query, params);

    // Compute ETag for efficient polling
    const maxUpdatedAt = tournaments.reduce(
      (max, t) => { const val = String(t.updated_at); return val > max ? val : max; },
      ''
    );
    const etag = `"${tournaments.length}:${maxUpdatedAt}"`;
    const ifNoneMatch = request.headers.get('if-none-match');
    if (limit === null && ifNoneMatch === etag) {
      return new NextResponse(null, { status: 304, headers: { ETag: etag } });
    }

    return NextResponse.json(tournaments, { headers: { ETag: etag } });
  } catch (error) {
    logger.error('Error fetching tournaments:', error);
    return apiError('Failed to fetch tournaments');
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body: TournamentBody = await request.json();

    const validationError = validateTournamentBody(body);
    if (validationError) {
      return apiError(validationError, 400);
    }

    const db = await getDbInstance();

    const gameModeError = await validateGameModeId(db, body.gameId, body.gameModeId);
    if (gameModeError) {
      return apiError(gameModeError, 400);
    }

    const tournamentId = `tournament_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`; // NOSONAR: non-security internal ID generation
    const startDateTime = body.startDate ? new Date(body.startDate).toISOString() : null;
    const startTimeOnly = body.startTime ? new Date(body.startTime).toISOString() : null;

    await db.run(`
      INSERT INTO tournaments (
        id, name, description, game_id, game_mode_id, format, status, rounds_per_match,
        ruleset, max_participants, start_date, start_time, event_image_url,
        allow_player_team_selection, allow_match_editing, stats_enabled,
        announcements, player_notifications, livestream_link
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, buildTournamentInsertValues(body, tournamentId, startDateTime, startTimeOnly));
    
    const tournament = await db.get<TournamentDbRow>(`
      SELECT
        t.*,
        g.name as game_name,
        g.icon_url as game_icon,
        g.color as game_color,
        0 as participant_count,
        0 as has_bracket
      FROM tournaments t
      LEFT JOIN games g ON t.game_id = g.id
      WHERE t.id = ?
    `, [tournamentId]);
    
    logger.debug(`✅ Tournament created in "created" status: ${body.name}`);

    await logFeedEvent({
      eventType: 'tournament_created',
      priority: 3,
      title: 'Tournament Created',
      description: `"${body.name}" is ready for setup`,
      tournamentId,
      metadata: { format: body.format },
    });

    return apiOk(tournament, 201);
  } catch (error) {
    logger.error('Error creating tournament:', error);
    return apiError('Failed to create tournament');
  }
}