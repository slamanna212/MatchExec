import type { JSX } from 'react';
import { Stack, Group, Text, Card, ThemeIcon, Badge, Button } from '@mantine/core';
import { IconTrophy, IconCalendarEvent, IconListDetails } from '@tabler/icons-react';
import { EmptyState } from '@/components/EmptyState';
import { SectionLabel } from '@/components/SectionLabel';
import { SeriesEventRow } from './series-event-row';
import { recentResults, upcomingEvents } from './series-schedule-helpers';
import type { SeriesEventView, SeriesSummary } from './series-shared';

interface SeriesOverviewPanelProps {
  series: SeriesSummary;
  events: SeriesEventView[];
  onOpenSchedule: () => void;
}

export function ChampionBanner({ champion }: { champion: NonNullable<SeriesSummary['champion']> }): JSX.Element {
  return (
    <Card
      withBorder
      radius="md"
      padding="lg"
      data-testid="champion-banner"
      style={{ borderColor: 'var(--mantine-color-yellow-6)', background: 'light-dark(rgba(250, 176, 5, 0.08), rgba(250, 176, 5, 0.06))' }}
    >
      <Group gap="md" wrap="nowrap">
        <ThemeIcon size={48} radius="xl" color="yellow" variant="filled"><IconTrophy size={26} /></ThemeIcon>
        <div style={{ minWidth: 0 }}>
          <SectionLabel>Champion</SectionLabel>
          <Text size="xl" fw={700} truncate>{champion.name}</Text>
          <Text size="xs" c="dimmed">
            {champion.source === 'season_playoff' ? 'Won the season playoffs' : 'Finished first in the season standings'}
          </Text>
        </div>
      </Group>
    </Card>
  );
}

/** Overview tab: champion banner, the next events and the latest results. */
export function SeriesOverviewPanel({ series, events, onOpenSchedule }: SeriesOverviewPanelProps): JSX.Element {
  const upcoming = upcomingEvents(events, 5);
  const recent = recentResults(events, 3);
  const planned = events.filter((e) => e.status === 'planned');

  return (
    <Stack gap="lg">
      {series.champion && <ChampionBanner champion={series.champion} />}

      <Stack gap="xs">
        <Group justify="space-between">
          <SectionLabel>Up next</SectionLabel>
          {events.length > 0 && (
            <Button variant="subtle" size="compact-xs" leftSection={<IconCalendarEvent size={12} />} onClick={onOpenSchedule}>Full schedule</Button>
          )}
        </Group>
        {upcoming.length === 0 ? (
          <Card withBorder radius="md">
            <EmptyState
              icon={IconListDetails}
              title={events.length === 0 ? 'No events yet' : 'Nothing left to play'}
              description={events.length === 0 ? 'Build the schedule in the Schedule tab' : 'Every scheduled event has finished'}
              action={events.length === 0 ? <Button size="xs" onClick={onOpenSchedule}>Open schedule</Button> : undefined}
            />
          </Card>
        ) : (
          upcoming.map((ev) => <SeriesEventRow key={ev.id} event={ev} isNext={series.next_event?.id === ev.id} />)
        )}
        {planned.length > 0 && (
          <Group gap={6}>
            <Badge size="sm" variant="light" color="violet">{planned.length} playoff {planned.length === 1 ? 'placeholder' : 'placeholders'}</Badge>
            <Text size="xs" c="dimmed">waiting to be seeded</Text>
          </Group>
        )}
      </Stack>

      {recent.length > 0 && (
        <Stack gap="xs">
          <SectionLabel>Latest results</SectionLabel>
          {recent.map((ev) => <SeriesEventRow key={ev.id} event={ev} />)}
        </Stack>
      )}
    </Stack>
  );
}
