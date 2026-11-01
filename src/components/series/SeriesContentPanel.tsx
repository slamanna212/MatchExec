import { useState } from 'react';
import type { JSX } from 'react';
import { useNavigate } from 'react-router';
import {
  Stack, Group, Text, Badge, Card, Avatar, SegmentedControl, Button, ActionIcon, Tooltip, Box, Image,
} from '@mantine/core';
import { IconLock, IconPlus, IconEdit, IconTrash, IconCalendar, IconTrophy, IconListDetails } from '@tabler/icons-react';
import { StageRing } from '@/components/StageRing';
import { EmptyState } from '@/components/EmptyState';
import { SectionLabel } from '@/components/SectionLabel';
import { RankedTable } from '@/components/shared/RankedTable';
import type { RankedTableColumn } from '@/components/shared/RankedTable';
import classes from '@/components/gradient-segmented-control.module.css';
import {
  EVENT_TYPE_COLOR, SERIES_FALLBACK_COLOR, eventHref, formatMultiplier, formatPoints, formatShortDateTime,
  parseScoringConfig,
} from './series-shared';
import type { SeriesSummary, SeriesEventDetail, SeriesStanding } from './series-shared';

type Tab = 'standings' | 'events';

interface SeriesContentPanelProps {
  series: SeriesSummary;
  events: SeriesEventDetail[];
  standings: SeriesStanding[];
  onAddEvent: () => void;
  onEditEvent: (e: SeriesEventDetail) => void;
  onRemoveEvent: (e: SeriesEventDetail) => void;
}

export function SeriesContentPanel({
  series, events, standings, onAddEvent, onEditEvent, onRemoveEvent,
}: SeriesContentPanelProps): JSX.Element {
  const storageKey = `series_tab_${series.id}`;
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(storageKey);
        if (saved === 'standings' || saved === 'events') return saved;
      } catch { /* storage unavailable */ }
    }
    return series.status === 'created' ? 'events' : 'standings';
  });

  const changeTab = (v: string) => {
    try { localStorage.setItem(storageKey, v); } catch { /* storage unavailable */ }
    setActiveTab(v as Tab);
  };

  return (
    <Stack gap="md">
      <Group justify="center" mb="sm">
        <SegmentedControl
          radius="xl"
          size="sm"
          classNames={classes}
          value={activeTab}
          onChange={changeTab}
          data={[
            { label: `Standings (${standings.length})`, value: 'standings' },
            { label: `Events (${events.length})`, value: 'events' },
          ]}
        />
      </Group>

      {activeTab === 'standings'
        ? <StandingsTab series={series} events={events} standings={standings} />
        : (
          <EventsTab
            series={series}
            events={events}
            onAddEvent={onAddEvent}
            onEditEvent={onEditEvent}
            onRemoveEvent={onRemoveEvent}
          />
        )}
    </Stack>
  );
}

function scoringFootnote(series: SeriesSummary): string {
  const c = parseScoringConfig(series.scoring_config);
  const parts = [
    `Match win ${formatPoints(c.match_win_points ?? 0)} / loss ${formatPoints(c.match_loss_points ?? 0)} pts`,
  ];
  const placements = c.tournament_position_points ?? [];
  if (placements.length > 0) parts.push(`tournament placements ${placements.map(formatPoints).join(' · ')}`);
  if (c.position_event_use_event_spread !== false) parts.push('position matches use their own spread');
  return `${parts.join(' · ')}. Event columns show points after multipliers.`;
}

