'use client'

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Container, Button, Stack, Skeleton, SimpleGrid, Text } from '@mantine/core';
import { IconArrowLeft, IconChartBar } from '@tabler/icons-react';
import { PageHeader } from '@/components/PageHeader';
import { MapStatCard } from '@/components/stats/MapStatCard';
import { StatsVisualizationPlaceholder } from '@/components/stats/StatsVisualizationPlaceholder';
import type { ScorecardSubmission } from '@/shared/types';

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
  image_url?: string;
  status: 'pending' | 'ongoing' | 'completed';
  round: number;
}

export default function MatchStatsPage({ params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = use(params);
  const router = useRouter();
  const [match, setMatch] = useState<Match | null>(null);
  const [matchGames, setMatchGames] = useState<MatchGame[]>([]);
  const [scorecardMap, setScorecardMap] = useState<Map<string, { blue: boolean; red: boolean }>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`/api/matches/${matchId}`).then(r => r.json()),
      fetch(`/api/matches/${matchId}/games`).then(r => r.json()).catch(() => ({ games: [] })),
      fetch(`/api/matches/${matchId}/scorecard`).then(r => r.json()).catch(() => []),
    ]).then(([matchData, gamesData, scorecardData]: [Match, { games?: MatchGame[] }, ScorecardSubmission[]]) => {
      setMatch(matchData);
      const games = gamesData.games ?? [];
      setMatchGames(games);

      const map = new Map<string, { blue: boolean; red: boolean }>();
      for (const sub of (scorecardData || [])) {
        const entry = map.get(sub.match_game_id) ?? { blue: false, red: false };
        if (sub.team_side === 'blue') entry.blue = true;
        if (sub.team_side === 'red') entry.red = true;
        map.set(sub.match_game_id, entry);
      }
      setScorecardMap(map);
    }).finally(() => setLoading(false));
  }, [matchId]);

  if (loading) {
    return (
      <Container size="xl" py="xl">
        <Stack gap="lg">
          <Skeleton height={40} />
          <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
            <Skeleton height={110} />
            <Skeleton height={110} />
            <Skeleton height={110} />
          </SimpleGrid>
          <Skeleton height={300} />
        </Stack>
      </Container>
    );
  }

  return (
    <Container size="xl" py="xl">
      <Stack gap="lg">
        <PageHeader
          icon={IconChartBar}
          title={`${match?.name || 'Match'} — Stats`}
          subtitle={match?.game_name}
          breadcrumbs={[
            { title: 'Matches', href: '/matches' },
            { title: match?.name || 'Match', href: `/matches/${matchId}` },
          ]}
          action={
            <Button
              variant="subtle"
              leftSection={<IconArrowLeft size={16} />}
              onClick={() => router.push(`/matches/${matchId}`)}
            >
              Back
            </Button>
          }
        />

        {/* Map cards — horizontal grid across the top */}
        {matchGames.length === 0 ? (
          <Text size="sm" c="dimmed">No maps configured for this match.</Text>
        ) : (
          <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
            {matchGames.map(game => (
              <MapStatCard
                key={game.id}
                round={game.round}
                mapName={game.map_name}
                mapImageUrl={game.image_url}
                status={game.status}
                blueSubmitted={scorecardMap.get(game.id)?.blue ?? false}
                redSubmitted={scorecardMap.get(game.id)?.red ?? false}
                onView={() => router.push(`/matches/${matchId}/stats/${game.id}`)}
              />
            ))}
          </SimpleGrid>
        )}

        {/* Full-width stats area */}
        <StatsVisualizationPlaceholder />
      </Stack>
    </Container>
  );
}
