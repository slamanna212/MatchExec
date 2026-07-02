'use client'

import type { JSX } from 'react';
import { Stack, Card, Group, Avatar, Text } from '@mantine/core';
import { IconTrophy } from '@tabler/icons-react';
import { EmptyState } from '../EmptyState';
import { SectionLabel } from '../SectionLabel';

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
 */
export function LeaderboardView({ standings }: LeaderboardViewProps): JSX.Element {
  if (standings.length === 0) {
    return (
      <Card withBorder>
        <EmptyState
          icon={IconTrophy}
          title="No standings yet"
          description="Standings will appear once rounds are scored"
        />
      </Card>
    );
  }

  return (
    <Stack gap="xs" style={{ width: '80%', margin: '0 auto' }}>
      {standings.map((entry) => (
        <Card
          key={entry.participant_id}
          withBorder
          p="md"
          style={{
            borderLeft: entry.rank === 1 ? '4px solid var(--mantine-color-yellow-5)' : undefined
          }}
        >
          <Group justify="space-between" wrap="nowrap">
            <Group gap="md">
              <Avatar size="md" color={entry.rank === 1 ? 'yellow' : 'blue'} variant="filled">
                {entry.rank}
              </Avatar>
              <div>
                <Text fw={500} size="sm">{entry.username}</Text>
                <Text size="xs" c="dimmed">
                  {entry.matches_played} {entry.matches_played === 1 ? 'round' : 'rounds'} played
                  {entry.best_position != null && ` · best finish P${entry.best_position}`}
                </Text>
              </div>
            </Group>
            <div style={{ textAlign: 'center' }}>
              <SectionLabel>Points</SectionLabel>
              <Text size="lg" fw={700} c="green">{entry.total_points}</Text>
            </div>
          </Group>
        </Card>
      ))}
    </Stack>
  );
}
