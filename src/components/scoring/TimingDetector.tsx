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
  gameType?: string; // Optional game type for API calls (if different from gameId)
  modeData: ModeDataJsonWithScoring;
  scoringConfig: ScoringConfig;
  onScoreSubmit: (score: MatchScore) => Promise<void>;
  submitting: boolean;
  initialScore?: MatchScore;
}

export function TimingDetector({
  matchId,
  gameId,
  gameType,
  modeData,
  scoringConfig,
  onScoreSubmit,
  submitting,
  initialScore
}: TimingDetectorProps) {
  
  // Route to appropriate scoring component based on timing
  if (scoringConfig.scoringTiming === 'realtime') {
    return (
      <RealTimeScoring
        matchId={matchId}
        gameId={gameId}
        scoringConfig={scoringConfig}
        onScoreSubmit={onScoreSubmit}
        submitting={submitting}
        initialScore={initialScore}
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