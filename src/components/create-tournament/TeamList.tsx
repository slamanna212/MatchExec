'use client'

import { Stack, Card, Group, Badge, Text, ActionIcon } from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';

interface TeamListProps {
  teams: string[];
  onRemoveTeam: (teamName: string) => void;
}

export function TeamList({ teams, onRemoveTeam }: TeamListProps) {
  if (teams.length === 0) {
    return (
      <Text size="sm" c="dimmed" ta="center" py="md">
        No teams created yet. Add teams using the form above.
      </Text>
    );
  }

  return (
    <Stack gap="xs">
      {teams.map((teamName, index) => (
        <Card key={index} withBorder padding="sm">
          <Group justify="space-between" align="center">
            <Group align="center">
              <Badge variant="light">{index + 1}</Badge>
              <Text size="sm" fw={500}>{teamName}</Text>
            </Group>
            <ActionIcon
              variant="light"
              color="red"
              size="sm"
              onClick={() => onRemoveTeam(teamName)}
            >
              <IconTrash size="1rem" />
            </ActionIcon>
          </Group>
        </Card>
      ))}
    </Stack>
  );
}
