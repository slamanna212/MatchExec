'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Stack,
  Group,
  Text,
  Card,
  Badge,
  Button,
  Skeleton,
  Divider,
  SegmentedControl,
  ThemeIcon,
  useMantineColorScheme,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import {
  IconSwords,
  IconTrophy,
  IconPlayerPlay,
  IconChartBar,
  IconCheck,
  IconX,
  IconRefresh,
  IconBrain,
  IconAlertTriangle,
  IconMap,
  IconRss,
  IconCircleFilled,
  IconHeartbeat,
} from '@tabler/icons-react';
import { logger } from '@/lib/logger/client';
import { notificationHelper } from '@/lib/notifications';
import type { FeedEvent, FeedResponse } from '@/shared/types';
import classes from './gradient-segmented-control.module.css';

// ─── Priority config ──────────────────────────────────────────────────────────

const PRIORITY_CONFIG = {
  1: { color: 'red',    label: 'Critical', badgeVariant: 'filled'  as const },
  2: { color: 'orange', label: 'High',     badgeVariant: 'filled'  as const },
  3: { color: 'blue',   label: 'Normal',   badgeVariant: 'light'   as const },
  4: { color: 'gray',   label: 'Low',      badgeVariant: 'outline' as const },
} as const;

// ─── Event type → icon + color ────────────────────────────────────────────────

const EVENT_ICONS: Record<string, { icon: React.ComponentType<{ size: number }>, color: string }> = {
  match_created:            { icon: IconSwords,     color: 'violet'  },
  tournament_created:       { icon: IconTrophy,     color: 'violet'  },
  match_phase_changed:      { icon: IconRefresh,    color: 'blue'    },
  tournament_phase_changed: { icon: IconRefresh,    color: 'blue'    },
  match_started:            { icon: IconPlayerPlay, color: 'green'   },
  tournament_started:       { icon: IconPlayerPlay, color: 'green'   },
  match_scoring_required:   { icon: IconMap,        color: 'orange'  },
  map_scored:               { icon: IconChartBar,   color: 'teal'    },
  match_completed:          { icon: IconCheck,      color: 'green'   },
  tournament_completed:     { icon: IconCheck,      color: 'green'   },
  match_cancelled:          { icon: IconX,          color: 'red'     },
  tournament_cancelled:     { icon: IconX,          color: 'red'     },
  ai_error:                 { icon: IconBrain,      color: 'orange'  },
  health_alert:             { icon: IconHeartbeat,  color: 'red'     },
};

// ─── Utilities ────────────────────────────────────────────────────────────────

function parseDbTimestamp(ts: string): Date {
  return ts.includes('Z') || /[+-]\d{2}:?\d{2}$/.test(ts)
    ? new Date(ts)
    : new Date(`${ts}Z`);
}