function StandingsTab({ series, events, standings }: { series: SeriesSummary; events: SeriesEventDetail[]; standings: SeriesStanding[] }): JSX.Element {
  if (standings.length === 0) {
    return (
      <Card withBorder radius="md">
        <EmptyState
          icon={IconTrophy}
          title="No standings yet"
          description="Standings appear once events in this series are completed"
        />
      </Card>
    );
  }

  const completed = events.filter(e => e.status === 'complete');
  const eventColumns: RankedTableColumn<SeriesStanding>[] = completed.map(ev => ({
    key: ev.id,
    width: '64px',
    align: 'center',
    header: (
      <Tooltip label={ev.name ?? `Event #${ev.event_order}`} withArrow>
        <span>
          #{ev.event_order}
          {ev.points_multiplier !== 1 && (
            <Text span size="xs" ff="monospace" c="violet" ml={2}>{formatMultiplier(ev.points_multiplier)}</Text>
          )}
        </span>
      </Tooltip>
    ),
    render: (row) => {
      const pts = row.events.find(e => e.series_event_id === ev.id)?.points ?? null;
      if (pts === null) return <Text size="sm" c="dimmed">—</Text>;
      return <Text size="sm" c={pts === 0 ? 'dimmed' : undefined}>{formatPoints(pts)}</Text>;
    },
  }));

  return (
    <Stack gap="xs">
      <RankedTable
        rows={standings}
        getKey={(r) => r.user_id}
        getRank={(r) => r.rank}
        primaryHeader="Player"
        renderPrimary={(r) => (
          <>
            <Text fw={500} size="sm" truncate>{r.username}</Text>
            <Text size="xs" c="dimmed">{r.events_played} {r.events_played === 1 ? 'event' : 'events'} played</Text>
          </>
        )}
        minWidth={completed.length > 3 ? 280 + completed.length * 76 : undefined}
        columns={[
          ...eventColumns,
          {
            key: 'points',
            width: '84px',
            align: 'right',
            header: 'Points',
            render: (r) => <Text size="lg" fw={700}>{formatPoints(r.total_points)}</Text>,
          },
        ]}
      />
      <Text size="xs" c="dimmed" ta="center">{scoringFootnote(series)}</Text>
    </Stack>
  );
}

function EventsTab({
  series, events, onAddEvent, onEditEvent, onRemoveEvent,
}: {
  series: SeriesSummary;
  events: SeriesEventDetail[];
  onAddEvent: () => void;
  onEditEvent: (e: SeriesEventDetail) => void;
  onRemoveEvent: (e: SeriesEventDetail) => void;
}): JSX.Element {
  const locked = series.status === 'complete' || series.status === 'cancelled';
  const editable = series.status === 'created';

  return (
    <Stack gap="md">
      <Group justify="space-between" wrap="nowrap">
        {editable ? <span /> : (
          <Group gap={6} wrap="nowrap">
            <IconLock size={14} color="var(--mantine-color-dimmed)" style={{ flexShrink: 0 }} />
            <Text size="xs" c="dimmed">Multipliers and order are locked once the series starts.</Text>
          </Group>
        )}
        <Button size="xs" leftSection={<IconPlus size={14} />} onClick={onAddEvent} disabled={locked} style={{ flexShrink: 0 }}>
          Add Event
        </Button>
      </Group>

      {events.length === 0 ? (
        <Card withBorder radius="md">
          <EmptyState
            icon={IconListDetails}
            title="No events yet"
            description="Add matches or tournaments to this series"
          />
        </Card>
      ) : (
        <Stack gap="xs">
          {events.map(ev => (
            <SeriesEventCard
              key={ev.id}
              event={ev}
              isNext={series.next_event?.id === ev.id}
              editable={editable}
              locked={locked}
              onEdit={() => onEditEvent(ev)}
              onRemove={() => onRemoveEvent(ev)}
            />
          ))}
        </Stack>
      )}
    </Stack>
  );
}

