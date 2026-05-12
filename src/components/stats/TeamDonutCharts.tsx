'use client'

import type { JSX } from 'react';
import { Card, Text, Stack } from '@mantine/core';
import type { GameStatDefinition } from '@/shared/types';
import type { PlayerStatEntry } from './StatCallouts';

const DONUT_STAT_NAMES = new Set(['damage', 'healing', 'damage_mitigated', 'damage_blocked']);
const TEAM_COLORS = { blue: '#339af0', red: '#ff6b6b' };

function formatStatValue(value: number, format?: string): string {
  if (format === 'thousands') return `${(value / 1000).toFixed(1)}K`;
  if (format === 'percentage') return `${Math.round(value)}%`;
  return String(Math.round(value));
}

interface Props {
  players: PlayerStatEntry[];
  statDefs: GameStatDefinition[];
}

export function TeamDonutCharts({ players, statDefs }: Props): JSX.Element | null {
  const bluePlayers = players.filter(p => p.team === 'blue');
  const redPlayers = players.filter(p => p.team === 'red');

  const charts = statDefs
    .filter(def => DONUT_STAT_NAMES.has(def.name))
    .map(def => {
      const blueTotal = bluePlayers.reduce((s, p) => s + (p.stats[def.name] ?? 0), 0);
      const redTotal = redPlayers.reduce((s, p) => s + (p.stats[def.name] ?? 0), 0);
      return { def, blueTotal, redTotal };
    })
    .filter(({ blueTotal, redTotal }) => blueTotal > 0 || redTotal > 0);

  if (!charts.length) return null;

  return (
    <Card withBorder shadow="sm" padding="lg" radius="md">
      {/* Column headers */}
      <div style={{ display: 'grid', gridTemplateColumns: '88px 72px 1fr 72px', gap: '10px', alignItems: 'center', marginBottom: '12px' }}>
        <div />
        <Text size="xs" fw={700} tt="uppercase" ta="right" style={{ color: TEAM_COLORS.red }}>Red</Text>
        <div />
        <Text size="xs" fw={700} tt="uppercase" ta="left" style={{ color: TEAM_COLORS.blue }}>Blue</Text>
      </div>

      <Stack gap="sm">
        {charts.map(({ def, redTotal, blueTotal }) => {
          const total = redTotal + blueTotal;
          const redPct = total > 0 ? (redTotal / total) * 100 : 50;
          const bluePct = 100 - redPct;

          return (
            <div key={def.id} style={{ display: 'grid', gridTemplateColumns: '88px 72px 1fr 72px', gap: '10px', alignItems: 'center' }}>
              <Text size="xs" tt="uppercase" fw={600} ta="right" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#c1c2c5' }}>
                {def.display_name}
              </Text>
              <Text size="sm" fw={700} ta="right" style={{ color: TEAM_COLORS.red }}>
                {formatStatValue(redTotal, def.format)}
              </Text>
              <div style={{ height: '10px', display: 'flex', borderRadius: '5px', overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.05)' }}>
                <div style={{ width: `${redPct}%`, backgroundColor: TEAM_COLORS.red }} />
                <div style={{ width: `${bluePct}%`, backgroundColor: TEAM_COLORS.blue }} />
              </div>
              <Text size="sm" fw={700} ta="left" style={{ color: TEAM_COLORS.blue }}>
                {formatStatValue(blueTotal, def.format)}
              </Text>
            </div>
          );
        })}
      </Stack>
    </Card>
  );
}
