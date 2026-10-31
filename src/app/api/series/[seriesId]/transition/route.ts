import type { NextRequest, NextResponse } from 'next/server';
import { getSeriesById, transitionSeriesStatus, validateSeriesStatusTransition, readJsonObject } from '@/lib/series';
import { logger } from '@/lib/logger';
import { apiError, apiOk } from '@/lib/api-response';

const VALID_STATUSES = ['created', 'active', 'complete', 'cancelled'];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ seriesId: string }> }
): Promise<NextResponse> {
  try {
    const { seriesId } = await params;
    const series = await getSeriesById(seriesId);
    if (!series) return apiError('Series not found', 404);

    const body = await readJsonObject(request);
    if (!body) return apiError('Invalid JSON body', 400);
    const newStatus = body.status;
    if (typeof newStatus !== 'string' || !VALID_STATUSES.includes(newStatus)) {
      return apiError(`Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`, 400);
    }

    const transitionError = validateSeriesStatusTransition(series.status, newStatus);
    if (transitionError) {
      return apiError(transitionError, 400);
    }

    // Atomic compare-and-set so two concurrent transitions can't both win.
    const changed = await transitionSeriesStatus(seriesId, series.status, newStatus);
    if (!changed) {
      return apiError('Series status changed concurrently, please refresh and retry', 409);
    }
    const updated = await getSeriesById(seriesId);

    return apiOk({ series: updated });
  } catch (error) {
    logger.error('Error transitioning series:', error);
    return apiError('Failed to transition series');
  }
}
