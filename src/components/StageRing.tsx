'use client'

import type { JSX } from 'react';
import { RingProgress } from '@mantine/core';
import { MATCH_FLOW_STEPS, TOURNAMENT_FLOW_STEPS } from '@/shared/types';

type ItemType = 'match' | 'tournament';

interface StageRingProps {
  /** Match/tournament status; ignored when `value` is given. */
  status?: string;
  /** Explicit progress 0-100 (e.g. series event-completion %). Overrides `status`. */
  value?: number;
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
  value,
  gameColor,
  type = 'match',
  size = 50,
  thickness = 4,
}: StageRingProps): JSX.Element {
  return (
    <RingProgress
      size={size}
      thickness={thickness}
      sections={[
        {
          value: value ?? (status ? getProgress(status, type) : 0),
          color: gameColor || FALLBACK_COLOR,
        },
      ]}
    />
  );
}
