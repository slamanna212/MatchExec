import type { NextRequest, NextResponse } from 'next/server';
import { getSeriesById, updateSeries, deleteSeries } from '@/lib/series';
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
    return apiOk({ series });
  } catch (error) {
    logger.error('Error fetching series:', error);
    return apiError('Failed to fetch series');
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ seriesId: string }> }
): Promise<NextResponse> {
  try {
    const { seriesId } = await params;
    const series = await getSeriesById(seriesId);
    if (!series) return apiError('Series not found', 404);
    const body = await request.json();
    await updateSeries(seriesId, body);
    return apiOk({ success: true });
  } catch (error) {
    logger.error('Error updating series:', error);
    return apiError('Failed to update series');
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ seriesId: string }> }
): Promise<NextResponse> {
  try {
    const { seriesId } = await params;
    const series = await getSeriesById(seriesId);
    if (!series) return apiError('Series not found', 404);
    await deleteSeries(seriesId);
    return apiOk({ success: true });
  } catch (error) {
    logger.error('Error deleting series:', error);
    return apiError('Failed to delete series');
  }
}
