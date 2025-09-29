'use client'

import { Card, Text, Stack, Group, Button, useMantineColorScheme } from '@mantine/core';
import { useRouter } from 'next/navigation';

export function HomePage() {
  const router = useRouter();
  const { colorScheme } = useMantineColorScheme();

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <Stack gap="xl">
        <div className="text-center">
          <Text size="2.5rem" fw={700} mb="md">
            Welcome to MatchExec
          </Text>
          <Text size="lg" c="dimmed" maw={600} mx="auto">
            Your comprehensive match management platform for organizing tournaments,
            tracking matches, and managing competitive gaming events.
          </Text>
        </div>

        <Group grow align="stretch">
          <Card
            shadow={colorScheme === 'light' ? 'lg' : 'sm'}
            padding="lg"
            radius="md"
            withBorder
            bg={colorScheme === 'light' ? 'white' : undefined}
            style={{
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              borderColor: colorScheme === 'light' ? 'var(--mantine-color-gray-3)' : undefined
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = colorScheme === 'light' ? '0 1px 3px rgba(0,0,0,0.12)' : '0 1px 3px rgba(0,0,0,0.24)';
            }}
            onClick={() => router.push('/matches')}
          >
            <Stack gap="md" h="100%">
              <Text size="xl" fw={600}>Matches</Text>
              <Text c="dimmed">
                Create and manage individual matches. Track signups, assign players,
                and monitor match progress in real-time.
              </Text>
              <Button mt="auto" size="sm">
                View Matches
              </Button>
            </Stack>
          </Card>

          <Card
            shadow={colorScheme === 'light' ? 'lg' : 'sm'}
            padding="lg"
            radius="md"
            withBorder
            bg={colorScheme === 'light' ? 'white' : undefined}
            style={{
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              borderColor: colorScheme === 'light' ? 'var(--mantine-color-gray-3)' : undefined
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = colorScheme === 'light' ? '0 1px 3px rgba(0,0,0,0.12)' : '0 1px 3px rgba(0,0,0,0.24)';
            }}
            onClick={() => router.push('/tournaments')}
          >
            <Stack gap="md" h="100%">
              <Text size="xl" fw={600}>Tournaments</Text>
              <Text c="dimmed">
                Organize full tournaments with bracket systems, multiple rounds,
                and comprehensive tournament management tools.
              </Text>
              <Button mt="auto" size="sm">
                View Tournaments
              </Button>
            </Stack>
          </Card>
        </Group>

        <Group grow align="stretch">
          <Card
            shadow={colorScheme === 'light' ? 'lg' : 'sm'}
            padding="lg"
            radius="md"
            withBorder
            bg={colorScheme === 'light' ? 'white' : undefined}
            style={{
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              borderColor: colorScheme === 'light' ? 'var(--mantine-color-gray-3)' : undefined
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = colorScheme === 'light' ? '0 1px 3px rgba(0,0,0,0.12)' : '0 1px 3px rgba(0,0,0,0.24)';
            }}
            onClick={() => router.push('/games')}
          >
            <Stack gap="md" h="100%">
              <Text size="xl" fw={600}>Games</Text>
              <Text c="dimmed">
                Configure supported games, maps, and game modes for your
                competitive events and tournaments.
              </Text>
              <Button mt="auto" size="sm">
                Manage Games
              </Button>
            </Stack>
          </Card>

          <Card
            shadow={colorScheme === 'light' ? 'lg' : 'sm'}
            padding="lg"
            radius="md"
            withBorder
            bg={colorScheme === 'light' ? 'white' : undefined}
            style={{
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              borderColor: colorScheme === 'light' ? 'var(--mantine-color-gray-3)' : undefined
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = colorScheme === 'light' ? '0 1px 3px rgba(0,0,0,0.12)' : '0 1px 3px rgba(0,0,0,0.24)';
            }}
            onClick={() => router.push('/settings')}
          >
            <Stack gap="md" h="100%">
              <Text size="xl" fw={600}>Settings</Text>
              <Text c="dimmed">
                Configure Discord integration, announcements, scheduling,
                and customize your MatchExec experience.
              </Text>
              <Button mt="auto" size="sm">
                Open Settings
              </Button>
            </Stack>
          </Card>
        </Group>
      </Stack>
    </div>
  );
}