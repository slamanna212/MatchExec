import type { JSX } from 'react';
import { Stack, Group, Text, Card, Badge, Progress, SimpleGrid, Alert, Button } from '@mantine/core';
import { IconBan, IconUserExclamation } from '@tabler/icons-react';
import type { SeriesStageDto } from '@/shared/series-types';
import { useOverviewData } from './series-overview-data';
import type { OverviewData } from './series-overview-data';
import { ChampionBanner, ResultsList, StandingsSnapshot, StatTile, UpNextList } from './series-overview-parts';
import type { OpenTab } from './series-overview-parts';
import { DraftOverview, RegistrationOverview } from './series-overview-setup';
import { formatShortDate, seriesProgress } from './series-shared';
import type { SeriesEventView, SeriesSummary } from './series-shared';

interface SeriesOverviewPanelProps {
  series: SeriesSummary;
  events: SeriesEventView[];
  /** Bumped by the page after every reload, so the overview's extras stay in step with the series. */
  refreshToken: number;
  onOpenTab: OpenTab;
  onChanged: () => void;
}

interface ViewProps {
  series: SeriesSummary;
  events: SeriesEventView[];
  data: OverviewData;
  onOpenTab: OpenTab;
}

function stageProgress(stage: SeriesStageDto, events: readonly SeriesEventView[]): { done: number; total: number } {
  const inStage = events.filter((e) => e.stage_id === stage.id && e.status === 'live');
  return { done: inStage.filter((e) => e.target_status === 'complete').length, total: inStage.length };
}

function SeasonProgressCard({ series, events, stages }: { series: SeriesSummary; events: SeriesEventView[]; stages: SeriesStageDto[] | null }): JSX.Element {
  const current = stages?.find((s) => s.status === 'active') ?? null;
  const stage = current ? stageProgress(current, events) : null;
  const stageIndex = current && stages ? stages.indexOf(current) + 1 : 0;
  return (
    <Card withBorder radius="md" padding="md" data-testid="season-progress">
      <Stack gap="sm">
        <div>
          <Group justify="space-between" mb={4}>
            <Text size="sm" fw={600}>Season</Text>
            <Text size="sm" c="dimmed">{series.completed_event_count} / {series.event_count} events played</Text>
          </Group>
          <Progress value={seriesProgress(series)} color="violet" radius="xl" />
        </div>
        {current && stage && stages && (
          <div>
            <Group justify="space-between" mb={4}>
              <Group gap={6}>
                <Text size="sm" fw={600}>{current.name}</Text>
                <Badge size="xs" variant="light" color="violet">Stage {stageIndex} of {stages.length}</Badge>
              </Group>
              <Text size="sm" c="dimmed">{stage.done} / {stage.total} played</Text>
            </Group>
            <Progress value={stage.total > 0 ? (stage.done / stage.total) * 100 : 0} color="grape" radius="xl" size="sm" />
          </div>
        )}
      </Stack>
    </Card>
  );
}

/** Season running: progress, what is next, the latest results and the top of the table. */
function ActiveOverview({ series, events, data, onOpenTab }: ViewProps): JSX.Element {
  const pending = data.entrants?.filter((e) => e.status === 'pending').length ?? 0;
  return (
    <Stack gap="lg">
      {pending > 0 && (
        <Alert color="yellow" variant="light" icon={<IconUserExclamation size={16} />}>
          <Group justify="space-between" wrap="nowrap">
            <Text size="sm">{pending} {pending === 1 ? 'entrant is' : 'entrants are'} still waiting for approval.</Text>
            <Button size="compact-xs" variant="light" color="yellow" onClick={() => onOpenTab('entrants')}>Review</Button>
          </Group>
        </Alert>
      )}
      <SeasonProgressCard series={series} events={events} stages={data.stages} />
      <UpNextList series={series} events={events} limit={3} onOpenTab={onOpenTab} />
      <ResultsList events={events} limit={3} />
      <StandingsSnapshot standings={data.standings} limit={5} onOpenTab={onOpenTab} />
    </Stack>
  );
}

function SeasonSummary({ series, data }: { series: SeriesSummary; data: OverviewData }): JSX.Element {
  const start = formatShortDate(series.start_date);
  const end = formatShortDate(series.end_date);
  const entrants = data.entrants?.filter((e) => e.status !== 'pending').length ?? series.entrant_count;
  return (
    <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="sm">
      <StatTile label="Events played" value={`${series.completed_event_count} / ${series.event_count}`} />
      <StatTile label={series.entrant_type === 'team' ? 'Teams' : 'Players'} value={entrants} />
      <StatTile label="Season" value={start || end ? `${start ?? '?'} – ${end ?? '?'}` : '—'} />
    </SimpleGrid>
  );
}

/** Season over: champion, final podium and a short recap. */
function CompleteOverview({ series, events, data, onOpenTab }: ViewProps): JSX.Element {
  return (
    <Stack gap="lg">
      {series.champion && <ChampionBanner champion={series.champion} />}
      <StandingsSnapshot standings={data.standings} limit={3} label="Final standings" onOpenTab={onOpenTab} />
      <SeasonSummary series={series} data={data} />
      <ResultsList events={events} limit={3} label="Final results" />
    </Stack>
  );
}

function CancelledOverview({ series, events, data }: ViewProps): JSX.Element {
  return (
    <Stack gap="lg">
      <Alert color="gray" variant="light" icon={<IconBan size={16} />} title="This series was cancelled">
        Its matches and tournaments were not affected and stay in their own history.
      </Alert>
      <SeasonSummary series={series} data={data} />
      <ResultsList events={events} limit={3} label="Played before cancellation" />
    </Stack>
  );
}

/** Overview tab: a different view per series status (setup, registration, season, recap). */
export function SeriesOverviewPanel({ series, events, refreshToken, onOpenTab, onChanged }: SeriesOverviewPanelProps): JSX.Element {
  const data = useOverviewData(series, refreshToken);
  const props = { series, events, data, onOpenTab };
  switch (series.status) {
    case 'created': return <DraftOverview {...props} onChanged={onChanged} />;
    case 'registration': return <RegistrationOverview {...props} onChanged={onChanged} />;
    case 'complete': return <CompleteOverview {...props} />;
    case 'cancelled': return <CancelledOverview {...props} />;
    default: return <ActiveOverview {...props} />;
  }
}
