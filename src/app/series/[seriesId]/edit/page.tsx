'use client'

import { use } from 'react';
import { EditSeriesPage } from '@/components/series/edit-series-page';

export default function SeriesEditPage({ params }: { params: Promise<{ seriesId: string }> }) {
  const { seriesId } = use(params);
  return <EditSeriesPage seriesId={seriesId} />;
}
