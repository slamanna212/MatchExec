import type { JSX, ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { Stack, Group, Text, Badge, Card, Avatar, Box, ColorSwatch } from '@mantine/core';
import { IconCalendar, IconTrophy } from '@tabler/icons-react';
import { StageRing } from '@/components/StageRing';
import {
  EVENT_ROLE_COLOR, EVENT_ROLE_LABEL, EVENT_TYPE_COLOR, SERIES_FALLBACK_COLOR, eventHref, formatMultiplier, formatShortDateTime,
} from './series-shared';
import type { SeriesEventView } from './series-shared';
import { versusLine } from './series-schedule-helpers';

const TARGET_STATUS_COLOR: Record<string, string> = {
  created: 'gray', gather: 'blue', assign: 'orange', battle: 'green', complete: 'teal', cancelled: 'red',
};

function EntrantsLine({ event }: { event: SeriesEventView }): JSX.Element | null {
  const versus = versusLine(event);
  if (!versus) {
    const n = event.entrant_ids?.length;
    return n ? <Text size="xs" c="dimmed">{n} {n === 1 ? 'entrant' : 'entrants'}</Text> : null;
  }
  const side = (e: typeof versus.a) => (
    <Group gap={4} wrap="nowrap">
      {e.color && <ColorSwatch color={e.color} size={10} withShadow={false} />}
      <Text size="sm" fw={e.is_winner ? 700 : 500} truncate>{e.name}</Text>
      {typeof e.score === 'number' && <Text size="sm" fw={700} ff="monospace">{e.score}</Text>}
    </Group>
  );
  return (
    <Group gap={6} wrap="nowrap" data-testid="versus">
      {side(versus.a)}
      <Text size="xs" c="dimmed">vs</Text>
      {side(versus.b)}
    </Group>
  );
}

interface SeriesEventRowProps {
  event: SeriesEventView;
  isNext?: boolean;
  /** Highlights a planned playoff that is ready to seed. */
  ready?: boolean;
  /** Right-hand controls (reorder, menu, seed button). Clicks on them do not open the event. */
  actions?: ReactNode;
}

/** One series event: order, game, name, role / week / type badges, date, entrants and target status. */
export function SeriesEventRow({ event, isNext, ready, actions }: SeriesEventRowProps): JSX.Element {
  const navigate = useNavigate();
  const color = event.game_color || SERIES_FALLBACK_COLOR;
  const planned = event.status === 'planned';
  const href = planned ? null : eventHref(event);
  const missing = !planned && event.name === null;
  const date = formatShortDateTime(event.start_date);
  const done = event.target_status === 'complete';
  const label = event.name ?? (missing ? 'Deleted event' : `Event #${event.event_order}`);

  return (
    <Card
      withBorder
      radius="md"
      p="sm"
      data-testid="series-event-row"
      data-event-id={event.id}
      style={{
        cursor: href ? 'pointer' : 'default',
        transition: 'all 0.25s ease',
        borderColor: ready ? 'var(--mantine-color-violet-6)' : isNext ? color : undefined,
        opacity: done ? 0.85 : 1,
      }}
      onMouseOver={(e) => {
        if (!href) return;
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.boxShadow = `0 8px 24px ${color}33`;
      }}
      onMouseOut={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = '';
      }}
      onClick={() => { if (href) navigate(href); }}
    >
      <Group gap="sm" wrap="nowrap" align="center">
        <Text size="xs" fw={700} c="dimmed" w={28} ta="center" style={{ flexShrink: 0 }}>#{event.event_order}</Text>

        <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
          <Group gap={6} wrap="nowrap">
            <Text fw={600} fz={15} truncate>{label}</Text>
            {isNext && <Badge size="xs" variant="filled" color={color} style={{ flexShrink: 0 }}>Up next</Badge>}
          </Group>
          <Group gap={6} wrap="wrap">
            {event.game_icon && <Avatar src={event.game_icon} size={16} radius="xs" />}
            {event.game_name && <Text size="xs" c="dimmed">{event.game_name} ·</Text>}
            <Badge size="xs" variant="light" color={EVENT_TYPE_COLOR[event.event_type]}>{event.event_type}</Badge>
            {event.role !== 'regular' && (
              <Badge size="xs" variant="light" color={EVENT_ROLE_COLOR[event.role]} leftSection={<IconTrophy size={10} />}>
                {EVENT_ROLE_LABEL[event.role]}
              </Badge>
            )}
            {event.week !== null && <Badge size="xs" variant="outline" color="gray">Week {event.week}</Badge>}
            {!event.counts_for_standings && <Badge size="xs" variant="outline" color="gray">Not counted</Badge>}
            {event.points_multiplier !== 1 && (
              <Text size="xs" ff="monospace" fw={700} c="violet">{formatMultiplier(event.points_multiplier)}</Text>
            )}
          </Group>
          <Group gap={4} wrap="nowrap">
            <IconCalendar size={12} color="var(--mantine-color-dimmed)" style={{ flexShrink: 0 }} />
            <Text size="xs" c="dimmed">{date ?? 'No date set'}</Text>
          </Group>
          <EntrantsLine event={event} />
        </Stack>

        {planned ? (
          <Badge size="sm" variant="light" color={ready ? 'violet' : 'gray'} style={{ flexShrink: 0 }}>
            {ready ? 'Ready to seed' : 'Planned'}
          </Badge>
        ) : (
          <>
            {event.target_status && (
              <Badge size="sm" variant="light" color={TARGET_STATUS_COLOR[event.target_status] ?? 'gray'} visibleFrom="xs" style={{ flexShrink: 0 }}>
                {event.target_status}
              </Badge>
            )}
            <Box visibleFrom="sm" style={{ flexShrink: 0 }}>
              <StageRing status={event.target_status ?? undefined} type={event.event_type} gameColor={color} size={40} thickness={4} />
            </Box>
          </>
        )}

        {actions && (
          <Group gap={2} wrap="nowrap" style={{ flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
            {actions}
          </Group>
        )}
      </Group>
    </Card>
  );
}
