import { useState, useEffect, useCallback, useMemo, memo } from 'react';
import type { JSX, ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { motion } from 'framer-motion';
import {
  Card, Text, Badge, Group, Stack, Grid, TextInput, Divider, Button, Center, useMantineColorScheme,
} from '@mantine/core';
import { IconClockHour3, IconSearch, IconTrophyFilled } from '@tabler/icons-react';
import { EmptyState } from '@/components/EmptyState';
import { PageLayout } from '@/components/PageLayout';
import { PageHeader } from '@/components/PageHeader';
import { StageRing } from '@/components/StageRing';
import { logger } from '@/lib/logger/client';
import { SeriesCover, SeriesAvatar, SeriesSkeletonCard } from './series-dashboard';
import {
  SERIES_STATUS_COLOR, SERIES_FALLBACK_COLOR, seriesHistoryIdentity, seriesProgress, formatShortDate,
} from './series-shared';
import type { SeriesSummary } from './series-shared';

const PAGE_SIZE = 12;
const CANCELLED_RING_COLOR = '#fa5252';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

function Row({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return (
    <Group justify="space-between" wrap="nowrap">
      <Text size="sm" c="dimmed">{label}:</Text>
      {children}
    </Group>
  );
}

const HistorySeriesCard = memo(({ series, onViewDetails }: { series: SeriesSummary; onViewDetails: (s: SeriesSummary) => void }) => {
  const { colorScheme } = useMantineColorScheme();
  const identity = seriesHistoryIdentity(series);
  const cancelled = series.status === 'cancelled';
  const accent = identity?.game_color || SERIES_FALLBACK_COLOR;
  const cover = series.event_image_url || identity?.game_cover || null;

  return (
    <Card
      shadow={colorScheme === 'light' ? 'lg' : 'sm'}
      padding={0}
      radius="md"
      withBorder
      bg={colorScheme === 'light' ? 'white' : undefined}
      style={{
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        borderColor: colorScheme === 'light' ? 'var(--mantine-color-gray-3)' : undefined,
      }}
      onMouseOver={(e) => {
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
      }}
      onMouseOut={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = colorScheme === 'light' ? '0 1px 3px rgba(0,0,0,0.12)' : '0 1px 3px rgba(0,0,0,0.24)';
      }}
      onClick={() => onViewDetails(series)}
    >
      <Card.Section style={{ height: 140, overflow: 'hidden' }}>
        <SeriesCover
          imageUrl={cover}
          alt={`${series.name} cover`}
          dimmed={series.event_count === 0 && !series.event_image_url}
          grayscale={cancelled}
        />
      </Card.Section>

      <Group mb="md" p="lg" pb={0} wrap="nowrap">
        <SeriesAvatar icon={identity?.game_icon} name={identity?.game_name} />
        <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
          <Text fw={600} truncate>{series.name}</Text>
          {identity?.game_name && <Text size="sm" c="dimmed">{identity.game_name}</Text>}
        </Stack>
        <StageRing
          value={cancelled ? seriesProgress(series) : 100}
          gameColor={cancelled ? CANCELLED_RING_COLOR : accent}
        />
      </Group>

      <Divider mb="md" mx="lg" />

      <Stack gap="xs" px="lg" pb="lg">
        <Row label="Champion">
          {series.champion ? (
            <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
              <IconTrophyFilled size={14} color="#fab005" style={{ flexShrink: 0 }} />
              <Text size="sm" fw={500} truncate>{series.champion}</Text>
            </Group>
          ) : <Text size="sm">—</Text>}
        </Row>
        <Row label="Status">
          <Badge size="sm" variant="light" color={SERIES_STATUS_COLOR[series.status]}>{series.status}</Badge>
        </Row>
        <Row label="Events">
          <Text size="sm">{series.completed_event_count} of {series.event_count}</Text>
        </Row>
        <Row label="Players">
          <Text size="sm">{series.participant_count}</Text>
        </Row>
        <Row label={cancelled ? 'Cancelled' : 'Completed'}>
          <Text size="sm">{formatShortDate(series.updated_at) ?? '—'}</Text>
        </Row>
      </Stack>
    </Card>
  );
});
HistorySeriesCard.displayName = 'HistorySeriesCard';

export function SeriesHistoryDashboard(): JSX.Element {
  const navigate = useNavigate();
  const [series, setSeries] = useState<SeriesSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchPage = useCallback(async (offset: number): Promise<SeriesSummary[] | null> => {
    const res = await fetch(`/api/series?status=complete,cancelled&limit=${PAGE_SIZE}&offset=${offset}`);
    if (!res.ok) return null;
    return (await res.json()).series ?? [];
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const page = await fetchPage(0);
        if (page) {
          setSeries(page);
          setHasMore(page.length >= PAGE_SIZE);
        }
      } catch (error) {
        logger.error('Error fetching series history:', error);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [fetchPage]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const page = await fetchPage(series.length);
      if (page) {
        setSeries(prev => [...prev, ...page]);
        setHasMore(page.length >= PAGE_SIZE);
      }
    } catch (error) {
      logger.error('Error loading more series:', error);
    } finally {
      setLoadingMore(false);
    }
  };

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return series;
    return series.filter(s =>
      s.name.toLowerCase().includes(q) ||
      (s.description ?? '').toLowerCase().includes(q) ||
      (s.champion ?? '').toLowerCase().includes(q) ||
      (seriesHistoryIdentity(s)?.game_name ?? '').toLowerCase().includes(q)
    );
  }, [series, searchQuery]);

  const handleViewDetails = useCallback((s: SeriesSummary) => navigate(`/series/${s.id}`), [navigate]);

  const renderBody = (): JSX.Element => {
    if (series.length === 0) {
      return (
        <Card shadow="sm" withBorder>
          <EmptyState
            icon={IconClockHour3}
            title="No finished series yet"
            description="Completed and cancelled series will appear here"
          />
        </Card>
      );
    }
    if (filtered.length === 0) {
      return (
        <Card shadow="sm" withBorder>
          <EmptyState
            icon={IconSearch}
            title="No series found"
            description={`No finished series match your search for "${searchQuery}"`}
          />
        </Card>
      );
    }
    return (
      <>
        <motion.div variants={containerVariants} initial="hidden" animate="visible">
          <Grid>
            {filtered.map((s, index) => (
              <Grid.Col key={s.id} span={{ base: 12, md: 6, lg: 4 }}>
                <motion.div variants={itemVariants} initial="hidden" animate="visible" custom={index}>
                  <HistorySeriesCard series={s} onViewDetails={handleViewDetails} />
                </motion.div>
              </Grid.Col>
            ))}
          </Grid>
        </motion.div>
        {hasMore && !searchQuery && (
          <Center mt="xl">
            <Button variant="default" loading={loadingMore} onClick={loadMore}>Load More</Button>
          </Center>
        )}
      </>
    );
  };

  if (loading) {
    return (
      <PageLayout>
        <Grid>
          {Array.from({ length: 6 }).map((_, i) => (
            <Grid.Col key={i} span={{ base: 12, md: 6, lg: 4 }}>
              <SeriesSkeletonCard />
            </Grid.Col>
          ))}
        </Grid>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <PageHeader
        icon={IconClockHour3}
        title="Series History"
        subtitle="View results from completed and cancelled series"
        action={series.length > 0 ? (
          <TextInput
            placeholder="Search history..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.currentTarget.value)}
            style={{ width: 300, maxWidth: '50vw' }}
          />
        ) : undefined}
      />

      {renderBody()}
    </PageLayout>
  );
}
