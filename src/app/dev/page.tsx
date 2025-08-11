'use client'

import { Card, Text, Badge, Grid, Stack, Group, Button, Alert } from '@mantine/core';
import { useState } from 'react';

export default function DevPage() {
  const [voiceTestLoading, setVoiceTestLoading] = useState(false);
  const [voiceTestMessage, setVoiceTestMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleTestVoiceLines = async () => {
    setVoiceTestLoading(true);
    setVoiceTestMessage(null);

    try {
      const response = await fetch('/api/debug/test-voice', {
        method: 'POST',
      });

      if (response.ok) {
        const result = await response.json();
        setVoiceTestMessage({ type: 'success', text: result.message || 'Voice test completed successfully!' });
      } else {
        const error = await response.json();
        setVoiceTestMessage({ type: 'error', text: error.error || 'Failed to test voice lines' });
      }
    } catch (error) {
      console.error('Error testing voice lines:', error);
      setVoiceTestMessage({ type: 'error', text: 'Failed to test voice lines' });
    } finally {
      setVoiceTestLoading(false);
    }
  };

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

        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Text size="lg" fw={600} mb="md">Discord</Text>
          
          {voiceTestMessage && (
            <Alert color={voiceTestMessage.type === 'success' ? 'green' : 'red'} mb="md">
              {voiceTestMessage.text}
            </Alert>
          )}

          <Stack gap="md">
            <div>
              <Text size="sm" c="dimmed" mb="xs">Voice Line Testing</Text>
              <Text size="xs" c="dimmed" mb="md">
                Tests voice announcements by connecting to user 123546381628604420&apos;s voice channel and playing a random line from the selected voice.
              </Text>
              <Button 
                onClick={handleTestVoiceLines}
                loading={voiceTestLoading}
                disabled={voiceTestLoading}
              >
                Test Voice Lines
              </Button>
            </div>
          </Stack>
        </Card>
      </Stack>
    </div>
  );
}