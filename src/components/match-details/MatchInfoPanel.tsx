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
  Divider,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { useRouter } from 'next/navigation';
import type { MatchWithGameDetails, MatchGameResult } from '@/shared/types';
import { StageRing } from '../StageRing';

// Use MatchWithGame as a local alias for the shared type
type MatchWithGame = MatchWithGameDetails;

interface MatchInfoPanelProps {
  match: MatchWithGame;
  mapDetails: {[key: string]: {name: string, imageUrl?: string, modeName?: string, location?: string, note?: string}};
  mapNotes: {[key: string]: string};
  matchGames?: MatchGameResult[];
  gamesLoading?: boolean;
  formatMapName: (mapId: string) => string;
  parseDbTimestamp: (timestamp: string | null | undefined) => Date | null;

  // Feature flags
  showActions?: boolean;
  isHistory?: boolean;

  // Action callbacks
  onAssignPlayers?: () => void;
  onDelete?: () => void;
  onEdit?: () => void;
  onStatusTransition?: (newStatus: string, force?: boolean) => void;
}

const DATE_FORMAT: Intl.DateTimeFormatOptions = {
  year: 'numeric', month: 'numeric', day: 'numeric',
  hour: 'numeric', minute: '2-digit', hour12: true
};

function formatTs(parseDbTimestamp: (ts: string | null | undefined) => Date | null, ts: string | null | undefined): string {
  return parseDbTimestamp(ts)?.toLocaleString('en-US', DATE_FORMAT) ?? 'N/A';
}

function getStatusTransitionButton(
  match: MatchWithGame,
  isHistory: boolean,
  onStatusTransition?: (newStatus: string) => void
): React.ReactNode {
  if (isHistory || !onStatusTransition) return null;
  switch (match.status) {
    case 'created':
      return <Button variant="filled" color="violet" fullWidth onClick={() => onStatusTransition('gather')}>Start Signups</Button>;
    case 'gather':
      return <Button variant="light" color="orange" fullWidth onClick={() => onStatusTransition('assign')}>Close Signups</Button>;
    case 'assign':
      return <Button variant="filled" color="violet" fullWidth onClick={() => onStatusTransition('battle')}>Start Match</Button>;
    case 'battle':
      return <Button variant="light" color="red" fullWidth onClick={() => onStatusTransition('complete')}>End Match</Button>;
    default:
      return null;
  }
}

function MatchDetailsCard({
  match,
  parseDbTimestamp
}: {
  match: MatchWithGame;
  parseDbTimestamp: (timestamp: string | null | undefined) => Date | null;
}) {
  const startDateDisplay = match.start_date ? formatTs(parseDbTimestamp, match.start_date) : null;
  const completedDisplay = match.status === 'complete' ? formatTs(parseDbTimestamp, match.updated_at) : null;

  return (
    <Card withBorder padding="lg" shadow="sm">
      <Stack gap="sm">
        {match.rules && (
          <Group justify="space-between">
            <Text size="sm" fw={500} c="dimmed">Rules:</Text>
            <Text size="sm" tt="capitalize">{match.rules}</Text>
          </Group>
        )}
        {match.rounds && (
          <Group justify="space-between">
            <Text size="sm" fw={500} c="dimmed">Rounds:</Text>
            <Text size="sm">{match.rounds}</Text>
          </Group>
        )}
        <Group justify="space-between">
          <Text size="sm" fw={500} c="dimmed">Player Notifications:</Text>
          <Badge variant="light" color={match.player_notifications !== 0 ? 'green' : 'gray'}>
            {match.player_notifications !== 0 ? 'Enabled' : 'Disabled'}
          </Badge>
        </Group>
        <Group justify="space-between">
          <Text size="sm" fw={500} c="dimmed">Stats Collection:</Text>
          <Badge variant="light" color={match.stats_enabled === 1 ? 'green' : 'gray'}>
            {match.stats_enabled === 1 ? 'Enabled' : 'Disabled'}
          </Badge>
        </Group>
        {match.livestream_link && (
          <Group justify="space-between">
            <Text size="sm" fw={500} c="dimmed">Livestream:</Text>
            <Text size="sm" component="a" href={match.livestream_link} target="_blank">View Stream</Text>
          </Group>
        )}
        <Group justify="space-between">
          <Text size="sm" fw={500} c="dimmed">Max Participants:</Text>
          <Text size="sm">{match.max_participants}</Text>
        </Group>
        <Group justify="space-between">
          <Text size="sm" fw={500} c="dimmed">Created:</Text>
          <Text size="sm">{formatTs(parseDbTimestamp, match.created_at)}</Text>
        </Group>
        {startDateDisplay && (
          <Group justify="space-between">
            <Text size="sm" fw={500} c="dimmed">Start Date:</Text>
            <Text size="sm">{startDateDisplay}</Text>
          </Group>
        )}
        {completedDisplay && (
          <Group justify="space-between">
            <Text size="sm" fw={500} c="dimmed">Completed:</Text>
            <Text size="sm">{completedDisplay}</Text>
          </Group>
        )}
      </Stack>
    </Card>
  );
}

