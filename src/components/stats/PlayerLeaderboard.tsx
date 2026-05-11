'use client'

import type { JSX } from 'react';
import { Text, Card } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ResponsiveContainer } from 'recharts';
import type { GameStatDefinition } from '@/shared/types';
import type { PlayerStatEntry } from './StatCallouts';

const TEAM_COLORS: Record<string, string> = {
  blue: '#339af0',
  red: '#ff6b6b',
  reserve: '#868e96',
};

function formatTick(value: number, format?: string): string {
  if (format === 'percentage') return `${Math.round(value)}%`;
  return String(Math.round(value));
}

interface Props {
  players: PlayerStatEntry[];
  statDefs: GameStatDefinition[];
}

interface StatChartProps {
  def: GameStatDefinition;
  players: PlayerStatEntry[];
}

function StatChart({ def, players }: StatChartProps) {
  const sorted = [...players]
    .map(p => ({ name: p.username, value: p.stats[def.name] ?? 0, team: p.team }))
    .filter(e => e.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  if (!sorted.length) return null;

  const barHeight = 32;
  const chartHeight = sorted.length * barHeight + 40;

  return (
    <Card withBorder shadow="sm" padding="md" radius="md" style={{ breakInside: 'avoid', marginBottom: '1rem' }}>
      <Text size="xs" c="dimmed" tt="uppercase" fw={600} mb={6}>{def.display_name}</Text>
      <ResponsiveContainer width="100%" height={chartHeight}>
        <BarChart data={sorted} layout="vertical" margin={{ top: 0, right: 44, left: 8, bottom: 0 }}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11, fill: '#c1c2c5' }} axisLine={false} tickLine={false} />
          <Tooltip
            formatter={(value) => [formatTick(Number(value), def.format), def.display_name]}
            contentStyle={{ backgroundColor: '#1e1e2e', border: '1px solid #3a3a44', borderRadius: 6 }}
          />
          <Bar dataKey="value" radius={[0, 3, 3, 0]} barSize={24} label={{ position: 'right', fontSize: 10, formatter: (v: unknown) => formatTick(Number(v), def.format) }}>
            {sorted.map((entry, i) => (
              <Cell key={i} fill={TEAM_COLORS[entry.team] ?? TEAM_COLORS.reserve} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}

export function PlayerLeaderboard({ players, statDefs }: Props): JSX.Element | null {
  const isLg = useMediaQuery('(min-width: 75em)', false, { getInitialValueInEffect: true });
  const isMd = useMediaQuery('(min-width: 62em)', false, { getInitialValueInEffect: true });
  const columns = isLg ? 3 : isMd ? 2 : 1;

  const primaryDefs = statDefs.filter(d => d.is_primary);
  if (!players.length || !primaryDefs.length) return null;

  return (
    <div style={{ columns: String(columns), columnGap: '1rem' }}>
      {primaryDefs.map(def => (
        <StatChart key={def.id} def={def} players={players} />
      ))}
    </div>
  );
}
