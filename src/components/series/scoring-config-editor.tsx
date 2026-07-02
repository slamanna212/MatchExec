'use client'

import type { JSX } from 'react';
import { Stack, Text, Group, NumberInput, TextInput, Switch, Card } from '@mantine/core';
import type { SeriesScoringConfig } from '@/lib/series';

interface ScoringConfigEditorProps {
  value: SeriesScoringConfig;
  onChange: (value: SeriesScoringConfig) => void;
}

function parsePositionPoints(raw: string): number[] {
  return raw
    .split(',')
    .map(s => s.trim())
    .filter(s => s.length > 0)
    .map(s => Number(s))
    .filter(n => !isNaN(n));
}

/**
 * Configures how event outcomes convert to series points: win/loss points
 * for match events (or their own position-based spread), and a
 * placement-points array for tournament events (index 0 = 1st place).
 */
export function ScoringConfigEditor({ value, onChange }: ScoringConfigEditorProps): JSX.Element {
  const update = <K extends keyof SeriesScoringConfig>(key: K, val: SeriesScoringConfig[K]) => {
    onChange({ ...value, [key]: val });
  };

  return (
    <Card withBorder padding="lg">
      <Stack gap="md">
        <Text fw={500} size="sm">Series Scoring</Text>
        <Text size="xs" c="dimmed">
          Controls how match and tournament results convert into series standings points.
        </Text>

        <Group grow>
          <NumberInput
            label="Points for a match win"
            value={value.match_win_points ?? 0}
            onChange={(v) => update('match_win_points', typeof v === 'number' ? v : 0)}
            min={0}
          />
          <NumberInput
            label="Points for a match loss"
            value={value.match_loss_points ?? 0}
            onChange={(v) => update('match_loss_points', typeof v === 'number' ? v : 0)}
            min={0}
          />
        </Group>

        <TextInput
          label="Tournament placement points"
          description="Comma-separated, in finishing order — e.g. 25, 18, 15, 12, 10 for 1st through 5th."
          value={(value.tournament_position_points ?? []).join(', ')}
          onChange={(e) => update('tournament_position_points', parsePositionPoints(e.currentTarget.value))}
          placeholder="25, 18, 15, 12, 10"
        />

        <Switch
          label="Position-based match events use their own point spread"
          description="For FFA/Position matches, award the points earned in the match itself rather than a flat win/loss amount."
          checked={value.position_event_use_event_spread !== false}
          onChange={(e) => update('position_event_use_event_spread', e.currentTarget.checked)}
        />
      </Stack>
    </Card>
  );
}
