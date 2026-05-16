'use client'

import { useState, type JSX } from 'react';
import { Stack, Text, Card, Avatar, Group, ActionIcon, Badge } from '@mantine/core';
import { IconGripVertical, IconArrowUp, IconArrowDown } from '@tabler/icons-react';

interface Participant {
  id: string;
  username: string;
  avatar_url?: string | null;
}

interface GridOrderProps {
  participants: Participant[];
  onChange?: (orderedIds: string[]) => void;
}

/**
 * Position / racing setup: drag-and-drop (or button) reordering of participants into starting grid positions.
 */
export function GridOrder({ participants: initial, onChange }: GridOrderProps): JSX.Element {
  const [order, setOrder] = useState<Participant[]>(initial);

  const move = (index: number, direction: -1 | 1) => {
    const newOrder = [...order];
    const target = index + direction;
    if (target < 0 || target >= newOrder.length) return;
    [newOrder[index], newOrder[target]] = [newOrder[target], newOrder[index]];
    setOrder(newOrder);
    onChange?.(newOrder.map((p) => p.id));
  };

  return (
    <Stack gap="sm">
      <Text fw={600} size="sm">Starting Grid Order</Text>
      <Text size="xs" c="dimmed">Reorder participants to set their starting grid positions (P1 = pole position).</Text>
      {order.map((p, idx) => (
        <Card key={p.id} withBorder padding="sm" radius="md">
          <Group gap="sm" justify="space-between">
            <Group gap="sm">
              <IconGripVertical size={16} color="var(--mantine-color-gray-5)" />
              <Badge variant="filled" size="sm" color="dark" w={36}>P{idx + 1}</Badge>
              <Avatar src={p.avatar_url ?? undefined} size="sm" radius="xl">
                {p.username[0]?.toUpperCase()}
              </Avatar>
              <Text size="sm" fw={500}>{p.username}</Text>
            </Group>
            <Group gap={4}>
              <ActionIcon size="sm" variant="subtle" disabled={idx === 0} onClick={() => move(idx, -1)}>
                <IconArrowUp size={14} />
              </ActionIcon>
              <ActionIcon size="sm" variant="subtle" disabled={idx === order.length - 1} onClick={() => move(idx, 1)}>
                <IconArrowDown size={14} />
              </ActionIcon>
            </Group>
          </Group>
        </Card>
      ))}
    </Stack>
  );
}
