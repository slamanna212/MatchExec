import type { NextRequest, NextResponse } from 'next/server';
import {
  getSeriesById, removeSeriesEvent, updateSeriesEvent, readJsonObject,
  validatePointsMultiplier, validateEventOrder,
} from '@/lib/series';
import type { UpdateSeriesEventInput } from '@/lib/series';
import { logger } from '@/lib/logger';
import { apiError, apiOk } from '@/lib/api-response';

/**
 * Edit an event's points_multiplier, event_order (swaps with the event already holding that
 * order) and/or event_date. Only allowed while the series is still 'created': once it starts,
 * changing weights or order would silently rewrite standings people have already seen.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ seriesId: string; eventId: string }> }
): Promise<NextResponse> {
  try {
    const { seriesId, eventId } = await params;
    const series = await getSeriesById(seriesId);
    if (!series) return apiError('Series not found', 404);
    if (series.status !== 'created') {
      return apiError(`Events can only be edited before the series starts (series is ${series.status})`, 409);
    }

    const body = await readJsonObject(request);
    if (!body) return apiError('Invalid JSON body', 400);

    const updates: UpdateSeriesEventInput = {};
    if (body.points_multiplier !== undefined) {
      const err = validatePointsMultiplier(body.points_multiplier);
      if (err) return apiError(err, 400);
      updates.points_multiplier = body.points_multiplier as number;
    }
    if (body.event_order !== undefined) {
      const err = validateEventOrder(body.event_order);
      if (err) return apiError(err, 400);
      updates.event_order = body.event_order as number;
    }
    if (body.event_date !== undefined) {
      if (body.event_date !== null && (typeof body.event_date !== 'string' || Number.isNaN(Date.parse(body.event_date)))) {
        return apiError('event_date must be a valid date or null', 400);
      }
      updates.event_date = body.event_date as string | null;
    }
    if (Object.keys(updates).length === 0) {
      return apiError('Nothing to update: send points_multiplier, event_order and/or event_date', 400);
    }

    const result = await updateSeriesEvent(seriesId, eventId, updates, { requireSeriesStatus: 'created' });
    if ('error' in result) return apiError(result.error, result.status);
    return apiOk({ event: result.event, swapped_with: result.swappedWith ?? null });
  } catch (error) {
    logger.error('Error updating series event:', error);
    return apiError('Failed to update series event');
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ seriesId: string; eventId: string }> }
): Promise<NextResponse> {
  try {
    const { seriesId, eventId } = await params;
    const series = await getSeriesById(seriesId);
    if (!series) return apiError('Series not found', 404);
    if (series.status === 'complete' || series.status === 'cancelled') {
      return apiError(`Cannot modify events of a ${series.status} series`, 409);
    }
    const removed = await removeSeriesEvent(eventId, seriesId);
    if (!removed) return apiError('Event not found in this series', 404);
    return apiOk({ success: true });
  } catch (error) {
    logger.error('Error removing series event:', error);
    return apiError('Failed to remove series event');
  }
}