function formatRelativeTime(timestamp: string): string {
  const diff = Date.now() - parseDbTimestamp(timestamp).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── FeedEventCard ────────────────────────────────────────────────────────────

function FeedEventCard({ event }: { event: FeedEvent }) {
  const router = useRouter();
  const { colorScheme } = useMantineColorScheme();
  const isDark = colorScheme === 'dark';

  const p = PRIORITY_CONFIG[event.priority] ?? PRIORITY_CONFIG[4];
  const e = EVENT_ICONS[event.event_type] ?? { icon: IconRss, color: 'gray' };
  const Icon = e.icon;

  const isScoring = event.event_type === 'match_scoring_required';
  const isAiError = event.event_type === 'ai_error';
  const hasWarmBg = isScoring || isAiError;

  const accentColor = `var(--mantine-color-${p.color}-6)`;
  const warmBg = isDark ? 'rgba(234,88,12,0.07)' : 'rgba(234,88,12,0.04)';

  const navigateTo = event.match_id
    ? `/matches/${event.match_id}`
    : event.tournament_id
    ? `/tournaments/${event.tournament_id}`
    : null;

  return (
    <Card
      withBorder
      padding="sm"
      radius="md"
      style={{
        borderLeftWidth: 3,
        borderLeftColor: accentColor,
        borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'var(--mantine-color-gray-3)',
        background: hasWarmBg ? warmBg : undefined,
        transition: 'box-shadow 0.15s ease',
      }}
    >
      <Group justify="space-between" wrap="nowrap" gap="sm">

        {/* Icon + content */}
        <Group wrap="nowrap" gap="sm" style={{ flex: 1, minWidth: 0 }}>
          <ThemeIcon
            size={32}
            radius="md"
            color={e.color}
            variant="light"
            style={{ flexShrink: 0 }}
          >
            <Icon size={15} />
          </ThemeIcon>

          <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
            <Group gap={6} wrap="nowrap">
              <Badge
                color={p.color}
                variant={p.badgeVariant}
                size="xs"
                style={{ flexShrink: 0 }}
              >
                {p.label}
              </Badge>
              <Text size="sm" fw={600} truncate>
                {event.title}
              </Text>
            </Group>
            {event.description && (
              <Text size="xs" c="dimmed" lineClamp={1}>
                {event.description}
              </Text>
            )}
          </Stack>
        </Group>

        {/* Right side: timestamp + action */}
        <Group gap="xs" wrap="nowrap" style={{ flexShrink: 0 }}>
          <Text
            size="xs"
            c="dimmed"
            style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}
          >
            {formatRelativeTime(event.created_at)}
          </Text>

          {isScoring && event.match_id && (
            <Button
              size="xs"
              color="orange"
              variant="filled"
              onClick={() => router.push(`/matches/${event.match_id}/scoring`)}
              className="feed-score-now-btn"
            >
              Score Now
            </Button>
          )}

          {!isScoring && navigateTo && (
            <Button
              size="xs"
              variant="filled"
              color="violet"
              onClick={() => router.push(navigateTo)}
            >
              View
            </Button>
          )}
        </Group>
      </Group>
    </Card>
  );
}

// ─── FeedDashboard ────────────────────────────────────────────────────────────

