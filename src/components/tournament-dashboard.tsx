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
import { Tournament, Game } from '@/shared/types';
import { CreateTournamentModal } from './create-tournament-modal';

interface TournamentWithGame extends Tournament {
  game_name?: string;
  game_icon?: string;
}

export function TournamentDashboard() {
  const [tournaments, setTournaments] = useState<TournamentWithGame[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [createModalOpen, setCreateModalOpen] = useState(false);

  useEffect(() => {
    fetchTournaments();
    fetchGames();
  }, []);

  const fetchTournaments = async () => {
    try {
      const response = await fetch('/api/tournaments');
      if (response.ok) {
        const data = await response.json();
        setTournaments(data);
      }
    } catch (error) {
      console.error('Error fetching tournaments:', error);
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

  const handleTournamentCreated = (tournament: Tournament) => {
    setTournaments(prev => [tournament, ...prev]);
    setCreateModalOpen(false);
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
          <Text size="xl" fw={700}>Tournament Dashboard</Text>
          <Text c="dimmed" mt="xs">Manage and view all tournaments</Text>
        </div>
        <Button 
          size="lg"
          onClick={() => setCreateModalOpen(true)}
        >
          Create Tournament
        </Button>
      </Group>

      <Divider mb="xl" />

      {tournaments.length === 0 ? (
        <Card p="xl">
          <Stack align="center">
            <Text size="xl" fw={600}>No tournaments yet</Text>
            <Text c="dimmed" mb="md">
              Create your first tournament to get started
            </Text>
            <Button 
              onClick={() => setCreateModalOpen(true)}
            >
              Create Tournament
            </Button>
          </Stack>
        </Card>
      ) : (
        <Grid>
          {tournaments.map((tournament) => (
            <Grid.Col key={tournament.id} span={{ base: 12, md: 6, lg: 4 }}>
              <Card shadow="sm" padding="lg" radius="md" withBorder>
                <Group mb="md">
                  <Avatar
                    src={tournament.game_icon}
                    alt={tournament.game_name}
                    size="md"
                  />
                  <Stack gap="xs" style={{ flex: 1 }}>
                    <Text fw={600}>{tournament.name}</Text>
                    <Text size="sm" c="dimmed">{tournament.game_name}</Text>
                  </Stack>
                  <Badge 
                    color={getStatusColor(tournament.status)} 
                    size="sm"
                  >
                    {tournament.status}
                  </Badge>
                </Group>
                
                <Divider mb="md" />
                
                <Stack gap="xs">
                  {tournament.description && (
                    <Text size="sm" c="dimmed">{tournament.description}</Text>
                  )}
                  <Group justify="space-between">
                    <Text size="sm" c="dimmed">Max Participants:</Text>
                    <Text size="sm">{tournament.max_participants}</Text>
                  </Group>
                  <Group justify="space-between">
                    <Text size="sm" c="dimmed">Created:</Text>
                    <Text size="sm">{new Date(tournament.created_at).toLocaleDateString('en-US')}</Text>
                  </Group>
                </Stack>
                
                <Group mt="md" gap="xs">
                  <Button size="sm" variant="light" style={{ flex: 1 }}>
                    View Details
                  </Button>
                  {tournament.status === 'created' && (
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

      <CreateTournamentModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onTournamentCreated={handleTournamentCreated}
        games={games}
      />
    </div>
  );
}