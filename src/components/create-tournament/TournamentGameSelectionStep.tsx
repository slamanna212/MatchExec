'use client'

import { Text, Stack, Grid, Card, Avatar, Group, Badge, Button } from '@mantine/core';
import type { GameWithIcon } from './useTournamentForm';

interface TournamentGameSelectionStepProps {
  games: GameWithIcon[];
  onGameSelect: (gameId: string) => void;
  onNext: () => void;
  canProceed: boolean;
}

export function TournamentGameSelectionStep({
  games,
  onGameSelect,
  onNext,
  canProceed
}: TournamentGameSelectionStepProps) {
  return (
    <Stack>
      <Text mb="md">Select the game for your tournament:</Text>
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
                transition: 'all 0.2s ease'
              }}
              onClick={() => {
                onGameSelect(game.id);
                onNext();
              }}
            >
              <Group align="center">
                <Avatar src={game.iconUrl} alt={game.name} size="lg" />
                <div className="flex-1">
                  <Text fw={500}>{game.name}</Text>
                  <Text size="sm" c="dimmed">{game.genre}</Text>
                  <Group gap="xs" mt="xs">
                    <Badge size="xs" variant="light">{game.mapCount} maps</Badge>
                    <Badge size="xs" variant="light">{game.modeCount} modes</Badge>
                  </Group>
                </div>
              </Group>
            </Card>
          </Grid.Col>
        ))}
      </Grid>

      <Group justify="end" mt="md">
        <Button onClick={onNext} disabled={!canProceed}>
          Next: Event Info
        </Button>
      </Group>
    </Stack>
  );
}
