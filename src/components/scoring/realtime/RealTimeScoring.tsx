'use client'

import { useState, useEffect } from 'react';
import { Stack, Group, Card, Button, Text, Alert, Divider } from '@mantine/core';
import { IconPlus, IconCheck, IconAlertCircle } from '@tabler/icons-react';
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
  modeData: ModeDataJsonWithScoring;
  scoringConfig: ScoringConfig;
  onScoreSubmit: (score: MatchScore) => Promise<void>;
  submitting: boolean;
}

export function RealTimeScoring({
  matchId,
  gameId,
  modeData,
  scoringConfig,
  onScoreSubmit,
  submitting
}: RealTimeScoringProps) {
  
  // Get max rounds from format variant
  const maxRounds = (scoringConfig.formatVariant.maxRounds as number) || 3;
  const winCondition = maxRounds === 3 ? 2 : Math.ceil(maxRounds / 2); // First to majority
  
  // Round state
  const [rounds, setRounds] = useState<RoundScore[]>([]);
  const [currentRound, setCurrentRound] = useState(1);
  const [currentRoundWinner, setCurrentRoundWinner] = useState<'team1' | 'team2' | 'draw' | null>(null);
  const [currentRoundScores, setCurrentRoundScores] = useState({ team1: 0, team2: 0 });
  
  // Match state
  const [matchWinner, setMatchWinner] = useState<'team1' | 'team2' | 'draw' | null>(null);
  const [isMatchComplete, setIsMatchComplete] = useState(false);

  // Calculate current team round wins
  const team1Rounds = rounds.filter(r => r.winner === 'team1').length;
  const team2Rounds = rounds.filter(r => r.winner === 'team2').length;

  // Check if match is complete
  useEffect(() => {
    if (team1Rounds >= winCondition) {
      setMatchWinner('team1');
      setIsMatchComplete(true);
    } else if (team2Rounds >= winCondition) {
      setMatchWinner('team2');
      setIsMatchComplete(true);
    } else if (rounds.length >= maxRounds && team1Rounds === team2Rounds) {
      // Handle overtime or draw based on format
      if (scoringConfig.formatVariant.overtimeEnabled) {
        // Continue playing until someone has a 2-round lead
        setIsMatchComplete(false);
      } else {
        setMatchWinner('draw');
        setIsMatchComplete(true);
      }
    }
  }, [rounds, team1Rounds, team2Rounds, winCondition, maxRounds, scoringConfig]);

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
      maxRounds,
      rounds,
      team1Rounds,
      team2Rounds
    };

    await onScoreSubmit(finalScore);
  };

  const canAddRound = currentRoundWinner !== null && !isMatchComplete;
  const canFinishMatch = isMatchComplete && matchWinner !== null;

  return (
    <Stack gap="md">
      {/* Round Progress Indicator */}
      <RoundIndicator
        currentRound={currentRound}
        maxRounds={maxRounds}
        team1Rounds={team1Rounds}
        team2Rounds={team2Rounds}
        formatLabel={`First to ${winCondition}`}
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
                : `${matchWinner === 'team1' ? 'Team 1' : 'Team 2'} wins ${team1Rounds}-${team2Rounds}!`
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
                  <Text size="sm" fw={600} c={round.winner === 'team1' ? 'blue' : 'red'}>
                    {round.winner === 'team1' ? 'Team 1' : 'Team 2'} wins
                  </Text>
                </Group>
              </Group>
            ))}
          </Stack>
        </Card>
      )}

      {/* Submit Match Score */}
      <Group justify="flex-end">
        <Button
          size="md"
          color="green"
          leftSection={<IconCheck size={16} />}
          onClick={handleFinishMatch}
          disabled={!canFinishMatch}
          loading={submitting}
        >
          Submit Match Score
        </Button>
      </Group>
    </Stack>
  );
}