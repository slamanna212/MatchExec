import { useState, useEffect, useCallback } from 'react';
import type { JSX } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import {
  Stack, Group, Text, Grid, Skeleton, Alert, Anchor, Breadcrumbs, SegmentedControl,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { IconAlertCircle } from '@tabler/icons-react';
import { logger } from '@/lib/logger/client';
import { notificationHelper } from '@/lib/notifications';
import { SeriesInfoPanel } from './SeriesInfoPanel';
import { SeriesEntrantsPanel } from './series-entrants-panel';
import { SeriesOverviewPanel } from './series-overview-panel';
import { SeriesSchedulePanel } from './series-schedule-panel';
import { useSeriesStages } from './series-schedule-api';
import { SeriesStandingsPanel } from './series-standings-panel';
import { CloseRegistrationModal } from './series-close-modal';
import { plannedWork } from './series-schedule-helpers';
import { isEventFinished } from './series-shared';
import type { SeriesSummary, SeriesEventView } from './series-shared';
import type { SeriesBatchDto } from '@/shared/series-types';
import { usePolling } from '@/hooks/usePolling';
import { useRefreshInterval } from '@/lib/ui-settings-client';

export type SeriesTab = 'overview' | 'schedule' | 'standings' | 'entrants';
const TABS: SeriesTab[] = ['overview', 'schedule', 'standings', 'entrants'];

/** The `?tab=` value of the URL, falling back to the overview. */
export function parseSeriesTab(value: string | null): SeriesTab {
  return TABS.includes(value as SeriesTab) ? (value as SeriesTab) : 'overview';
}

function StandingsTab({ series, refreshToken }: { series: SeriesSummary; refreshToken: number }): JSX.Element {
  const { stages } = useSeriesStages(series.id);
  return <SeriesStandingsPanel series={series} stages={stages} refreshToken={refreshToken} />;
}

const TRANSITION_MESSAGES: Record<string, { loading: string; success: string }> = {
  registration: { loading: 'Opening registration...', success: 'Registration is open!' },
  active: { loading: 'Activating series...', success: 'Series activated!' },
  complete: { loading: 'Completing series...', success: 'Series completed!' },
  cancelled: { loading: 'Cancelling series...', success: 'Series cancelled' },
};

function DetailSkeleton(): JSX.Element {
  return (
    <div className="container mx-auto py-6 px-2">
      <Stack gap="lg">
        <Group gap="xs">
          <Skeleton height={16} width={80} />
          <Skeleton height={16} width={140} />
        </Group>
        <Grid gap="lg">
          <Grid.Col span={{ base: 12, md: 4 }}>
            <Stack gap="md">
              <Skeleton height={340} radius="md" />
              <Skeleton height={260} radius="md" />
              <Skeleton height={120} radius="md" />
            </Stack>
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 8 }}>
            <Stack gap="md">
              <Group justify="center"><Skeleton height={36} width={260} radius="xl" /></Group>
              {[1, 2, 3].map(i => <Skeleton key={i} height={96} radius="md" />)}
            </Stack>
          </Grid.Col>
        </Grid>
      </Stack>
    </div>
  );
}