const ASSIGN_STATUSES = new Set(['gather', 'assign', 'battle']);
const NON_EDIT_STATUSES = new Set(['battle', 'complete', 'cancelled']);

function MatchActionsCard({
  match,
  matchGames,
  isHistory,
  onAssignPlayers,
  onDelete,
  onEdit,
  onStatusTransition,
}: {
  match: MatchWithGame;
  matchGames?: MatchGameResult[];
  isHistory: boolean;
  onAssignPlayers?: () => void;
  onDelete?: () => void;
  onEdit?: () => void;
  onStatusTransition?: (newStatus: string, force?: boolean) => void;
}) {
  const router = useRouter();
  const matchInBattle = match.status === 'battle';
  const ongoingGame = matchGames?.find(g => g.status === 'ongoing');
  const allGamesScored = Boolean(matchGames?.length) && matchGames!.every(g => g.status === 'completed');

  const handleEndMatch = () => {
    modals.openConfirmModal({
      title: 'End Match',
      children: (
        <Stack gap="sm">
          <Text size="sm">Are you sure you want to end this match?</Text>
          {!allGamesScored && (
            <Text size="sm" c="orange">
              Not all maps have been scored. The winner will be determined from maps scored so far.
            </Text>
          )}
        </Stack>
      ),
      labels: { confirm: 'End Match', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: () => onStatusTransition?.('complete', !allGamesScored),
    });
  };
  const showAssignPlayers = ASSIGN_STATUSES.has(match.status) && Boolean(onAssignPlayers);
  const showEdit = !isHistory && Boolean(onEdit) && !NON_EDIT_STATUSES.has(match.status) && match.tournament_allow_match_editing !== false;

  return (
    <Card withBorder padding="lg" shadow="sm">
      <Stack gap="xs">
        {matchInBattle && (
          <Button
            variant="filled"
            color="violet"
            fullWidth
            disabled={!ongoingGame}
            onClick={() => ongoingGame && router.push(`/matches/${match.id}/scoring?gameId=${ongoingGame.id}`)}
          >
            Score Next Map
          </Button>
        )}
        {match.status === 'battle' && !isHistory && onStatusTransition
          ? <Button variant="light" color="red" fullWidth onClick={handleEndMatch}>End Match</Button>
          : getStatusTransitionButton(match, isHistory, onStatusTransition)}
        {(showAssignPlayers || showEdit) && (
          <Group grow gap="xs">
            {showAssignPlayers && (
              <Button size="sm" variant="light" color="violet" onClick={onAssignPlayers}>
                Assign Players
              </Button>
            )}
            {showEdit && (
              <Button size="sm" variant="light" color="violet" onClick={onEdit}>
                Edit Match
              </Button>
            )}
          </Group>
        )}
        {onDelete && (
          <>
            <Divider />
            <Button variant="subtle" color="red" fullWidth size="sm" onClick={onDelete}>
              Delete Match
            </Button>
          </>
        )}
      </Stack>
    </Card>
  );
}

export function MatchInfoPanel({
  match,
  mapDetails: _mapDetails,
  mapNotes: _mapNotes,
  matchGames,
  gamesLoading: _gamesLoading,
  formatMapName: _formatMapName,
  parseDbTimestamp,
  showActions = true,
  isHistory = false,
  onAssignPlayers,
  onDelete,
  onEdit,
  onStatusTransition,
}: MatchInfoPanelProps): JSX.Element {
  return (
    <div style={{ position: 'sticky', top: 20 }}>
      <Stack gap="md">
        {/* Card 1: Header & Featured Image */}
        <Card withBorder padding="lg" shadow="sm">
          <Stack gap="md">
            <Group>
              <Avatar src={match.game_icon} alt={match.game_name} size="lg" />
              <Stack gap="xs" style={{ flex: 1 }}>
                <Text size="xl" fw={600}>{match.name}</Text>
                <Text size="md" c="dimmed">{match.game_name}</Text>
              </Stack>
              <StageRing status={match.status} gameColor={match.game_color} size={60} thickness={6} />
            </Group>
            {match.description && (
              <div>
                <Text size="sm" fw={500} c="dimmed">Description:</Text>
                <Text size="sm">{match.description}</Text>
              </div>
            )}
            {match.event_image_url && (
              <Image src={match.event_image_url} alt={match.name} radius="md" fit="cover" h={200} />
            )}
          </Stack>
        </Card>

        {/* Card 2: Match Details */}
        <MatchDetailsCard match={match} parseDbTimestamp={parseDbTimestamp} />

        {/* Card 3: Action Buttons */}
        {showActions && (
          <MatchActionsCard
            match={match}
            matchGames={matchGames}
            isHistory={isHistory}
            onAssignPlayers={onAssignPlayers}
            onDelete={onDelete}
            onEdit={onEdit}
            onStatusTransition={onStatusTransition}
          />
        )}
      </Stack>
    </div>
  );
}
