'use client'

import { Card, Box, Text, Select, Button } from '@mantine/core';
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
      padding={0}
      radius="md"
      withBorder
    >
      <Box
        style={{
          position: 'relative',
          height: 160,
          overflow: 'hidden',
          borderRadius: '10px 10px 0 0',
          backgroundImage: `url(${map.imageUrl})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundColor: 'var(--mantine-color-dark-6)',
        }}
      >
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
        </div>
      </Box>
      <Box p="md">
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
      </Box>
    </Card>
  );
}
