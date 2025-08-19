'use client'

import { 
  ModeDataJsonWithScoring, 
  ScoringConfig, 
  MatchScore 
} from '@/shared/types';
import { RealTimeScoring } from './realtime/RealTimeScoring';
import { EndGameScoring } from './endgame/EndGameScoring';

interface TimingDetectorProps {
  matchId: string;
  gameId: string;
  modeData: ModeDataJsonWithScoring;
  scoringConfig: ScoringConfig;
  onScoreSubmit: (score: MatchScore) => Promise<void>;
  submitting: boolean;
}

export function TimingDetector({
  matchId,
  gameId,
  modeData,
  scoringConfig,
  onScoreSubmit,
  submitting
}: TimingDetectorProps) {
  
  // Route to appropriate scoring component based on timing
  if (scoringConfig.scoringTiming === 'realtime') {
    return (
      <RealTimeScoring
        matchId={matchId}
        gameId={gameId}
        modeData={modeData}
        scoringConfig={scoringConfig}
        onScoreSubmit={onScoreSubmit}
        submitting={submitting}
      />
    );
  }

  // Default to end-game scoring
  return (
    <EndGameScoring
      matchId={matchId}
      gameId={gameId}
      modeData={modeData}
      scoringConfig={scoringConfig}
      onScoreSubmit={onScoreSubmit}
      submitting={submitting}
    />
  );
}