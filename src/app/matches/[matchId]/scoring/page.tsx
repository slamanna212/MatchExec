'use client'

import { logger } from '@/lib/logger/client';
import { use, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Container,
  Stack,
  Group,
  Text,
  Title,
  Breadcrumbs,
  Anchor,
  Loader,
  Center,
  Alert,
  Button,
  ThemeIcon
} from '@mantine/core';
import { IconTrophy, IconAlertCircle } from '@tabler/icons-react';
import type { MatchFormat, MatchResult } from '@/shared/types';
import { FormatBadge } from '@/components/scoring/shared/FormatBadge';
import { SimpleMapScoring } from '@/components/scoring/SimpleMapScoring';
import { PositionScoring } from '@/components/scoring/PositionScoring';

interface MatchData {
  id: string;
  name: string;
  game_id: string;
  match_format?: MatchFormat;
  status: string;
}

export default function ScoringPage({
  params
}: {
  params: Promise<{ matchId: string }>
}) {
  const { matchId } = use(params);
  const router = useRouter();

  const [match, setMatch] = useState<MatchData | null>(null);
  const [scoringType, setScoringType] = useState<'Normal' | 'FFA' | 'Position' | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);

        const matchRes = await fetch(`/api/matches/${matchId}`);
        if (!matchRes.ok) {
          setError(matchRes.status === 404 ? 'Match not found' : 'Failed to load match');
          return;
        }
        const matchData: MatchData = await matchRes.json();
        setMatch(matchData);

        const gamesRes = await fetch(`/api/matches/${matchId}/games`);
        if (!gamesRes.ok) throw new Error('Failed to fetch match games');

        const gamesData = await gamesRes.json();
        if (gamesData.games && gamesData.games.length > 0) {
          const firstGame = gamesData.games[0];
          setScoringType(firstGame.mode_scoring_type || 'Normal');
        } else {
          setScoringType('Normal');
        }
      } catch (err) {
        logger.error('Error loading scoring page:', err);
        setError('An error occurred while loading the scoring interface');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [matchId]);

  const handleResultSubmit = async (result: MatchResult) => {
    setSubmitting(true);
    try {
      const response = await fetch(`/api/matches/${matchId}/games/${result.gameId}/result`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result)
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to save result');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleAllMapsCompleted = () => {
    router.push(`/matches/${matchId}`);
  };

  if (loading) {
    return (
      <Container>
        <Center style={{ minHeight: '400px' }}>
          <Stack align="center" gap="md">
            <Loader size="lg" />
            <Text c="dimmed">Loading scoring interface...</Text>
          </Stack>
        </Center>
      </Container>
    );
  }

  if (error || !match) {
    return (
      <Container size="md" py="xl">
        <Stack gap="md">
          <Alert color="red" icon={<IconAlertCircle size={16} />}>
            {error || 'Match not found'}
          </Alert>
          <Anchor onClick={() => router.push('/matches')} style={{ cursor: 'pointer' }}>
            ← Back to Matches
          </Anchor>
        </Stack>
      </Container>
    );
  }

  if (match.status !== 'battle') {
    return (
      <Container size="md" py="xl">
        <Stack gap="md">
          <Breadcrumbs mb="sm">
            <Anchor onClick={() => router.push('/matches')} style={{ cursor: 'pointer' }}>Matches</Anchor>
            <Anchor onClick={() => router.push(`/matches/${matchId}`)} style={{ cursor: 'pointer' }}>{match.name}</Anchor>
            <Text>Scoring</Text>
          </Breadcrumbs>
          <Alert color="yellow" icon={<IconAlertCircle size={16} />}>
            Scoring is only available when the match is in progress (battle status). Current status: {match.status}
          </Alert>
          <Button variant="outline" onClick={() => router.push(`/matches/${matchId}`)}>
            Back to Match
          </Button>
        </Stack>
      </Container>
    );
  }

  return (
    <Container size="lg" py="xl">
      <Stack gap="lg">
        <div>
          <Breadcrumbs mb="sm">
            <Anchor onClick={() => router.push('/matches')} style={{ cursor: 'pointer' }}>Matches</Anchor>
            <Anchor onClick={() => router.push(`/matches/${matchId}`)} style={{ cursor: 'pointer' }}>{match.name}</Anchor>
            <Text>Scoring</Text>
          </Breadcrumbs>

          <Group align="center" gap="sm">
            <ThemeIcon size="lg" variant="light" color="yellow">
              <IconTrophy size={20} />
            </ThemeIcon>
            <Title order={2}>{match.name}</Title>
            <FormatBadge format={match.match_format || 'casual'} />
          </Group>
        </div>

        {scoringType === 'Position' ? (
          <Stack gap="md">
            <PositionScoring
              matchId={matchId}
              gameType={match.game_id}
              onResultSubmit={handleResultSubmit}
              submitting={submitting}
            />
            <Group justify="flex-end">
              <Button variant="outline" onClick={() => router.push(`/matches/${matchId}`)}>
                Back to Match
              </Button>
            </Group>
          </Stack>
        ) : (
          <SimpleMapScoring
            matchId={matchId}
            gameType={match.game_id}
            onResultSubmit={handleResultSubmit}
            submitting={submitting}
            onAllMapsCompleted={handleAllMapsCompleted}
          />
        )}
      </Stack>
    </Container>
  );
}
