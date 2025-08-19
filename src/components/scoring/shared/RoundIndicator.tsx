'use client'

import { Group, Text, Progress, Badge, Stack } from '@mantine/core';
import { IconTarget } from '@tabler/icons-react';

interface RoundIndicatorProps {
  currentRound: number;
  maxRounds: number;
  team1Rounds: number;
  team2Rounds: number;
  team1Name?: string;
  team2Name?: string;
  formatLabel?: string;
}

export function RoundIndicator({
  currentRound,
  maxRounds,
  team1Rounds,
  team2Rounds,
  team1Name = 'Team 1',
  team2Name = 'Team 2',
  formatLabel
}: RoundIndicatorProps) {
  
  const totalRounds = team1Rounds + team2Rounds;
  const progressPercentage = maxRounds > 0 ? (totalRounds / maxRounds) * 100 : 0;

  // Determine if match is complete
  const isComplete = team1Rounds > maxRounds / 2 || team2Rounds > maxRounds / 2;
  const winner = team1Rounds > team2Rounds ? team1Name : team2Rounds > team1Rounds ? team2Name : null;

  return (
    <Stack gap="sm">
      <Group justify="space-between" align="center">
        <Group gap="xs">
          <IconTarget size={16} />
          <Text fw={600} size="sm">Round Progress</Text>
          {formatLabel && (
            <Badge size="xs" variant="light">{formatLabel}</Badge>
          )}
        </Group>
        
        <Text size="sm" c="dimmed">
          Round {Math.min(currentRound, maxRounds)} of {maxRounds}
        </Text>
      </Group>

      {/* Round Progress Bar */}
      <Progress
        value={progressPercentage}
        size="lg"
        radius="md"
        striped={!isComplete}
        animate={!isComplete}
        color={isComplete ? 'green' : 'blue'}
      />

      {/* Team Scores */}
      <Group justify="space-between">
        <Group gap="xs">
          <Text size="sm" fw={600}>{team1Name}:</Text>
          <Badge 
            color={team1Rounds > team2Rounds ? 'green' : 'gray'}
            variant={team1Rounds > team2Rounds ? 'filled' : 'light'}
          >
            {team1Rounds}
          </Badge>
        </Group>

        <Group gap="xs">
          <Text size="sm" fw={600}>{team2Name}:</Text>
          <Badge 
            color={team2Rounds > team1Rounds ? 'green' : 'gray'}
            variant={team2Rounds > team1Rounds ? 'filled' : 'light'}
          >
            {team2Rounds}
          </Badge>
        </Group>
      </Group>

      {/* Winner Display */}
      {isComplete && winner && (
        <Text size="sm" ta="center" fw={600} c="green">
          🏆 {winner} wins the match!
        </Text>
      )}
    </Stack>
  );
}