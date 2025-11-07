/**
 * Winner selection component for different scoring modes
 */

import { Stack, Group, Button, Text, Alert } from '@mantine/core';
import { IconTrophy, IconSwords } from '@tabler/icons-react';

interface WinnerSelectionProps {
  mode: 'Normal' | 'FFA' | 'Position' | undefined;
  participants: Array<{ id: string; username: string }>;
  team1Name: string | null;
  team2Name: string | null;
  onTeamWin: (teamId: 'team1' | 'team2') => void;
  onParticipantWin: (participantId: string) => void;
  submitting: boolean;
}

export function WinnerSelection({
  mode,
  participants,
  team1Name,
  team2Name,
  onTeamWin,
  onParticipantWin,
  submitting
}: WinnerSelectionProps) {
  // Position mode alert
  if (mode === 'Position') {
    return (
      <Alert color="blue" icon={<IconTrophy size={16} />}>
        This mode uses position-based scoring. Please close this dialog and use the Position Scoring interface instead.
      </Alert>
    );
  }

  // FFA mode - select winner from participants
  if (mode === 'FFA') {
    return (
      <>
        <Text size="sm" c="dimmed" ta="center">
          <IconTrophy size={16} style={{ marginRight: 8 }} />
          Select the winner of this Free-For-All match:
        </Text>

        <Stack gap="sm" align="center">
          {participants.map((participant) => (
            <Button
              key={participant.id}
              size="md"
              color="violet"
              variant="outline"
              onClick={() => onParticipantWin(participant.id)}
              disabled={submitting}
              loading={submitting}
              leftSection={<IconTrophy size={18} />}
              style={{ minWidth: 200 }}
            >
              {participant.username} Wins
            </Button>
          ))}
        </Stack>
      </>
    );
  }

  // Normal mode - team winner selection
  return (
    <>
      <Text size="sm" c="dimmed" ta="center">
        <IconSwords size={16} style={{ marginRight: 8 }} />
        Who won this map?
      </Text>

      <Group justify="center" gap="xl">
        <Button
          size="lg"
          color="blue"
          variant="outline"
          onClick={() => onTeamWin('team1')}
          disabled={submitting}
          loading={submitting}
          leftSection={<IconTrophy size={20} />}
        >
          {team1Name || 'Blue Team'} Wins
        </Button>

        <Button
          size="lg"
          color="red"
          variant="outline"
          onClick={() => onTeamWin('team2')}
          disabled={submitting}
          loading={submitting}
          leftSection={<IconTrophy size={20} />}
        >
          {team2Name || 'Red Team'} Wins
        </Button>
      </Group>
    </>
  );
}
