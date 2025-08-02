'use client'

import { Card, Text, Stack, Grid, Badge, Group, Image, Center, Loader } from '@mantine/core';
import { useEffect, useState } from 'react';

interface Game {
  id: string;
  name: string;
  genre: string;
  developer: string;
  minPlayers: number;
  maxPlayers: number;
  iconUrl: string;
  coverUrl?: string;
  mapCount: number;
  modeCount: number;
}

export default function GamesPage() {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchGames() {
      try {
        const response = await fetch('/api/games');
        if (response.ok) {
          const gamesData = await response.json();
          setGames(gamesData);
        } else {
          console.error('Failed to fetch games');
        }
      } catch (error) {
        console.error('Error fetching games:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchGames();
  }, []);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto">
        <Center h={400}>
          <Loader size="lg" />
        </Center>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <Stack gap="xl">
        <div>
          <Text size="xl" fw={700}>Games</Text>
          <Text c="dimmed" mt="xs">Available games for tournament management</Text>
        </div>

        <Grid>
          {games.map((game) => (
            <Grid.Col key={game.id} span={{ base: 12, md: 6 }}>
              <Card shadow="sm" padding={{ base: "sm", md: "lg" }} radius="md" withBorder>
                <Group wrap="nowrap">
                  <div style={{ width: '50%', height: '50%', flexShrink: 0 }}>
                    {game.coverUrl && (
                      <Image
                        src={game.coverUrl}
                        alt={`${game.name} cover`}
                        radius="md"
                        fallbackSrc="/assets/placeholder-cover.png"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    )}
                  </div>
                  <div style={{ flex: 1 }}>
                    <Text size="lg" fw={500}>
                      {game.name}
                    </Text>
                    <Badge variant="light" size="sm" mt="xs">
                      {game.genre}
                    </Badge>
                    <Text size="sm" c="dimmed" mt="xs">
                      {game.developer}
                    </Text>
                    <Group mt={{ base: "xs", md: "md" }} gap="xl">
                      <div>
                        <Text ta="center" fz="lg" fw={700}>
                          {game.mapCount}
                        </Text>
                        <Text ta="center" fz="xs" c="dimmed">
                          Maps
                        </Text>
                      </div>
                      <div>
                        <Text ta="center" fz="lg" fw={700}>
                          {game.modeCount}
                        </Text>
                        <Text ta="center" fz="xs" c="dimmed">
                          Modes
                        </Text>
                      </div>
                    </Group>
                    <Text size="xs" c="dimmed" mt={{ base: "xs", md: "sm" }}>
                      {game.minPlayers}-{game.maxPlayers} players
                    </Text>
                  </div>
                </Group>
              </Card>
            </Grid.Col>
          ))}
        </Grid>

        {games.length === 0 && !loading && (
          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Text ta="center" c="dimmed">
              No games found. Check your database configuration.
            </Text>
          </Card>
        )}
      </Stack>
    </div>
  );
}