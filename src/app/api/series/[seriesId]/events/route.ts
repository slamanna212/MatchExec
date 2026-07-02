import type { NextRequest, NextResponse } from 'next/server';
import { getSeriesById, addSeriesEvent, listSeriesEvents } from '@/lib/series';
import { logger } from '@/lib/logger';
import { apiError, apiOk } from '@/lib/api-response';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ seriesId: string }> }
): Promise<NextResponse> {
  try {
    const { seriesId } = await params;
    const events = await listSeriesEvents(seriesId);
    return apiOk({ events });
  } catch (error) {
    logger.error('Error listing series events:', error);
    return apiError('Failed to list series events');
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ seriesId: string }> }
): Promise<NextResponse> {
  try {
    const { seriesId } = await params;
    const series = await getSeriesById(seriesId);
    if (!series) return apiError('Series not found', 404);

    const body = await request.json();
    const { event_type, match_id, tournament_id } = body;

    if (!event_type || !['match', 'tournament'].includes(event_type)) {
      return apiError('event_type must be "match" or "tournament"', 400);
    }
    if (event_type === 'match' && !match_id) return apiError('match_id is required for match events', 400);
    if (event_type === 'tournament' && !tournament_id) return apiError('tournament_id is required for tournament events', 400);

    const id = await addSeriesEvent(seriesId, body);
    return apiOk({ id }, 201);
  } catch (error) {
    logger.error('Error adding series event:', error);
    return apiError('Failed to add series event');
  }
}
