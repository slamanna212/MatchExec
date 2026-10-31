'use client'

import { Suspense } from 'react';
import { CreateSeriesPage } from '@/components/series/create-series-page';

export default function NewSeriesPage() {
  return (
    <Suspense fallback={null}>
      <CreateSeriesPage />
    </Suspense>
  );
}
