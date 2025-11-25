'use client'

import { Card, Group, Image, Stack, Text, Badge } from '@mantine/core';
import { IconTrophy } from '@tabler/icons-react';
import responsiveTextClasses from '../responsive-text.module.css';

interface MapDetail {
  name: string;
  imageUrl?: string;
  modeName?: string;
  location?: string;
  note?: string;
}

interface MapCardProps {
  mapId: string;
  mapDetail?: MapDetail;
  mapNote?: string;
  formatMapName: (mapId: string) => string;
  winner?: {
    team: string;
    color: string;
  } | null;
  children?: React.ReactNode;
}

export function MapCard({
  mapId,
  mapDetail,
  mapNote,
  formatMapName,
  winner,
  children
}: MapCardProps) {
  const hasChildren = Boolean(children);

  return (
    <Card shadow="sm" padding={0} radius="md" withBorder style={{ overflow: 'hidden' }}>
      <Group wrap="nowrap" align="stretch" gap={0}>
        <div style={{ width: hasChildren ? '40%' : '50%', position: 'relative' }}>
          <Image
            src={mapDetail?.imageUrl}
            alt={mapDetail?.name || formatMapName(mapId)}
            height={80}
            radius={0}
            style={{
              borderTopLeftRadius: 'var(--mantine-radius-md)',
              borderBottomLeftRadius: 'var(--mantine-radius-md)',
              objectFit: 'cover',
              width: '100%',
              height: '100%'
            }}
            fallbackSrc="data:image/svg+xml,%3csvg width='100' height='100' xmlns='http://www.w3.org/2000/svg'%3e%3crect width='100' height='100' fill='%23f1f3f4'/%3e%3c/svg%3e"
          />
        </div>
        <div style={{
          width: hasChildren ? '60%' : '50%',
          padding: hasChildren ? 'var(--mantine-spacing-md)' : 'var(--mantine-spacing-sm)'
        }}>
          <Stack gap="xs" justify="center" style={{ height: '100%' }}>
            <div>
              <Text fw={500} lineClamp={1} className={responsiveTextClasses.mapNameResponsive}>
                {mapDetail?.name || formatMapName(mapId)}
              </Text>
              {mapDetail?.location && (
                <Text c="dimmed" lineClamp={1} className={responsiveTextClasses.locationResponsive}>
                  {mapDetail.location}
                </Text>
              )}
              {(mapDetail?.modeName || mapId.includes('-')) && (
                <Badge size="xs" variant="light" mt={2}>
                  {mapDetail?.modeName || extractModeNameFromMapId(mapId)}
                </Badge>
              )}
              {mapNote && (
                <Text size="xs" c="dimmed" lineClamp={1} mt="xs" title={mapNote}>
                  📝 {mapNote}
                </Text>
              )}
            </div>
            {winner && (
              <Group gap={4} justify="flex-start">
                <IconTrophy size={14} color="gold" />
                <Badge size="xs" color={winner.color} variant="filled">
                  {winner.team}
                </Badge>
              </Group>
            )}
            {children}
          </Stack>
        </div>
      </Group>
    </Card>
  );
}

function extractModeNameFromMapId(mapId: string): string {
  if (!mapId.includes('-')) return '';

  const parts = mapId.split('-');
  if (parts.length < 2) return '';

  const modePart = parts[parts.length - 1];
  return modePart
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
