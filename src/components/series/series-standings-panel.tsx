import { useEffect, useMemo, useState } from 'react';
import type { JSX } from 'react';
import { Stack, Group, Text, Badge, Card, Select, SegmentedControl, Loader, Center, Alert, Tooltip, ColorSwatch } from '@mantine/core';
import { IconAlertCircle, IconTrophy } from '@tabler/icons-react';
import { EmptyState } from '@/components/EmptyState';
import { RankedTable } from '@/components/shared/RankedTable';
import type { RankedTableColumn } from '@/components/shared/RankedTable';
import { logger } from '@/lib/logger/client';
import type { SeriesStageDto, SeriesStandingRow, SeriesStandingsResponse } from '@/shared/series-types';
import { errorMessage, scheduleApi } from './series-schedule-api';
import { formatPoints } from './series-shared';
import type { SeriesSummary } from './series-shared';
import {
  SEASON_SCOPE, divisionNames, effectiveScoringConfig, eventPointsFor, filterByDivision, formatDiff, formatRecord, hasLeaguePoints,
  scopeOptions,
} from './series-standings-helpers';

interface SeriesStandingsPanelProps {
  series: Pick<SeriesSummary, 'id' | 'entrant_type' | 'scoring_config'>;
  stages: SeriesStageDto[];
  /** Changes whenever the page reloaded its data, so the table refreshes with it. */
  refreshToken?: number;
}

function EntrantCell({ row, individual }: { row: SeriesStandingRow; individual: boolean }): JSX.Element {
  return (
    <>
      <Group gap={6} wrap="nowrap">
        {row.color && <ColorSwatch color={row.color} size={12} withShadow={false} style={{ flexShrink: 0 }} />}
        <Text fw={500} size="sm" truncate>{row.name}</Text>
        {row.tag && <Badge size="xs" variant="outline" color="gray" style={{ flexShrink: 0 }}>{row.tag}</Badge>}
      </Group>
      <Text size="xs" c="dimmed" truncate>
        {individual && row.entrant_name ? `${row.entrant_name} · ` : ''}
        {row.events_played} {row.events_played === 1 ? 'event' : 'events'} played
      </Text>
    </>
  );
}

function HeadToHeadTable({ rows, showPoints, individual }: { rows: SeriesStandingRow[]; showPoints: boolean; individual: boolean }): JSX.Element {
  const columns: RankedTableColumn<SeriesStandingRow>[] = [
    {
      key: 'record', width: '84px', align: 'center', header: 'W-L-T',
      render: (r) => <Text size="sm" fw={600}>{formatRecord(r.match_wins, r.match_losses, r.match_ties)}</Text>,
    },
    {
      key: 'maps', width: '84px', align: 'center', header: 'Maps',
      render: (r) => <Text size="sm">{formatRecord(r.map_wins, r.map_losses, r.map_ties)}</Text>,
    },
    {
      key: 'diff', width: '64px', align: 'center', header: 'Diff',
      render: (r) => (
        <Text size="sm" c={(r.map_diff ?? 0) > 0 ? 'green' : (r.map_diff ?? 0) < 0 ? 'red' : 'dimmed'}>{formatDiff(r.map_diff)}</Text>
      ),
    },
    ...(showPoints ? [{
      key: 'points', width: '72px', align: 'right' as const, header: 'Pts',
      render: (r: SeriesStandingRow) => <Text size="lg" fw={700}>{formatPoints(r.total_points)}</Text>,
    }] : []),
  ];
  return (
    <RankedTable
      rows={rows}
      getKey={(r) => r.key}
      getRank={(r) => r.rank}
      primaryHeader={individual ? 'Player' : 'Entrant'}
      renderPrimary={(r) => <EntrantCell row={r} individual={individual} />}
      columns={columns}
      minWidth={420}
    />
  );
}

function PointsTable({ rows, events, individual }: {
  rows: SeriesStandingRow[]; events: SeriesStandingsResponse['events']; individual: boolean;
}): JSX.Element {
  const eventColumns: RankedTableColumn<SeriesStandingRow>[] = events.map((ev) => ({
    key: ev.id,
    width: '64px',
    align: 'center',
    header: (
      <Tooltip label={ev.name ?? `Event #${ev.event_order}`} withArrow>
        <span>#{ev.event_order}</span>
      </Tooltip>
    ),
    render: (row) => {
      const entry = eventPointsFor(row, ev.id);
      if (!entry || entry.points === null) return <Text size="sm" c="dimmed">—</Text>;
      if (entry.dropped) {
        return (
          <Tooltip label="Dropped (one of the worst results)" withArrow>
            <Text size="sm" c="dimmed" td="line-through" data-dropped="true">{formatPoints(entry.points)}</Text>
          </Tooltip>
        );
      }
      return <Text size="sm" c={entry.points === 0 ? 'dimmed' : undefined}>{formatPoints(entry.points)}</Text>;
    },
  }));
  const columns: RankedTableColumn<SeriesStandingRow>[] = [
    ...eventColumns,
    { key: 'wins', width: '56px', align: 'center', header: 'Wins', render: (r) => <Text size="sm">{r.event_wins ?? 0}</Text> },
    { key: 'podiums', width: '72px', align: 'center', header: 'Podiums', render: (r) => <Text size="sm">{r.podiums ?? 0}</Text> },
    { key: 'total', width: '84px', align: 'right', header: 'Total', render: (r) => <Text size="lg" fw={700}>{formatPoints(r.total_points)}</Text> },
  ];
  return (
    <RankedTable
      rows={rows}
      getKey={(r) => r.key}
      getRank={(r) => r.rank}
      primaryHeader={individual ? 'Player' : 'Entrant'}
      renderPrimary={(r) => <EntrantCell row={r} individual={individual} />}
      columns={columns}
      minWidth={280 + events.length * 76 + 250}
    />
  );
}

