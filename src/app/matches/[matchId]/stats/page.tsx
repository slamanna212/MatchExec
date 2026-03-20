'use client'

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Container, Group, Button, Text, Stack, Skeleton, Tabs, Badge } from '@mantine/core';
import { IconArrowLeft, IconChartBar } from '@tabler/icons-react';
import { StatsReviewPanel } from '@/components/stats/StatsReviewPanel';

interface Match {
  id: string;
  name: string;
  game_id: string;
  game_name?: string;
}

interface MatchGame {
  id: string;
  map_name?: string;
  map_id: string;
  status: string;
  round: number;
}

export default function MatchStatsPage({ params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = use(params);
  const router = useRouter();
  const [match, setMatch] = useState<Match | null>(null);
  const [matchGames, setMatchGames] = useState<MatchGame[]>([]);
  const [activeGameId, setActiveGameId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`/api/matches/${matchId}`).then(r => r.json()),
      fetch(`/api/matches/${matchId}/games`).then(r => r.json()).catch(() => []),
    ]).then(([matchData, gamesData]: [Match, MatchGame[]]) => {
      setMatch(matchData);
      const games = Array.isArray(gamesData) ? gamesData : [];
      setMatchGames(games);
      if (games.length > 0) {
        setActiveGameId(games[0].id);
      }
    }).finally(() => setLoading(false));
  }, [matchId]);

  if (loading) {
    return (
      <Container size="lg" py="xl">
        <Stack gap="lg">
          <Skeleton height={40} />
          <Skeleton height={400} />
        </Stack>
      </Container>
    );
  }

  return (
    <Container size="lg" py="xl">
      <Stack gap="lg">
        {/* Header */}
        <Group justify="space-between">
          <Group>
            <Button
              variant="subtle"
              leftSection={<IconArrowLeft size={16} />}
              onClick={() => router.push(`/matches/${matchId}`)}
            >
              Back
            </Button>
            <Group gap="xs">
              <IconChartBar size="1.5rem" />
              <div>
                <Text fw={700} size="xl">{match?.name || 'Match'} — Stats</Text>
                {match?.game_name && <Text size="sm" c="dimmed">{match.game_name}</Text>}
              </div>
            </Group>
          </Group>
        </Group>

        {/* Map tabs if multiple games */}
        {matchGames.length > 1 ? (
          <Tabs value={activeGameId} onChange={setActiveGameId}>
            <Tabs.List>
              {matchGames.map((game, i) => (
                <Tabs.Tab
                  key={game.id}
                  value={game.id}
                  rightSection={
                    <Badge size="xs" color={game.status === 'completed' ? 'green' : game.status === 'ongoing' ? 'blue' : 'gray'}>
                      {game.status}
                    </Badge>
                  }
                >
                  Map {i + 1}{game.map_name ? ` — ${game.map_name}` : ''}
                </Tabs.Tab>
              ))}
            </Tabs.List>

            {matchGames.map(game => (
              <Tabs.Panel key={game.id} value={game.id} pt="md">
                {match && (
                  <StatsReviewPanel
                    matchId={matchId}
                    gameId={match.game_id}
                  />
                )}
              </Tabs.Panel>
            ))}
          </Tabs>
        ) : (
          match && (
            <StatsReviewPanel
              matchId={matchId}
              gameId={match.game_id}
            />
          )
        )}
      </Stack>
    </Container>
  );
}
