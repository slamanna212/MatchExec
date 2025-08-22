'use client'


import { Card, Text, Stack, Grid, Badge, Group, Image, Center, Loader, Modal } from '@mantine/core';
import { useEffect, useState } from 'react';
import { useDisclosure } from '@mantine/hooks';

interface Game {
  id: string;
  name: string;
  genre: string;
  developer: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
  iconUrl: string;
  coverUrl?: string;
  mapCount: number;
  modeCount: number;
}

interface GameMap {
  id: string;
  name: string;
  modeId: string;
  imageUrl?: string;
  location?: string;
  modeName: string;
  modeDescription?: string;
}

interface GameMode {
  id: string;
  name: string;
  description?: string;
}

export default function GamesPage() {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Modal states
  const [mapsOpened, { open: openMaps, close: closeMaps }] = useDisclosure(false);
  const [modesOpened, { open: openModes, close: closeModes }] = useDisclosure(false);
  
  // Modal data
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [maps, setMaps] = useState<GameMap[]>([]);
  const [modes, setModes] = useState<GameMode[]>([]);
  const [modalLoading, setModalLoading] = useState(false);

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

  const handleShowMaps = async (game: Game) => {
    setSelectedGame(game);
    setModalLoading(true);
    openMaps();
    
    try {
      const response = await fetch(`/api/games/${game.id}/maps`);
      if (response.ok) {
        const mapsData = await response.json();
        setMaps(mapsData);
      } else {
        console.error('Failed to fetch maps');
      }
    } catch (error) {
      console.error('Error fetching maps:', error);
    } finally {
      setModalLoading(false);
    }
  };

  const handleShowModes = async (game: Game) => {
    setSelectedGame(game);
    setModalLoading(true);
    openModes();
    
    try {
      const response = await fetch(`/api/games/${game.id}/modes`);
      if (response.ok) {
        const modesData = await response.json();
        setModes(modesData);
      } else {
        console.error('Failed to fetch modes');
      }
    } catch (error) {
      console.error('Error fetching modes:', error);
    } finally {
      setModalLoading(false);
    }
  };

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
              <Card shadow="sm" padding="lg" radius="md" withBorder>
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
                    <Text size="sm" mt="xs">
                      {game.description}
                    </Text>
                    <Group mt={{ base: "xs", md: "md" }} gap="xl">
                      <div 
                        style={{ cursor: 'pointer' }} 
                        onClick={() => handleShowMaps(game)}
                        className="hover:opacity-70 transition-opacity"
                      >
                        <Text ta="center" fz="lg" fw={700} c="blue">
                          {game.mapCount}
                        </Text>
                        <Text ta="center" fz="xs" c="dimmed">
                          Maps
                        </Text>
                      </div>
                      <div 
                        style={{ cursor: 'pointer' }} 
                        onClick={() => handleShowModes(game)}
                        className="hover:opacity-70 transition-opacity"
                      >
                        <Text ta="center" fz="lg" fw={700} c="blue">
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

      {/* Maps Modal */}
      <Modal
        opened={mapsOpened}
        onClose={closeMaps}
        title={selectedGame ? `${selectedGame.name} - Maps` : 'Maps'}
        size="lg"
        centered
      >
        {modalLoading ? (
          <Center h={200}>
            <Loader size="md" />
          </Center>
        ) : (
          <Stack gap="md">
            {maps.map((map) => (
              <Card key={map.id} shadow="sm" padding="md" radius="md" withBorder>
                <Group wrap="nowrap">
                  {map.imageUrl && (
                    <Image
                      src={map.imageUrl}
                      alt={map.name}
                      w={80}
                      h={60}
                      radius="sm"
                      fallbackSrc="/assets/placeholder-map.png"
                      style={{ objectFit: 'cover' }}
                    />
                  )}
                  <div style={{ flex: 1 }}>
                    <Text fw={500}>{map.name}</Text>
                    <Badge variant="light" size="sm" mt="xs">
                      {map.modeName}
                    </Badge>
                    {map.location && (
                      <Text size="sm" c="dimmed" mt="xs">
                        {map.location}
                      </Text>
                    )}
                  </div>
                </Group>
              </Card>
            ))}
            {maps.length === 0 && !modalLoading && (
              <Text ta="center" c="dimmed">
                No maps found for this game.
              </Text>
            )}
          </Stack>
        )}
      </Modal>

      {/* Modes Modal */}
      <Modal
        opened={modesOpened}
        onClose={closeModes}
        title={selectedGame ? `${selectedGame.name} - Modes` : 'Modes'}
        size="md"
        centered
      >
        {modalLoading ? (
          <Center h={150}>
            <Loader size="md" />
          </Center>
        ) : (
          <Stack gap="md">
            {modes.map((mode) => (
              <Card key={mode.id} shadow="sm" padding="md" radius="md" withBorder>
                <Text fw={500} mb="xs">{mode.name}</Text>
                {mode.description && (
                  <Text size="sm" c="dimmed">
                    {mode.description}
                  </Text>
                )}
              </Card>
            ))}
            {modes.length === 0 && !modalLoading && (
              <Text ta="center" c="dimmed">
                No modes found for this game.
              </Text>
            )}
          </Stack>
        )}
      </Modal>
    </div>
  );
}