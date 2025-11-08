'use client'

import { Text, Stack, Card, Group, Badge, Button } from '@mantine/core';
import type { GameWithIcon, TournamentFormData } from './useTournamentForm';

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