/** Standings tab: scope (season / stage), view (entrants / individual), division filter, and the head-to-head or points table. */
export function SeriesStandingsPanel({ series, stages, refreshToken = 0 }: SeriesStandingsPanelProps): JSX.Element {
  const [scope, setScope] = useState(SEASON_SCOPE);
  const [view, setView] = useState<'entrant' | 'individual'>('entrant');
  const [division, setDivision] = useState<string | null>(null);
  const [data, setData] = useState<SeriesStandingsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const team = series.entrant_type === 'team';

  // A stage that no longer exists falls back to the season table.
  const activeScope = scope === SEASON_SCOPE || stages.some((s) => s.id === scope) ? scope : SEASON_SCOPE;

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await scheduleApi.standings(series.id, activeScope, team ? view : 'entrant');
        if (cancelled) return;
        setData(res);
        setError(null);
      } catch (err) {
        logger.error('Error loading series standings:', err);
        if (!cancelled) setError(errorMessage(err, 'Failed to load standings'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [series.id, activeScope, view, team, refreshToken]);

  const stage = stages.find((s) => s.id === activeScope);
  const config = useMemo(() => effectiveScoringConfig(series.scoring_config, stage?.scoring_config), [series.scoring_config, stage]);
  const rows = useMemo(() => data?.rows ?? data?.standings ?? [], [data]);
  const divisions = useMemo(() => divisionNames(data?.divisions ?? [], rows), [data, rows]);
  const activeDivision = division && divisions.includes(division) ? division : null;
  const visibleRows = useMemo(() => filterByDivision(rows, activeDivision), [rows, activeDivision]);
  const individual = (data?.view ?? view) === 'individual';

  const controls = (
    <Group gap="sm" align="flex-end" wrap="wrap">
      {stages.length > 0 && (
        <Select
          aria-label="Standings scope"
          size="xs"
          w={180}
          allowDeselect={false}
          data={scopeOptions(stages)}
          value={activeScope}
          onChange={(v) => setScope(v ?? SEASON_SCOPE)}
        />
      )}
      {divisions.length > 0 && (
        <Select
          aria-label="Division"
          size="xs"
          w={160}
          placeholder="All divisions"
          clearable
          data={divisions}
          value={activeDivision}
          onChange={setDivision}
        />
      )}
      {team && (
        <SegmentedControl
          size="xs"
          value={view}
          onChange={(v) => setView(v as 'entrant' | 'individual')}
          data={[{ label: 'Entrants', value: 'entrant' }, { label: 'Individual', value: 'individual' }]}
        />
      )}
    </Group>
  );

  let body: JSX.Element;
  if (loading && !data) {
    body = <Center py="xl"><Loader /></Center>;
  } else if (error && !data) {
    body = <Alert color="red" icon={<IconAlertCircle size={16} />}>{error}</Alert>;
  } else if (visibleRows.length === 0) {
    body = (
      <Card withBorder radius="md">
        <EmptyState icon={IconTrophy} title="No standings yet" description="Standings appear once events in this series are completed" />
      </Card>
    );
  } else if (data?.mode === 'head_to_head') {
    body = <HeadToHeadTable rows={visibleRows} showPoints={hasLeaguePoints(config)} individual={individual} />;
  } else {
    body = <PointsTable rows={visibleRows} events={data?.events ?? []} individual={individual} />;
  }

  const multiplierEvents = data?.events ?? [];
  return (
    <Stack gap="xs">
      {controls}
      {body}
      {data?.mode === 'points' && visibleRows.length > 0 && (
        <Text size="xs" c="dimmed" ta="center">
          Event columns show points after multipliers{multiplierEvents.length > 0 ? ' (hover a column for the event)' : ''}.
          {(config.drop_worst ?? 0) > 0 ? ` The ${config.drop_worst} worst ${config.drop_worst === 1 ? 'result is' : 'results are'} dropped (struck through).` : ''}
        </Text>
      )}
      {data?.mode === 'head_to_head' && visibleRows.length > 0 && (
        <Text size="xs" c="dimmed" ta="center">
          Record is wins-losses-ties.{hasLeaguePoints(config) ? ` League points: ${formatPoints(config.win_points ?? 0)} per win, ${formatPoints(config.loss_points ?? 0)} per loss, ${formatPoints(config.tie_points ?? 0)} per tie.` : ''}
        </Text>
      )}
    </Stack>
  );
}
