import type { JSX, ReactNode } from 'react';
import { Group, Text, Badge, ActionIcon, Stack, Card } from '@mantine/core';
import { IconArrowUp, IconArrowDown } from '@tabler/icons-react';
import { moveItem } from './scoring-config';

export interface SeedOrderItem {
  id: string;
  name: string;
  /** Right-hand detail (division, previous rank). */
  detail?: ReactNode;
}

interface SeedOrderListProps {
  items: SeedOrderItem[];
  /** Called with the ids in their new order. */
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}

/** Numbered list with up / down buttons: the seed order of a tournament or playoff. */
export function SeedOrderList({ items, onChange, disabled }: SeedOrderListProps): JSX.Element {
  const ids = items.map((i) => i.id);
  return (
    <Card withBorder radius="md" p="xs">
      <Stack gap={4}>
        {items.map((item, i) => (
          <Group key={item.id} gap="xs" wrap="nowrap" data-testid="seed-row">
            <Badge variant="light" color="violet" w={34} px={0}>#{i + 1}</Badge>
            <Text size="sm" style={{ flex: 1 }} truncate>{item.name}</Text>
            {item.detail}
            <ActionIcon
              variant="subtle" size="sm" aria-label={`Move ${item.name} up`}
              disabled={disabled || i === 0} onClick={() => onChange(moveItem(ids, i, -1))}
            >
              <IconArrowUp size={14} />
            </ActionIcon>
            <ActionIcon
              variant="subtle" size="sm" aria-label={`Move ${item.name} down`}
              disabled={disabled || i === items.length - 1} onClick={() => onChange(moveItem(ids, i, 1))}
            >
              <IconArrowDown size={14} />
            </ActionIcon>
          </Group>
        ))}
      </Stack>
    </Card>
  );
}
