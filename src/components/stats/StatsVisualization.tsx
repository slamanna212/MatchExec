'use client'

import { useEffect, useState, useMemo } from 'react';
import type { JSX } from 'react';
import { Tabs, Stack, Text, Group, Divider, Skeleton } from '@mantine/core';
import { IconLayoutGrid, IconMap } from '@tabler/icons-react';
import type { MatchPlayerStats, GameStatDefinition, ParticipantDbRow } from '@/shared/types';
import type { PerMapStatRow } from '@/app/api/matches/[matchId]/stats/per-map/route';
import { StatCallouts, type PlayerStatEntry } from './StatCallouts';
import { TeamDonutCharts } from './TeamDonutCharts';
import { PlayerLeaderboard } from './PlayerLeaderboard';

export interface MapTab {
  id: string;
  round: number;
  map_name?: string;
}

interface Props {
  matchId: string;
  gameId: string;
  games?: MapTab[];
}

function SectionHeader({ label }: { label: string }) {
  return (
    <Group gap="sm" mb="xs">
      <Text size="xs" fw={700} tt="uppercase" c="dimmed" style={{ letterSpacing: '0.1em', whiteSpace: 'nowrap' }}>
        {label}
      </Text>
      <Divider style={{ flex: 1 }} />
    </Group>
  );
}

function buildPlayerEntries(
  rows: Array<{ participant_id: string; stats_json: string }>,
  participantMap: Map<string, ParticipantDbRow>
): PlayerStatEntry[] {
  const byParticipant = new Map<string, { stats: Record<string, number>; participant: ParticipantDbRow }>();
  for (const row of rows) {
    const participant = participantMap.get(row.participant_id);
    if (!participant) continue;
    let stats: Record<string, number> = {};
    try { stats = JSON.parse(row.stats_json) as Record<string, number>; } catch { /**/ }
    if (!byParticipant.has(row.participant_id)) {
      byParticipant.set(row.participant_id, { stats: {}, participant });
    }
    const entry = byParticipant.get(row.participant_id)!;
    for (const [k, v] of Object.entries(stats)) {
      if (typeof v === 'number') entry.stats[k] = (entry.stats[k] ?? 0) + v;
    }
  }
  return [...byParticipant.values()].map(({ stats, participant }) => ({
    participantId: participant.id,
    username: participant.username,
    team: (participant.team_assignment as 'blue' | 'red' | 'reserve') ?? 'reserve',
    stats,
  }));
}

export function StatsVisualization({ matchId, gameId, games = [] }: Props): JSX.Element {
  const [activeTab, setActiveTab] = useState('overall');
  const [overallStats, setOverallStats] = useState<MatchPlayerStats[]>([]);
  const [perMapStats, setPerMapStats] = useState<PerMapStatRow[]>([]);
  const [participantMap, setParticipantMap] = useState<Map<string, ParticipantDbRow>>(new Map());
  const [statDefs, setStatDefs] = useState<GameStatDefinition[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`/api/matches/${matchId}/stats`).then(r => r.json()) as Promise<MatchPlayerStats[]>,
      fetch(`/api/matches/${matchId}/stats/per-map`).then(r => r.json()).catch(() => []) as Promise<PerMapStatRow[]>,
      fetch(`/api/matches/${matchId}/participants`).then(r => r.json()) as Promise<{ participants: ParticipantDbRow[] }>,
      fetch(`/api/games/${gameId}/stats`).then(r => r.json()) as Promise<GameStatDefinition[]>,
    ]).then(([overallData, perMapData, participantsData, defsData]) => {
      setOverallStats(overallData ?? []);
      setPerMapStats(perMapData ?? []);
      const map = new Map<string, ParticipantDbRow>();
      for (const p of participantsData.participants ?? []) map.set(p.id, p);
      setParticipantMap(map);
      setStatDefs(Array.isArray(defsData) ? defsData : []);
    }).finally(() => setLoading(false));
  }, [matchId, gameId]);

  const overallPlayers = useMemo(
    () => buildPlayerEntries(
      overallStats.map(s => ({ participant_id: s.participant_id, stats_json: s.total_stats_json })),
      participantMap
    ),
    [overallStats, participantMap]
  );

  const perMapPlayers = useMemo(() => {
    const result = new Map<string, PlayerStatEntry[]>();
    for (const gid of new Set(perMapStats.map(r => r.match_game_id))) {
      result.set(gid, buildPlayerEntries(perMapStats.filter(r => r.match_game_id === gid), participantMap));
    }
    return result;
  }, [perMapStats, participantMap]);

  const showOverall = overallStats.length > 0;

  const activePlayers = activeTab === 'overall'
    ? overallPlayers
    : (perMapPlayers.get(activeTab) ?? []);

  if (loading) {
    return (
      <Stack gap="md">
        <Skeleton height={36} width={320} />
        <Skeleton height={88} />
        <Skeleton height={220} />
        <Skeleton height={280} />
      </Stack>
    );
  }

  // If overall is hidden and the active tab is 'overall', switch to first map tab
  if (!showOverall && activeTab === 'overall' && games.length > 0) {
    setActiveTab(games[0].id);
  }

  const hasAnyData = overallPlayers.length > 0 || perMapPlayers.size > 0;
  if (!hasAnyData) {
    return (
      <Text size="sm" c="dimmed" ta="center" py="xl">
        No stats available yet. Submit and approve scorecards to generate stats.
      </Text>
    );
  }

  return (
    <Stack gap="xl">
      <Tabs value={activeTab} onChange={v => setActiveTab(v ?? 'overall')} variant="pills">
        <Tabs.List style={{ overflowX: 'auto', flexWrap: 'nowrap', gap: 4, paddingBottom: 2 }}>
          {showOverall && (
            <Tabs.Tab value="overall" leftSection={<IconLayoutGrid size={13} />}>
              Overall
            </Tabs.Tab>
          )}
          {games.map(game => (
            <Tabs.Tab
              key={game.id}
              value={game.id}
              leftSection={<IconMap size={13} />}
              style={{ whiteSpace: 'nowrap' }}
            >
              {game.map_name ?? `Map ${game.round}`}
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs>

      {activePlayers.length === 0 ? (
        <Text size="sm" c="dimmed" ta="center" py="lg">
          No stats for this {activeTab === 'overall' ? 'match' : 'map'} yet.
        </Text>
      ) : (
        <>
          <div>
            <SectionHeader label="Highlights" />
            <StatCallouts players={activePlayers} statDefs={statDefs} />
          </div>
          <div>
            <SectionHeader label="Team Breakdown" />
            <TeamDonutCharts players={activePlayers} statDefs={statDefs} />
          </div>
          <div>
            <SectionHeader label="Player Leaderboard" />
            <PlayerLeaderboard players={activePlayers} statDefs={statDefs} />
          </div>
        </>
      )}
    </Stack>
  );
}
