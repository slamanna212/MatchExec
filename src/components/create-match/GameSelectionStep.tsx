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
              style={{
                cursor: 'pointer',
                transition: 'all 0.25s ease',
                borderColor: `${game.color ?? '#888888'}22`,
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.transform = 'translateY(-3px)';
                e.currentTarget.style.boxShadow = `0 8px 28px ${game.color ?? '#888888'}44`;
                e.currentTarget.style.borderColor = `${game.color ?? '#888888'}55`;
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '';
                e.currentTarget.style.borderColor = `${game.color ?? '#888888'}22`;
              }}
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
