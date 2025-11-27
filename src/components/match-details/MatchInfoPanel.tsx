'use client'

import {
  Stack,
  Group,
  Avatar,
  Text,
  RingProgress,
  Button,
  Card,
  Image
} from '@mantine/core';
import type { Match } from '@/shared/types';
import { MATCH_FLOW_STEPS } from '@/shared/types';

interface MatchWithGame extends Omit<Match, 'created_at' | 'updated_at' | 'start_date' | 'end_date'> {
  game_name?: string;
  game_icon?: string;
  game_color?: string;
  map_codes_supported?: boolean;
  rules?: string;
  rounds?: number;
  maps?: string[];
  map_codes?: Record<string, string>;
  livestream_link?: string;
  event_image_url?: string;
  created_at: string;
  updated_at: string;
  start_date?: string;
  end_date?: string;
}

interface MatchGameResult {
  id: string;
  match_id: string;
  round: number;
  map_id: string;
  map_name: string;
  winner_id?: string;
  status: 'pending' | 'ongoing' | 'completed';
}

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
  onScoring?: () => void;
  onDelete?: () => void;
  onStatusTransition?: (newStatus: string) => void;
}

export function MatchInfoPanel({
  match,
  mapDetails: _mapDetails,
  mapNotes: _mapNotes,
  matchGames: _matchGames,
  gamesLoading: _gamesLoading,
  formatMapName: _formatMapName,
  parseDbTimestamp,
  showActions = true,
  isHistory = false,
  onAssignPlayers,
  onScoring,
  onDelete,
  onStatusTransition
}: MatchInfoPanelProps) {
  // Determine which status transition button to show
  const getStatusTransitionButton = () => {
    if (isHistory || !onStatusTransition) return null;

    switch (match.status) {
      case 'created':
        return (
          <Button
            fullWidth
            variant="light"
            color="blue"
            onClick={() => onStatusTransition('gather')}
          >
            Start Signups
          </Button>
        );
      case 'gather':
        return (
          <Button
            fullWidth
            variant="light"
            color="orange"
            onClick={() => onStatusTransition('assign')}
          >
            Close Signups
          </Button>
        );
      case 'assign':
        return (
          <Button
            fullWidth
            variant="light"
            color="green"
            onClick={() => onStatusTransition('battle')}
          >
            Start Match
          </Button>
        );
      case 'battle':
        return (
          <Button
            fullWidth
            variant="light"
            color="red"
            onClick={() => onStatusTransition('complete')}
          >
            End Match
          </Button>
        );
      default:
        return null;
    }
  };

  return (
    <div style={{
      position: 'sticky',
      top: 20
    }}>
      <Stack gap="md">
        {/* Card 1: Header & Featured Image */}
        <Card withBorder padding="lg" shadow="sm">
          <Stack gap="md">
            {/* Header with game icon, title, and progress ring */}
            <Group>
              <Avatar
                src={match.game_icon}
                alt={match.game_name}
                size="lg"
              />
              <Stack gap="xs" style={{ flex: 1 }}>
                <Text size="xl" fw={600}>{match.name}</Text>
                <Text size="md" c="dimmed">{match.game_name}</Text>
              </Stack>
              <RingProgress
                size={60}
                thickness={6}
                sections={[
                  {
                    value: MATCH_FLOW_STEPS[match.status]?.progress || 0,
                    color: match.game_color || '#95a5a6'
                  }
                ]}
              />
            </Group>

            {/* Description */}
            {match.description && (
              <div>
                <Text size="sm" fw={500} c="dimmed">Description:</Text>
                <Text size="sm">{match.description}</Text>
              </div>
            )}

            {/* Featured Image */}
            {match.event_image_url && (
              <Image
                src={match.event_image_url}
                alt={match.name}
                radius="md"
                fit="cover"
                h={200}
              />
            )}
          </Stack>
        </Card>

        {/* Card 2: Match Details */}
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

            {match.livestream_link && (
              <Group justify="space-between">
                <Text size="sm" fw={500} c="dimmed">Livestream:</Text>
                <Text size="sm" component="a" href={match.livestream_link} target="_blank">
                  View Stream
                </Text>
              </Group>
            )}

            <Group justify="space-between">
              <Text size="sm" fw={500} c="dimmed">Max Participants:</Text>
              <Text size="sm">{match.max_participants}</Text>
            </Group>

            {match.start_date && (
              <Group justify="space-between">
                <Text size="sm" fw={500} c="dimmed">Start Date:</Text>
                <Text size="sm">{parseDbTimestamp(match.start_date)?.toLocaleString('en-US', {
                  year: 'numeric',
                  month: 'numeric',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                  hour12: true
                }) || 'N/A'}</Text>
              </Group>
            )}

            <Group justify="space-between">
              <Text size="sm" fw={500} c="dimmed">Created:</Text>
              <Text size="sm">{parseDbTimestamp(match.created_at)?.toLocaleString('en-US', {
                year: 'numeric',
                month: 'numeric',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
              }) || 'N/A'}</Text>
            </Group>

            {match.status === 'complete' && (
              <Group justify="space-between">
                <Text size="sm" fw={500} c="dimmed">Completed:</Text>
                <Text size="sm">{parseDbTimestamp(match.updated_at)?.toLocaleString('en-US', {
                  year: 'numeric',
                  month: 'numeric',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                  hour12: true
                }) || 'N/A'}</Text>
              </Group>
            )}
          </Stack>
        </Card>

        {/* Card 3: Action Buttons */}
        {showActions && (
          <Card withBorder padding="lg" shadow="sm">
            <Stack gap="sm">
              {/* Assign Players button */}
              {(match.status === 'gather' || match.status === 'assign' || match.status === 'battle') && onAssignPlayers && (
                <Button
                  fullWidth
                  variant="light"
                  onClick={onAssignPlayers}
                >
                  Assign Players
                </Button>
              )}

              {/* Scoring button */}
              {match.status === 'battle' && onScoring && (
                <Button
                  fullWidth
                  variant="light"
                  color="blue"
                  onClick={onScoring}
                >
                  Scoring
                </Button>
              )}

              {/* Status transition button */}
              {getStatusTransitionButton()}

              {/* Delete button */}
              {onDelete && (
                <Button
                  fullWidth
                  color="red"
                  variant="light"
                  onClick={onDelete}
                >
                  Delete Match
                </Button>
              )}
            </Stack>
          </Card>
        )}
      </Stack>
    </div>
  );
}
