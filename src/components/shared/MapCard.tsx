/**
 * Reusable MapCard component for displaying map information
 */

import { Card, Stack, Group, Badge, Text, Box } from '@mantine/core';
import { IconMap, IconCheck, IconClock, IconTrophy } from '@tabler/icons-react';
import { getMapImageUrl, formatMapName, getStatusColor } from '@/lib/utils/map-utils';

export interface MapCardProps {
  mapId: string;
  mapName?: string | null;
  gameType: string;
  round: number;
  status: string;
  selected?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  imageUrl?: string | null;
  winner?: 'blue' | 'red' | null;
  showWinner?: boolean;
}

export function getStatusIcon(status: string) {
  switch (status) {
    case 'completed':
      return <IconCheck size={16} color="var(--mantine-color-green-6)" />;
    case 'ongoing':
      return <IconClock size={16} color="var(--mantine-color-blue-6)" />;
    case 'created':
      return <IconMap size={16} color="var(--mantine-color-gray-6)" />;
    default:
      return <IconMap size={16} color="var(--mantine-color-gray-6)" />;
  }
}

function getCardCursor(disabled: boolean, hasOnClick: boolean): string {
  if (disabled) return 'not-allowed';
  if (hasOnClick) return 'pointer';
  return 'default';
}

function getBackgroundGradient(selected: boolean): string {
  return selected
    ? 'rgba(0, 0, 0, 0.2), rgba(0, 0, 0, 0.4)'
    : 'rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0.6)';
}

function getBackgroundImage(selected: boolean, imageUrl: string): string {
  return `linear-gradient(${getBackgroundGradient(selected)}), url('${imageUrl}')`;
}

function getCardBorder(selected: boolean, statusColor: string): string {
  return selected ? `2px solid var(--mantine-color-${statusColor}-6)` : 'none';
}

function getCardBoxShadow(selected: boolean, statusColor: string): string | undefined {
  return selected ? `0 0 0 1px var(--mantine-color-${statusColor}-6)` : undefined;
}

function getCardOpacity(disabled: boolean): number {
  return disabled ? 0.6 : 1;
}

function getCardStyle(
  disabled: boolean,
  onClick: (() => void) | undefined,
  selected: boolean,
  statusColor: string,
  imageUrl: string
) {
  return {
    cursor: getCardCursor(disabled, !!onClick),
    minWidth: 180,
    height: 120,
    backgroundImage: getBackgroundImage(selected, imageUrl),
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
    backgroundColor: '#1a1b1e',
    border: getCardBorder(selected, statusColor),
    boxShadow: getCardBoxShadow(selected, statusColor),
    opacity: getCardOpacity(disabled),
    position: 'relative' as const
  };
}

const TEXT_SHADOW = '0 0 4px rgba(0, 0, 0, 0.9), 1px 1px 2px rgba(0, 0, 0, 0.8)';

export function MapCard({
  mapId,
  mapName,
  gameType,
  round,
  status,
  selected = false,
  onClick,
  disabled = false,
  imageUrl,
  winner,
  showWinner = false
}: MapCardProps) {
  const finalImageUrl = imageUrl || getMapImageUrl(gameType, mapId);
  const statusColor = getStatusColor(status);
  const cardStyle = getCardStyle(disabled, onClick, selected, statusColor, finalImageUrl);

  return (
    <Card
      withBorder
      onClick={disabled ? undefined : onClick}
      style={cardStyle}
      p="sm"
    >
      <Stack gap="xs" h="100%" justify="space-between">
        {/* Status Icon and Badge */}
        <Group justify="space-between" align="flex-start">
          {getStatusIcon(status)}
          <Badge
            color={statusColor}
            size="xs"
            style={{ backgroundColor: `var(--mantine-color-${statusColor}-6)` }}
          >
            {status}
          </Badge>
        </Group>

        {/* Map Info */}
        <Box>
          <Text
            size="xs"
            fw={600}
            c="white"
            style={{
              textShadow: TEXT_SHADOW,
              lineHeight: 1.2,
              fontWeight: 700
            }}
          >
            Map {round}
          </Text>
          <Text
            size="xs"
            c="white"
            style={{
              textShadow: TEXT_SHADOW,
              lineHeight: 1.1,
              fontWeight: 600
            }}
          >
            {formatMapName(mapId, mapName)}
          </Text>

          {/* Winner Badge */}
          {showWinner && winner && (
            <Badge
              size="xs"
              color={winner === 'blue' ? 'blue' : 'red'}
              leftSection={<IconTrophy size={12} />}
              mt={4}
            >
              {winner === 'blue' ? 'Blue Wins' : 'Red Wins'}
            </Badge>
          )}
        </Box>
      </Stack>
    </Card>
  );
}
