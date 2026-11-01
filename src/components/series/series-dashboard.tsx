import { useState, useEffect, useCallback, useMemo, memo } from 'react';
import type { JSX } from 'react';
import { useNavigate } from 'react-router';
import { motion } from 'framer-motion';
import {
  Card, Text, Button, Badge, Group, Stack, Grid, TextInput, Skeleton, Avatar, Divider, Image,
  ThemeIcon, useMantineColorScheme,
} from '@mantine/core';
import { IconTimeline, IconSearch } from '@tabler/icons-react';
import { EmptyState } from '@/components/EmptyState';
import { PageLayout } from '@/components/PageLayout';
import { PageHeader } from '@/components/PageHeader';
import { StageRing } from '@/components/StageRing';
import { logger } from '@/lib/logger/client';
import { notificationHelper, showError } from '@/lib/notifications';
import {
  SERIES_STATUS_COLOR, SERIES_FALLBACK_COLOR, seriesIdentity, seriesProgress, formatShortDateTime,
} from './series-shared';
import type { SeriesSummary } from './series-shared';

const NEXT_STATUS: Partial<Record<SeriesSummary['status'], { status: string; label: string; color: string; done: string }>> = {
  created: { status: 'active', label: 'Activate', color: 'green', done: 'Series activated!' },
  active: { status: 'complete', label: 'Complete', color: 'blue', done: 'Series completed!' },
};

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

