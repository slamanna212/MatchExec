import { useState, useEffect } from 'react';
import type { JSX } from 'react';
import { Link } from 'react-router';
import { Group, Text, Anchor, Stack } from '@mantine/core';
import { logger } from '@/lib/logger/client';
import { formatMultiplier } from './series-shared';

interface SeriesMembership {
  series_id: string;
  series_name: string;
  series_event_id: string;
  points_multiplier: number;
  via: 'direct' | 'tournament';
}

/**
 * "Series:" details row for match/tournament info panels, e.g.
 * "Fall 2026 Championship · ×1.5" linking to the series. Renders nothing when
 * the entity isn't part of any series.
 */
export function SeriesMembershipRow({ kind, id }: { kind: 'match' | 'tournament'; id: string }): JSX.Element | null {
  const [memberships, setMemberships] = useState<SeriesMembership[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/series?${kind === 'match' ? 'match_id' : 'tournament_id'}=${encodeURIComponent(id)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setMemberships(data.memberships ?? []);
      } catch (err) {
        logger.error('Error loading series membership:', err);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [kind, id]);

  if (memberships.length === 0) return null;

  return (
    <Group justify="space-between" align="flex-start" wrap="nowrap" gap="md">
      <Text size="sm" fw={500} c="dimmed" style={{ flexShrink: 0 }}>Series:</Text>
      <Stack gap={2} align="flex-end" style={{ minWidth: 0 }}>
        {memberships.map(m => (
          <Text key={m.series_event_id} size="sm" ta="right">
            <Anchor component={Link} to={`/series/${m.series_id}`} size="sm">{m.series_name}</Anchor>
            {' · '}
            <Text span size="sm" ff="monospace">{formatMultiplier(m.points_multiplier)}</Text>
            {m.via === 'tournament' && <Text span size="xs" c="dimmed"> (via tournament)</Text>}
          </Text>
        ))}
      </Stack>
    </Group>
  );
}
