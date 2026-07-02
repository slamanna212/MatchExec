'use client'

/**
 * Scoring component for FFA (free-for-all) matches.
 * SimpleMapScoring already handles FFA mode via mode_scoring_type === 'FFA';
 * this wrapper makes the intent explicit and allows future FFA-specific UI divergence.
 */

import type { JSX } from 'react';
import { SimpleMapScoring } from './SimpleMapScoring';
import type { MatchResult } from '@/shared/types';

interface FfaMapScoringProps {
  matchId: string;
  gameType: string;
  onResultSubmit: (result: MatchResult) => Promise<void>;
  submitting: boolean;
  onAllMapsCompleted?: () => void;
  matchStatsEnabled?: boolean;
  initialGameId?: string;
}

export function FfaMapScoring(props: FfaMapScoringProps): JSX.Element {
  return <SimpleMapScoring {...props} />;
}
