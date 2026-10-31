import type { NextRequest, NextResponse } from 'next/server';
import { createSeries, readJsonObject, validateSeriesBody, validateSeriesGameId } from '@/lib/series';
import { findSeriesForMatch, findSeriesForTournament, listSeriesSummaries } from '@/lib/series-summary';
import type { CreateSeriesInput } from '@/lib/series';
import { logger } from '@/lib/logger';
import { apiError, apiOk } from '@/lib/api-response';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);

    // Membership lookups for the "Series" row on match/tournament detail pages.
    const matchId = searchParams.get('match_id');
    if (matchId) return apiOk({ memberships: await findSeriesForMatch(matchId) });
    const tournamentId = searchParams.get('tournament_id');
    if (tournamentId) return apiOk({ memberships: await findSeriesForTournament(tournamentId) });

    // status may be repeated (?status=a&status=b) or comma-separated (?status=a,b)
    const statuses = searchParams.getAll('status').flatMap(v => v.split(',')).map(v => v.trim()).filter(Boolean);
    const limitParam = searchParams.get('limit');
    const offsetParam = searchParams.get('offset');
    const limit = limitParam ? Number.parseInt(limitParam, 10) : undefined;
    const offset = offsetParam ? Number.parseInt(offsetParam, 10) : undefined;
    if ((limit !== undefined && (!Number.isInteger(limit) || limit < 1)) || (offset !== undefined && (!Number.isInteger(offset) || offset < 0))) {
      return apiError('limit must be a positive integer and offset a non-negative integer', 400);
    }

    const series = await listSeriesSummaries({ statuses, limit, offset });
    return apiOk({ series });
  } catch (error) {
    logger.error('Error listing series:', error);
    return apiError('Failed to list series');
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await readJsonObject(request);
    if (!body) return apiError('Invalid JSON body', 400);
    const validationError = validateSeriesBody(body, false);
    if (validationError) return apiError(validationError, 400);
    const gameError = await validateSeriesGameId(body.game_id);
    if (gameError) return apiError(gameError, 400);
    const id = await createSeries({ ...body, name: (body.name as string).trim() } as unknown as CreateSeriesInput);
    return apiOk({ id }, 201);
  } catch (error) {
    logger.error('Error creating series:', error);
    return apiError('Failed to create series');
  }
}
