'use client'

import { useState, useEffect } from 'react';
import { Stack, Group, Card, Button, Text, Alert, Divider } from '@mantine/core';
import { IconPlus, IconCheck, IconDeviceFloppy } from '@tabler/icons-react';
import { 
  ModeDataJsonWithScoring, 
  ScoringConfig, 
  MatchScore,
  RoundsScore,
  RoundScore
} from '@/shared/types';
import { WinnerSelector } from '../shared/WinnerSelector';
import { RoundIndicator } from '../shared/RoundIndicator';
import { FormatAwareScoreInput } from '../shared/FormatAwareScoreInput';

interface RealTimeScoringProps {
  matchId: string;
  gameId: string;
  gameType?: string; // Optional game type for API calls (if different from gameId)
  modeData: ModeDataJsonWithScoring;
  scoringConfig: ScoringConfig;
  onScoreSubmit: (score: MatchScore) => Promise<void>;
  submitting: boolean;
  initialScore?: MatchScore;
}

export function RealTimeScoring({
  matchId,
  gameId,
  // gameType is not used in this component
  // modeData is not used in this component
  scoringConfig,
  onScoreSubmit,
  submitting,
  initialScore
}: Omit<RealTimeScoringProps, 'gameType' | 'modeData'>) {
  // Remove unused destructured variables
  // gameType and modeData are not used
  
  // Get rounds configuration from format variant
  const maxRounds = (scoringConfig.formatVariant.maxRounds as number) || 3;
  const winCondition = scoringConfig.formatVariant.winCondition || 'playAll';
  
  // For "playAll", we play all rounds and winner is determined by most wins
  // For "bestOf", we stop when someone reaches majority (legacy behavior)
  const maxPossibleRounds = winCondition === 'playAll' ? maxRounds : (Math.ceil(maxRounds / 2));
  
  // Round state
  const [rounds, setRounds] = useState<RoundScore[]>([]);
  const [currentRound, setCurrentRound] = useState(1);
  const [currentRoundWinner, setCurrentRoundWinner] = useState<'team1' | 'team2' | null>(null);
  const [currentRoundScores, setCurrentRoundScores] = useState({ team1: 0, team2: 0 });
  
  // Match state
  const [matchWinner, setMatchWinner] = useState<'team1' | 'team2' | 'draw' | null>(null);
  const [isMatchComplete, setIsMatchComplete] = useState(false);

  // Initialize with existing score data if provided
  useEffect(() => {
    if (initialScore && initialScore.scoringType === 'rounds') {
      const existingScore = initialScore as RoundsScore;
      setRounds(existingScore.rounds || []);
      setCurrentRound((existingScore.rounds?.length || 0) + 1);
      
      // If the match was already complete, restore the winner
      if (existingScore.winner && existingScore.winner !== 'draw') {
        // Check if match should be complete based on win condition
        const shouldBeComplete = winCondition === 'playAll' 
          ? existingScore.rounds.length >= maxPossibleRounds
          : (existingScore.team1Rounds >= Math.ceil(maxPossibleRounds / 2) || existingScore.team2Rounds >= Math.ceil(maxPossibleRounds / 2));
          
        if (shouldBeComplete) {
          setMatchWinner(existingScore.winner);
          setIsMatchComplete(true);
        }
      }
    }
  }, [initialScore, winCondition, maxPossibleRounds]);

  // Calculate current team round wins
  const team1Rounds = rounds.filter(r => r.winner === 'team1').length;
  const team2Rounds = rounds.filter(r => r.winner === 'team2').length;

  // Check if match is complete
  useEffect(() => {
    if (winCondition === 'playAll') {
      // Play all rounds, then determine winner by most wins
      if (rounds.length >= maxPossibleRounds) {
        if (team1Rounds > team2Rounds) {
          setMatchWinner('team1');
          setIsMatchComplete(true);
        } else if (team2Rounds > team1Rounds) {
          setMatchWinner('team2');
          setIsMatchComplete(true);
        } else {
          // Handle tie - check for overtime
          if (scoringConfig.formatVariant.overtimeEnabled) {
            setIsMatchComplete(false); // Continue to overtime
          } else {
            setMatchWinner('draw');
            setIsMatchComplete(true);
          }
        }
      }
    } else {
      // Legacy "bestOf" behavior - first to reach majority wins
      const requiredWins = Math.ceil(maxPossibleRounds / 2);
      if (team1Rounds >= requiredWins) {
        setMatchWinner('team1');
        setIsMatchComplete(true);
      } else if (team2Rounds >= requiredWins) {
        setMatchWinner('team2');
        setIsMatchComplete(true);
      }
    }
  }, [rounds, team1Rounds, team2Rounds, winCondition, maxPossibleRounds, scoringConfig]);

  const handleAddRound = () => {
    if (!currentRoundWinner) return;

    const newRound: RoundScore = {
      round: currentRound,
      winner: currentRoundWinner,
      team1Score: currentRoundScores.team1,
      team2Score: currentRoundScores.team2,
      metadata: {
        scoringType: scoringConfig.scoringType,
        timestamp: new Date().toISOString()
      }
    };

    setRounds(prev => [...prev, newRound]);
    setCurrentRound(prev => prev + 1);
    setCurrentRoundWinner(null);
    setCurrentRoundScores({ team1: 0, team2: 0 });
  };

  const handleFinishMatch = async () => {
    if (!matchWinner && !isMatchComplete) return;

    const finalScore: RoundsScore = {
      matchId,
      gameId,
      format: scoringConfig.format,
      scoringType: 'rounds',
      winner: matchWinner || 'draw',
      completedAt: new Date(),
      currentRound: currentRound - 1,
      maxRounds: maxPossibleRounds,
      rounds,
      team1Rounds,
      team2Rounds
    };

    await onScoreSubmit(finalScore);
  };

  const handleSaveProgress = async () => {
    if (rounds.length === 0) return;

    // For partial saves, we need to determine a temporary winner or use null
    // But since the API requires a winner, we'll use the current leader or 'draw'
    let tempWinner: 'team1' | 'team2' | 'draw' = 'draw';
    if (team1Rounds > team2Rounds) {
      tempWinner = 'team1';
    } else if (team2Rounds > team1Rounds) {
      tempWinner = 'team2';
    }

    const progressScore: RoundsScore = {
      matchId,
      gameId,
      format: scoringConfig.format,
      scoringType: 'rounds',
      winner: isMatchComplete ? (matchWinner || 'draw') : tempWinner,
      completedAt: new Date(),
      currentRound: currentRound - 1,
      maxRounds: maxPossibleRounds,
      rounds,
      team1Rounds,
      team2Rounds
    };

    await onScoreSubmit(progressScore);
  };

  const canAddRound = currentRoundWinner !== null && !isMatchComplete;
  const canFinishMatch = isMatchComplete && matchWinner !== null;
  const canSaveProgress = rounds.length > 0 && !submitting;

  return (
    <Stack gap="md">
      {/* Round Progress Indicator */}
      <RoundIndicator
        currentRound={currentRound}
        maxRounds={maxPossibleRounds}
        team1Rounds={team1Rounds}
        team2Rounds={team2Rounds}
        formatLabel={winCondition === 'playAll' ? `Play all ${maxPossibleRounds}` : `First to ${Math.ceil(maxPossibleRounds / 2)}`}
      />

      {/* Current Round Scoring - Only show if match not complete */}
      {!isMatchComplete && (
        <Card withBorder p="md">
          <Stack gap="md">
            <Group justify="space-between">
              <Text fw={600} size="lg">Round {currentRound}</Text>
              <Text size="sm" c="dimmed">
                {scoringConfig.format === 'competitive' ? 'Competitive' : 'Casual'} Format
              </Text>
            </Group>

            <Divider />

            {/* Round-specific scoring based on scoring type */}
            {scoringConfig.scoringType === 'rounds' && (
              <>
                {/* For pure round-based (like Valorant), just need winner */}
                <WinnerSelector
                  value={currentRoundWinner}
                  onChange={setCurrentRoundWinner}
                  allowDraw={false}
                  disabled={submitting}
                />
              </>
            )}

            {(scoringConfig.scoringType === 'points' || scoringConfig.scoringType === 'objective') && (
              <>
                {/* For point-based rounds (like Control), need scores */}
                <FormatAwareScoreInput
                  team1Score={currentRoundScores.team1}
                  team2Score={currentRoundScores.team2}
                  onTeam1ScoreChange={(value) => setCurrentRoundScores(prev => ({ ...prev, team1: value }))}
                  onTeam2ScoreChange={(value) => setCurrentRoundScores(prev => ({ ...prev, team2: value }))}
                  scoringConfig={scoringConfig}
                  disabled={submitting}
                  label="Round Score"
                  description={`Enter the scores for Round ${currentRound}`}
                />

                <WinnerSelector
                  value={currentRoundWinner}
                  onChange={setCurrentRoundWinner}
                  allowDraw={false}
                  disabled={submitting}
                />
              </>
            )}

            <Group justify="flex-end">
              <Button
                leftSection={<IconPlus size={16} />}
                onClick={handleAddRound}
                disabled={!canAddRound || submitting}
              >
                Add Round {currentRound}
              </Button>
            </Group>
          </Stack>
        </Card>
      )}

      {/* Match Complete */}
      {isMatchComplete && (
        <Alert color="green" icon={<IconCheck size={16} />}>
          <Stack gap="xs">
            <Text fw={600}>Match Complete!</Text>
            <Text size="sm">
              {matchWinner === 'draw' 
                ? 'The match ended in a draw'
                : `${matchWinner === 'team1' ? 'Red Team' : 'Blue Team'} wins ${team1Rounds}-${team2Rounds}!`
              }
            </Text>
          </Stack>
        </Alert>
      )}

      {/* Rounds History */}
      {rounds.length > 0 && (
        <Card withBorder p="md">
          <Stack gap="sm">
            <Text fw={600} size="sm">Rounds History</Text>
            {rounds.map((round, index) => (
              <Group key={index} justify="space-between" p="xs" style={{ backgroundColor: 'var(--mantine-color-gray-0)', borderRadius: '4px' }}>
                <Text size="sm">Round {round.round}</Text>
                <Group gap="xs">
                  {round.team1Score !== undefined && round.team2Score !== undefined && (
                    <Text size="sm" c="dimmed">
                      {round.team1Score} - {round.team2Score}
                    </Text>
                  )}
                  <Text size="sm" fw={600} c={round.winner === 'team1' ? 'red' : 'blue'}>
                    {round.winner === 'team1' ? 'Red Team' : 'Blue Team'} wins
                  </Text>
                </Group>
              </Group>
            ))}
          </Stack>
        </Card>
      )}

      {/* Save Progress / Submit Match Score */}
      <Group justify="space-between">
        {/* Save Progress Button - Show when there are rounds to save but match isn't complete */}
        {!isMatchComplete && canSaveProgress && (
          <Button
            size="md"
            variant="light"
            color="blue"
            leftSection={<IconDeviceFloppy size={16} />}
            onClick={handleSaveProgress}
            loading={submitting}
          >
            Save Progress
          </Button>
        )}
        
        {/* Submit Final Score Button - Show when match is complete */}
        <Button
          size="md"
          color="green"
          leftSection={<IconCheck size={16} />}
          onClick={handleFinishMatch}
          disabled={!canFinishMatch}
          loading={submitting}
          style={{ marginLeft: 'auto' }}
        >
          {isMatchComplete ? 'Submit Final Score' : 'Complete Match'}
        </Button>
      </Group>
    </Stack>
  );
}