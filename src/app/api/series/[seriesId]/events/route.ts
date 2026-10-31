import type { NextRequest, NextResponse } from 'next/server';
import {
  getSeriesById, addSeriesEvent, listSeriesEvents, readJsonObject,
  validatePointsMultiplier, validateEventOrder, checkSeriesEventTarget,
} from '@/lib/series';
import type { AddSeriesEventInput } from '@/lib/series';
import { logger } from '@/lib/logger';
import { apiError, apiOk } from '@/lib/api-response';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ seriesId: string }> }
): Promise<NextResponse> {
  try {
    const { seriesId } = await params;
    const series = await getSeriesById(seriesId);
    if (!series) return apiError('Series not found', 404);
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
    if (series.status === 'complete' || series.status === 'cancelled') {
      return apiError(`Cannot modify events of a ${series.status} series`, 409);
    }

    const body = await readJsonObject(request);
    if (!body) return apiError('Invalid JSON body', 400);
    const { event_type, match_id, tournament_id } = body;

    if (event_type !== 'match' && event_type !== 'tournament') {
      return apiError('event_type must be "match" or "tournament"', 400);
    }
    if (event_type === 'match' && (typeof match_id !== 'string' || !match_id)) return apiError('match_id is required for match events', 400);
    if (event_type === 'tournament' && (typeof tournament_id !== 'string' || !tournament_id)) return apiError('tournament_id is required for tournament events', 400);

    if (body.points_multiplier !== undefined) {
      const err = validatePointsMultiplier(body.points_multiplier);
      if (err) return apiError(err, 400);
    }
    if (body.event_order !== undefined) {
      const err = validateEventOrder(body.event_order);
      if (err) return apiError(err, 400);
    }
    if (body.event_date !== undefined && body.event_date !== null && typeof body.event_date !== 'string') {
      return apiError('event_date must be a string', 400);
    }

    const input: AddSeriesEventInput = {
      event_type,
      match_id: event_type === 'match' ? (match_id as string) : undefined,
      tournament_id: event_type === 'tournament' ? (tournament_id as string) : undefined,
      event_order: body.event_order as number | undefined,
      event_date: (body.event_date as string | null | undefined) ?? undefined,
      points_multiplier: body.points_multiplier as number | undefined,
    };

    const targetError = await checkSeriesEventTarget(seriesId, {
      ...input,
      // surface a contradictory body (e.g. match event with tournament_id) as 400
      match_id: event_type === 'match' ? input.match_id : (match_id as string | undefined),
      tournament_id: event_type === 'tournament' ? input.tournament_id : (tournament_id as string | undefined),
    });
    if (targetError) return apiError(targetError.error, targetError.status);

    try {
      const id = await addSeriesEvent(seriesId, input);
      return apiOk({ id }, 201);
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (/UNIQUE constraint failed.*(match_id|tournament_id)/i.test(message)) {
        return apiError('Event is already part of this series', 409);
      }
      if (/UNIQUE constraint failed.*event_order/i.test(message)) {
        return apiError('event_order is already used in this series', 409);
      }
      throw err;
    }
  } catch (error) {
    logger.error('Error adding series event:', error);
    return apiError('Failed to add series event');
  }
}
