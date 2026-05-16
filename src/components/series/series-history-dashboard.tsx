'use client'

import { logger } from '@/lib/logger/client';
import { useState, useEffect, useCallback } from 'react';
import type { JSX } from 'react';
import { useRouter } from 'next/navigation';
import {
  Card,
  Text,
  Badge,
  Group,
  Stack,
  Grid,
  TextInput,
  Skeleton,
  Anchor,
} from '@mantine/core';
import { IconTimeline, IconSearch } from '@tabler/icons-react';
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
  created_at: string;
}

const STATUS_COLOR: Record<SeriesRow['status'], string> = {
  created: 'gray',
  active: 'green',
  complete: 'blue',
  cancelled: 'red',
};

export function SeriesHistoryDashboard(): JSX.Element {
  const router = useRouter();
  const [series, setSeries] = useState<SeriesRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchSeries = useCallback(async () => {
    setLoading(true);
    try {
      const [completeRes, cancelledRes] = await Promise.all([
        fetch('/api/series?status=complete'),
        fetch('/api/series?status=cancelled'),
      ]);
      const combined: SeriesRow[] = [];
      if (completeRes.ok) combined.push(...((await completeRes.json()).series ?? []));
      if (cancelledRes.ok) combined.push(...((await cancelledRes.json()).series ?? []));
      combined.sort((a, b) => b.created_at.localeCompare(a.created_at));
      setSeries(combined);
    } catch (error) {
      logger.error('Error fetching series history:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSeries(); }, [fetchSeries]);

  const filtered = series.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <PageLayout>
      <PageHeader
        icon={IconTimeline}
        title="Series History"
        subtitle="Completed and cancelled championship series"
        breadcrumbs={[{ title: 'Series', href: '/series' }]}
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
        <Grid>
          {Array.from({ length: 4 }, (_, i) => (
            <Grid.Col key={i} span={{ base: 12, sm: 6, lg: 4 }}>
              <Skeleton height={120} radius="md" />
            </Grid.Col>
          ))}
        </Grid>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={IconTimeline}
          title={search ? 'No series found' : 'No completed series yet'}
          description={search ? 'Try adjusting your search' : 'Series will appear here once they are completed'}
        />
      ) : (
        <Grid>
          {filtered.map((s) => (
            <Grid.Col key={s.id} span={{ base: 12, sm: 6, lg: 4 }}>
              <Card
                shadow="sm"
                padding="lg"
                radius="md"
                withBorder
                style={{ cursor: 'pointer' }}
                onClick={() => router.push(`/series/${s.id}`)}
              >
                <Group justify="space-between" mb="xs">
                  <Text fw={600} lineClamp={1} style={{ flex: 1 }}>{s.name}</Text>
                  <Badge color={STATUS_COLOR[s.status]} variant="light" size="sm">{s.status}</Badge>
                </Group>
                {s.description && (
                  <Text size="sm" c="dimmed" lineClamp={2} mb="sm">{s.description}</Text>
                )}
                {(s.start_date || s.end_date) && (
                  <Text size="xs" c="dimmed">
                    {s.start_date ? (parseDbTimestamp(s.start_date)?.toLocaleDateString() ?? '?') : '?'}
                    {s.end_date ? ` → ${parseDbTimestamp(s.end_date)?.toLocaleDateString() ?? ''}` : ''}
                  </Text>
                )}
              </Card>
            </Grid.Col>
          ))}
        </Grid>
      )}

      <Stack mt="xl">
        <Anchor onClick={() => router.push('/series')} style={{ cursor: 'pointer' }}>
          ← Back to Active Series
        </Anchor>
      </Stack>
    </PageLayout>
  );
}
