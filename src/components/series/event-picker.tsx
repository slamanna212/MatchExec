import { useState, useEffect } from 'react';
import type { JSX, ReactNode } from 'react';
import { Avatar, Badge, Group, Stack, Text, ThemeIcon, UnstyledButton, Loader, Center, ScrollArea } from '@mantine/core';
import { IconCheck } from '@tabler/icons-react';
import { logger } from '@/lib/logger/client';
import { EVENT_TYPE_COLOR, formatShortDate } from './series-shared';

export interface EventCandidate {
  type: 'match' | 'tournament';
  id: string;
  name: string;
  status: string;
  game_name?: string | null;
  game_icon?: string | null;
  start_date?: string | null;
}

export const candidateKey = (c: Pick<EventCandidate, 'type' | 'id'>): string => `${c.type}:${c.id}`;

const MATCH_STATUSES = ['created', 'gather', 'assign', 'battle', 'complete'];

const STATUS_COLOR: Record<string, string> = {
  created: 'gray',
  gather: 'blue',
  assign: 'orange',
  battle: 'green',
  complete: 'teal',
  cancelled: 'red',
};

interface RawRow {
  id: string;
  name: string;
  status: string;
  game_name?: string | null;
  game_icon?: string | null;
  start_date?: string | null;
}

function toRows(data: unknown): RawRow[] {
  if (Array.isArray(data)) return data as RawRow[];
  const obj = data as { matches?: RawRow[]; tournaments?: RawRow[] } | null;
  return obj?.matches ?? obj?.tournaments ?? [];
}

/**
 * Loads matches (standalone only — tournament matches are added via their
 * tournament) and tournaments (active and complete) that can become series events.
 */
export function useEventCandidates(enabled = true): { candidates: EventCandidate[]; loading: boolean } {
  const [candidates, setCandidates] = useState<EventCandidate[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const statusQuery = MATCH_STATUSES.map(s => `status=${s}`).join('&');
        const [matchRes, activeTRes, doneTRes] = await Promise.all([
          fetch(`/api/matches?${statusQuery}&exclude_tournament=true`),
          fetch('/api/tournaments'),
          fetch('/api/tournaments?status=complete'),
        ]);
        const matches = matchRes.ok ? toRows(await matchRes.json()) : [];
        const tournaments = [
          ...(activeTRes.ok ? toRows(await activeTRes.json()) : []),
          ...(doneTRes.ok ? toRows(await doneTRes.json()) : []),
        ];
        if (cancelled) return;
        setCandidates([
          ...matches.map(m => ({ type: 'match' as const, ...pick(m) })),
          ...tournaments.map(t => ({ type: 'tournament' as const, ...pick(t) })),
        ]);
      } catch (err) {
        logger.error('Error loading series event candidates:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [enabled]);

  return { candidates, loading };
}

function pick(r: RawRow): Omit<EventCandidate, 'type'> {
  return {
    id: r.id, name: r.name, status: r.status,
    game_name: r.game_name, game_icon: r.game_icon, start_date: r.start_date,
  };
}

export function filterCandidates(candidates: EventCandidate[], query: string): EventCandidate[] {
  const q = query.trim().toLowerCase();
  if (!q) return candidates;
  return candidates.filter(c =>
    c.name.toLowerCase().includes(q) || (c.game_name ?? '').toLowerCase().includes(q)
  );
}

interface EventPickerRowProps {
  candidate: EventCandidate;
  selected: boolean;
  onClick: () => void;
  /** Extra content on the right, before the status badge (e.g. type badge + default multiplier). */
  extra?: ReactNode;
}

export function EventPickerRow({ candidate, selected, onClick, extra }: EventPickerRowProps): JSX.Element {
  const date = formatShortDate(candidate.start_date);
  return (
    <UnstyledButton
      onClick={onClick}
      aria-pressed={selected}
      style={{
        display: 'block',
        width: '100%',
        padding: '10px 12px',
        borderRadius: 8,
        border: `1px solid ${selected ? 'var(--mantine-color-violet-6)' : 'var(--mantine-color-default-border)'}`,
        backgroundColor: selected ? 'var(--mantine-color-violet-light)' : undefined,
        transition: 'background-color 0.15s ease, border-color 0.15s ease',
      }}
    >
      <Group gap="sm" wrap="nowrap">
        <Avatar src={candidate.game_icon} alt={candidate.game_name ?? ''} size={32} radius="sm" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <Text fw={500} size="sm" truncate>{candidate.name}</Text>
          <Text size="xs" c="dimmed" truncate>
            {[candidate.game_name, date].filter(Boolean).join(' · ') || '—'}
          </Text>
        </div>
        {extra}
        <Badge variant="light" size="sm" color={STATUS_COLOR[candidate.status] ?? 'gray'}>
          {candidate.status}
        </Badge>
        {selected && (
          <ThemeIcon size={20} radius="xl" color="violet" variant="filled">
            <IconCheck size={13} stroke={3} />
          </ThemeIcon>
        )}
      </Group>
    </UnstyledButton>
  );
}

export function EventPickerList({
  candidates,
  loading,
  emptyText,
  renderRow,
  maxHeight = 300,
}: {
  candidates: EventCandidate[];
  loading: boolean;
  emptyText: string;
  renderRow: (c: EventCandidate) => ReactNode;
  maxHeight?: number;
}): JSX.Element {
  if (loading) {
    return <Center py="lg"><Loader size="sm" /></Center>;
  }
  if (candidates.length === 0) {
    return <Text size="sm" c="dimmed" ta="center" py="lg">{emptyText}</Text>;
  }
  return (
    <ScrollArea.Autosize mah={maxHeight} type="auto" offsetScrollbars>
      <Stack gap={6}>{candidates.map(renderRow)}</Stack>
    </ScrollArea.Autosize>
  );
}

export function EventTypeBadge({ type }: { type: 'match' | 'tournament' }): JSX.Element {
  return (
    <Badge variant="light" size="sm" color={EVENT_TYPE_COLOR[type]}>{type}</Badge>
  );
}
