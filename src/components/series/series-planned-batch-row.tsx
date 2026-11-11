import type { CSSProperties, JSX, ReactNode } from 'react';
import { Stack, Group, Text, Badge, Card, ThemeIcon } from '@mantine/core';
import { IconFlag, IconRepeat } from '@tabler/icons-react';
import type { RaceCalendarConfig, RoundRobinConfig, SeriesBatchKind } from '@/shared/series-types';
import { describeScheduleConfig } from './series-fixtures';
import { SERIES_FALLBACK_COLOR } from './series-shared';
import classes from './series-event-row.module.css';

interface PlannedBatchRowProps {
  kind: SeriesBatchKind;
  config: RoundRobinConfig | RaceCalendarConfig;
  /** `#n` shown like an event's order (the slot it takes). */
  order?: number | null;
  gameName?: string | null;
  gameColor?: string | null;
  actions?: ReactNode;
}

/**
 * A planned round robin / race calendar in the schedule: what it will generate and when, styled like an event row (dashed,
 * because its fixtures do not exist until the entrants are known).
 */
export function PlannedBatchRow({ kind, config, order, gameName, gameColor, actions }: PlannedBatchRowProps): JSX.Element {
  const color = gameColor || SERIES_FALLBACK_COLOR;
  const Icon = kind === 'round_robin' ? IconRepeat : IconFlag;
  return (
    <div className={classes.wrapper}>
      <Card
        withBorder
        radius="md"
        p="sm"
        className={classes.row}
        data-testid="planned-batch-row"
        style={{ '--row-glow': `${color}55`, borderStyle: 'dashed' } as CSSProperties}
      >
        <Group gap="sm" wrap="nowrap" align="center">
          <Text size="xs" fw={700} c="dimmed" w={28} ta="center" style={{ flexShrink: 0 }}>{order ? `#${order}` : ''}</Text>
          <ThemeIcon variant="light" color="violet" radius="md" size="lg" style={{ flexShrink: 0 }}><Icon size={18} /></ThemeIcon>
          <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
            <Group gap={6} wrap="wrap">
              <Text fw={600} fz={15}>{kind === 'round_robin' ? 'Round robin' : 'Race calendar'}</Text>
              <Badge size="xs" variant="light" color="violet">Generated at registration close</Badge>
            </Group>
            <Text size="xs" c="dimmed">{describeScheduleConfig(kind, config)}</Text>
            <Text size="xs" c="dimmed">
              {gameName ? `${gameName} · ` : ''}Every approved entrant{config.points_multiplier && config.points_multiplier !== 1 ? ` · ×${config.points_multiplier}` : ''}
            </Text>
          </Stack>
          <Badge size="sm" variant="light" color="gray" visibleFrom="xs" style={{ flexShrink: 0 }}>Planned</Badge>
          {actions && (
            <Group gap={2} wrap="nowrap" style={{ flexShrink: 0 }}>{actions}</Group>
          )}
        </Group>
      </Card>
    </div>
  );
}
