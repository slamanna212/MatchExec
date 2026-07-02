import type { NextRequest, NextResponse } from 'next/server';
import { createSeries, listSeries } from '@/lib/series';
import { logger } from '@/lib/logger';
import { apiError, apiOk } from '@/lib/api-response';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') ?? undefined;
    const series = await listSeries(status);
    return apiOk({ series });
  } catch (error) {
    logger.error('Error listing series:', error);
    return apiError('Failed to list series');
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { name } = body;
    if (!name) return apiError('name is required', 400);
    const id = await createSeries(body);
    return apiOk({ id }, 201);
  } catch (error) {
    logger.error('Error creating series:', error);
    return apiError('Failed to create series');
  }
}
