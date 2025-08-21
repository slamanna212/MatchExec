'use client'

import { useState, useEffect } from 'react';
import { 
  Card, 
  Stack, 
  Group, 
  Text, 
  Badge, 
  Divider, 
  Button,
  Alert,
  Loader
} from '@mantine/core';
import { IconTrophy, IconEdit, IconClock, IconAlertCircle } from '@tabler/icons-react';
import { MatchResult } from '@/shared/types';

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
  const [result, setResult] = useState<MatchResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchResult = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/matches/${matchId}/games/${gameId}/result`);
        
        if (response.status === 404) {
          setResult(null);
          return;
        }
        
        if (!response.ok) {
          throw new Error('Failed to load result');
        }
        
        const resultData = await response.json();
        setResult(resultData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load result');
      } finally {
        setLoading(false);
      }
    };

    fetchResult();
  }, [matchId, gameId]);

  if (loading) {
    return (
      <Card withBorder p="sm">
        <Group justify="center">
          <Loader size="sm" />
          <Text size="sm">Loading result...</Text>
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

  if (!result) {
    return (
      <Card withBorder p="sm" style={{ backgroundColor: 'var(--mantine-color-gray-0)' }}>
        <Text size="sm" c="dimmed" ta="center">No result available</Text>
      </Card>
    );
  }

  const getWinnerDisplay = () => {
    return {
      text: result.winner === 'team1' ? 'Blue Team Wins' : 'Red Team Wins',
      color: result.winner === 'team1' ? 'blue' : 'red'
    };
  };

  const winner = getWinnerDisplay();

  return (
    <Card withBorder p="md">
      <Stack gap="sm">
        {/* Header */}
        <Group justify="space-between" align="flex-start">
          <Group gap="sm">
            <IconTrophy size={20} color="gold" />
            <div>
              <Text fw={600} size="sm">Match Result</Text>
              <Badge size="sm" color={winner.color} variant="filled" mt={4}>
                {winner.text}
              </Badge>
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

        {/* Completion Time */}
        <Group justify="flex-end" mt="sm">
          <Group gap={4}>
            <IconClock size={12} />
            <Text size="xs" c="dimmed">
              {new Date(result.completedAt).toLocaleString()}
            </Text>
          </Group>
        </Group>
      </Stack>
    </Card>
  );
}