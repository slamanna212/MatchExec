'use client'

import { SimpleGrid, Card, Text, Group } from '@mantine/core';
import type { GameStatDefinition } from '@/shared/types';

export interface PlayerStatEntry {
  participantId: string;
  username: string;
  team: 'blue' | 'red' | 'reserve';
  stats: Record<string, number>;
}

const TEAM_COLORS: Record<string, string> = {
  blue: '#339af0',
  red: '#ff6b6b',
  reserve: '#868e96',
};

function formatStatValue(value: number, format?: string): string {
  if (format === 'thousands') return `${(value / 1000).toFixed(1)}K`;
  if (format === 'percentage') return `${Math.round(value)}%`;
  return String(Math.round(value));
}

interface Props {
  players: PlayerStatEntry[];
  statDefs: GameStatDefinition[];
}

export function StatCallouts({ players, statDefs }: Props) {
  const primaryDefs = statDefs.filter(d => d.is_primary);
  if (!players.length || !primaryDefs.length) return null;

  const callouts = primaryDefs.map(def => {
    let topPlayer: PlayerStatEntry | null = null;
    let topValue = -Infinity;
    for (const p of players) {
      const v = p.stats[def.name] ?? 0;
      if (v > topValue) { topValue = v; topPlayer = p; }
    }
    return { def, player: topPlayer, value: topValue };
  }).filter(c => c.player && c.value > 0);

  if (!callouts.length) return null;

  return (
    <SimpleGrid cols={{ base: 2, sm: 3, md: callouts.length }}>
      {callouts.map(({ def, player, value }) => (
        <Card key={def.id} padding="md" radius="md" style={{ boxShadow: '0 0 20px rgba(124, 58, 237, 0.3)', border: 'none' }}>
          <Text size="xs" c="dimmed" tt="uppercase" fw={600} mb={4}>Most {def.display_name}</Text>
          <Text fw={700} size="xl" style={{ color: TEAM_COLORS[player!.team] ?? '#868e96' }}>
            {formatStatValue(value, def.format)}
          </Text>
          <Group gap={4} mt={4}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: TEAM_COLORS[player!.team] ?? '#868e96', flexShrink: 0 }} />
            <Text size="sm" fw={500}>{player!.username}</Text>
          </Group>
        </Card>
      ))}
    </SimpleGrid>
  );
}
