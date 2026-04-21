'use client'

import { Card, Group, Image, Stack, Text, Badge, Button } from '@mantine/core';
import { IconCheck, IconX } from '@tabler/icons-react';
import classes from './map-stat-card.module.css';

interface MapStatCardProps {
  round: number;
  mapName?: string;
  mapImageUrl?: string;
  status: 'pending' | 'ongoing' | 'completed';
  blueSubmitted: boolean;
  redSubmitted: boolean;
  onView: () => void;
}

const STATUS_CONFIG = {
  completed: { color: 'green', label: 'Completed' },
  ongoing:   { color: 'blue',  label: 'Ongoing'   },
  pending:   { color: 'gray',  label: 'Pending'   },
} as const;

export function MapStatCard({ round, mapName, mapImageUrl, status, blueSubmitted, redSubmitted, onView }: MapStatCardProps) {
  const cfg = STATUS_CONFIG[status];
  const displayName = mapName ?? `Map ${round}`;

  return (
    <Card shadow="sm" padding={0} radius="md" withBorder className={classes.card}>
      <Group wrap="nowrap" align="stretch" gap={0}>
        <div className={classes.imageWrapper}>
          <Image
            src={mapImageUrl}
            alt={displayName}
            radius={0}
            className={classes.image}
            loading="lazy"
            fallbackSrc="data:image/svg+xml,%3csvg width='100' height='100' xmlns='http://www.w3.org/2000/svg'%3e%3crect width='100' height='100' fill='%23373A40'/%3e%3c/svg%3e"
          />
        </div>

        <div className={classes.content}>
          <Stack gap="xs" justify="space-between" style={{ height: '100%' }}>
            <div>
              <Group gap="xs" align="center" wrap="wrap">
                <Text fw={500} size="sm" lineClamp={1}>{displayName}</Text>
                <Badge size="xs" variant="light" color={cfg.color}>{cfg.label}</Badge>
              </Group>
              <Text size="xs" c="dimmed">Round {round}</Text>
            </div>

            <Group justify="space-between" align="center">
              <Group gap="sm">
                <SubmissionPip side="Blue" submitted={blueSubmitted} />
                <SubmissionPip side="Red" submitted={redSubmitted} />
              </Group>
              <Button size="xs" variant="light" color="violet" onClick={onView}>
                Match Players
              </Button>
            </Group>
          </Stack>
        </div>
      </Group>
    </Card>
  );
}

function SubmissionPip({ side, submitted }: { side: 'Blue' | 'Red'; submitted: boolean }) {
  return (
    <Group gap={4} align="center">
      {submitted
        ? <IconCheck size={12} color="var(--mantine-color-green-5)" stroke={2.5} />
        : <IconX size={12} color="var(--mantine-color-dimmed)" stroke={2.5} />}
      <Text size="xs" c={submitted ? (side === 'Blue' ? 'blue' : 'red') : 'dimmed'}>
        {side}
      </Text>
    </Group>
  );
}
