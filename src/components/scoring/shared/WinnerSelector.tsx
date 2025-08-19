'use client'

import { Group, SegmentedControl, Text, Card } from '@mantine/core';
import { IconUser, IconUsers, IconHandStop } from '@tabler/icons-react';

interface WinnerSelectorProps {
  value: 'team1' | 'team2' | 'draw' | null;
  onChange: (value: 'team1' | 'team2' | 'draw') => void;
  team1Name?: string;
  team2Name?: string;
  allowDraw?: boolean;
  disabled?: boolean;
}

export function WinnerSelector({
  value,
  onChange,
  team1Name = 'Team 1',
  team2Name = 'Team 2',
  allowDraw = true,
  disabled = false
}: WinnerSelectorProps) {
  const data = [
    {
      label: team1Name,
      value: 'team1',
      icon: <IconUser size={16} />
    },
    {
      label: team2Name,
      value: 'team2',
      icon: <IconUsers size={16} />
    },
    ...(allowDraw ? [{
      label: 'Draw',
      value: 'draw',
      icon: <IconHandStop size={16} />
    }] : [])
  ];

  return (
    <Card withBorder p="sm">
      <Group gap="sm" mb="xs">
        <Text fw={600} size="sm">Match Winner</Text>
        {value && (
          <Text size="xs" c="dimmed">
            {value === 'team1' ? team1Name : value === 'team2' ? team2Name : 'Draw'}
          </Text>
        )}
      </Group>

      <SegmentedControl
        value={value || ''}
        onChange={onChange}
        disabled={disabled}
        fullWidth
        data={data.map(item => ({
          label: (
            <Group gap="xs" justify="center">
              {item.icon}
              <Text size="sm">{item.label}</Text>
            </Group>
          ),
          value: item.value
        }))}
      />
    </Card>
  );
}