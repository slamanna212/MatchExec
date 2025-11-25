'use client'

import { Card, Box, Image, Text } from '@mantine/core';
import type { GameMapWithMode } from './useMatchForm';

interface MapCardProps {
  map: GameMapWithMode;
  onClick: () => void;
}

export function MapCard({ map, onClick }: MapCardProps) {
  return (
    <Card
      shadow="sm"
      padding="md"
      radius="md"
      withBorder
      className="cursor-pointer hover:shadow-md transition-shadow"
      onClick={onClick}
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
      <Text fw={500} size="sm" mt="xs">{map.name}</Text>
    </Card>
  );
}
