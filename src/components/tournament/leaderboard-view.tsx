'use client'

import type { JSX } from 'react';
import { Card, Text } from '@mantine/core';
import { IconTrophy } from '@tabler/icons-react';
import { EmptyState } from '../EmptyState';
import { RankedTable } from '../shared/RankedTable';

export interface CumulativeStanding {
  rank: number;
  participant_id: string;
  username: string;
  total_points: number;
  matches_played: number;
  best_position: number | null;
}

interface LeaderboardViewProps {
  standings: CumulativeStanding[];
}

/**
 * Standings view for FFA/Position ('cumulative-points') tournaments — a
 * per-participant leaderboard ranked by total points across all rounds,
 * as opposed to the win/loss team standings used by bracket tournaments.
 * Uses the shared RankedTable so it matches series and team standings.
 */
export function LeaderboardView({ standings }: LeaderboardViewProps): JSX.Element {
  if (standings.length === 0) {
    return (
      <Card withBorder radius="md">
        <EmptyState
          icon={IconTrophy}
          title="No standings yet"
          description="Standings will appear once rounds are scored"
        />
      </Card>
    );
  }

  return (
    <RankedTable
      rows={standings}
      getKey={(e) => e.participant_id}
      getRank={(e) => e.rank}
      primaryHeader="Player"
      renderPrimary={(e) => (
        <>
          <Text fw={500} size="sm" truncate>{e.username}</Text>
          <Text size="xs" c="dimmed">
            {e.matches_played} {e.matches_played === 1 ? 'round' : 'rounds'} played
            {e.best_position != null && ` · best finish P${e.best_position}`}
          </Text>
        </>
      )}
      columns={[
        {
          key: 'points',
          header: 'Points',
          width: '84px',
          align: 'right',
          render: (e) => <Text size="lg" fw={700}>{e.total_points}</Text>,
        },
      ]}
    />
  );
}
