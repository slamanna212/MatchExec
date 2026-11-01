import { useState, useEffect, useCallback } from 'react';
import type { JSX } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  Stack, Group, Text, Grid, Skeleton, Alert, Anchor, Breadcrumbs,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { IconAlertCircle } from '@tabler/icons-react';
import { logger } from '@/lib/logger/client';
import { notificationHelper } from '@/lib/notifications';
import { SeriesInfoPanel } from './SeriesInfoPanel';
import { SeriesContentPanel } from './SeriesContentPanel';
import { AddSeriesEventModal, EditSeriesEventModal } from './series-event-modals';
import type { SeriesSummary, SeriesEventDetail, SeriesStanding } from './series-shared';

const TRANSITION_MESSAGES: Record<string, { loading: string; success: string }> = {
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
  const [series, setSeries] = useState<SeriesSummary | null>(null);
  const [events, setEvents] = useState<SeriesEventDetail[]>([]);
  const [standings, setStandings] = useState<SeriesStanding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addEventOpen, setAddEventOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<SeriesEventDetail | null>(null);
  const [refreshInterval, setRefreshInterval] = useState(30);

  const fetchData = useCallback(async () => {
    try {
      const [seriesRes, eventsRes, standingsRes] = await Promise.all([
        fetch(`/api/series/${seriesId}`),
        fetch(`/api/series/${seriesId}/events`),
        fetch(`/api/series/${seriesId}/standings`),
      ]);
      if (!seriesRes.ok) {
        setError(seriesRes.status === 404 ? 'Series not found' : 'Failed to load series');
        return;
      }
      setError(null);
      setSeries((await seriesRes.json()).series);
      if (eventsRes.ok) setEvents((await eventsRes.json()).events ?? []);
      if (standingsRes.ok) setStandings((await standingsRes.json()).standings ?? []);
    } catch (err) {
      logger.error('Error loading series:', err);
      setError('Failed to load series data');
    } finally {
      setLoading(false);
    }
  }, [seriesId]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const res = await fetch('/api/settings/ui');
        if (res.ok) setRefreshInterval((await res.json()).auto_refresh_interval_seconds || 30);
      } catch (err) {
        logger.error('Error fetching UI settings:', err);
      }
    };
    void loadSettings();
  }, []);

  // Auto-refresh while the series is running so event progress and standings stay live.
  const isActive = series?.status === 'active';
  useEffect(() => {
    if (!isActive) return undefined;
    const id = setInterval(() => { void fetchData(); }, refreshInterval * 1000);
    return () => clearInterval(id);
  }, [isActive, refreshInterval, fetchData]);

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
    const unfinished = events.filter(e => e.status !== 'complete' && e.status !== 'cancelled').length;
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

  const confirmRemoveEvent = (ev: SeriesEventDetail) => {
    modals.openConfirmModal({
      title: 'Remove Event',
      children: (
        <Text size="sm">
          Remove &quot;{ev.name ?? `Event #${ev.event_order}`}&quot; from this series? Its points will no longer count.
          The {ev.event_type} itself is not deleted.
        </Text>
      ),
      labels: { confirm: 'Remove Event', cancel: 'Back' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        const nid = `series-remove-event-${ev.id}`;
        notificationHelper.loading({ id: nid, message: 'Removing event...' });
        try {
          const res = await fetch(`/api/series/${seriesId}/events/${ev.id}`, { method: 'DELETE' });
          if (res.ok) {
            notificationHelper.update(nid, { type: 'success', message: 'Event removed' });
            await fetchData();
          } else {
            const data = await res.json().catch(() => ({}));
            notificationHelper.update(nid, { type: 'error', message: data.error ?? 'Failed to remove event' });
          }
        } catch (err) {
          logger.error('Error removing series event:', err);
          notificationHelper.update(nid, { type: 'error', message: 'An error occurred while removing the event' });
        }
      },
    });
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
            onActivate={() => { void transition('active'); }}
            onAddEvent={() => setAddEventOpen(true)}
            onEdit={() => navigate(`/series/${seriesId}/edit`)}
            onComplete={confirmComplete}
            onCancel={confirmCancel}
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 8 }} pr={{ base: 'md', md: 0 }}>
          <SeriesContentPanel
            series={series}
            events={events}
            standings={standings}
            onAddEvent={() => setAddEventOpen(true)}
            onEditEvent={setEditingEvent}
            onRemoveEvent={confirmRemoveEvent}
          />
        </Grid.Col>
      </Grid>

      <AddSeriesEventModal
        opened={addEventOpen}
        onClose={() => setAddEventOpen(false)}
        seriesId={seriesId}
        events={events}
        onAdded={() => { void fetchData(); }}
      />
      <EditSeriesEventModal
        seriesId={seriesId}
        event={editingEvent}
        onClose={() => setEditingEvent(null)}
        onSaved={() => { void fetchData(); }}
      />
    </div>
  );
}
