import type { JSX } from 'react';
import { Stack, Group, Text, Card, Badge, ThemeIcon, Loader, Center, Alert, Button } from '@mantine/core';
import { IconRepeat, IconFlag, IconSwords, IconTrophy, IconCalendarTime } from '@tabler/icons-react';
import type { SeriesBatchDto, SeriesStageDto } from '@/shared/series-types';
import { describeScheduleConfig } from './series-fixtures';
import { OverviewSection } from './series-overview-parts';
import type { OpenTab } from './series-overview-parts';
import { ProjectedBracketView, useProjectedBracket } from './series-placeholder-modals';
import { plannedWork } from './series-schedule-helpers';
import { formatShortDateTime } from './series-shared';
import type { SeriesEventView, SeriesSummary } from './series-shared';

interface LayoutLine {
  key: string;
  icon: JSX.Element;
  title: string;
  detail: string;
  stageId: string | null;
}

/** Placeholders of the season, in order: planned schedules, match placeholders and playoffs. */
export function layoutLines(events: readonly SeriesEventView[], batches: readonly SeriesBatchDto[]): LayoutLine[] {
  const lines: Array<LayoutLine & { order: number }> = [];
  for (const b of batches.filter((x) => x.status === 'planned')) {
    lines.push({
      key: b.id, order: b.position ?? 0, stageId: b.stage_id,
      icon: b.kind === 'round_robin' ? <IconRepeat size={14} /> : <IconFlag size={14} />,
      title: b.kind === 'round_robin' ? 'Round robin' : 'Race calendar',
      detail: describeScheduleConfig(b.kind, b.config),
    });
  }
  for (const e of events.filter((x) => x.status === 'planned')) {
    const playoff = !e.match_template;
    lines.push({
      key: e.id, order: e.event_order, stageId: e.stage_id,
      icon: playoff ? <IconTrophy size={14} /> : <IconSwords size={14} />,
      title: e.name ?? (playoff ? 'Playoffs' : 'Match'),
      detail: playoff && e.seeding_rule
        ? `Top ${e.seeding_rule.top}${e.seeding_rule.per_division ? ' per division' : ''} · ${e.seeding_rule.format.replace(/-/g, ' ')}`
        : `${formatShortDateTime(e.start_date) ?? 'No date'} · entrants picked at registration close`,
    });
  }
  return lines.sort((a, b) => a.order - b.order).map(({ order: _o, ...l }) => l);
}

/** The planned season (draft / registration): what gets built when registration closes, grouped by stage. */
export function SeasonLayoutCard({ events, batches, stages, onOpenTab }: {
  events: SeriesEventView[]; batches: SeriesBatchDto[]; stages: SeriesStageDto[] | null; onOpenTab: OpenTab;
}): JSX.Element | null {
  const lines = layoutLines(events, batches);
  if (lines.length === 0) return null;
  const stageName = new Map((stages ?? []).map((s) => [s.id, s.name]));
  const groups = new Map<string, LayoutLine[]>();
  for (const l of lines) {
    const k = l.stageId && stageName.has(l.stageId) ? l.stageId : '';
    groups.set(k, [...(groups.get(k) ?? []), l]);
  }
  const ordered = [...(stages ?? []).map((s) => s.id).filter((id) => groups.has(id)), ...(groups.has('') ? [''] : [])];
  return (
    <OverviewSection label="Season layout" link={{ label: 'Schedule', onClick: () => onOpenTab('schedule') }} testId="season-layout">
      <Card withBorder radius="md" padding="md">
        <Stack gap="sm">
          {ordered.map((k) => (
            <Stack key={k || 'unstaged'} gap={6}>
              {(stages?.length ?? 0) > 0 && <Text size="xs" fw={700} c="dimmed" tt="uppercase">{stageName.get(k) ?? 'Unstaged'}</Text>}
              {groups.get(k)?.map((l) => (
                <Group key={l.key} gap="sm" wrap="nowrap" align="flex-start">
                  <ThemeIcon size="sm" variant="light" color="violet" mt={2}>{l.icon}</ThemeIcon>
                  <div style={{ minWidth: 0 }}>
                    <Text size="sm" fw={600}>{l.title}</Text>
                    <Text size="xs" c="dimmed">{l.detail}</Text>
                  </div>
                </Group>
              ))}
            </Stack>
          ))}
        </Stack>
      </Card>
    </OverviewSection>
  );
}

