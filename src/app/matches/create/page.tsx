'use client'

import { Suspense } from 'react';
import { CreateMatchPage } from '@/components/create-match-page';

export default function MatchCreatePage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <CreateMatchPage />
    </Suspense>
  );
}