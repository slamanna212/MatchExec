'use client'


import { Card, Text, Stack, Group, Button, Grid, Badge, ActionIcon, Modal, Checkbox, Alert, Loader, Center, Indicator } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useEffect, useState } from 'react';
import { IconPlus, IconSettings, IconTrash, IconMicrophone, IconMessage, IconRefresh, IconCircle } from '@tabler/icons-react';
import { DiscordChannel } from '../api/channels/route';

interface ChannelEditData {
  send_announcements: boolean;
  send_reminders: boolean;
  send_match_start: boolean;
  send_signup_updates: boolean;
}

export default function ChannelsPage() {
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
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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
        setMessage({ type: 'error', text: 'Failed to fetch channels' });
      }
    } catch (error) {
      console.error('Error fetching channels:', error);
      setMessage({ type: 'error', text: 'An error occurred while fetching channels' });
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
        setMessage({ 
          type: 'success', 
          text: `Refreshed ${result.updated_count} of ${result.total_channels} channels` 
        });
        await fetchChannels(); // Refresh the list
      } else {
        setMessage({ type: 'error', text: 'Failed to refresh channel names' });
      }
    } catch (error) {
      console.error('Error refreshing channel names:', error);
      setMessage({ type: 'error', text: 'An error occurred while refreshing channel names' });
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
        setMessage({ type: 'success', text: 'Notification settings updated successfully!' });
        closeEditModal();
        await fetchChannels();
      } else {
        setMessage({ type: 'error', text: 'Failed to update notification settings' });
      }
    } catch (error) {
      console.error('Error updating notifications:', error);
      setMessage({ type: 'error', text: 'An error occurred while updating settings' });
    }
  };

  const handleDeleteChannel = async (channelId: string, channelName?: string) => {
    if (!confirm(`Are you sure you want to delete ${channelName || 'this channel'}?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/channels/${channelId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        setMessage({ type: 'success', text: 'Channel deleted successfully!' });
        await fetchChannels();
      } else {
        setMessage({ type: 'error', text: 'Failed to delete channel' });
      }
    } catch (error) {
      console.error('Error deleting channel:', error);
      setMessage({ type: 'error', text: 'An error occurred while deleting the channel' });
    }
  };

  const textChannels = channels.filter(ch => ch.channel_type === 'text');
  const voiceChannels = channels.filter(ch => ch.channel_type === 'voice');

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
          <Group justify="space-between" align="center">
            <div>
              <Text size="xl" fw={700}>Discord Channels</Text>
              <Text c="dimmed" mt="xs">Manage text and voice channels for notifications</Text>
            </div>
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
            <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
              <Group gap="xs" align="center">
                <IconCircle 
                  size="0.8rem" 
                  style={{ color: notificationStatus.announcements ? '#51cf66' : '#ff6b6b' }}
                  fill="currentColor"
                />
                <Text size="sm">Announcements</Text>
              </Group>
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
              <Group gap="xs" align="center">
                <IconCircle 
                  size="0.8rem" 
                  style={{ color: notificationStatus.reminders ? '#51cf66' : '#ff6b6b' }}
                  fill="currentColor"
                />
                <Text size="sm">Reminders</Text>
              </Group>
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
              <Group gap="xs" align="center">
                <IconCircle 
                  size="0.8rem" 
                  style={{ color: notificationStatus.live_updates ? '#51cf66' : '#ff6b6b' }}
                  fill="currentColor"
                />
                <Text size="sm">Live Updates</Text>
              </Group>
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
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

        {message && (
          <Alert color={message.type === 'success' ? 'green' : 'red'} onClose={() => setMessage(null)}>
            {message.text}
          </Alert>
        )}

        <Grid>
          <Grid.Col span={{ base: 12, md: 6 }}>
            <Card shadow="sm" padding="lg" radius="md" withBorder>
              <Group mb="md">
                <IconMessage size="1.2rem" />
                <Text size="lg" fw={600}>Text Channels</Text>
                <Badge color="blue" variant="light">{textChannels.length}</Badge>
              </Group>

              <Stack gap="sm">
                {textChannels.length === 0 ? (
                  <Text c="dimmed" ta="center" py="xl">No text channels configured</Text>
                ) : (
                  textChannels.map((channel) => (
                    <Card key={channel.id} p="sm" withBorder>
                      <Group justify="space-between">
                        <div>
                          <Text fw={500} size="sm">
                            {channel.channel_name || `Channel ${channel.discord_channel_id}`}
                          </Text>
                          <Text size="xs" c="dimmed">
                            ID: {channel.discord_channel_id}
                          </Text>
                          <Group gap="xs" mt="xs">
                            {channel.send_announcements && <Badge size="xs" color="green">Announcements</Badge>}
                            {channel.send_reminders && <Badge size="xs" color="blue">Reminders</Badge>}
                            {channel.send_match_start && <Badge size="xs" color="orange">Live Updates</Badge>}
                            {channel.send_signup_updates && <Badge size="xs" color="purple">Signup Updates</Badge>}
                          </Group>
                        </div>
                        <Group gap="xs">
                          <ActionIcon
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditChannel(channel)}
                          >
                            <IconSettings size="0.8rem" />
                          </ActionIcon>
                          <ActionIcon
                            variant="outline"
                            color="red"
                            size="sm"
                            onClick={() => handleDeleteChannel(channel.id, channel.channel_name)}
                          >
                            <IconTrash size="0.8rem" />
                          </ActionIcon>
                        </Group>
                      </Group>
                    </Card>
                  ))
                )}
              </Stack>
            </Card>
          </Grid.Col>

          <Grid.Col span={{ base: 12, md: 6 }}>
            <Card shadow="sm" padding="lg" radius="md" withBorder>
              <Group mb="md">
                <IconMicrophone size="1.2rem" />
                <Text size="lg" fw={600}>Voice Channels</Text>
                <Badge color="grape" variant="light">{voiceChannels.length}</Badge>
              </Group>

              <Stack gap="sm">
                {voiceChannels.length === 0 ? (
                  <Text c="dimmed" ta="center" py="xl">No voice channels configured</Text>
                ) : (
                  voiceChannels.map((channel) => (
                    <Card key={channel.id} p="sm" withBorder>
                      <Group justify="space-between">
                        <div>
                          <Text fw={500} size="sm">
                            {channel.channel_name || `Channel ${channel.discord_channel_id}`}
                          </Text>
                          <Text size="xs" c="dimmed">
                            ID: {channel.discord_channel_id}
                          </Text>
                        </div>
                        <ActionIcon
                          variant="outline"
                          color="red"
                          size="sm"
                          onClick={() => handleDeleteChannel(channel.id, channel.channel_name)}
                        >
                          <IconTrash size="0.8rem" />
                        </ActionIcon>
                      </Group>
                    </Card>
                  ))
                )}
              </Stack>
            </Card>
          </Grid.Col>
        </Grid>

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
