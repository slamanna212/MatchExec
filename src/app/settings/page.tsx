'use client'

import { Card, Text, Stack } from '@mantine/core';

export default function SettingsPage() {
  return (
    <div className="max-w-4xl mx-auto">
      <Stack gap="xl">
        <div>
          <Text size="xl" fw={700}>Settings</Text>
          <Text c="dimmed" mt="xs">Configure application and tournament settings</Text>
        </div>

        <Stack gap="lg">
          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Text size="lg" fw={600} mb="md">Discord Configuration</Text>
            <Text c="dimmed">
              Configure Discord bot settings and permissions.
            </Text>
          </Card>

          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Text size="lg" fw={600} mb="md">Tournament Defaults</Text>
            <Text c="dimmed">
              Set default values for tournament creation and management.
            </Text>
          </Card>

          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Text size="lg" fw={600} mb="md">Notification Settings</Text>
            <Text c="dimmed">
              Configure how and when notifications are sent to participants.
            </Text>
          </Card>
        </Stack>
      </Stack>
    </div>
  );
}