function SeriesEventCard({
  event, isNext, editable, locked, onEdit, onRemove,
}: {
  event: SeriesEventDetail;
  isNext: boolean;
  editable: boolean;
  locked: boolean;
  onEdit: () => void;
  onRemove: () => void;
}): JSX.Element {
  const navigate = useNavigate();
  const color = event.game_color || SERIES_FALLBACK_COLOR;
  const thumb = event.event_image_url || event.game_cover || '/assets/placeholder-cover.png';
  const date = formatShortDateTime(event.start_date);
  const done = event.status === 'complete';
  const missing = event.name === null;

  return (
    <Card
      withBorder
      radius="md"
      p="sm"
      style={{
        cursor: missing ? 'default' : 'pointer',
        transition: 'all 0.25s ease',
        borderColor: isNext ? color : undefined,
      }}
      onMouseOver={(e) => {
        if (missing) return;
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.boxShadow = `0 8px 24px ${color}33`;
      }}
      onMouseOut={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = '';
      }}
      onClick={() => { if (!missing) navigate(eventHref(event)); }}
    >
      <Group gap="md" wrap="nowrap" align="center">
        <Box
          visibleFrom="xs"
          style={{
            position: 'relative', width: 112, height: 68, borderRadius: 6, overflow: 'hidden', flexShrink: 0,
          }}
        >
          <Image
            src={thumb}
            alt=""
            h="100%"
            w="100%"
            fit="cover"
            style={{ filter: done ? 'saturate(.55)' : undefined }}
          />
          <span
            style={{
              position: 'absolute', top: 6, left: 6, padding: '1px 7px', borderRadius: 999,
              background: 'rgba(0,0,0,.7)', color: '#fff', fontSize: 11, fontWeight: 700,
            }}
          >
            #{event.event_order}
          </span>
        </Box>

        <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
          <Group gap={6} wrap="nowrap">
            <Text hiddenFrom="xs" size="xs" fw={700} c="dimmed">#{event.event_order}</Text>
            <Text fw={600} fz={15} truncate>{event.name ?? 'Deleted event'}</Text>
            {isNext && (
              <Badge size="xs" variant="filled" color={color} style={{ flexShrink: 0 }}>Up next</Badge>
            )}
          </Group>
          <Group gap={6} wrap="nowrap">
            {event.game_icon && <Avatar src={event.game_icon} size={16} radius="xs" />}
            {event.game_name && <Text size="xs" c="dimmed" truncate>{event.game_name} ·</Text>}
            <Badge size="xs" variant="light" color={EVENT_TYPE_COLOR[event.event_type]} style={{ flexShrink: 0 }}>
              {event.event_type}
            </Badge>
          </Group>
          <Group gap={4} wrap="nowrap">
            <IconCalendar size={12} color="var(--mantine-color-dimmed)" />
            <Text size="xs" c="dimmed">{date ?? 'No date set'}</Text>
          </Group>
        </Stack>

        <Stack gap={2} align="center" style={{ flexShrink: 0 }}>
          <SectionLabel>Points</SectionLabel>
          <Text ff="monospace" fw={700} c="violet">{formatMultiplier(event.points_multiplier)}</Text>
        </Stack>

        <Box visibleFrom="xs" style={{ flexShrink: 0 }}>
          <StageRing
            status={event.status ?? undefined}
            type={event.event_type}
            gameColor={color}
            size={44}
            thickness={4}
          />
        </Box>

        <Stack gap={4} style={{ flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
          <Tooltip
            label={editable ? 'Edit multiplier and order' : 'Events can only be edited before the series starts'}
            withArrow
          >
            {/* data-disabled (not disabled) so the tooltip still shows on hover */}
            <ActionIcon
              variant="subtle"
              size="sm"
              data-disabled={!editable || undefined}
              aria-disabled={!editable}
              aria-label="Edit event"
              onClick={(e) => { if (!editable) { e.preventDefault(); return; } onEdit(); }}
            >
              <IconEdit size={14} />
            </ActionIcon>
          </Tooltip>
          <ActionIcon color="red" variant="subtle" size="sm" disabled={locked} aria-label="Remove event" onClick={onRemove}>
            <IconTrash size={14} />
          </ActionIcon>
        </Stack>
      </Group>
    </Card>
  );
}
