'use client'

import { useState, useEffect } from 'react';
import { Stack, Group, Card, Button, Text, Select, Alert, Divider, Badge, Box } from '@mantine/core';
import { IconTrophy, IconFlag, IconCheck } from '@tabler/icons-react';
import type { MatchResult } from '@/shared/types';
import { logger } from '@/lib/logger/client';

interface MatchGame {
  id: string;
  match_id: string;
  round: number;
  map_id: string;
  map_name: string;
  image_url?: string;
  game_id: string;
  mode_scoring_type?: 'Position';
  status: 'pending' | 'ongoing' | 'completed';
  position_results?: string;
  points_awarded?: string;
}

interface MatchParticipant {
  id: string;
  username: string;
}

interface PositionScoringProps {
  matchId: string;
  gameType: string;
  onResultSubmit: (result: MatchResult) => Promise<void>;
  submitting: boolean;
}

export function PositionScoring({
  matchId,
  gameType,
  onResultSubmit,
  submitting
}: PositionScoringProps) {
  const [matchGames, setMatchGames] = useState<MatchGame[]>([]);
  const [participants, setParticipants] = useState<MatchParticipant[]>([]);
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [positionAssignments, setPositionAssignments] = useState<Record<string, number | null>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch match data
  useEffect(() => {
    if (!matchId || matchId.trim() === '') {
      setLoading(true);
      return;
    }

    const fetchMatchData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch match games
        const gamesResponse = await fetch(`/api/matches/${matchId}/games?t=${Date.now()}`);
        if (!gamesResponse.ok) {
          throw new Error('Failed to load match games');
        }
        const gamesData = await gamesResponse.json();
        setMatchGames(gamesData.games || []);

        // Fetch participants
        const participantsResponse = await fetch(`/api/matches/${matchId}/participants`);
        if (!participantsResponse.ok) {
          throw new Error('Failed to load participants');
        }
        const participantsData = await participantsResponse.json();
        setParticipants(participantsData.participants || []);

        // Auto-select the first pending/ongoing game
        const activeGame = gamesData.games.find((game: MatchGame) =>
          game.status === 'pending' || game.status === 'ongoing'
        );
        if (activeGame) {
          setSelectedGameId(activeGame.id);
        }
      } catch (err) {
        logger.error('Error fetching match data:', err);
        setError(err instanceof Error ? err.message : 'Failed to load match data');
      } finally {
        setLoading(false);
      }
    };

    fetchMatchData();
  }, [matchId]);

  // Initialize position assignments when game is selected
  useEffect(() => {
    if (participants.length > 0) {
      const initial: Record<string, number | null> = {};
      participants.forEach(p => {
        initial[p.id] = null;
      });
      setPositionAssignments(initial);
    }
  }, [participants]);

  const selectedGame = matchGames.find(game => game.id === selectedGameId);

  const getMapImageUrl = (gameId: string, mapId: string) => {
    // Handle special cases where maps don't use webp format
    if (gameId === 'overwatch2' && mapId === 'ow2-workshop') {
      return `/assets/games/${gameId}/maps/${mapId}.jpg`;
    }
    // Default to webp for all other maps
    return `/assets/games/${gameId}/maps/${mapId}.webp`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'green';
      case 'ongoing':
        return 'orange';
      default:
        return 'gray';
    }
  };

  // Generate position options (1 to number of participants)
  const positionOptions = Array.from({ length: participants.length }, (_, i) => ({
    value: String(i + 1),
    label: `${i + 1}${getOrdinalSuffix(i + 1)} Place`
  }));

  function getOrdinalSuffix(n: number): string {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return s[(v - 20) % 10] || s[v] || s[0];
  }

  const handlePositionChange = (participantId: string, position: string | null) => {
    setPositionAssignments(prev => ({
      ...prev,
      [participantId]: position ? parseInt(position) : null
    }));
  };

  const isValidSubmission = (): boolean => {
    // All participants must have a position assigned
    const allAssigned = Object.values(positionAssignments).every(pos => pos !== null);

    // No duplicate positions
    const positions = Object.values(positionAssignments).filter(p => p !== null);
    const uniquePositions = new Set(positions);
    const noDuplicates = positions.length === uniquePositions.size;

    return allAssigned && noDuplicates;
  };

  const handleSubmit = async () => {
    if (!selectedGame || !isValidSubmission()) return;

    try {
      // Convert assignments to Record<string, number>
      const positionResults: Record<string, number> = {};
      for (const [participantId, position] of Object.entries(positionAssignments)) {
        if (position !== null) {
          positionResults[participantId] = position;
        }
      }

      const result: MatchResult = {
        matchId,
        gameId: selectedGame.id,
        winner: 'team1', // Required field but not used in Position mode
        positionResults,
        isPositionMode: true,
        completedAt: new Date()
      };

      await onResultSubmit(result);

      // Move to next game
      const nextGame = matchGames.find((game: MatchGame) =>
        game.status === 'pending' || game.status === 'ongoing'
      );
      if (nextGame && nextGame.id !== selectedGameId) {
        setSelectedGameId(nextGame.id);
      }

      // Reset position assignments
      const initial: Record<string, number | null> = {};
      participants.forEach(p => {
        initial[p.id] = null;
      });
      setPositionAssignments(initial);
    } catch (error) {
      logger.error('Error submitting position results:', error);
      setError(error instanceof Error ? error.message : 'Failed to save results');
    }
  };

  if (loading) {
    return <Text>Loading race data...</Text>;
  }

  if (error) {
    return (
      <Alert color="red" icon={<IconTrophy size={16} />}>
        {error}
      </Alert>
    );
  }

  if (matchGames.length === 0 || participants.length === 0) {
    return (
      <Alert color="yellow" icon={<IconFlag size={16} />}>
        No races or participants found for this match.
      </Alert>
    );
  }

  return (
    <Stack gap="md">
      {/* Race Selection */}
      <Card withBorder p="md">
        <Stack gap="sm">
          <Text fw={600} size="sm">Race Schedule</Text>

          <Group gap="md">
            {matchGames.map((game) => (
              <Card
                key={game.id}
                withBorder
                onClick={() => setSelectedGameId(game.id)}
                style={{
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  minWidth: 180,
                  height: 120,
                  backgroundImage: `linear-gradient(${selectedGameId === game.id ? 'rgba(0, 0, 0, 0.2), rgba(0, 0, 0, 0.4)' : 'rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0.6)'}), url('${game.image_url || getMapImageUrl(gameType, game.map_id)}')`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  backgroundRepeat: 'no-repeat',
                  backgroundColor: '#1a1b1e',
                  border: selectedGameId === game.id ? `2px solid var(--mantine-color-${getStatusColor(game.status)}-6)` : 'none',
                  boxShadow: selectedGameId === game.id ? `0 0 0 1px var(--mantine-color-${getStatusColor(game.status)}-6)` : undefined,
                  opacity: submitting ? 0.6 : 1,
                  position: 'relative'
                }}
                p="sm"
              >
                <Stack gap="xs" h="100%" justify="space-between">
                  {/* Status Icon and Badge */}
                  <Group justify="space-between" align="flex-start">
                    {game.status === 'completed' ? (
                      <IconCheck size={16} color="green" />
                    ) : (
                      <IconFlag size={16} color="gray" />
                    )}
                    <Badge
                      color={getStatusColor(game.status)}
                      size="xs"
                      style={{ backgroundColor: `var(--mantine-color-${getStatusColor(game.status)}-6)` }}
                    >
                      {game.status}
                    </Badge>
                  </Group>

                  {/* Map Info */}
                  <Box>
                    <Text
                      size="xs"
                      fw={600}
                      c="white"
                      style={{
                        textShadow: '0 0 4px rgba(0, 0, 0, 0.9), 1px 1px 2px rgba(0, 0, 0, 0.8)',
                        lineHeight: 1.2,
                        fontWeight: 700
                      }}
                    >
                      Race {game.round}
                    </Text>
                    <Text
                      size="xs"
                      c="white"
                      style={{
                        textShadow: '0 0 4px rgba(0, 0, 0, 0.9), 1px 1px 2px rgba(0, 0, 0, 0.8)',
                        lineHeight: 1.1,
                        fontWeight: 600
                      }}
                    >
                      {game.map_name}
                    </Text>
                  </Box>
                </Stack>
              </Card>
            ))}
          </Group>
        </Stack>
      </Card>

      {/* Position Entry */}
      {selectedGame && selectedGame.status !== 'completed' && (
        <Card withBorder p="md">
          <Stack gap="md">
            <Group justify="space-between">
              <Text fw={600}>
                Race {selectedGame.round}: {selectedGame.map_name}
              </Text>
              <Badge color="blue" size="sm">
                Position-Based Scoring
              </Badge>
            </Group>

            <Divider />

            <Text size="sm" c="dimmed">
              <IconTrophy size={16} style={{ marginRight: 8 }} />
              Assign finishing position to each participant:
            </Text>

            <Stack gap="sm">
              {participants.map((participant) => (
                <Group key={participant.id} align="center" justify="space-between">
                  <Text fw={500} style={{ flex: 1 }}>
                    {participant.username}
                  </Text>
                  <Select
                    placeholder="Select position"
                    data={positionOptions}
                    value={positionAssignments[participant.id]?.toString() || null}
                    onChange={(value) => handlePositionChange(participant.id, value)}
                    disabled={submitting}
                    style={{ width: 200 }}
                    clearable
                  />
                </Group>
              ))}
            </Stack>

            <Divider />

            <Button
              fullWidth
              size="lg"
              color="blue"
              onClick={handleSubmit}
              disabled={!isValidSubmission() || submitting}
              loading={submitting}
              leftSection={<IconCheck size={20} />}
            >
              Submit Race Results
            </Button>

            {!isValidSubmission() && (
              <Text size="xs" c="dimmed" ta="center">
                {Object.values(positionAssignments).every(pos => pos !== null)
                  ? 'Please ensure no duplicate positions'
                  : 'Please assign a position to all participants'}
              </Text>
            )}
          </Stack>
        </Card>
      )}

      {/* Completed Race Display */}
      {selectedGame && selectedGame.status === 'completed' && (
        <Alert color="green" icon={<IconCheck size={16} />}>
          This race has been completed. Results recorded.
        </Alert>
      )}
    </Stack>
  );
}