'use client'

import { Grid, Card, Box, Image, Group, Stack, Text, Badge, ActionIcon } from '@mantine/core';
import { IconNote, IconX, IconPlus } from '@tabler/icons-react';
import type { SelectedMapCard } from './useMatchForm';

interface SelectedMapsListProps {
  selectedMaps: SelectedMapCard[];
  showMapSelector: boolean;
  onRemoveMap: (mapId: string) => void;
  onOpenNoteModal: (map: SelectedMapCard) => void;
  onAddMapClick: () => void;
}

export function SelectedMapsList({
  selectedMaps,
  showMapSelector,
  onRemoveMap,
  onOpenNoteModal,
  onAddMapClick
}: SelectedMapsListProps) {
  return (
    <Grid>
      {selectedMaps.map((map) => (
        <Grid.Col key={map.id} span={{ base: 12, sm: 6, md: 4 }}>
          <Card shadow="sm" padding="md" radius="md" withBorder>
            <Card.Section>
              <Box
                style={{
                  position: 'relative',
                  width: '100%',
                  aspectRatio: '16/9',
                  overflow: 'hidden',
                  borderRadius: 'var(--mantine-radius-md) var(--mantine-radius-md) 0 0'
                }}
              >
                {/* Blur background */}
                <Box
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    backgroundImage: `url(${map.imageUrl})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    filter: 'blur(10px)',
                    transform: 'scale(1.1)'
                  }}
                />
                {/* Main image */}
                <Image
                  src={map.imageUrl}
                  alt={map.name}
                  style={{
                    position: 'relative',
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                    zIndex: 1
                  }}
                  fallbackSrc="data:image/svg+xml,%3csvg width='100' height='100' xmlns='http://www.w3.org/2000/svg'%3e%3crect width='100' height='100' fill='%23f1f3f4'/%3e%3c/svg%3e"
                />
              </Box>
            </Card.Section>

            <Group justify="space-between" mt="xs">
              <Stack gap={2} style={{ flex: 1 }}>
                <Text fw={500} size="sm">{map.name}</Text>
                <Badge size="xs" variant="light">{map.modeName}</Badge>
                {map.note && (
                  <Text size="xs" c="dimmed" lineClamp={1} title={map.note}>
                    📝 {map.note}
                  </Text>
                )}
              </Stack>
              <Stack gap={2} align="center">
                <ActionIcon
                  color="blue"
                  variant="light"
                  size="sm"
                  onClick={() => onOpenNoteModal(map)}
                  title="Add/Edit Note"
                >
                  <IconNote size={14} />
                </ActionIcon>
                <ActionIcon
                  color="red"
                  variant="light"
                  size="sm"
                  onClick={() => onRemoveMap(map.id)}
                  title="Remove Map"
                >
                  <IconX size={14} />
                </ActionIcon>
              </Stack>
            </Group>
          </Card>
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