/** Registration open: what closing it will do, and the button that does it. */
export function CloseRegistrationCard({ series, events, batches, approved, onStartSeason }: {
  series: SeriesSummary; events: SeriesEventView[]; batches: SeriesBatchDto[]; approved: number | null; onStartSeason?: () => void;
}): JSX.Element {
  const work = plannedWork(events, batches);
  const parts = [
    work.batches.length > 0 && `generate ${work.batches.length === 1 ? 'the planned schedule' : `${work.batches.length} planned schedules`}`,
    work.matches.length > 0 && `assign ${work.matches.length === 1 ? 'one match' : `${work.matches.length} matches`}`,
  ].filter(Boolean);
  const ready = approved !== null && approved >= 2;
  return (
    <Card withBorder radius="md" padding="md" data-testid="close-registration-card">
      <Group justify="space-between" wrap="wrap" gap="sm">
        <Group gap="sm" wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
          <ThemeIcon size={36} radius="md" color="violet" variant="light"><IconCalendarTime size={20} /></ThemeIcon>
          <div style={{ minWidth: 0 }}>
            <Text fw={600}>When sign-ups are done</Text>
            <Text size="sm" c="dimmed">
              {parts.length > 0
                ? `Close registration to split divisions, ${parts.join(' and ')} with the approved ${series.entrant_type === 'team' ? 'teams' : 'players'}, and start the season.`
                : 'Close registration to start the season.'}
            </Text>
          </div>
        </Group>
        {onStartSeason && (
          <Button color="violet" onClick={onStartSeason} disabled={!ready}>Close registration</Button>
        )}
      </Group>
    </Card>
  );
}

function PlayoffPicture({ series, event, refreshToken }: { series: SeriesSummary; event: SeriesEventView; refreshToken: number }): JSX.Element {
  const { bracket, error } = useProjectedBracket(series.id, event.id, refreshToken);
  return (
    <Card withBorder radius="md" padding="md">
      <Stack gap="sm">
        <Group justify="space-between" wrap="nowrap">
          <Group gap={6}><IconTrophy size={16} /><Text fw={600}>{event.name ?? 'Playoffs'}</Text></Group>
          {bracket && <Badge variant="light" color={bracket.provisional ? 'gray' : 'violet'}>{bracket.provisional ? 'If the season ended today' : 'Qualifiers decided'}</Badge>}
        </Group>
        {error && <Alert color="red" variant="light">{error}</Alert>}
        {!bracket && !error && <Center py="xs"><Loader size="sm" /></Center>}
        {bracket && <ProjectedBracketView bracket={bracket} />}
      </Stack>
    </Card>
  );
}

/** Running season: the playoff picture of every playoff placeholder (live from the standings). */
export function PlayoffPictureSection({ series, events, refreshToken, onOpenTab }: {
  series: SeriesSummary; events: SeriesEventView[]; refreshToken: number; onOpenTab: OpenTab;
}): JSX.Element | null {
  const playoffs = events.filter((e) => e.status === 'planned' && !e.match_template && e.seeding_rule);
  if (playoffs.length === 0) return null;
  return (
    <OverviewSection label="Playoff picture" link={{ label: 'Standings', onClick: () => onOpenTab('standings') }} testId="playoff-picture">
      <Stack gap="sm">
        {playoffs.map((e) => <PlayoffPicture key={e.id} series={series} event={e} refreshToken={refreshToken} />)}
      </Stack>
    </OverviewSection>
  );
}