export function FeedDashboard() {
  const [events, setEvents]     = useState<FeedEvent[]>([]);
  const [total, setTotal]       = useState(0);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState('all');
  const [displayLimit, setDisplayLimit] = useState(20);
  const [dateRange, setDateRange] = useState<[Date | null, Date | null]>([null, null]);
  const etagRef = useRef<string | null>(null);
  const seenHealthAlertIds = useRef<Set<string>>(new Set());

  const fetchEvents = useCallback(async (silent = false, limit = displayLimit, range = dateRange) => {
    try {
      const params = new URLSearchParams({ limit: String(limit) });
      if (range[0]) params.set('date_from', new Date(range[0]).toISOString());
      if (range[1]) {
        const endOfDay = new Date(range[1]);
        endOfDay.setHours(23, 59, 59, 999);
        params.set('date_to', endOfDay.toISOString());
      }

      const headers: Record<string, string> = {};
      const hasRange = !!(range[0] || range[1]);
      if (silent && !hasRange && etagRef.current) headers['If-None-Match'] = etagRef.current;

      const res = await fetch(`/api/feed?${params}`, { headers });
      if (res.status === 304) return;

      const newEtag = res.headers.get('etag');
      if (newEtag) etagRef.current = newEtag;

      if (res.ok) {
        const data: FeedResponse = await res.json();
        setEvents(data.events);
        setTotal(data.total);

        // Show toast for new health alerts detected on background polls
        if (silent) {
          for (const event of data.events) {
            if (event.event_type === 'health_alert' && !seenHealthAlertIds.current.has(event.id)) {
              seenHealthAlertIds.current.add(event.id);
              notificationHelper.error({
                title: event.title,
                message: event.description ?? 'A system health alert was triggered.',
                autoClose: false,
                id: `health_alert_${event.id}`,
              });
            }
          }
        } else {
          // On initial load, seed seen IDs without toasting
          for (const event of data.events) {
            if (event.event_type === 'health_alert') {
              seenHealthAlertIds.current.add(event.id);
            }
          }
        }
      }
    } catch (err) {
      logger.error('Error fetching feed:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [displayLimit, dateRange]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  useEffect(() => {
    const id = setInterval(() => fetchEvents(true), 15_000);
    return () => clearInterval(id);
  }, [fetchEvents]);

  const filtered = useMemo(() => {
    switch (filter) {
      case 'high':        return events.filter(e => e.priority <= 2);
      case 'matches':     return events.filter(e => !!e.match_id);
      case 'tournaments': return events.filter(e => !!e.tournament_id);
      default:            return events;
    }
  }, [events, filter]);

  const critical = useMemo(() => filtered.filter(e => e.priority === 1), [filtered]);
  const regular  = useMemo(() => filtered.filter(e => e.priority > 1), [filtered]);

  return (
    <>
      <style>{`
        .feed-score-now-btn {
          animation: feedScorePulse 2.4s ease-in-out infinite;
        }
        @keyframes feedScorePulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(234, 88, 12, 0.5); }
          50%       { box-shadow: 0 0 0 7px rgba(234, 88, 12, 0); }
        }
      `}</style>

      <Stack gap="md" maw={820} mx="auto">

        {/* Header */}
        <Group justify="space-between" align="flex-end">
          <Stack gap={2}>
            <Group gap="xs" align="center">
              <Text size="xl" fw={700}>Activity Feed</Text>
              <Group gap={4} align="center" mb={1}>
                <IconCircleFilled size={8} color="var(--mantine-color-green-5)" />
                <Text size="xs" c="dimmed">Live</Text>
              </Group>
            </Group>
            <Text size="sm" c="dimmed">Real-time events from matches and tournaments</Text>
          </Stack>
          <DatePickerInput
            type="range"
            placeholder="Filter by date range"
            value={dateRange}
            onChange={(val) => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              setDateRange(val as any);
              setDisplayLimit(20);
              etagRef.current = null;
            }}
            clearable
            maxDate={new Date()}
            size="sm"
            style={{ minWidth: 220 }}
          />
        </Group>

        {/* Filter */}
        <Group justify="center">
          <SegmentedControl
            radius="xl"
            size="sm"
            value={filter}
            onChange={setFilter}
            classNames={classes}
            data={[
              { value: 'all',         label: 'All'           },
              { value: 'high',        label: 'High Priority' },
              { value: 'matches',     label: 'Matches'       },
              { value: 'tournaments', label: 'Tournaments'   },
            ]}
          />
        </Group>

        {/* Loading skeletons */}
        {loading && (
          <Stack gap="xs">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} height={64} radius="md" />
            ))}
          </Stack>
        )}

        {/* Events */}
        {!loading && (
          <Stack gap="xs">
            {/* Critical pinned section */}
            {critical.length > 0 && (
              <>
                <Group gap={6}>
                  <IconAlertTriangle size={13} color="var(--mantine-color-red-6)" />
                  <Text
                    size="xs"
                    fw={700}
                    c="red"
                    tt="uppercase"
                    style={{ letterSpacing: '0.06em' }}
                  >
                    Requires Attention
                  </Text>
                </Group>
                {critical.map(e => <FeedEventCard key={e.id} event={e} />)}
                {regular.length > 0 && <Divider my={4} />}
              </>
            )}

            {/* Main list */}
            {regular.map(e => <FeedEventCard key={e.id} event={e} />)}

            {/* Empty state */}
            {filtered.length === 0 && (
              <Stack align="center" py="xl" gap="xs">
                <IconRss size={36} color="var(--mantine-color-dimmed)" style={{ opacity: 0.35 }} />
                <Text c="dimmed" size="sm">No activity yet</Text>
              </Stack>
            )}

            {/* Load more */}
            {events.length < total && (
              <Group justify="center" mt="sm">
                <Button
                  variant="subtle"
                  color="violet"
                  onClick={() => setDisplayLimit(prev => prev + 20)}
                  loading={loading}
                >
                  Load more ({total - events.length} remaining)
                </Button>
              </Group>
            )}
          </Stack>
        )}
      </Stack>
    </>
  );
}
