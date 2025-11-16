'use client'

import { Text, Stack, Card, Group, Badge, Button } from '@mantine/core';
import { useEffect, useState } from 'react';
import type { GameWithIcon, TournamentFormData } from './useTournamentForm';

interface GameMode {
  id: string;
  name: string;
  team_size: number | null;
  max_players: number;
}

interface TournamentReviewStepProps {
  formData: Partial<TournamentFormData>;
  games: GameWithIcon[];
  onBack: () => void;
  onCreate: (startSignups: boolean) => void;
  canProceed: boolean;
}

export function TournamentReviewStep({
  formData,
  games,
  onBack,
  onCreate,
  canProceed
}: TournamentReviewStepProps) {
  const [gameMode, setGameMode] = useState<GameMode | null>(null);

  // Fetch game mode details
  useEffect(() => {
    if (!formData.gameId || !formData.gameModeId) {
      return;
    }

    const fetchGameMode = async () => {
      try {
        const response = await fetch(`/api/games/${formData.gameId}/modes`);
        if (!response.ok) {
          return;
        }

        const modes = await response.json();
        const selectedMode = modes.find((m: GameMode) => m.id === formData.gameModeId);
        setGameMode(selectedMode || null);
      } catch {
        // Silently fail - game mode display is optional
      }
    };

    void fetchGameMode();
  }, [formData.gameId, formData.gameModeId]);

  const formatGameMode = (mode: GameMode, gameId?: string): string => {
    // For OW2, handle special mode IDs
    if (gameId === 'overwatch2' && formData.gameModeId?.startsWith('ow2-')) {
      return formData.gameModeId === 'ow2-5v5' ? '5v5' : '6v6';
    }

    if (mode.team_size === null) {
      return mode.max_players ? `${mode.max_players} players (FFA)` : 'FFA';
    }
    return `${mode.team_size}v${mode.team_size}`;
  };

  return (
    <Stack>
      <Text mb="md">Review tournament details:</Text>

      <Card withBorder>
        <Stack gap="md">
          <Group>
            <Text fw={500}>Tournament Name:</Text>
            <Text>{formData.name}</Text>
          </Group>

          {formData.description && (
            <Group>
              <Text fw={500}>Description:</Text>
              <Text>{formData.description}</Text>
            </Group>
          )}

          <Group>
            <Text fw={500}>Game:</Text>
            <Text>{games.find(g => g.id === formData.gameId)?.name}</Text>
          </Group>

          {gameMode && (
            <Group>
              <Text fw={500}>Team Size:</Text>
              <Text>{formatGameMode(gameMode, formData.gameId)}</Text>
            </Group>
          )}

          <Group>
            <Text fw={500}>Format:</Text>
            <Badge variant="light">
              {formData.format === 'single-elimination' ? 'Single Elimination' : 'Double Elimination'}
            </Badge>
          </Group>

          <Group>
            <Text fw={500}>Rounds per Match:</Text>
            <Text>{formData.roundsPerMatch}</Text>
          </Group>

          <Group>
            <Text fw={500}>Ruleset:</Text>
            <Badge variant="light" tt="capitalize">{formData.ruleset}</Badge>
          </Group>

          {formData.maxParticipants && (
            <Group>
              <Text fw={500}>Max Participants:</Text>
              <Text>{formData.maxParticipants}</Text>
            </Group>
          )}

          {formData.date && formData.time && (
            <Group>
              <Text fw={500}>Start:</Text>
              <Text>{new Date(`${formData.date}T${formData.time}`).toLocaleString()}</Text>
            </Group>
          )}

          {formData.preCreatedTeams && formData.preCreatedTeams.length > 0 && (
            <div>
              <Text fw={500} mb="xs">Pre-Created Teams:</Text>
              <Group gap="xs">
                {formData.preCreatedTeams.map((teamName, index) => (
                  <Badge key={index} variant="light" size="lg">
                    {teamName}
                  </Badge>
                ))}
              </Group>
            </div>
          )}
        </Stack>
      </Card>

      <Group justify="space-between" mt="md" align="center">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Group align="center" gap="md">
          <Button
            variant="outline"
            onClick={() => onCreate(false)}
            disabled={!canProceed}
          >
            Create Tournament
          </Button>
          <Button
            onClick={() => onCreate(true)}
            disabled={!canProceed}
          >
            Create & Open Signups
          </Button>
        </Group>
      </Group>
    </Stack>
  );
}
