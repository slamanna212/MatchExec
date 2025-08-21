'use client'

import { useState, useEffect } from 'react';
import { Stack, Group, Card, Button, Text, Badge, Divider, Alert, Loader } from '@mantine/core';
import { IconMap, IconCheck, IconClock, IconTrophy, IconSwords } from '@tabler/icons-react';
import { MatchResult } from '@/shared/types';

interface MatchGame {
  id: string;
  match_id: string;
  round: number;
  map_id: string;
  map_name: string;
  mode_id: string;
  game_id: string; // game type like "overwatch2"
  status: 'pending' | 'ongoing' | 'completed';
  winner_id?: string;
}

interface SimpleMapScoringProps {
  matchId: string;
  gameType: string; // The game type (e.g., "marvelrivals", "overwatch2")
  onResultSubmit: (result: MatchResult) => Promise<void>;
  submitting: boolean;
  onAllMapsCompleted?: () => void; // Optional callback when all maps are completed
}

export function SimpleMapScoring({
  matchId,
  gameType,
  onResultSubmit,
  submitting,
  onAllMapsCompleted
}: SimpleMapScoringProps) {
  const [matchGames, setMatchGames] = useState<MatchGame[]>([]);
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch match games
  useEffect(() => {
    const fetchMatchGames = async () => {
      let response: Response | undefined;
      try {
        setLoading(true);
        setError(null);
        response = await fetch(`/api/matches/${matchId}/games`);
        if (!response.ok) {
          let errorMessage = `HTTP ${response.status}: Failed to load match games`;
          try {
            const errorData = await response.json();
            errorMessage = errorData.error || errorMessage;
          } catch (jsonError) {
            console.error('Failed to parse error response as JSON:', jsonError);
          }
          throw new Error(errorMessage);
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
        console.error('Response status:', response?.status);
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

  const handleTeamWin = async (winner: 'team1' | 'team2') => {
    if (!selectedGame) return;

    try {
      const result: MatchResult = {
        matchId,
        gameId: selectedGame.id,
        winner,
        completedAt: new Date()
      };
      
      await onResultSubmit(result);
      
      // Refresh match games after submission
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
        let errorMessage = `HTTP ${response.status}: Failed to refresh games`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch (jsonError) {
          console.error('Failed to parse error response as JSON:', jsonError);
        }
        console.error('Error refreshing match games:', response.status, errorMessage);
        setError(errorMessage);
      }
    } catch (error) {
      console.error('Error in handleTeamWin:', error);
      setError(error instanceof Error ? error.message : 'Failed to save result');
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

      {/* Error display */}
      {error && (
        <Alert color="red" icon={<IconTrophy size={16} />}>
          {error}
        </Alert>
      )}

      {/* Selected Map Winner Selection */}
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
                {selectedGame.winner_id && (
                  <Badge color={selectedGame.winner_id === 'team1' ? 'blue' : 'red'} size="sm">
                    Winner: {selectedGame.winner_id === 'team1' ? 'Blue Team' : 'Red Team'}
                  </Badge>
                )}
              </Group>
            </Group>

            <Divider />

            {/* Winner Selection */}
            {selectedGame.status !== 'completed' && (
              <Stack gap="md">
                <Text size="sm" c="dimmed" ta="center">
                  <IconSwords size={16} style={{ marginRight: 8 }} />
                  Who won this map?
                </Text>
                
                <Group justify="center" gap="xl">
                  <Button
                    size="lg"
                    color="blue"
                    variant="outline"
                    onClick={() => handleTeamWin('team1')}
                    disabled={submitting}
                    loading={submitting}
                    leftSection={<IconTrophy size={20} />}
                  >
                    Blue Team Wins
                  </Button>
                  
                  <Button
                    size="lg"
                    color="red"
                    variant="outline"
                    onClick={() => handleTeamWin('team2')}
                    disabled={submitting}
                    loading={submitting}
                    leftSection={<IconTrophy size={20} />}
                  >
                    Red Team Wins
                  </Button>
                </Group>
              </Stack>
            )}

            {/* Already completed */}
            {selectedGame.status === 'completed' && (
              <Alert color="green" icon={<IconCheck size={16} />}>
                This map has been completed. Winner: {selectedGame.winner_id === 'team1' ? 'Blue Team' : 'Red Team'}
              </Alert>
            )}
          </Stack>
        </Card>
      )}
    </Stack>
  );
}