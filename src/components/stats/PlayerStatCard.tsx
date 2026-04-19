'use client'

import { Card, Text, Badge, Group, Select, Stack, Divider } from '@mantine/core';
import type { ScorecardPlayerStat, GameStatDefinition } from '@/shared/types';

interface Participant {
  id: string;
  username: string;
  team_assignment?: string | null;
}

interface PlayerStatCardProps {
  stat: ScorecardPlayerStat;
  statDefs: GameStatDefinition[];
  participants: Participant[];
  onAssignChange: (playerStatId: string, participantId: string | null) => void;
}

function confidenceColor(score?: number): string {
  if (!score) return 'gray';
  if (score > 0.8) return 'green';
  if (score > 0.5) return 'yellow';
  return 'red';
}

function formatStatValue(value: number, format?: string): string {
  if (format === 'thousands' && value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`;
  }
  if (format === 'decimal') {
    return value.toFixed(2);
  }
  return String(Math.round(value));
}

export function PlayerStatCard({ stat, statDefs, participants, onAssignChange }: PlayerStatCardProps) {
  let statsObj: Record<string, number> = {};
  try {
    statsObj = JSON.parse(stat.stats_json) as Record<string, number>;
  } catch { /* skip */ }

  const groupedMap = new Map<string, { value: string; label: string }[]>();
  for (const p of [...participants].sort((a, b) => a.username.localeCompare(b.username))) {
    const group = p.team_assignment ?? 'Unassigned';
    if (!groupedMap.has(group)) groupedMap.set(group, []);
    groupedMap.get(group)!.push({ value: p.id, label: p.username });
  }
  const participantOptions = [...groupedMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([group, items]) => ({ group, items }));

  return (
    <Card withBorder padding="sm">
      <Stack gap="xs">
        <Group justify="space-between">
          <div>
            <Text fw={600}>{stat.extracted_player_name}</Text>
          </div>
          {stat.confidence_score !== undefined && (
            <Badge color={confidenceColor(stat.confidence_score)} size="sm">
              {Math.round((stat.confidence_score || 0) * 100)}% confidence
            </Badge>
          )}
        </Group>

        <Divider />

        {/* Stats grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px' }}>
          {statDefs.map(def => {
            const val = statsObj[def.name] ?? 0;
            return (
              <div key={def.id} style={{ textAlign: 'center' }}>
                <Text size="xs" c="dimmed">{def.display_name}</Text>
                <Text size="sm" fw={def.is_primary ? 600 : 400}>
                  {formatStatValue(val, def.format)}
                </Text>
              </div>
            );
          })}
        </div>

        <Divider />

        {/* Assignment dropdown */}
        <Select
          size="xs"
          placeholder="Assign to participant..."
          data={participantOptions}
          value={stat.participant_id || null}
          onChange={(val) => onAssignChange(stat.id, val)}
          searchable
          clearable
        />
      </Stack>
    </Card>
  );
}
