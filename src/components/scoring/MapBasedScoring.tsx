'use client'

import { useState, useEffect } from 'react';
import { Stack, Group, Card, Button, Text, Badge, Divider, Alert, Loader } from '@mantine/core';
import { IconMap, IconCheck, IconClock, IconTrophy } from '@tabler/icons-react';
import { MatchScore, ScoringConfig, ModeDataJsonWithScoring } from '@/shared/types';
import { FormatDetector } from './FormatDetector';

interface MatchGame {
  id: string;
  match_id: string;
  round: number;
  map_id: string;
  map_name: string;
  status: 'pending' | 'ongoing' | 'completed';
  score_data?: string;
  winner_id?: string;
}

interface MapBasedScoringProps {
  matchId: string;
  gameType: string; // The game type (e.g., "marvelrivals", "overwatch2")
  modeData: ModeDataJsonWithScoring;
  scoringConfig: ScoringConfig;
  onScoreSubmit: (score: MatchScore) => Promise<void>;
  submitting: boolean;
  onAllMapsCompleted?: () => void; // Optional callback when all maps are completed
}

export function MapBasedScoring({
  matchId,
  gameType,
  modeData,
  scoringConfig,
  onScoreSubmit,
  submitting,
  onAllMapsCompleted
}: MapBasedScoringProps) {
  const [matchGames, setMatchGames] = useState<MatchGame[]>([]);
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch match games
  useEffect(() => {
    const fetchMatchGames = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/matches/${matchId}/games`);
        if (!response.ok) {
          throw new Error('Failed to load match games');
        }
        
        const data = await response.json();
        setMatchGames(data.games || []);
        
        // Auto-select the first pending/ongoing game
        const activeGame = data.games.find((game: MatchGame) => 
          game.status === 'pending' || game.status === 'ongoing'
        );
        if (activeGame) {
          setSelectedGameId(activeGame.id);
        }
      } catch (err) {
        console.error('Error fetching match games:', err);
        setError(err instanceof Error ? err.message : 'Failed to load match games');
      } finally {
        setLoading(false);
      }
    };

    fetchMatchGames();
  }, [matchId]);

  const selectedGame = matchGames.find(game => game.id === selectedGameId);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <IconCheck size={16} color="green" />;
      case 'ongoing':
        return <IconClock size={16} color="orange" />;
      default:
        return <IconMap size={16} color="gray" />;
    }
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

  const formatMapName = (mapId: string, mapName?: string) => {
    if (mapName) return mapName;
    
    // Fallback formatting
    return mapId
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const handleMapScoreSubmit = async (score: MatchScore) => {
    // Update the score with the correct game ID
    const updatedScore = {
      ...score,
      gameId: selectedGameId || score.gameId
    };
    
    await onScoreSubmit(updatedScore);
    
    // Refresh match games after submission
    try {
      const response = await fetch(`/api/matches/${matchId}/games`);
      if (response.ok) {
        const data = await response.json();
        setMatchGames(data.games || []);
        
        // Move to next pending game if current one is completed
        const nextGame = data.games.find((game: MatchGame) => 
          game.status === 'pending' || game.status === 'ongoing'
        );
        if (nextGame && nextGame.id !== selectedGameId) {
          setSelectedGameId(nextGame.id);
        } else if (!nextGame && onAllMapsCompleted) {
          // No more pending games - all maps are completed
          onAllMapsCompleted();
        }
      } else {
        console.error('Failed to refresh match games after score submission:', response.status, response.statusText);
      }
    } catch (fetchError) {
      console.error('Error refreshing match games after score submission:', fetchError);
      // Don't throw the error - just log it so the modal doesn't close unexpectedly
    }
  };

  if (loading) {
    return (
      <Group justify="center" p="xl">
        <Loader size="md" />
        <Text>Loading match maps...</Text>
      </Group>
    );
  }

  if (error) {
    return (
      <Alert color="red" icon={<IconTrophy size={16} />}>
        {error}
      </Alert>
    );
  }

  if (matchGames.length === 0) {
    return (
      <Alert color="yellow" icon={<IconMap size={16} />}>
        No maps found for this match. Please check the match configuration.
      </Alert>
    );
  }

  return (
    <Stack gap="md">
      {/* Map Selection */}
      <Card withBorder p="md">
        <Stack gap="sm">
          <Text fw={600} size="sm">Select Map to Score</Text>
          <Group gap="xs">
            {matchGames.map((game) => (
              <Button
                key={game.id}
                variant={selectedGameId === game.id ? "filled" : "light"}
                color={getStatusColor(game.status)}
                size="sm"
                leftSection={getStatusIcon(game.status)}
                onClick={() => setSelectedGameId(game.id)}
                disabled={submitting}
              >
                Map {game.round}: {formatMapName(game.map_id, game.map_name)}
              </Button>
            ))}
          </Group>
          
          {/* Status summary */}
          <Group gap="lg" mt="xs">
            <Group gap="xs">
              <IconCheck size={14} color="green" />
              <Text size="xs" c="dimmed">
                {matchGames.filter(g => g.status === 'completed').length} Completed
              </Text>
            </Group>
            <Group gap="xs">
              <IconClock size={14} color="orange" />
              <Text size="xs" c="dimmed">
                {matchGames.filter(g => g.status === 'ongoing').length} In Progress
              </Text>
            </Group>
            <Group gap="xs">
              <IconMap size={14} color="gray" />
              <Text size="xs" c="dimmed">
                {matchGames.filter(g => g.status === 'pending').length} Pending
              </Text>
            </Group>
          </Group>
        </Stack>
      </Card>

      {/* Selected Map Scoring */}
      {selectedGame && (
        <Card withBorder p="md">
          <Stack gap="md">
            <Group justify="space-between">
              <Group gap="sm">
                <Text fw={600}>
                  Map {selectedGame.round}: {formatMapName(selectedGame.map_id, selectedGame.map_name)}
                </Text>
                <Badge color={getStatusColor(selectedGame.status)} size="sm">
                  {selectedGame.status}
                </Badge>
              </Group>
            </Group>

            <Divider />

            {/* Scoring Interface */}
            <FormatDetector
              matchId={matchId}
              gameId={selectedGame.id}
              gameType={gameType}
              modeData={modeData}
              scoringConfig={scoringConfig}
              onScoreSubmit={handleMapScoreSubmit}
              submitting={submitting}
            />
          </Stack>
        </Card>
      )}
    </Stack>
  );
}