import type { NextRequest, NextResponse } from 'next/server';
import { getSeriesById, getSeriesStandings } from '@/lib/series';
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
    const standings = await getSeriesStandings(seriesId);
    return apiOk({ series_id: seriesId, series_name: series.name, standings });
  } catch (error) {
    logger.error('Error fetching series standings:', error);
    return apiError('Failed to fetch series standings');
  }
}
