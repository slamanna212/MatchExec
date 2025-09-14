'use client'

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Card, 
  Text, 
  Button, 
  Avatar,
  Divider,
  Loader,
  Group,
  Stack,
  Grid,
  TextInput,
  useMantineColorScheme,
  Badge
} from '@mantine/core';
import { Tournament } from '@/shared/types';

interface TournamentWithGame extends Tournament {
  game_name?: string;
  game_icon?: string;
  game_color?: string;
  participant_count?: number;
}

export function TournamentHistoryDashboard() {
  const router = useRouter();
  const { colorScheme } = useMantineColorScheme();
  const [tournaments, setTournaments] = useState<TournamentWithGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchCompletedTournaments = useCallback(async () => {
    try {
      const response = await fetch('/api/tournaments?status=complete');
      if (response.ok) {
        const data = await response.json();
        setTournaments(data);
      }
    } catch (error) {
      console.error('Error fetching completed tournaments:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCompletedTournaments();
  }, [fetchCompletedTournaments]);

  // Filter tournaments based on search query
  const filteredTournaments = useMemo(() => {
    if (!searchQuery.trim()) return tournaments;
    
    const query = searchQuery.toLowerCase();
    return tournaments.filter(tournament => 
      tournament.name.toLowerCase().includes(query) ||
      tournament.game_name?.toLowerCase().includes(query) ||
      tournament.description?.toLowerCase().includes(query)
    );
  }, [tournaments, searchQuery]);

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Loader size="lg" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="flex justify-between items-center mb-6">
        <Text size="xl" fw={600}>Tournament History</Text>
        <Group gap="sm">
          {tournaments.length > 0 && (
            <TextInput
              placeholder="Search tournaments..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.currentTarget.value)}
              style={{ width: 'clamp(150px, 50vw, 300px)' }}
            />
          )}
          <Button variant="outline" onClick={() => router.push('/tournaments')}>
            Back to Tournaments
          </Button>
        </Group>
      </div>

      {tournaments.length === 0 ? (
        <div className="text-center py-12">
          <Text size="lg" c="dimmed" mb="md">No completed tournaments yet</Text>
          <Button onClick={() => router.push('/tournaments')}>
            View Active Tournaments
          </Button>
        </div>
      ) : filteredTournaments.length === 0 ? (
        <div className="text-center py-12">
          <Text size="lg" c="dimmed">No tournaments match your search</Text>
        </div>
      ) : (
        <Grid>
          {filteredTournaments.map((tournament) => (
            <Grid.Col key={tournament.id} span={{ base: 12, md: 6, lg: 4 }}>
              <Card 
                shadow={colorScheme === 'light' ? 'lg' : 'sm'}
                padding="lg" 
                radius="md" 
                withBorder
                bg={colorScheme === 'light' ? 'white' : undefined}
                style={{ 
                  transition: 'all 0.2s ease',
                  borderColor: colorScheme === 'light' ? 'var(--mantine-color-gray-3)' : undefined
                }}
              >
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
                  <Badge color="green" variant="light">Complete</Badge>
                </Group>
                
                <Divider mb="md" />
                
                <Stack gap="xs">
                  {tournament.description && (
                    <Text size="sm" c="dimmed" mb="xs">{tournament.description}</Text>
                  )}
                  
                  <Group justify="space-between">
                    <Text size="sm" c="dimmed">Format:</Text>
                    <Badge size="sm" variant="light">
                      {tournament.format === 'single-elimination' ? 'Single Elim' : 'Double Elim'}
                    </Badge>
                  </Group>
                  
                  <Group justify="space-between">
                    <Text size="sm" c="dimmed">Participants:</Text>
                    <Text size="sm">{tournament.participant_count || 0}</Text>
                  </Group>

                  {tournament.start_time && (
                    <Group justify="space-between">
                      <Text size="sm" c="dimmed">Started:</Text>
                      <Text size="sm">{new Date(tournament.start_time).toLocaleDateString()}</Text>
                    </Group>
                  )}
                </Stack>
              </Card>
            </Grid.Col>
          ))}
        </Grid>
      )}
    </div>
  );
}