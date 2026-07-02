import type { NextRequest, NextResponse } from 'next/server';
import { removeSeriesEvent } from '@/lib/series';
import { logger } from '@/lib/logger';
import { apiError, apiOk } from '@/lib/api-response';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ seriesId: string; eventId: string }> }
): Promise<NextResponse> {
  try {
    const { eventId } = await params;
    await removeSeriesEvent(eventId);
    return apiOk({ success: true });
  } catch (error) {
    logger.error('Error removing series event:', error);
    return apiError('Failed to remove series event');
  }
}
