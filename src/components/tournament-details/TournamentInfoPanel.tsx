'use client'

import type { JSX } from 'react';
import {
  Stack,
  Group,
  Avatar,
  Text,
  Button,
  Card,
  Badge,
  Image,
  Divider
} from '@mantine/core';
import { modals } from '@mantine/modals';
import type { TournamentWithGameDetails } from '@/shared/types';
import { StageRing } from '../StageRing';
import { SeriesMembershipRow } from '../series/SeriesMembershipRow';

// Use shared type as local alias
type TournamentWithGame = TournamentWithGameDetails;

interface TournamentInfoPanelProps {
  tournament: TournamentWithGame;
  hasBracket: boolean;
  parseDbTimestamp: (timestamp: string | null | undefined) => Date | null;
  onAssignTeams: () => void;
  onDelete: () => void;
  onEdit: () => void;
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
  onEdit,
  onStatusTransition,
  onGenerateBracket,
  onProgressTournament
}: TournamentInfoPanelProps): JSX.Element {
  const showActions = tournament.status !== 'complete' && tournament.status !== 'cancelled';

  const confirmCloseSignups = () => {
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
  };

  const confirmNextRound = () => {
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
  };

  const confirmEndTournament = () => {
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
  };

  /** Primary (filled, full-width) next-step action for the current status. */
  const getPrimaryAction = (): { label: string; onClick: () => void } | null => {
    switch (tournament.status) {
      case 'created': return { label: 'Open Signups', onClick: () => onStatusTransition('gather') };
      case 'gather': return { label: 'Close Signups', onClick: confirmCloseSignups };
      case 'assign': return hasBracket
        ? { label: 'Start Tournament', onClick: () => onStatusTransition('battle') }
        : { label: 'Generate Bracket', onClick: () => { void onGenerateBracket(); } };
      case 'battle': return { label: 'Next Round', onClick: confirmNextRound };
      default: return null;
    }
  };

  const primary = getPrimaryAction();
  const showAssignTeams = tournament.status === 'gather' || tournament.status === 'assign';
  const showEnd = tournament.status === 'battle';
  // Deleting a running tournament isn't offered here (unchanged from the previous layout).
  const showDelete = tournament.status !== 'battle';

  const formatLabel = (() => {
    switch (tournament.format) {
      case 'single-elimination': return 'Single Elimination';
      case 'double-elimination': return 'Double Elimination';
      case 'cumulative-points': return 'Cumulative Points';
      default: return tournament.format;
    }
  })();

  return (
    <div style={{ position: 'sticky', top: 20 }}>
      <Stack gap="md">
        {/* Card 1: Header */}
        <Card withBorder radius="md" padding="lg" shadow="sm">
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
        <Card withBorder radius="md" padding="lg" shadow="sm">
          <Stack gap="sm">
            <Group justify="space-between">
              <Text size="sm" fw={500} c="dimmed">Format:</Text>
              <Badge variant="light">{formatLabel}</Badge>
            </Group>

            <SeriesMembershipRow kind="tournament" id={tournament.id} />

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

            <Group justify="space-between">
              <Text size="sm" fw={500} c="dimmed">Stats Collection:</Text>
              <Badge variant="light" color={tournament.stats_enabled === 1 ? 'green' : 'gray'}>
                {tournament.stats_enabled === 1 ? 'Enabled' : 'Disabled'}
              </Badge>
            </Group>
          </Stack>
        </Card>

        {/* Card 3: Actions (MatchActionsCard structure) */}
        {showActions && (
          <Card withBorder radius="md" padding="lg" shadow="sm">
            <Stack gap="xs">
              {primary && (
                <Button variant="filled" color="violet" fullWidth onClick={primary.onClick}>
                  {primary.label}
                </Button>
              )}
              <Group grow gap="xs">
                {showAssignTeams && (
                  <Button size="sm" variant="light" color="violet" onClick={onAssignTeams}>Assign Teams</Button>
                )}
                <Button size="sm" variant="light" color="violet" onClick={onEdit}>Edit Tournament</Button>
                {showEnd && (
                  <Button size="sm" variant="light" color="red" onClick={confirmEndTournament}>End Tournament</Button>
                )}
              </Group>
              {showDelete && (
                <>
                  <Divider />
                  <Button variant="subtle" color="red" fullWidth size="sm" onClick={onDelete}>
                    Delete Tournament
                  </Button>
                </>
              )}
            </Stack>
          </Card>
        )}
      </Stack>
    </div>
  );
}
