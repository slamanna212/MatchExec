'use client'

/**
 * Scoring component for Normal (team vs team) matches.
 * Thin wrapper over SimpleMapScoring that locks scoring_type to 'Normal'.
 */

import type { JSX } from 'react';
import { SimpleMapScoring } from './SimpleMapScoring';
import type { MatchResult } from '@/shared/types';

interface TeamMapScoringProps {
  matchId: string;
  gameType: string;
  onResultSubmit: (result: MatchResult) => Promise<void>;
  submitting: boolean;
  onAllMapsCompleted?: () => void;
  matchStatsEnabled?: boolean;
  initialGameId?: string;
}

export function TeamMapScoring(props: TeamMapScoringProps): JSX.Element {
  return <SimpleMapScoring {...props} />;
}
