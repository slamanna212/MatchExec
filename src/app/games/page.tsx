'use client'

import { Card, Text, Stack, List } from '@mantine/core';

export default function GamesPage() {
  return (
    <div className="max-w-4xl mx-auto">
      <Stack gap="xl">
        <div>
          <Text size="xl" fw={700}>Games</Text>
          <Text c="dimmed" mt="xs">Manage available games and their configurations</Text>
        </div>

        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Text size="lg" fw={600} mb="md">Game Management</Text>
          <Text c="dimmed" mb="md">
            This page will contain game management features including:
          </Text>
          <List>
            <List.Item>View all available games</List.Item>
            <List.Item>Configure game modes and maps</List.Item>
            <List.Item>Add new games to the system</List.Item>
            <List.Item>Edit game settings and metadata</List.Item>
          </List>
        </Card>
      </Stack>
    </div>
  );
}