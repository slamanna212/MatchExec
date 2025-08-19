'use client'

import { useState, useEffect } from 'react';
import { 
  Card, 
  Stack, 
  Group, 
  Text, 
  Badge, 
  Divider, 
  Progress,
  Button,
  Alert,
  Loader
} from '@mantine/core';
import { IconTrophy, IconEdit, IconClock, IconTarget, IconAlertCircle } from '@tabler/icons-react';
import { 
  MatchScore, 
  RoundsScore, 
  ObjectiveScore, 
  PointsScore, 
  DeathmatchScore, 
  VehicleScore, 
  CustomScore 
} from '@/shared/types';
import { FormatBadge } from './shared/FormatBadge';

interface ScoreDisplayProps {
  matchId: string;
  gameId: string;
  onEdit?: () => void;
  showEditButton?: boolean;
}

export function ScoreDisplay({
  matchId,
  gameId,
  onEdit,
  showEditButton = false
}: ScoreDisplayProps) {
  const [score, setScore] = useState<MatchScore | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchScore = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/matches/${matchId}/games/${gameId}/score`);
        
        if (response.status === 404) {
          setScore(null);
          return;
        }
        
        if (!response.ok) {
          throw new Error('Failed to load score');
        }
        
        const scoreData = await response.json();
        setScore(scoreData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load score');
      } finally {
        setLoading(false);
      }
    };

    fetchScore();
  }, [matchId, gameId]);

  if (loading) {
    return (
      <Card withBorder p="sm">
        <Group justify="center">
          <Loader size="sm" />
          <Text size="sm">Loading score...</Text>
        </Group>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert icon={<IconAlertCircle size={16} />} color="red">
        {error}
      </Alert>
    );
  }

  if (!score) {
    return (
      <Card withBorder p="sm" style={{ backgroundColor: 'var(--mantine-color-gray-0)' }}>
        <Text size="sm" c="dimmed" ta="center">No score available</Text>
      </Card>
    );
  }

  const renderScoreContent = () => {
    switch (score.scoringType) {
      case 'rounds':
        return <RoundsDisplay score={score as RoundsScore} />;
      case 'objective':
        return <ObjectiveDisplay score={score as ObjectiveScore} />;
      case 'points':
        return <PointsDisplay score={score as PointsScore} />;
      case 'deathmatch':
        return <DeathmatchDisplay score={score as DeathmatchScore} />;
      case 'vehicle':
        return <VehicleDisplay score={score as VehicleScore} />;
      case 'custom':
        return <CustomDisplay score={score as CustomScore} />;
      default:
        return <Text size="sm">Unknown scoring type</Text>;
    }
  };

  const getWinnerDisplay = () => {
    if (score.winner === 'draw') {
      return { text: 'Draw', color: 'gray' };
    }
    return {
      text: score.winner === 'team1' ? 'Red Team Wins' : 'Blue Team Wins',
      color: score.winner === 'team1' ? 'red' : 'blue'
    };
  };

  const winner = getWinnerDisplay();

  return (
    <Card withBorder p="md">
      <Stack gap="sm">
        {/* Header */}
        <Group justify="space-between" align="flex-start">
          <Group gap="sm">
            <IconTrophy size={20} color={winner.color === 'gray' ? 'gray' : 'gold'} />
            <div>
              <Text fw={600} size="sm">Match Score</Text>
              <Group gap="xs" mt={2}>
                <FormatBadge format={score.format} size="xs" />
                <Badge size="xs" color={winner.color} variant="filled">
                  {winner.text}
                </Badge>
              </Group>
            </div>
          </Group>
          
          {showEditButton && onEdit && (
            <Button
              size="xs"
              variant="light"
              leftSection={<IconEdit size={14} />}
              onClick={onEdit}
            >
              Edit
            </Button>
          )}
        </Group>

        <Divider />

        {/* Score Content */}
        {renderScoreContent()}

        {/* Completion Time */}
        <Group justify="flex-end" mt="xs">
          <Group gap={4}>
            <IconClock size={12} />
            <Text size="xs" c="dimmed">
              {new Date(score.completedAt).toLocaleString()}
            </Text>
          </Group>
        </Group>
      </Stack>
    </Card>
  );
}

function RoundsDisplay({ score }: { score: RoundsScore }) {
  return (
    <Stack gap="sm">
      <Group justify="space-between">
        <Text size="sm" fw={600}>Round Score</Text>
        <Text size="sm" fw={600}>
          {score.team1Rounds} - {score.team2Rounds}
        </Text>
      </Group>

      {/* Round Progress */}
      <Group gap="xs" align="center">
        <Text size="xs" c="dimmed">Progress:</Text>
        <Progress 
          value={(score.team1Rounds + score.team2Rounds) / score.maxRounds * 100}
          size="sm"
          style={{ flex: 1 }}
          color="blue"
        />
        <Text size="xs" c="dimmed">
          {score.team1Rounds + score.team2Rounds} / {score.maxRounds}
        </Text>
      </Group>

      {/* Round History (if available and not too many) */}
      {score.rounds && score.rounds.length <= 7 && (
        <Stack gap={2}>
          <Text size="xs" fw={600} c="dimmed">Round History:</Text>
          {score.rounds.map((round, index) => (
            <Group key={index} justify="space-between" p={4} style={{ backgroundColor: 'var(--mantine-color-gray-0)', borderRadius: '4px' }}>
              <Text size="xs">Round {round.round}</Text>
              <Text size="xs" c={round.winner === 'team1' ? 'red' : 'blue'}>
                {round.winner === 'team1' ? 'Red Team' : 'Blue Team'}
              </Text>
            </Group>
          ))}
        </Stack>
      )}
    </Stack>
  );
}

function ObjectiveDisplay({ score }: { score: ObjectiveScore }) {
  return (
    <Stack gap="sm">
      <Group justify="space-between">
        <Text size="sm" fw={600}>Distance Progress</Text>
        <Text size="sm" fw={600}>
          {score.team1Distance.toFixed(1)}m vs {score.team2Distance.toFixed(1)}m
        </Text>
      </Group>

      {/* Progress bars */}
      <Stack gap="xs">
        <div>
          <Group justify="space-between" mb={2}>
            <Text size="xs" c="red">Red Team</Text>
            <Text size="xs">{score.team1Distance.toFixed(1)}m</Text>
          </Group>
          <Progress value={(score.team1Distance / Math.max(score.team1Distance, score.team2Distance, 100)) * 100} color="red" size="sm" />
        </div>
        
        <div>
          <Group justify="space-between" mb={2}>
            <Text size="xs" c="blue">Blue Team</Text>
            <Text size="xs">{score.team2Distance.toFixed(1)}m</Text>
          </Group>
          <Progress value={(score.team2Distance / Math.max(score.team1Distance, score.team2Distance, 100)) * 100} color="blue" size="sm" />
        </div>
      </Stack>

      {/* Checkpoints */}
      <Group justify="space-between">
        <Text size="xs" c="dimmed">Checkpoints:</Text>
        <Text size="xs">
          Red Team: {score.checkpointsReached.team1} | Blue Team: {score.checkpointsReached.team2}
        </Text>
      </Group>
    </Stack>
  );
}

function PointsDisplay({ score }: { score: PointsScore }) {
  return (
    <Stack gap="sm">
      <Group justify="space-between">
        <Text size="sm" fw={600}>Points Scored</Text>
        <Text size="sm" fw={600}>
          {score.team1Points} - {score.team2Points}
        </Text>
      </Group>

      <Group justify="space-between">
        <Text size="xs" c="dimmed">Target:</Text>
        <Text size="xs">{score.targetPoints} points</Text>
      </Group>

      {/* Progress bars */}
      <Stack gap="xs">
        <div>
          <Group justify="space-between" mb={2}>
            <Text size="xs" c="red">Red Team</Text>
            <Text size="xs">{score.team1Points}/{score.targetPoints}</Text>
          </Group>
          <Progress value={(score.team1Points / score.targetPoints) * 100} color="red" size="sm" />
        </div>
        
        <div>
          <Group justify="space-between" mb={2}>
            <Text size="xs" c="blue">Blue Team</Text>
            <Text size="xs">{score.team2Points}/{score.targetPoints}</Text>
          </Group>
          <Progress value={(score.team2Points / score.targetPoints) * 100} color="blue" size="sm" />
        </div>
      </Stack>
    </Stack>
  );
}

function DeathmatchDisplay({ score }: { score: DeathmatchScore }) {
  return (
    <Stack gap="sm">
      <Group justify="space-between">
        <Text size="sm" fw={600}>Eliminations</Text>
        <Text size="sm" fw={600}>
          {score.team1Eliminations} - {score.team2Eliminations}
        </Text>
      </Group>

      <Group justify="space-between">
        <Text size="xs" c="dimmed">Target:</Text>
        <Text size="xs">{score.targetEliminations} eliminations</Text>
      </Group>

      {score.mvpPlayer && (
        <Group justify="space-between">
          <Text size="xs" c="dimmed">MVP:</Text>
          <Text size="xs" fw={600}>{score.mvpPlayer}</Text>
        </Group>
      )}
    </Stack>
  );
}

function VehicleDisplay({ score }: { score: VehicleScore }) {
  return (
    <Stack gap="sm">
      <Group justify="space-between">
        <Text size="sm" fw={600}>Vehicle Progress</Text>
        <Text size="sm" fw={600}>
          {score.team1Progress}% vs {score.team2Progress}%
        </Text>
      </Group>

      {/* Progress bars */}
      <Stack gap="xs">
        <div>
          <Group justify="space-between" mb={2}>
            <Text size="xs" c="red">Red Team</Text>
            <Text size="xs">{score.team1Progress}%</Text>
          </Group>
          <Progress value={score.team1Progress} color="red" size="sm" />
        </div>
        
        <div>
          <Group justify="space-between" mb={2}>
            <Text size="xs" c="blue">Blue Team</Text>
            <Text size="xs">{score.team2Progress}%</Text>
          </Group>
          <Progress value={score.team2Progress} color="blue" size="sm" />
        </div>
      </Stack>

      {/* Checkpoints */}
      <Group justify="space-between">
        <Text size="xs" c="dimmed">Checkpoints:</Text>
        <Text size="xs">
          Red Team: {score.checkpointsReached.team1} | Blue Team: {score.checkpointsReached.team2}
        </Text>
      </Group>
    </Stack>
  );
}

function CustomDisplay({ score }: { score: CustomScore }) {
  return (
    <Stack gap="sm">
      <Text size="sm" fw={600}>Custom Scoring</Text>
      <Text size="xs" c="dimmed">
        Custom scoring rules were used for this match.
      </Text>
    </Stack>
  );
}