export function SeriesDetailPage({ seriesId }: { seriesId: string }): JSX.Element {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = parseSeriesTab(searchParams.get('tab'));
  const [series, setSeries] = useState<SeriesSummary | null>(null);
  const [events, setEvents] = useState<SeriesEventView[]>([]);
  const [batches, setBatches] = useState<SeriesBatchDto[]>([]);
  const [closing, setClosing] = useState(false);
  const [dataVersion, setDataVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refreshInterval = useRefreshInterval();

  const changeTab = useCallback((next: string) => {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      if (next === 'overview') params.delete('tab');
      else params.set('tab', next);
      return params;
    }, { replace: true });
  }, [setSearchParams]);

  const fetchData = useCallback(async () => {
    try {
      const [seriesRes, eventsRes, batchesRes] = await Promise.all([
        fetch(`/api/series/${seriesId}`),
        fetch(`/api/series/${seriesId}/events`),
        fetch(`/api/series/${seriesId}/batches`),
      ]);
      if (!seriesRes.ok) {
        setError(seriesRes.status === 404 ? 'Series not found' : 'Failed to load series');
        return;
      }
      setError(null);
      setSeries((await seriesRes.json()).series);
      if (eventsRes.ok) setEvents((await eventsRes.json()).events ?? []);
      if (batchesRes.ok) setBatches((await batchesRes.json()).batches ?? []);
      setDataVersion((v) => v + 1);
    } catch (err) {
      logger.error('Error loading series:', err);
      setError('Failed to load series data');
    } finally {
      setLoading(false);
    }
  }, [seriesId]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  // Auto-refresh while the series is running (event progress, standings) or taking registrations (Discord sign-ups),
  // paused while the tab is hidden.
  const isLive = series?.status === 'active' || series?.status === 'registration';
  usePolling(() => fetchData(), isLive ? refreshInterval * 1000 : null);

  const transition = useCallback(async (status: string) => {
    const msgs = TRANSITION_MESSAGES[status];
    const nid = `series-transition-${seriesId}`;
    notificationHelper.loading({ id: nid, message: msgs.loading });
    try {
      const res = await fetch(`/api/series/${seriesId}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        notificationHelper.update(nid, { type: 'error', message: data.error ?? 'Failed to update series status' });
        return;
      }
      notificationHelper.update(nid, { type: 'success', message: msgs.success });
      await fetchData();
    } catch (err) {
      logger.error('Error transitioning series:', err);
      notificationHelper.update(nid, { type: 'error', message: 'An error occurred while updating the series' });
    }
  }, [seriesId, fetchData]);

  const confirmComplete = () => {
    const unfinished = events.filter(e => e.status === 'live' && !isEventFinished(e.target_status)).length;
    modals.openConfirmModal({
      title: 'Complete Series',
      children: (
        <Stack gap="sm">
          <Text size="sm">Mark &quot;{series?.name}&quot; as complete? Standings will be final.</Text>
          {unfinished > 0 && (
            <Text size="sm" c="orange">
              {unfinished} {unfinished === 1 ? 'event hasn\'t' : 'events haven\'t'} finished yet and won&apos;t count.
            </Text>
          )}
        </Stack>
      ),
      labels: { confirm: 'Complete Series', cancel: 'Back' },
      confirmProps: { color: 'blue' },
      onConfirm: () => { void transition('complete'); },
    });
  };

  const confirmCancel = () => {
    modals.openConfirmModal({
      title: 'Cancel Series',
      children: (
        <Text size="sm">
          Cancel &quot;{series?.name}&quot;? This cannot be undone. Its matches and tournaments are not affected.
        </Text>
      ),
      labels: { confirm: 'Cancel Series', cancel: 'Back' },
      confirmProps: { color: 'red' },
      onConfirm: () => { void transition('cancelled'); },
    });
  };

  const work = plannedWork(events, batches);
  const hasPlannedWork = work.batches.length > 0 || work.matches.length > 0;
  // With placeholders to fill, starting the season goes through the close dialog (divisions, assignments, generation).
  const startSeason = () => {
    if (hasPlannedWork) setClosing(true);
    else void transition('active');
  };

  if (loading && !series) return <DetailSkeleton />;

  if (error || !series) {
    return (
      <div className="container mx-auto py-6 px-2">
        <Stack>
          <Alert color="red" icon={<IconAlertCircle size={16} />}>{error ?? 'Series not found'}</Alert>
          <Anchor component={Link} to="/series">← Back to Series</Anchor>
        </Stack>
      </div>
    );
  }

  const isHistory = series.status === 'complete' || series.status === 'cancelled';
  const parentTitle = isHistory ? 'Series History' : 'Series';
  const parentHref = isHistory ? '/series/history' : '/series';

  return (
    <div className="container mx-auto py-6 pl-2 pr-2">
      <Breadcrumbs mb="xs" visibleFrom="sm" style={{ marginLeft: '0.5rem' }}>
        <Anchor size="sm" c="dimmed" component={Link} to={parentHref}>{parentTitle}</Anchor>
        <Text size="sm">{series.name}</Text>
      </Breadcrumbs>
      <Anchor
        component={Link}
        to={parentHref}
        size="sm"
        c="dimmed"
        hiddenFrom="sm"
        style={{ display: 'block', marginBottom: '0.5rem', marginLeft: '0.5rem' }}
      >
        ← {parentTitle}
      </Anchor>

      <Grid gap="lg">
        <Grid.Col span={{ base: 12, md: 4 }} pl={{ base: 'md', md: 0 }}>
          <SeriesInfoPanel
            series={series}
            onActivate={startSeason}
            hasPlannedWork={hasPlannedWork}
            onOpenRegistration={() => { void transition('registration'); }}
            onAddEvent={() => changeTab('schedule')}
            onEdit={() => navigate(`/series/${seriesId}/edit`)}
            onComplete={confirmComplete}
            onCancel={confirmCancel}
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 8 }} pr={{ base: 'md', md: 0 }}>
          {/*
            On mobile the info panel stacks above the tabs. Switching tabs swaps in a panel that first renders short
            (loading), so the document shrank and the browser clamped the scroll position up: the page jumped. Keeping
            at least a viewport of height from the selector down means the scroll position never has to move.
          */}
          <Stack gap="md" mih={{ base: '100dvh', md: 0 }}>
            <Group justify="center">
              <SegmentedControl
                size="sm"
                value={tab}
                style={{ maxWidth: '100%', overflowX: 'auto' }}
                onChange={changeTab}
                data={[
                  { label: 'Overview', value: 'overview' },
                  { label: `Schedule (${events.length + work.batches.length})`, value: 'schedule' },
                  { label: 'Standings', value: 'standings' },
                  { label: 'Entrants', value: 'entrants' },
                ]}
              />
            </Group>
            {tab === 'overview' && (
              <SeriesOverviewPanel
                series={series}
                events={events}
                batches={batches}
                refreshToken={dataVersion}
                onOpenTab={changeTab}
                onChanged={() => { void fetchData(); }}
                onStartSeason={startSeason}
              />
            )}
            {tab === 'schedule' && (
              <SeriesSchedulePanel series={series} events={events} batches={batches} onChanged={() => { void fetchData(); }} />
            )}
            {tab === 'standings' && <StandingsTab series={series} refreshToken={dataVersion} />}
            {tab === 'entrants' && (
              <SeriesEntrantsPanel series={series} onChanged={() => { void fetchData(); }} />
            )}
          </Stack>
        </Grid.Col>
      </Grid>
      <CloseRegistrationModal
        opened={closing}
        series={series}
        events={events}
        batches={batches}
        onClose={() => setClosing(false)}
        onClosed={() => { void fetchData(); }}
      />
    </div>
  );
}
