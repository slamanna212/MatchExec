'use client'

import { Grid, Card, Box, Group, Stack, Text, ActionIcon } from '@mantine/core';
import { IconNote, IconX, IconPlus } from '@tabler/icons-react';
import type { SelectedMapCard } from './useMatchForm';

interface SelectedMapsListProps {
  selectedMaps: SelectedMapCard[];
  showMapSelector: boolean;
  supportsAllModes?: boolean;
  onRemoveMap: (mapId: string) => void;
  onOpenNoteModal: (map: SelectedMapCard) => void;
  onAddMapClick: () => void;
}

export function SelectedMapsList({
  selectedMaps,
  showMapSelector,
  supportsAllModes,
  onRemoveMap,
  onOpenNoteModal,
  onAddMapClick
}: SelectedMapsListProps) {
  return (
    <Grid>
      {selectedMaps.map((map) => (
        <Grid.Col key={map.id} span={{ base: 12, sm: 6, md: 4 }}>
          <Box
            style={{
              position: 'relative',
              height: 190,
              borderRadius: 10,
              overflow: 'hidden',
              backgroundImage: `url(${map.imageUrl})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              backgroundColor: 'var(--mantine-color-dark-6)',
            }}
          >
            {/* Gradient overlay with map info at bottom */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.4) 40%, rgba(0,0,0,0.1) 65%)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-end',
                padding: 12,
              }}
            >
              <Text
                fw={700}
                size="sm"
                style={{
                  color: '#fff',
                  textShadow: '0 1px 3px rgba(0,0,0,1), 0 0 8px rgba(0,0,0,0.9), 0 0 16px rgba(0,0,0,0.5)',
                }}
              >
                {map.name}
              </Text>
              {!supportsAllModes && (
                <span
                  style={{
                    display: 'inline-block',
                    alignSelf: 'flex-start',
                    marginTop: 4,
                    fontSize: 10,
                    fontWeight: 600,
                    padding: '2px 6px',
                    borderRadius: 4,
                    backgroundColor: 'rgba(59, 130, 246, 0.85)',
                    color: '#fff',
                    textShadow: '0 0 2px rgba(0,0,0,0.5)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {map.modeName}
                </span>
              )}
              {map.note && (
                <Text
                  size="xs"
                  lineClamp={1}
                  title={map.note}
                  style={{ color: 'rgba(255,255,255,0.8)', marginTop: 4 }}
                >
                  📝 {map.note}
                </Text>
              )}
            </div>

            {/* Action buttons top-right */}
            <Group
              gap={4}
              style={{
                position: 'absolute',
                top: 8,
                right: 8,
              }}
            >
              <ActionIcon
                size="sm"
                onClick={() => onOpenNoteModal(map)}
                title="Add/Edit Note"
                style={{
                  backgroundColor: 'rgba(0,0,0,0.6)',
                  color: '#fff',
                  border: '1px solid rgba(255,255,255,0.2)',
                }}
              >
                <IconNote size={14} />
              </ActionIcon>
              <ActionIcon
                size="sm"
                onClick={() => onRemoveMap(map.id)}
                title="Remove Map"
                style={{
                  backgroundColor: 'rgba(0,0,0,0.6)',
                  color: '#fff',
                  border: '1px solid rgba(255,255,255,0.2)',
                }}
              >
                <IconX size={14} />
              </ActionIcon>
            </Group>
          </Box>
        </Grid.Col>
      ))}

      {!showMapSelector && (
        <Grid.Col span={{ base: 12, sm: 6, md: 4 }}>
          <Card
            shadow="sm"
            padding="md"
            radius="md"
            withBorder
            className="cursor-pointer hover:shadow-md transition-shadow border-dashed"
            onClick={onAddMapClick}
            style={{
              borderStyle: 'dashed',
              borderColor: 'var(--mantine-color-default-border)',
              backgroundColor: 'var(--mantine-color-body)'
            }}
          >
            <Stack align="center" justify="center" style={{ minHeight: 120 }}>
              <ActionIcon size="xl" variant="light">
                <IconPlus />
              </ActionIcon>
              <Text size="sm" c="dimmed">Add Map</Text>
            </Stack>
          </Card>
        </Grid.Col>
      )}
    </Grid>
  );
}
