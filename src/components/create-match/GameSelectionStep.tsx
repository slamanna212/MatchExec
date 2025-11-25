'use client'

import { Text, Stack, Grid, Card, Avatar, Group, Badge } from '@mantine/core';
import type { GameWithIcon } from './useMatchForm';

interface GameSelectionStepProps {
  games: GameWithIcon[];
  onGameSelect: (gameId: string) => void;
}

export function GameSelectionStep({ games, onGameSelect }: GameSelectionStepProps) {
  return (
    <Stack>
      <Text mb="md">Select the game for your match:</Text>
      <Grid>
        {games.map((game) => (
          <Grid.Col key={game.id} span={{ base: 12, sm: 6 }}>
            <Card
              shadow="sm"
              padding="md"
              radius="md"
              withBorder
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => onGameSelect(game.id)}
            >
              <Group>
                <Avatar
                  src={game.iconUrl}
                  alt={game.name}
                  size="lg"
                />
                <Stack gap={4} style={{ flex: 1 }}>
                  <Text fw={600}>{game.name}</Text>
                  <Text size="sm" c="dimmed">{game.genre}</Text>
                  <Badge size="xs" variant="light">
                    {game.minPlayers}-{game.maxPlayers} players
                  </Badge>
                </Stack>
              </Group>
            </Card>
          </Grid.Col>
        ))}
      </Grid>
    </Stack>
  );
}
