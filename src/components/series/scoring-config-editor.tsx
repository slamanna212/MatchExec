'use client'

import type { JSX } from 'react';
import { Stack, Text, Group, NumberInput, Switch, UnstyledButton, CloseButton } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import type { SeriesScoringConfig } from '@/lib/series';
import { ordinal } from './series-shared';

interface ScoringConfigEditorProps {
  value: SeriesScoringConfig;
  onChange: (value: SeriesScoringConfig) => void;
}

const TILE_WIDTH = 64;

/**
 * Configures how event outcomes convert to series points: win/loss points
 * for match events (or their own position-based spread), and placement points
 * for tournament events — one input per finishing place (index 0 = 1st).
 */
export function ScoringConfigEditor({ value, onChange }: ScoringConfigEditorProps): JSX.Element {
  const placements = value.tournament_position_points ?? [];

  const update = <K extends keyof SeriesScoringConfig>(key: K, val: SeriesScoringConfig[K]) => {
    onChange({ ...value, [key]: val });
  };

  const setPlace = (index: number, points: number) => {
    const next = [...placements];
    next[index] = points;
    update('tournament_position_points', next);
  };

  const addPlace = () => {
    // Suggest a value just below the current last place, never negative.
    const last = placements[placements.length - 1];
    update('tournament_position_points', [...placements, last !== undefined ? Math.max(0, last - 2) : 10]);
  };

  const removeLastPlace = () => {
    update('tournament_position_points', placements.slice(0, -1));
  };

  return (
    <Stack gap="md">
      <Group grow align="flex-start">
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

      <div>
        <Text size="sm" fw={500}>Tournament placement points</Text>
        <Text size="xs" c="dimmed" mb="xs">
          Points awarded by finishing position. Places beyond the last one score 0.
        </Text>
        <Group gap="xs" align="flex-end">
          {placements.map((pts, i) => (
            <Stack key={i} gap={4} align="center" w={TILE_WIDTH}>
              <Group gap={2} justify="center" wrap="nowrap" h={18}>
                <Text size="xs" c="dimmed" fw={600}>{ordinal(i + 1)}</Text>
                {i === placements.length - 1 && (
                  <CloseButton size="xs" aria-label={`Remove ${ordinal(i + 1)} place`} onClick={removeLastPlace} />
                )}
              </Group>
              <NumberInput
                aria-label={`${ordinal(i + 1)} place points`}
                value={pts}
                onChange={(v) => setPlace(i, typeof v === 'number' ? v : 0)}
                min={0}
                hideControls
                w={TILE_WIDTH}
                styles={{ input: { textAlign: 'center', paddingInline: 4 } }}
              />
            </Stack>
          ))}
          <UnstyledButton
            onClick={addPlace}
            aria-label="Add a place"
            style={{
              width: TILE_WIDTH,
              height: 36,
              border: '1px dashed var(--mantine-color-default-border)',
              borderRadius: 'var(--mantine-radius-sm)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--mantine-color-dimmed)',
            }}
          >
            <IconPlus size={16} />
          </UnstyledButton>
        </Group>
      </div>

      <Switch
        label="Position matches use their own point spread"
        description="For Position (race/ranking) matches, award the points earned in the match itself rather than a flat win/loss amount. FFA matches always use win/loss points."
        checked={value.position_event_use_event_spread !== false}
        onChange={(e) => update('position_event_use_event_spread', e.currentTarget.checked)}
      />
    </Stack>
  );
}
