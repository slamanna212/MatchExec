'use client'

import { Suspense } from 'react';
import { CreateTournamentPage } from '@/components/create-tournament-page';

export default function TournamentCreatePage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <CreateTournamentPage />
    </Suspense>
  );
}