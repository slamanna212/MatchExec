'use client'

import { use } from 'react';
import { SeriesDetailPage } from '@/components/series/series-detail-page';

export default function SeriesPage({ params }: { params: Promise<{ seriesId: string }> }) {
  const { seriesId } = use(params);
  return <SeriesDetailPage seriesId={seriesId} />;
}
