'use client'

import { Card, Box, Image, Text, Select, Button } from '@mantine/core';
import type { GameMode, GameMapWithMode } from './useMatchForm';

interface FlexibleMapCardProps {
  map: GameMapWithMode;
  availableModes: GameMode[];
  selectedModeId?: string;
  onModeChange: (modeId: string | null) => void;
  onAddMap: (modeId: string) => void;
}

export function FlexibleMapCard({
  map,
  availableModes,
  selectedModeId,
  onModeChange,
  onAddMap
}: FlexibleMapCardProps) {
  return (
    <Card
      shadow="sm"
      padding="md"
      radius="md"
      withBorder
    >
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
      <Text fw={500} size="sm" mt="xs" mb="xs">{map.name}</Text>
      <Select
        placeholder="Select mode"
        size="xs"
        data={availableModes.map(mode => ({ value: mode.id, label: mode.name }))}
        value={selectedModeId || null}
        onChange={onModeChange}
        disabled={availableModes.length === 0}
        mb="xs"
      />
      <Button
        size="xs"
        fullWidth
        disabled={!selectedModeId}
        onClick={() => selectedModeId && onAddMap(selectedModeId)}
      >
        Add Map
      </Button>
    </Card>
  );
}
