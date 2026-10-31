import type { NextRequest, NextResponse } from 'next/server';
import { getSeriesById, removeSeriesEvent } from '@/lib/series';
import { logger } from '@/lib/logger';
import { apiError, apiOk } from '@/lib/api-response';

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
