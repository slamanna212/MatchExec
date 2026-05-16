'use client'

import { logger } from '@/lib/logger/client';
import { useState, useEffect, useCallback, memo } from 'react';
import type { JSX } from 'react';
import { useRouter } from 'next/navigation';
import {
  Card,
  Text,
  Button,
  Badge,
  Group,
  Stack,
  Grid,
  TextInput,
  Skeleton,
  useMantineColorScheme,
} from '@mantine/core';
import { IconTimeline, IconSearch, IconPlus, IconCalendar, IconTrophyFilled } from '@tabler/icons-react';
import { EmptyState } from '@/components/EmptyState';
import { PageLayout } from '@/components/PageLayout';
import { PageHeader } from '@/components/PageHeader';
import { parseDbTimestamp } from '@/lib/utils/dates';

interface SeriesRow {
  id: string;
  name: string;
  description?: string;
  status: 'created' | 'active' | 'complete' | 'cancelled';
  start_date?: string;
  end_date?: string;
  event_image_url?: string;
  game_id?: string;
  created_at: string;
  updated_at: string;
}

const STATUS_COLOR: Record<SeriesRow['status'], string> = {
  created: 'gray',
  active: 'green',
  complete: 'blue',
  cancelled: 'red',
};

const NEXT_STATUS: Partial<Record<SeriesRow['status'], { status: string; label: string; color: string }>> = {
  created: { status: 'active', label: 'Activate', color: 'green' },
  active:  { status: 'complete', label: 'Complete', color: 'blue' },
};

const SeriesCard = memo(({ series, onViewDetails, onAdvance }: {
  series: SeriesRow;
  onViewDetails: (s: SeriesRow) => void;
  onAdvance: (s: SeriesRow) => void;
}) => {
  const { colorScheme } = useMantineColorScheme();

  return (
    <Card
      shadow={colorScheme === 'light' ? 'lg' : 'sm'}
      padding="lg"
      radius="md"
      withBorder
      style={{ cursor: 'pointer', transition: 'all 0.25s ease' }}
      onMouseOver={(e) => { e.currentTarget.style.transform = 'translateY(-3px)'; }}
      onMouseOut={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
      onClick={() => onViewDetails(series)}
    >
      <Group justify="space-between" mb="xs">
        <Text fw={600} size="lg" style={{ flex: 1 }} lineClamp={1}>{series.name}</Text>
        <Badge color={STATUS_COLOR[series.status]} variant="light" size="sm">
          {series.status}
        </Badge>
      </Group>

      {series.description && (
        <Text size="sm" c="dimmed" lineClamp={2} mb="sm">{series.description}</Text>
      )}

      <Group gap="xs" mb="sm">
        {series.start_date && (
          <Group gap={4}>
            <IconCalendar size={14} />
            <Text size="xs" c="dimmed">
              {parseDbTimestamp(series.start_date)?.toLocaleDateString()}
            </Text>
          </Group>
        )}
        {series.end_date && (
          <Text size="xs" c="dimmed">
            → {parseDbTimestamp(series.end_date)?.toLocaleDateString()}
          </Text>
        )}
      </Group>

      <Group justify="flex-end" gap="xs" onClick={(e) => e.stopPropagation()}>
        {NEXT_STATUS[series.status] && (
          <Button
            size="xs"
            color={NEXT_STATUS[series.status]!.color}
            variant="light"
            onClick={() => onAdvance(series)}
          >
            {NEXT_STATUS[series.status]!.label}
          </Button>
        )}
        <Button size="xs" variant="outline" onClick={() => onViewDetails(series)}>
          View
        </Button>
      </Group>
    </Card>
  );
});
SeriesCard.displayName = 'SeriesCard';

export function SeriesDashboard(): JSX.Element {
  const router = useRouter();
  const [series, setSeries] = useState<SeriesRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchSeries = useCallback(async () => {
    setLoading(true);
    try {
      const [createdRes, activeRes] = await Promise.all([
        fetch('/api/series?status=created'),
        fetch('/api/series?status=active'),
      ]);
      const combined: SeriesRow[] = [];
      if (activeRes.ok) combined.push(...((await activeRes.json()).series ?? []));
      if (createdRes.ok) combined.push(...((await createdRes.json()).series ?? []));
      combined.sort((a, b) => b.created_at.localeCompare(a.created_at));
      setSeries(combined);
    } catch (error) {
      logger.error('Error fetching series:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSeries(); }, [fetchSeries]);

  const handleAdvance = async (s: SeriesRow) => {
    const next = NEXT_STATUS[s.status];
    if (!next) return;
    try {
      await fetch(`/api/series/${s.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next.status }),
      });
      fetchSeries();
    } catch (error) {
      logger.error('Error advancing series status:', error);
    }
  };

  const filtered = series.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase())
  );

  const skeletons = Array.from({ length: 4 }, (_, i) => (
    <Grid.Col key={i} span={{ base: 12, sm: 6, lg: 4 }}>
      <Skeleton height={160} radius="md" />
    </Grid.Col>
  ));

  return (
    <PageLayout>
      <PageHeader
        icon={IconTimeline}
        title="Series"
        subtitle="Multi-event championships and seasons"
        action={
          <Button leftSection={<IconPlus size={16} />} onClick={() => router.push('/series/create')}>
            New Series
          </Button>
        }
      />

      <TextInput
        placeholder="Search series..."
        leftSection={<IconSearch size={14} />}
        value={search}
        onChange={(e) => setSearch(e.currentTarget.value)}
        mb="lg"
        maw={400}
      />

      {loading ? (
        <Grid>{skeletons}</Grid>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={IconTrophyFilled}
          title={search ? 'No series found' : 'No active series'}
          description={search ? 'Try adjusting your search' : 'Create your first championship series'}
          action={
            !search ? (
              <Button leftSection={<IconPlus size={16} />} onClick={() => router.push('/series/create')}>
                Create Series
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Grid>
          {filtered.map((s) => (
            <Grid.Col key={s.id} span={{ base: 12, sm: 6, lg: 4 }}>
              <SeriesCard
                series={s}
                onViewDetails={(s) => router.push(`/series/${s.id}`)}
                onAdvance={handleAdvance}
              />
            </Grid.Col>
          ))}
        </Grid>
      )}

      <Stack mt="xl" gap="xs">
        <Button variant="subtle" size="sm" onClick={() => router.push('/series/history')}>
          View completed series →
        </Button>
      </Stack>
    </PageLayout>
  );
}
