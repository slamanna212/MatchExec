'use client'

import { Card, Text, Badge, Grid, Stack, Group } from '@mantine/core';

export default function DevPage() {
  return (
    <div className="max-w-4xl mx-auto">
      <Stack gap="xl">
        <div>
          <Text size="xl" fw={700}>Developer Tools</Text>
          <Text c="dimmed" mt="xs">Development utilities and system information</Text>
        </div>

        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Group justify="space-between" mb="md">
            <Text size="lg" fw={600}>System Status</Text>
            <Badge color="green">Online</Badge>
          </Group>
          <Grid>
            <Grid.Col span={6}>
              <Text size="sm" c="dimmed">Web Server</Text>
              <Text fw={600}>Running</Text>
            </Grid.Col>
            <Grid.Col span={6}>
              <Text size="sm" c="dimmed">Discord Bot</Text>
              <Text fw={600}>Running</Text>
            </Grid.Col>
            <Grid.Col span={6}>
              <Text size="sm" c="dimmed">Scheduler</Text>
              <Text fw={600}>Running</Text>
            </Grid.Col>
            <Grid.Col span={6}>
              <Text size="sm" c="dimmed">Worker</Text>
              <Text fw={600}>Running</Text>
            </Grid.Col>
          </Grid>
        </Card>
      </Stack>
    </div>
  );
}