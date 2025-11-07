'use client'


import { Card, Text, Stack, Group, Button, Grid, Badge, ActionIcon, Modal, Checkbox, Loader, Center, Title, useMantineColorScheme } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import { useEffect, useState } from 'react';
import { IconPlus, IconSettings, IconTrash, IconMessage, IconRefresh, IconCircle } from '@tabler/icons-react';
import type { DiscordChannel } from '../api/channels/route';
import { logger } from '@/lib/logger/client';
import { showSuccess, showError } from '@/lib/notifications';

interface ChannelEditData {
  send_announcements: boolean;
  send_reminders: boolean;
  send_match_start: boolean;
  send_signup_updates: boolean;
}

export default function ChannelsPage() {
  const { colorScheme } = useMantineColorScheme();
  const [channels, setChannels] = useState<DiscordChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [editModalOpened, { open: openEditModal, close: closeEditModal }] = useDisclosure(false);
  const [selectedChannel, setSelectedChannel] = useState<DiscordChannel | null>(null);
  const [editData, setEditData] = useState<ChannelEditData>({
    send_announcements: false,
    send_reminders: false,
    send_match_start: false,
    send_signup_updates: false
  });

  useEffect(() => {
    fetchChannels();
  }, []);

  const fetchChannels = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/channels');
      if (response.ok) {
        const data = await response.json();
        setChannels(data);
      } else {
        showError('Failed to fetch channels');
      }
    } catch (error) {
      logger.error('Error fetching channels:', error);
      showError('An error occurred while fetching channels');
    } finally {
      setLoading(false);
    }
  };

  const refreshChannelNames = async () => {
    try {
      setRefreshing(true);
      const response = await fetch('/api/channels/refresh-names', {
        method: 'POST'
      });
      
      if (response.ok) {
        const result = await response.json();
        showSuccess(`Refreshed ${result.updated_count} of ${result.total_channels} channels`);
        await fetchChannels(); // Refresh the list
      } else {
        showError('Failed to refresh channel names');
      }
    } catch (error) {
      logger.error('Error refreshing channel names:', error);
      showError('An error occurred while refreshing channel names');
    } finally {
      setRefreshing(false);
    }
  };

  const handleEditChannel = (channel: DiscordChannel) => {
    setSelectedChannel(channel);
    setEditData({
      send_announcements: channel.send_announcements || false,
      send_reminders: channel.send_reminders || false,
      send_match_start: channel.send_match_start || false,
      send_signup_updates: channel.send_signup_updates || false
    });
    openEditModal();
  };

  const handleSaveNotifications = async () => {
    if (!selectedChannel) return;

    try {
      const response = await fetch(`/api/channels/${selectedChannel.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editData),
      });

      if (response.ok) {
        showSuccess('Notification settings updated successfully!');
        closeEditModal();
        await fetchChannels();
      } else {
        showError('Failed to update notification settings');
      }
    } catch (error) {
      logger.error('Error updating notifications:', error);
      showError('An error occurred while updating settings');
    }
  };

  const handleDeleteChannel = async (channelId: string, channelName?: string) => {
    modals.openConfirmModal({
      title: 'Delete Channel',
      children: (
        <Text size="sm">
          Are you sure you want to delete {channelName || 'this channel'}? This action cannot be undone.
        </Text>
      ),
      labels: { confirm: 'Delete', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        try {
          const response = await fetch(`/api/channels/${channelId}`, {
            method: 'DELETE'
          });

          if (response.ok) {
            showSuccess('Channel deleted successfully!');
            await fetchChannels();
          } else {
            showError('Failed to delete channel');
          }
        } catch (error) {
          logger.error('Error deleting channel:', error);
          showError('An error occurred while deleting the channel');
        }
      },
    });
  };

  const textChannels = channels.filter(ch => ch.channel_type === 'text');
  const _voiceChannels = channels.filter(ch => ch.channel_type === 'voice');

  // Calculate notification status
  const notificationStatus = {
    announcements: textChannels.some(ch => ch.send_announcements),
    reminders: textChannels.some(ch => ch.send_reminders),
    live_updates: textChannels.some(ch => ch.send_match_start),
    signup_updates: textChannels.some(ch => ch.send_signup_updates)
  };

  if (loading) {
    return (
      <Center h={400}>
        <Loader size="lg" />
      </Center>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <Stack gap="xl">
        <div>
          <Group justify="flex-end" align="center">
            <Group>
              <Button
                variant="outline"
                leftSection={<IconRefresh size="1rem" />}
                onClick={refreshChannelNames}
                loading={refreshing}
              >
                Refresh Names
              </Button>
              <Button
                leftSection={<IconPlus size="1rem" />}
                component="a"
                href="/channels/create"
              >
                Add Channel
              </Button>
            </Group>
          </Group>
        </div>

        {/* Notification Status Indicators */}
        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Text size="md" fw={600} mb="xs">Notification Status</Text>
          <Text size="sm" c="dimmed" mb="md">Green indicates at least one channel is configured for this notification type</Text>
          <Grid>
            <Grid.Col span={{ base: 6, sm: 6, md: 3 }}>
              <Group gap="xs" align="center">
                <IconCircle 
                  size="0.8rem" 
                  style={{ color: notificationStatus.announcements ? '#51cf66' : '#ff6b6b' }}
                  fill="currentColor"
                />
                <Text size="sm">Announcements</Text>
              </Group>
            </Grid.Col>
            <Grid.Col span={{ base: 6, sm: 6, md: 3 }}>
              <Group gap="xs" align="center">
                <IconCircle 
                  size="0.8rem" 
                  style={{ color: notificationStatus.reminders ? '#51cf66' : '#ff6b6b' }}
                  fill="currentColor"
                />
                <Text size="sm">Reminders</Text>
              </Group>
            </Grid.Col>
            <Grid.Col span={{ base: 6, sm: 6, md: 3 }}>
              <Group gap="xs" align="center">
                <IconCircle 
                  size="0.8rem" 
                  style={{ color: notificationStatus.live_updates ? '#51cf66' : '#ff6b6b' }}
                  fill="currentColor"
                />
                <Text size="sm">Live Updates</Text>
              </Group>
            </Grid.Col>
            <Grid.Col span={{ base: 6, sm: 6, md: 3 }}>
              <Group gap="xs" align="center">
                <IconCircle 
                  size="0.8rem" 
                  style={{ color: notificationStatus.signup_updates ? '#51cf66' : '#ff6b6b' }}
                  fill="currentColor"
                />
                <Text size="sm">Signup Updates</Text>
              </Group>
            </Grid.Col>
          </Grid>
        </Card>

        {/* Channels Section */}
        <div>
          <Group mb="md" align="center">
            <IconMessage size="1.2rem" />
            <Title order={2} size="h3">Channels</Title>
            <Badge color="blue" variant="light">{textChannels.length}</Badge>
          </Group>

          {textChannels.length === 0 ? (
            <Card shadow="sm" padding="lg" radius="md" withBorder>
              <Text c="dimmed" ta="center" py="xl">No channels configured</Text>
            </Card>
          ) : (
            <Grid>
              {textChannels.map((channel) => (
                <Grid.Col key={channel.id} span={{ base: 12, md: 6, lg: 4 }}>
                  <Card
                    shadow={colorScheme === 'light' ? 'lg' : 'sm'}
                    padding="lg"
                    radius="md"
                    withBorder
                    bg={colorScheme === 'light' ? 'white' : undefined}
                    style={{
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      borderColor: colorScheme === 'light' ? 'var(--mantine-color-gray-3)' : undefined,
                      height: '100%'
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.boxShadow = colorScheme === 'light'
                        ? '0 8px 16px rgba(0,0,0,0.15)'
                        : '0 4px 12px rgba(0,0,0,0.3)';
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = '';
                    }}
                  >
                    <Stack gap="md" h="100%">
                      <div>
                        <Text fw={600} size="md" mb="xs">
                          {channel.channel_name || `Channel ${channel.discord_channel_id}`}
                        </Text>
                        <Text size="xs" c="dimmed">
                          ID: {channel.discord_channel_id}
                        </Text>
                      </div>

                      <Group gap="xs" wrap="wrap">
                        {channel.send_announcements && <Badge size="xs" color="green">Announcements</Badge>}
                        {channel.send_reminders && <Badge size="xs" color="blue">Reminders</Badge>}
                        {channel.send_match_start && <Badge size="xs" color="orange">Live Updates</Badge>}
                        {channel.send_signup_updates && <Badge size="xs" color="purple">Signup Updates</Badge>}
                        {!channel.send_announcements && !channel.send_reminders && !channel.send_match_start && !channel.send_signup_updates && (
                          <Badge size="xs" color="gray" variant="light">No notifications</Badge>
                        )}
                      </Group>

                      <Group gap="xs" mt="auto" justify="flex-end">
                        <ActionIcon
                          variant="outline"
                          size="lg"
                          onClick={() => handleEditChannel(channel)}
                        >
                          <IconSettings size="1rem" />
                        </ActionIcon>
                        <ActionIcon
                          variant="outline"
                          color="red"
                          size="lg"
                          onClick={() => handleDeleteChannel(channel.id, channel.channel_name)}
                        >
                          <IconTrash size="1rem" />
                        </ActionIcon>
                      </Group>
                    </Stack>
                  </Card>
                </Grid.Col>
              ))}
            </Grid>
          )}
        </div>

        {/* Edit Notifications Modal */}
        <Modal
          opened={editModalOpened}
          onClose={closeEditModal}
          title="Channel Notification Settings"
          size="md"
        >
          <Stack gap="md">
            <Text size="sm" c="dimmed">
              Configure which notifications to send to {selectedChannel?.channel_name || 'this channel'}
            </Text>

            <Stack gap="sm">
              <Checkbox
                label="Match Announcements"
                description="Send new match announcements to this channel"
                checked={editData.send_announcements}
                onChange={(e) => setEditData(prev => ({ ...prev, send_announcements: e.target.checked }))}
              />
              
              <Checkbox
                label="Match Reminders"
                description="Send match start reminders to this channel"
                checked={editData.send_reminders}
                onChange={(e) => setEditData(prev => ({ ...prev, send_reminders: e.target.checked }))}
              />

              <Checkbox
                label="Live Updates"
                description="Send live updates about matches starting and their scores"
                checked={editData.send_match_start}
                onChange={(e) => setEditData(prev => ({ ...prev, send_match_start: e.target.checked }))}
              />

              <Checkbox
                label="Signup Updates"
                description="Send updates when players sign up or leave"
                checked={editData.send_signup_updates}
                onChange={(e) => setEditData(prev => ({ ...prev, send_signup_updates: e.target.checked }))}
              />
            </Stack>

            <Group justify="flex-end" mt="md">
              <Button variant="outline" onClick={closeEditModal}>
                Cancel
              </Button>
              <Button onClick={handleSaveNotifications}>
                Save Settings
              </Button>
            </Group>
          </Stack>
        </Modal>
      </Stack>
    </div>
  );
}
