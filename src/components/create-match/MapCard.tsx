'use client'

import { Text } from '@mantine/core';
import type { GameMapWithMode } from './useMatchForm';
import { useLazyBackground } from '@/hooks/useLazyBackground';

interface MapCardProps {
  map: GameMapWithMode;
  onClick: () => void;
}

export function MapCard({ map, onClick }: MapCardProps) {
  const { ref, backgroundImage } = useLazyBackground(map.imageUrl);

  return (
    <div
      ref={ref}
      onClick={onClick}
      className="hover:scale-[1.02] cursor-pointer"
      style={{
        position: 'relative',
        height: 190,
        borderRadius: 10,
        overflow: 'hidden',
        backgroundImage,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundColor: 'var(--mantine-color-dark-6)',
        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
        contentVisibility: 'auto',
        containIntrinsicSize: '0 190px',
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
    </div>
  );
}
