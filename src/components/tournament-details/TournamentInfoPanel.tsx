'use client'

import {
  Stack,
  Group,
  Avatar,
  Text,
  Button,
  Card,
  Badge,
  Image
} from '@mantine/core';
import { modals } from '@mantine/modals';
import type { Tournament } from '@/shared/types';
import { StageRing } from '../StageRing';

interface TournamentWithGame extends Omit<Tournament, 'created_at' | 'updated_at' | 'start_date' | 'start_time'> {
  game_name?: string;
  game_icon?: string;
  game_color?: string;
  participant_count?: number;
  event_image_url?: string;
  created_at: string;
  updated_at: string;
  start_time?: string;
}

interface TournamentInfoPanelProps {
  tournament: TournamentWithGame;
  hasBracket: boolean;
  parseDbTimestamp: (timestamp: string | null | undefined) => Date | null;
  onAssignTeams: () => void;
  onDelete: () => void;
  onStatusTransition: (newStatus: string) => void;
  onGenerateBracket: () => Promise<void>;
  onProgressTournament: () => Promise<void>;
}

export function TournamentInfoPanel({
  tournament,
  hasBracket,
  parseDbTimestamp,
  onAssignTeams,
  onDelete,
  onStatusTransition,
  onGenerateBracket,
  onProgressTournament
}: TournamentInfoPanelProps) {
  const showActions = tournament.status !== 'complete' && tournament.status !== 'cancelled';

  const getActionButtons = () => {
    switch (tournament.status) {
      case 'created':
        return (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
            <Button
              variant="light"
              color="blue"
              fullWidth
              onClick={() => onStatusTransition('gather')}
            >
              Open Signups
            </Button>
            <Button
              color="red"
              variant="light"
              fullWidth
              onClick={onDelete}
            >
              Delete Tournament
            </Button>
          </div>
        );
      case 'gather':
        return (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
            <Button
              variant="light"
              fullWidth
              onClick={onAssignTeams}
            >
              Assign Teams
            </Button>
            <Button
              variant="light"
              color="orange"
              fullWidth
              onClick={() => {
                modals.openConfirmModal({
                  title: 'Close Signups',
                  children: (
                    <Text size="sm">
                      Are you sure you want to close signups for &quot;{tournament.name}&quot;? This will prevent new participants from joining.
                    </Text>
                  ),
                  labels: { confirm: 'Close Signups', cancel: 'Cancel' },
                  confirmProps: { color: 'orange' },
                  onConfirm: () => onStatusTransition('assign'),
                });
              }}
            >
              Close Signups
            </Button>
            <Button
              color="red"
              variant="light"
              fullWidth
              onClick={onDelete}
            >
              Delete Tournament
            </Button>
          </div>
        );
      case 'assign':
        return (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
            <Button
              variant="light"
              fullWidth
              onClick={onAssignTeams}
            >
              Assign Teams
            </Button>
            {hasBracket ? (
              <Button
                variant="light"
                color="green"
                fullWidth
                onClick={() => onStatusTransition('battle')}
              >
                Start Tournament
              </Button>
            ) : (
              <Button
                variant="light"
                color="blue"
                fullWidth
                onClick={onGenerateBracket}
              >
                Generate Bracket
              </Button>
            )}
            <Button
              color="red"
              variant="light"
              fullWidth
              onClick={onDelete}
            >
              Delete Tournament
            </Button>
          </div>
        );
      case 'battle':
        return (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
            <Button
              variant="light"
              color="green"
              fullWidth
              onClick={() => {
                modals.openConfirmModal({
                  title: 'Next Round',
                  children: (
                    <Text size="sm">
                      Are you sure you want to advance to the next round? This will progress the tournament to the next set of matches.
                    </Text>
                  ),
                  labels: { confirm: 'Next Round', cancel: 'Cancel' },
                  confirmProps: { color: 'green' },
                  onConfirm: () => { void onProgressTournament(); },
                });
              }}
            >
              Next Round
            </Button>
            <Button
              variant="light"
              color="red"
              fullWidth
              onClick={() => {
                modals.openConfirmModal({
                  title: 'End Tournament',
                  children: (
                    <Text size="sm">
                      Are you sure you want to end &quot;{tournament.name}&quot;? This will mark the tournament as complete.
                    </Text>
                  ),
                  labels: { confirm: 'End Tournament', cancel: 'Cancel' },
                  confirmProps: { color: 'red' },
                  onConfirm: () => onStatusTransition('complete'),
                });
              }}
            >
              End Tournament
            </Button>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div style={{ position: 'sticky', top: 20 }}>
      <Stack gap="md">
        {/* Card 1: Header */}
        <Card withBorder padding="lg" shadow="sm">
          <Stack gap="md">
            <Group>
              <Avatar
                src={tournament.game_icon}
                alt={tournament.game_name}
                size="lg"
              />
              <Stack gap="xs" style={{ flex: 1 }}>
                <Text size="xl" fw={600}>{tournament.name}</Text>
                <Text size="md" c="dimmed">{tournament.game_name}</Text>
              </Stack>
              <StageRing status={tournament.status} gameColor={tournament.game_color} type="tournament" size={60} thickness={6} />
            </Group>

            {tournament.description && (
              <div>
                <Text size="sm" fw={500} c="dimmed">Description:</Text>
                <Text size="sm">{tournament.description}</Text>
              </div>
            )}

            {tournament.event_image_url && (
              <Image
                src={tournament.event_image_url}
                alt={tournament.name}
                radius="md"
                fit="cover"
                h={200}
              />
            )}
          </Stack>
        </Card>

        {/* Card 2: Details */}
        <Card withBorder padding="lg" shadow="sm">
          <Stack gap="sm">
            <Group justify="space-between">
              <Text size="sm" fw={500} c="dimmed">Format:</Text>
              <Badge variant="light">
                {tournament.format === 'single-elimination' ? 'Single Elimination' : 'Double Elimination'}
              </Badge>
            </Group>

            <Group justify="space-between">
              <Text size="sm" fw={500} c="dimmed">Rounds/Match:</Text>
              <Text size="sm">{tournament.rounds_per_match}</Text>
            </Group>

            <Group justify="space-between">
              <Text size="sm" fw={500} c="dimmed">Participants:</Text>
              <Text size="sm">
                {tournament.participant_count || 0}
                {tournament.max_participants ? ` / ${tournament.max_participants}` : ''}
              </Text>
            </Group>

            {tournament.start_time && (
              <Group justify="space-between">
                <Text size="sm" fw={500} c="dimmed">Start Date:</Text>
                <Text size="sm">
                  {parseDbTimestamp(tournament.start_time)?.toLocaleString('en-US', {
                    year: 'numeric',
                    month: 'numeric',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true
                  }) || 'N/A'}
                </Text>
              </Group>
            )}

            <Group justify="space-between">
              <Text size="sm" fw={500} c="dimmed">Created:</Text>
              <Text size="sm">
                {parseDbTimestamp(tournament.created_at)?.toLocaleString('en-US', {
                  year: 'numeric',
                  month: 'numeric',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                  hour12: true
                }) || 'N/A'}
              </Text>
            </Group>

            {tournament.status === 'complete' && (
              <Group justify="space-between">
                <Text size="sm" fw={500} c="dimmed">Completed:</Text>
                <Text size="sm">
                  {parseDbTimestamp(tournament.updated_at)?.toLocaleString('en-US', {
                    year: 'numeric',
                    month: 'numeric',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true
                  }) || 'N/A'}
                </Text>
              </Group>
            )}
          </Stack>
        </Card>

        {/* Card 3: Action Buttons */}
        {showActions && (
          <Card withBorder padding="lg" shadow="sm">
            {getActionButtons()}
          </Card>
        )}
      </Stack>
    </div>
  );
}
