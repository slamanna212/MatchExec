import type { JSX, ReactNode } from 'react';
import { Stack, Group, Text, Card, ThemeIcon, Badge, Button, Table } from '@mantine/core';
import { IconTrophy, IconListDetails, IconArrowRight } from '@tabler/icons-react';
import { EmptyState } from '@/components/EmptyState';
import { SectionLabel } from '@/components/SectionLabel';
import type { SeriesStandingsResponse } from '@/shared/series-types';
import { SeriesEventRow } from './series-event-row';
import { recentResults, upcomingEvents } from './series-schedule-helpers';
import { formatPoints, ordinal } from './series-shared';
import type { SeriesEventView, SeriesSummary } from './series-shared';
import type { SeriesTab } from './series-detail-page';

export type OpenTab = (tab: SeriesTab) => void;

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

/** Section label with an optional "go to tab" link on the right. */
export function OverviewSection({ label, link, children, testId }: {
  label: string;
  link?: { label: string; onClick: () => void };
  children: ReactNode;
  testId?: string;
}): JSX.Element {
  return (
    <Stack gap="xs" data-testid={testId}>
      <Group justify="space-between" wrap="nowrap">
        <SectionLabel>{label}</SectionLabel>
        {link && (
          <Button variant="subtle" size="compact-xs" rightSection={<IconArrowRight size={12} />} onClick={link.onClick}>{link.label}</Button>
        )}
      </Group>
      {children}
    </Stack>
  );
}

/** Small number tile for the stat rows. */
export function StatTile({ label, value, hint, color }: { label: string; value: ReactNode; hint?: ReactNode; color?: string }): JSX.Element {
  return (
    <Card withBorder radius="md" padding="sm">
      <SectionLabel>{label}</SectionLabel>
      <Text size="xl" fw={700} c={color} lh={1.3}>{value}</Text>
      {hint && <Text size="xs" c="dimmed">{hint}</Text>}
    </Card>
  );
}

/** The next unfinished events, with an empty state that points at the schedule. */
export function UpNextList({ series, events, limit, label = 'Up next', onOpenTab }: {
  series: SeriesSummary;
  events: SeriesEventView[];
  limit: number;
  label?: string;
  onOpenTab: OpenTab;
}): JSX.Element {
  const upcoming = upcomingEvents(events, limit);
  const planned = events.filter((e) => e.status === 'planned').length;
  return (
    <OverviewSection label={label} link={events.length > 0 ? { label: 'Full schedule', onClick: () => onOpenTab('schedule') } : undefined}>
      {upcoming.length === 0 ? (
        <Card withBorder radius="md">
          <EmptyState
            icon={IconListDetails}
            title={events.length === 0 ? 'No events yet' : 'Nothing left to play'}
            description={events.length === 0 ? 'Build the schedule in the Schedule tab' : 'Every scheduled event has finished'}
            action={events.length === 0 ? <Button size="xs" onClick={() => onOpenTab('schedule')}>Open schedule</Button> : undefined}
          />
        </Card>
      ) : (
        upcoming.map((ev) => <SeriesEventRow key={ev.id} event={ev} isNext={series.next_event?.id === ev.id} />)
      )}
      {planned > 0 && (
        <Group gap={6}>
          <Badge size="sm" variant="light" color="violet">{planned} playoff {planned === 1 ? 'placeholder' : 'placeholders'}</Badge>
          <Text size="xs" c="dimmed">waiting to be seeded</Text>
        </Group>
      )}
    </OverviewSection>
  );
}

/** The latest finished events; renders nothing before the first result. */
export function ResultsList({ events, limit, label = 'Latest results' }: { events: SeriesEventView[]; limit: number; label?: string }): JSX.Element | null {
  const recent = recentResults(events, limit);
  if (recent.length === 0) return null;
  return (
    <OverviewSection label={label}>
      {recent.map((ev) => <SeriesEventRow key={ev.id} event={ev} />)}
    </OverviewSection>
  );
}

function recordText(row: SeriesStandingsResponse['rows'][number]): string {
  const ties = row.match_ties ? `-${row.match_ties}` : '';
  return `${row.match_wins ?? 0}-${row.match_losses ?? 0}${ties}`;
}

/** Top of the season standings; renders nothing until someone has played. */
export function StandingsSnapshot({ standings, limit, label = 'Standings', onOpenTab }: {
  standings: SeriesStandingsResponse | null;
  limit: number;
  label?: string;
  onOpenTab: OpenTab;
}): JSX.Element | null {
  const rows = (standings?.rows ?? []).filter((r) => r.events_played > 0).slice(0, limit);
  if (!standings || rows.length === 0) return null;
  const h2h = standings.mode === 'head_to_head';
  return (
    <OverviewSection label={label} link={{ label: 'Full standings', onClick: () => onOpenTab('standings') }} testId="standings-snapshot">
      <Card withBorder radius="md" padding={0}>
        <Table verticalSpacing={6} horizontalSpacing="sm">
          <Table.Tbody>
            {rows.map((r) => (
              <Table.Tr key={r.key}>
                <Table.Td w={44}><Text size="sm" fw={700} c={r.rank === 1 ? 'yellow' : 'dimmed'}>{ordinal(r.rank)}</Text></Table.Td>
                <Table.Td>
                  <Group gap={8} wrap="nowrap">
                    {r.color && <span style={{ width: 8, height: 8, borderRadius: 4, background: r.color, flexShrink: 0 }} />}
                    <Text size="sm" fw={500} truncate>{r.name}</Text>
                  </Group>
                </Table.Td>
                {h2h && <Table.Td ta="right"><Text size="sm" c="dimmed">{recordText(r)}</Text></Table.Td>}
                <Table.Td ta="right" w={80}><Text size="sm" fw={600}>{formatPoints(r.total_points)} pts</Text></Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Card>
    </OverviewSection>
  );
}
