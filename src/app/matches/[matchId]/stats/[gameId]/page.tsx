'use client'

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Container, Button, Stack, Skeleton } from '@mantine/core';
import { IconArrowLeft, IconChartBar } from '@tabler/icons-react';
import { PageHeader } from '@/components/PageHeader';
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
  round: number;
  status: string;
}

export default function MapStatsPage({
  params,
}: {
  params: Promise<{ matchId: string; gameId: string }>;
}) {
  const { matchId, gameId } = use(params);
  const router = useRouter();
  const [match, setMatch] = useState<Match | null>(null);
  const [game, setGame] = useState<MatchGame | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`/api/matches/${matchId}`).then(r => r.json()),
      fetch(`/api/matches/${matchId}/games`).then(r => r.json()).catch(() => ({ games: [] })),
    ]).then(([matchData, gamesData]: [Match, { games?: MatchGame[] }]) => {
      setMatch(matchData);
      const games = gamesData.games ?? [];
      setGame(games.find((g: MatchGame) => g.id === gameId) ?? null);
    }).finally(() => setLoading(false));
  }, [matchId, gameId]);

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

  const mapLabel = game
    ? `Map ${game.round}${game.map_name ? ` · ${game.map_name}` : ''}`
    : 'Map';

  return (
    <Container size="lg" py="xl">
      <Stack gap="lg">
        <PageHeader
          icon={IconChartBar}
          title={`${match?.name || 'Match'} — ${mapLabel}`}
          subtitle={match?.game_name}
          breadcrumbs={[
            { title: 'Matches', href: '/matches' },
            { title: match?.name || 'Match', href: `/matches/${matchId}` },
            { title: 'Stats', href: `/matches/${matchId}/stats` },
          ]}
          action={
            <Button
              variant="subtle"
              leftSection={<IconArrowLeft size={16} />}
              onClick={() => router.push(`/matches/${matchId}/stats`)}
            >
              Back
            </Button>
          }
        />

        {match && (
          <StatsReviewPanel
            matchId={matchId}
            gameId={match.game_id}
            matchGameId={gameId}
          />
        )}
      </Stack>
    </Container>
  );
}
