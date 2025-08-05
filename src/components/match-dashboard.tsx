'use client'

import { useState, useEffect } from 'react';
import { 
  Card, 
  Text, 
  Button, 
  Badge,
  Avatar,
  Divider,
  Loader,
  Group,
  Stack,
  Grid
} from '@mantine/core';
import { Match } from '../../shared/types';

interface GameWithIcon {
  id: string;
  name: string;
  genre: string;
  developer: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
  iconUrl: string;
  coverUrl: string;
  mapCount: number;
  modeCount: number;
}
import { CreateMatchModal } from './create-match-modal';

interface MatchWithGame extends Match {
  game_name?: string;
  game_icon?: string;
  rules?: string;
  rounds?: number;
  maps?: string[];
  livestream_link?: string;
}

export function MatchDashboard() {
  const [matches, setMatches] = useState<MatchWithGame[]>([]);
  const [games, setGames] = useState<GameWithIcon[]>([]);
  const [loading, setLoading] = useState(true);
  const [createModalOpen, setCreateModalOpen] = useState(false);

  useEffect(() => {
    fetchMatches();
    fetchGames();
  }, []);

  const fetchMatches = async () => {
    try {
      const response = await fetch('/api/matches');
      if (response.ok) {
        const data = await response.json();
        setMatches(data);
      }
    } catch (error) {
      console.error('Error fetching matches:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchGames = async () => {
    try {
      const response = await fetch('/api/games');
      if (response.ok) {
        const data = await response.json();
        setGames(data);
      }
    } catch (error) {
      console.error('Error fetching games:', error);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'created': return 'gray';
      case 'registration': return 'blue';
      case 'ongoing': return 'yellow';
      case 'completed': return 'green';
      case 'cancelled': return 'red';
      default: return 'gray';
    }
  };

  const formatMapName = (mapId: string) => {
    // Convert map ID to proper display name
    // Examples: "circuit-royal" -> "Circuit Royal", "kings-row" -> "Kings Row"
    return mapId
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const [mapNames, setMapNames] = useState<{[key: string]: string}>({});

  const fetchMapNames = async (gameId: string) => {
    try {
      const response = await fetch(`/api/games/${gameId}/maps`);
      if (response.ok) {
        const maps = await response.json();
        const mapNamesObj: {[key: string]: string} = {};
        maps.forEach((map: any) => {
          mapNamesObj[map.id] = map.name;
        });
        setMapNames(prev => ({ ...prev, ...mapNamesObj }));
      }
    } catch (error) {
      console.error('Error fetching map names:', error);
    }
  };

  useEffect(() => {
    // Fetch all map names for games that have matches
    const gameIds = new Set<string>();
    matches.forEach(match => {
      if (match.maps && match.maps.length > 0) {
        gameIds.add(match.game_id);
      }
    });

    gameIds.forEach(gameId => {
      fetchMapNames(gameId);
    });
  }, [matches]);

  const handleMatchCreated = (match: Match) => {
    // Add the new match to the top of the list
    setMatches(prev => [match, ...prev]);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Loader size="lg" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <Group justify="space-between" mb="xl">
        <div>
          <Text size="xl" fw={700}>Match Dashboard</Text>
          <Text c="dimmed" mt="xs">Manage and view all matches</Text>
        </div>
        <Button 
          size="lg"
          onClick={() => setCreateModalOpen(true)}
        >
          Create Match
        </Button>
      </Group>

      <Divider mb="xl" />

      {matches.length === 0 ? (
        <Card p="xl">
          <Stack align="center">
            <Text size="xl" fw={600}>No matches yet</Text>
            <Text c="dimmed" mb="md">
              Create your first match to get started
            </Text>
            <Button 
              onClick={() => setCreateModalOpen(true)}
            >
              Create Match
            </Button>
          </Stack>
        </Card>
      ) : (
        <Grid>
          {matches.map((match) => (
            <Grid.Col key={match.id} span={{ base: 12, md: 6, lg: 4 }}>
              <Card shadow="sm" padding="lg" radius="md" withBorder>
                <Group mb="md">
                  <Avatar
                    src={match.game_icon}
                    alt={match.game_name}
                    size="md"
                  />
                  <Stack gap="xs" style={{ flex: 1 }}>
                    <Text fw={600}>{match.name}</Text>
                    <Text size="sm" c="dimmed">{match.game_name}</Text>
                  </Stack>
                  <Badge 
                    color={getStatusColor(match.status)} 
                    size="sm"
                  >
                    {match.status}
                  </Badge>
                </Group>
                
                <Divider mb="md" />
                
                <Stack gap="xs">
                  {match.description && (
                    <Text size="sm" c="dimmed">{match.description}</Text>
                  )}
                  
                  {match.rules && (
                    <Group justify="space-between">
                      <Text size="sm" c="dimmed">Rules:</Text>
                      <Text size="sm" tt="capitalize">{match.rules}</Text>
                    </Group>
                  )}
                  
                  {match.rounds && (
                    <Group justify="space-between">
                      <Text size="sm" c="dimmed">Rounds:</Text>
                      <Text size="sm">{match.rounds}</Text>
                    </Group>
                  )}
                  
                  {match.maps && match.maps.length > 0 && (
                    <Group justify="space-between">
                      <Text size="sm" c="dimmed">Maps:</Text>
                      <Text size="sm">{match.maps.map(mapId => mapNames[mapId] || formatMapName(mapId)).join(', ')}</Text>
                    </Group>
                  )}
                  
                  <Group justify="space-between">
                    <Text size="sm" c="dimmed">Max Participants:</Text>
                    <Text size="sm">{match.max_participants}</Text>
                  </Group>
                  <Group justify="space-between">
                    <Text size="sm" c="dimmed">Created:</Text>
                    <Text size="sm">{new Date(match.created_at).toLocaleDateString('en-US')}</Text>
                  </Group>
                </Stack>
                
                <Group mt="md" gap="xs">
                  <Button size="sm" variant="light" style={{ flex: 1 }}>
                    View Details
                  </Button>
                  {match.status === 'created' && (
                    <Button size="sm">
                      Start Registration
                    </Button>
                  )}
                </Group>
              </Card>
            </Grid.Col>
          ))}
        </Grid>
      )}

      <CreateMatchModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onMatchCreated={handleMatchCreated}
        games={games}
      />
    </div>
  );
}