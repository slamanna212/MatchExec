'use client'

import { Card, Text, Badge, Grid, Stack, Group, Button, Alert, Avatar, Select } from '@mantine/core';
import { useState, useEffect } from 'react';
import { notificationHelper, showSuccess, showError, showWarning, showInfo } from '@/lib/notifications';
import { redirect } from 'next/navigation';
import { logger } from '@/lib/logger/client';

export default function DevPage() {
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') {
      redirect('/');
    }
  }, []);
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
      logger.error('Error testing voice lines:', error);
      setVoiceTestMessage({ type: 'error', text: 'Failed to test voice lines' });
    } finally {
      setVoiceTestLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <Stack gap="xl">

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

        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Text size="lg" fw={600} mb="md">Player Card Color Testing</Text>
          <Text size="sm" c="dimmed" mb="lg">
            Test all available color combinations for tournament player cards to ensure readability
          </Text>

          <Grid>
            {/* Reserve Color */}
            <Grid.Col span={{ base: 12, sm: 6, md: 4 }}>
              <Card
                shadow="md"
                padding="md"
                radius="md"
                withBorder
                style={{
                  backgroundColor: '#FFD54F',
                  borderColor: '#FFC107'
                }}
              >
                <Group justify="space-between" align="center" mb="xs">
                  <Group align="center">
                    <Avatar size="sm" color="violet" variant="filled">
                      1
                    </Avatar>
                    <div>
                      <Text fw={500} size="sm" c="dark">TestPlayer</Text>
                      <Text size="xs" c="gray.7">
                        Joined: {new Date().toLocaleDateString('en-US')}
                      </Text>
                    </div>
                  </Group>
                </Group>

                <Select
                  size="xs"
                  value="reserve"
                  data={[{ value: 'reserve', label: 'Reserve' }]}
                  w={120}
                  mb="xs"
                  styles={{
                    input: {
                      backgroundColor: 'light-dark(rgba(255,255,255,0.8), rgba(37, 38, 43, 0.8))',
                      border: '1px solid var(--mantine-color-gray-5)',
                      backdropFilter: 'blur(2px)',
                      color: 'light-dark(var(--mantine-color-black), var(--mantine-color-white))'
                    }
                  }}
                />

                <Group mt="xs" gap="xs">
                  <Badge size="xs" variant="filled" color="violet">
                    Role: Tank
                  </Badge>
                  <Badge size="xs" variant="filled" color="violet">
                    Rank: Diamond
                  </Badge>
                </Group>
                <Text size="xs" fw={500} mt="xs" c="dark">Reserve (Yellow)</Text>
              </Card>
            </Grid.Col>

            {/* Team Colors */}
            {[
              { name: 'Team 1 (Blue)', bg: 'var(--mantine-color-blue-2)', border: 'var(--mantine-color-blue-4)', badge: 'orange' },
              { name: 'Team 2 (Red)', bg: 'var(--mantine-color-red-2)', border: 'var(--mantine-color-red-4)', badge: 'cyan' },
              { name: 'Team 3 (Green)', bg: 'var(--mantine-color-green-2)', border: 'var(--mantine-color-green-4)', badge: 'yellow' },
              { name: 'Team 4 (Purple)', bg: 'var(--mantine-color-purple-2)', border: 'var(--mantine-color-purple-4)', badge: 'grape' },
              { name: 'Team 5 (Orange)', bg: 'var(--mantine-color-orange-2)', border: 'var(--mantine-color-orange-4)', badge: 'lime' },
              { name: 'Team 6 (Teal)', bg: 'var(--mantine-color-teal-2)', border: 'var(--mantine-color-teal-4)', badge: 'indigo' }
            ].map((team, index) => (
              <Grid.Col key={team.name} span={{ base: 12, sm: 6, md: 4 }}>
                <Card
                  shadow="md"
                  padding="md"
                  radius="md"
                  withBorder
                  style={{
                    backgroundColor: team.bg,
                    borderColor: team.border
                  }}
                >
                  <Group justify="space-between" align="center" mb="xs">
                    <Group align="center">
                      <Avatar size="sm" color={team.badge} variant="filled">
                        {index + 2}
                      </Avatar>
                      <div>
                        <Text fw={500} size="sm" c="dark">TestPlayer</Text>
                        <Text size="xs" c="gray.7">
                          Joined: {new Date().toLocaleDateString('en-US')}
                        </Text>
                      </div>
                    </Group>
                  </Group>

                  <Select
                    size="xs"
                    value={`team${index + 1}`}
                    data={[{ value: `team${index + 1}`, label: team.name.split(' (')[0] }]}
                    w={120}
                    mb="xs"
                    styles={{
                      input: {
                        backgroundColor: 'light-dark(rgba(255,255,255,0.8), rgba(37, 38, 43, 0.8))',
                        border: '1px solid var(--mantine-color-gray-5)',
                        backdropFilter: 'blur(2px)',
                        color: 'light-dark(var(--mantine-color-black), var(--mantine-color-white))'
                      }
                    }}
                  />

                  <Group mt="xs" gap="xs">
                    <Badge size="xs" variant="filled" color={team.badge}>
                      Role: Tank
                    </Badge>
                    <Badge size="xs" variant="filled" color={team.badge}>
                      Rank: Diamond
                    </Badge>
                  </Group>
                  <Text size="xs" fw={500} mt="xs" c="dark">{team.name}</Text>
                </Card>
              </Grid.Col>
            ))}
          </Grid>
        </Card>

        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Text size="lg" fw={600} mb="md">Notification Testing</Text>
          <Text size="sm" c="dimmed" mb="lg">
            Test toast notifications with different types, themes, and behaviors
          </Text>

          <Grid>
            <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
              <Stack gap="xs">
                <Text size="sm" fw={500}>Basic Types</Text>
                <Button
                  size="sm"
                  color="green"
                  onClick={() => showSuccess('Operation completed successfully!')}
                >
                  Success Toast
                </Button>
                <Button
                  size="sm"
                  color="red"
                  onClick={() => showError('Something went wrong!')}
                >
                  Error Toast
                </Button>
                <Button
                  size="sm"
                  color="orange"
                  onClick={() => showWarning('Please review this action')}
                >
                  Warning Toast
                </Button>
                <Button
                  size="sm"
                  color="blue"
                  onClick={() => showInfo('Here is some helpful information')}
                >
                  Info Toast
                </Button>
              </Stack>
            </Grid.Col>

            <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
              <Stack gap="xs">
                <Text size="sm" fw={500}>Custom Titles</Text>
                <Button
                  size="sm"
                  color="green"
                  onClick={() => notificationHelper.success({
                    title: 'Tournament Created',
                    message: 'Your tournament has been successfully created and is ready for signups!'
                  })}
                >
                  Tournament Success
                </Button>
                <Button
                  size="sm"
                  color="red"
                  onClick={() => notificationHelper.error({
                    title: 'Save Failed',
                    message: 'Unable to save settings. Please check your connection and try again.'
                  })}
                >
                  Settings Error
                </Button>
                <Button
                  size="sm"
                  color="orange"
                  onClick={() => notificationHelper.warning({
                    title: 'Match Starting Soon',
                    message: 'Your match will begin in 5 minutes. Please join the voice channel.'
                  })}
                >
                  Match Warning
                </Button>
                <Button
                  size="sm"
                  color="blue"
                  onClick={() => notificationHelper.info({
                    title: 'New Feature',
                    message: 'Voice announcements are now available in tournament settings!'
                  })}
                >
                  Feature Info
                </Button>
              </Stack>
            </Grid.Col>

            <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
              <Stack gap="xs">
                <Text size="sm" fw={500}>Persistent & Loading</Text>
                <Button
                  size="sm"
                  color="violet"
                  onClick={() => notificationHelper.success({
                    message: 'This notification stays until dismissed',
                    autoClose: false
                  })}
                >
                  Persistent Toast
                </Button>
                <Button
                  size="sm"
                  color="gray"
                  onClick={() => {
                    notificationHelper.loading({
                      id: 'loading-test',
                      message: 'Processing tournament bracket...'
                    });
                    setTimeout(() => {
                      notificationHelper.update('loading-test', {
                        type: 'success',
                        message: 'Tournament bracket generated successfully!'
                      });
                    }, 3000);
                  }}
                >
                  Loading → Success
                </Button>
                <Button
                  size="sm"
                  color="gray"
                  onClick={() => {
                    notificationHelper.loading({
                      id: 'loading-error-test',
                      message: 'Saving settings...'
                    });
                    setTimeout(() => {
                      notificationHelper.update('loading-error-test', {
                        type: 'error',
                        message: 'Failed to save settings. Please try again.'
                      });
                    }, 2500);
                  }}
                >
                  Loading → Error
                </Button>
                <Button
                  size="sm"
                  color="red"
                  variant="outline"
                  onClick={() => notificationHelper.clean()}
                >
                  Clear All
                </Button>
              </Stack>
            </Grid.Col>

            <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
              <Stack gap="xs">
                <Text size="sm" fw={500}>Real-world Examples</Text>
                <Button
                  size="sm"
                  color="green"
                  onClick={() => notificationHelper.success({
                    title: 'Round Advanced',
                    message: 'Tournament has progressed to the next round. New matches are ready!'
                  })}
                >
                  Round Progress
                </Button>
                <Button
                  size="sm"
                  color="blue"
                  onClick={() => notificationHelper.info({
                    title: 'Player Joined',
                    message: 'TestPlayer has joined the tournament. 7/8 slots filled.'
                  })}
                >
                  Player Update
                </Button>
                <Button
                  size="sm"
                  color="orange"
                  onClick={() => notificationHelper.warning({
                    title: 'Discord Bot Offline',
                    message: 'The Discord bot is currently offline. Some features may be unavailable.'
                  })}
                >
                  System Warning
                </Button>
                <Button
                  size="sm"
                  color="violet"
                  onClick={() => notificationHelper.success({
                    title: 'Voice Test Complete',
                    message: 'Voice announcements are working correctly!'
                  })}
                >
                  Voice Success
                </Button>
              </Stack>
            </Grid.Col>
          </Grid>
        </Card>
      </Stack>
    </div>
  );
}