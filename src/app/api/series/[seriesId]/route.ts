import type { NextRequest, NextResponse } from 'next/server';
import { getSeriesById, updateSeries, deleteSeries, readJsonObject, validateSeriesBody } from '@/lib/series';
import type { UpdateSeriesInput } from '@/lib/series';
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
    const body = await readJsonObject(request);
    if (!body) return apiError('Invalid JSON body', 400);
    const validationError = validateSeriesBody(body, true);
    if (validationError) return apiError(validationError, 400);
    // Status changes must go through POST /transition, which validates the
    // move is legal (e.g. can't jump from 'created' straight to 'complete',
    // can't un-complete a finished series). Silently dropping it here rather
    // than erroring keeps this endpoint usable for updating other fields in
    // the same request without requiring callers to strip it themselves.
    const { status: _status, ...editableFields } = body;
    await updateSeries(seriesId, {
      ...editableFields,
      ...(typeof editableFields.name === 'string' ? { name: editableFields.name.trim() } : {}),
    } as unknown as UpdateSeriesInput);
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
