'use client'

import { Badge } from '@mantine/core';
import { IconFlame, IconSwords } from '@tabler/icons-react';
import { MatchFormat } from '@/shared/types';

interface FormatBadgeProps {
  format: MatchFormat;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
}

export function FormatBadge({ format, size = 'sm' }: FormatBadgeProps) {
  const isCompetitive = format === 'competitive';
  
  return (
    <Badge
      size={size}
      color={isCompetitive ? 'red' : 'blue'}
      variant="filled"
      leftSection={isCompetitive ? <IconFlame size={12} /> : <IconSwords size={12} />}
    >
      {format === 'competitive' ? 'Competitive' : 'Casual'}
    </Badge>
  );
}