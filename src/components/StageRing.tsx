'use client'

import { RingProgress } from '@mantine/core';
import { MATCH_FLOW_STEPS, TOURNAMENT_FLOW_STEPS } from '@/shared/types';

type ItemType = 'match' | 'tournament';

interface StageRingProps {
  status: string;
  gameColor?: string;
  type?: ItemType;
  size?: number;
  thickness?: number;
}

const FALLBACK_COLOR = '#95a5a6';

function getProgress(status: string, type: ItemType): number {
  const steps = type === 'tournament' ? TOURNAMENT_FLOW_STEPS : MATCH_FLOW_STEPS;
  return (steps as Record<string, { progress: number }>)[status]?.progress || 0;
}

export function StageRing({
  status,
  gameColor,
  type = 'match',
  size = 50,
  thickness = 4,
}: StageRingProps) {
  return (
    <RingProgress
      size={size}
      thickness={thickness}
      sections={[
        {
          value: getProgress(status, type),
          color: gameColor || FALLBACK_COLOR,
        },
      ]}
    />
  );
}
