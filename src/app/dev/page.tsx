'use client'

import { Card, Text, Badge, Grid, Stack, Group, List } from '@mantine/core';

export default function DevPage() {
  return (
    <div className="max-w-4xl mx-auto">
      <Stack gap="xl">
        <div>
          <Text size="xl" fw={700}>Developer Tools</Text>
          <Text c="dimmed" mt="xs">Development utilities and system information</Text>
        </div>

        <Stack gap="lg">
          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Group justify="space-between" mb="md">
              <Text size="lg" fw={600}>System Status</Text>
              <Badge color="green">Online</Badge>
            </Group>
            <Grid>
              <Grid.Col span={6}>
                <Text size="sm" c="dimmed">Database</Text>
                <Text fw={600}>SQLite Connected</Text>
              </Grid.Col>
              <Grid.Col span={6}>
                <Text size="sm" c="dimmed">Discord Bot</Text>
                <Text fw={600}>Not Connected</Text>
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

          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Text size="lg" fw={600} mb="md">Database Tools</Text>
            <Text c="dimmed" mb="md">
              Tools for database management and debugging.
            </Text>
            <List>
              <List.Item>View database schema</List.Item>
              <List.Item>Run SQL queries</List.Item>
              <List.Item>Manage data seeding</List.Item>
              <List.Item>Clear tournament data</List.Item>
            </List>
          </Card>

          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Text size="lg" fw={600} mb="md">Process Management</Text>
            <Text c="dimmed" mb="md">
              Monitor and control PM2 processes.
            </Text>
            <List>
              <List.Item>View process status</List.Item>
              <List.Item>Restart individual processes</List.Item>
              <List.Item>View process logs</List.Item>
              <List.Item>Monitor resource usage</List.Item>
            </List>
          </Card>
        </Stack>
      </Stack>
    </div>
  );
}