export function SeriesCover({
  imageUrl,
  alt,
  dimmed,
  grayscale,
}: {
  imageUrl: string | null;
  alt: string;
  /** Show the "no events" violet gradient + timeline icon instead of an image. */
  dimmed?: boolean;
  grayscale?: boolean;
}): JSX.Element {
  if (dimmed) {
    return (
      <div
        style={{
          height: 140,
          background: `linear-gradient(135deg, ${SERIES_FALLBACK_COLOR}cc, #4c1d95ee)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <IconTimeline size={56} color="rgba(255,255,255,0.85)" />
      </div>
    );
  }
  return (
    <Image
      src={imageUrl || '/assets/placeholder-cover.png'}
      alt={alt}
      h={140}
      w="100%"
      fit="cover"
      loading="lazy"
      style={{
        objectFit: 'cover',
        transition: 'transform 0.3s ease',
        filter: grayscale ? 'grayscale(1) brightness(.7)' : undefined,
      }}
      onMouseOver={(e) => { (e.currentTarget as HTMLImageElement).style.transform = 'scale(1.04)'; }}
      onMouseOut={(e) => { (e.currentTarget as HTMLImageElement).style.transform = 'scale(1)'; }}
    />
  );
}

export function SeriesAvatar({ icon, name, size = 'md' }: { icon: string | null | undefined; name?: string | null; size?: 'md' | 'lg' }): JSX.Element {
  if (icon) return <Avatar src={icon} alt={name ?? ''} size={size} />;
  return (
    <ThemeIcon size={size === 'lg' ? 56 : 38} radius="xl" variant="light" color="violet">
      <IconTimeline size={size === 'lg' ? 28 : 20} />
    </ThemeIcon>
  );
}

function upNextLabel(series: SeriesSummary): string {
  if (series.next_event) return `Up next: ${series.next_event.name ?? 'Untitled event'}`;
  return series.event_count === 0 ? 'No events yet — add a match or tournament' : 'All events finished';
}

interface SeriesCardProps {
  series: SeriesSummary;
  onViewDetails: (s: SeriesSummary) => void;
  onAdvance: (s: SeriesSummary) => void;
  isTransitioning: boolean;
}

const SeriesCard = memo(({ series, onViewDetails, onAdvance, isTransitioning }: SeriesCardProps) => {
  const { colorScheme } = useMantineColorScheme();
  const identity = seriesIdentity(series);
  const accent = identity?.game_color || SERIES_FALLBACK_COLOR;
  const next = NEXT_STATUS[series.status];
  const nextDate = formatShortDateTime(series.next_event?.start_date);
  const cover = series.event_image_url || identity?.game_cover || null;

  return (
    <Card
      shadow="sm"
      padding={0}
      radius="md"
      withBorder
      bg={colorScheme === 'light' ? 'white' : undefined}
      style={{
        cursor: 'pointer',
        transition: 'all 0.25s ease',
        borderColor: colorScheme === 'light' ? 'var(--mantine-color-gray-3)' : `${accent}33`,
      }}
      onMouseOver={(e) => {
        e.currentTarget.style.transform = 'translateY(-3px)';
        e.currentTarget.style.boxShadow = `0 12px 32px ${accent}44`;
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
        />
      </Card.Section>

      <Group mb="md" p="lg" pb={0} wrap="nowrap" align="flex-start">
        <SeriesAvatar icon={identity?.game_icon} name={identity?.game_name} />
        <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
          <Group gap={6} wrap="nowrap">
            <Text fw={600} truncate>{series.name}</Text>
            <Badge variant="light" size="sm" color={SERIES_STATUS_COLOR[series.status]} style={{ flexShrink: 0 }}>
              {series.status}
            </Badge>
          </Group>
          {identity?.game_name && <Text size="sm" c="dimmed">{identity.game_name}</Text>}
          <Text size="xs" c="violet" fw={500} lineClamp={1}>{upNextLabel(series)}</Text>
        </Stack>
        <StageRing value={seriesProgress(series)} gameColor={accent} />
      </Group>

      <Stack gap="xs" px="lg">
        {series.description && <Text size="sm" c="dimmed" lineClamp={2}>{series.description}</Text>}
        <Divider mb="xs" />
        <Group gap="xl" justify="center">
          <Stack gap={2} align="center">
            <Text size="xs" c="dimmed">Events</Text>
            <Text size="sm" fw={500}>{series.completed_event_count}/{series.event_count}</Text>
          </Stack>
          <Stack gap={2} align="center">
            <Text size="xs" c="dimmed">Players</Text>
            <Text size="sm" fw={500}>{series.participant_count}</Text>
          </Stack>
          <Stack gap={2} align="center">
            <Text size="xs" c="dimmed">Next Event</Text>
            <Text size="sm" fw={500}>{nextDate ?? '—'}</Text>
          </Stack>
        </Group>
      </Stack>

      <Group mt="md" px="lg" pb="lg" grow>
        <Button
          size="sm"
          color={accent}
          onClick={(e) => { e.stopPropagation(); onViewDetails(series); }}
        >
          Details
        </Button>
        {next && (
          <Button
            size="sm"
            color={next.color}
            loading={isTransitioning}
            onClick={(e) => { e.stopPropagation(); onAdvance(series); }}
          >
            {next.label}
          </Button>
        )}
      </Group>
    </Card>
  );
});
SeriesCard.displayName = 'SeriesCard';

export function SeriesSkeletonCard(): JSX.Element {
  return (
    <Card shadow="sm" padding={0} radius="md" withBorder>
      <Card.Section><Skeleton height={140} /></Card.Section>
      <Stack p="lg" gap="xs">
        <Group>
          <Skeleton height={40} width={40} radius="md" />
          <Stack gap={4} style={{ flex: 1 }}>
            <Skeleton height={16} width="70%" />
            <Skeleton height={12} width="40%" />
          </Stack>
        </Group>
        <Skeleton height={12} width="60%" />
        <Group grow mt="sm">
          <Skeleton height={32} radius="sm" />
          <Skeleton height={32} radius="sm" />
        </Group>
      </Stack>
    </Card>
  );
}

export function SeriesDashboard(): JSX.Element {
  const navigate = useNavigate();
  const [series, setSeries] = useState<SeriesSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [transitioning, setTransitioning] = useState<Set<string>>(new Set());

  const fetchSeries = useCallback(async () => {
    try {
      const res = await fetch('/api/series?status=created,active');
      if (res.ok) setSeries((await res.json()).series ?? []);
      else showError('Failed to load series. Please refresh the page.');
    } catch (error) {
      logger.error('Error fetching series:', error);
      showError('Failed to load series. Please refresh the page.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchSeries(); }, [fetchSeries]);

  const handleViewDetails = useCallback((s: SeriesSummary) => navigate(`/series/${s.id}`), [navigate]);

  const handleAdvance = useCallback(async (s: SeriesSummary) => {
    const next = NEXT_STATUS[s.status];
    if (!next) return;
    setTransitioning(prev => new Set(prev).add(s.id));
    const nid = `series-transition-${s.id}`;
    notificationHelper.loading({ id: nid, message: next.status === 'active' ? 'Activating series...' : 'Completing series...' });
    try {
      const res = await fetch(`/api/series/${s.id}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next.status }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        notificationHelper.update(nid, { type: 'error', message: data.error ?? 'Failed to update series status' });
        return;
      }
      notificationHelper.update(nid, { type: 'success', message: next.done });
      await fetchSeries();
    } catch (error) {
      logger.error('Error updating series status:', error);
      notificationHelper.update(nid, { type: 'error', message: 'An error occurred while updating the series' });
    } finally {
      setTransitioning(prev => {
        const n = new Set(prev);
        n.delete(s.id);
        return n;
      });
    }
  }, [fetchSeries]);

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return series.filter(s =>
      s.name.toLowerCase().includes(q) ||
      (s.description ?? '').toLowerCase().includes(q) ||
      (seriesIdentity(s)?.game_name ?? '').toLowerCase().includes(q) ||
      s.status.includes(q)
    );
  }, [series, searchQuery]);

  const goCreate = () => navigate('/series/create?step=1');

  const renderBody = (): JSX.Element => {
    if (series.length === 0) {
      return (
        <Card shadow="sm" withBorder>
          <EmptyState
            icon={IconTimeline}
            title="No series yet"
            description="Create a series to run a multi-event championship"
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
            description={`No series match your search for "${searchQuery}"`}
          />
        </Card>
      );
    }
    return (
      <motion.div variants={containerVariants} initial="hidden" animate="visible">
        <Grid>
          {filtered.map((s, index) => (
            <Grid.Col key={s.id} span={{ base: 12, md: 6, lg: 4 }}>
              <motion.div variants={itemVariants} initial="hidden" animate="visible" custom={index}>
                <SeriesCard
                  series={s}
                  onViewDetails={handleViewDetails}
                  onAdvance={handleAdvance}
                  isTransitioning={transitioning.has(s.id)}
                />
              </motion.div>
            </Grid.Col>
          ))}
        </Grid>
      </motion.div>
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
        icon={IconTimeline}
        title="Series"
        subtitle="Manage and advance your active series"
        action={
          <Group gap="sm" wrap="nowrap">
            {series.length > 0 && (
              <TextInput
                placeholder="Search series..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.currentTarget.value)}
                style={{ width: 'clamp(150px, 50vw, 300px)', flexShrink: 1 }}
              />
            )}
            <Button size="md" onClick={goCreate} style={{ flexShrink: 0 }}>
              Create Series
            </Button>
          </Group>
        }
      />

      {renderBody()}
    </PageLayout>
  );
}
