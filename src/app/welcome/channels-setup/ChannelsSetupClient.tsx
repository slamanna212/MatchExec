'use client';

import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import {
  Title, Text, Button, Stack, Group, Card, Badge,
  ActionIcon, Modal, Checkbox, Alert, TextInput, Progress
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconPlus, IconSettings, IconTrash, IconMicrophone, IconMessage, IconArrowRight, IconCheck } from '@tabler/icons-react';
import { logger } from '@/lib/logger/client';

interface DiscordChannel {
  id: string;
  discord_channel_id: string;
  channel_name?: string;
  channel_type: 'text' | 'voice';
  send_announcements?: boolean;
  send_reminders?: boolean;
  send_match_start?: boolean;
  send_signup_updates?: boolean;
}

interface CreateChannelForm {
  discord_channel_id: string;
  send_announcements: boolean;
  send_reminders: boolean;
  send_match_start: boolean;
  send_signup_updates: boolean;
}

interface ChannelEditData {
  send_announcements: boolean;
  send_reminders: boolean;
  send_match_start: boolean;
  send_signup_updates: boolean;
}

export default function ChannelsSetupClient() {
  const router = useRouter();
  const [channels, setChannels] = useState<DiscordChannel[]>([]);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [voiceCategoryId, setVoiceCategoryId] = useState('');
  const [savingCategory, setSavingCategory] = useState(false);

  // Create channel modal
  const [createModalOpened, setCreateModalOpened] = useState(false);

  // Debug function to test modal opening
  const handleOpenCreateModal = () => {
    logger.debug('Add Channel button clicked');
    logger.debug('Current modal state:', createModalOpened);
    setCreateModalOpened(true);
    logger.debug('Modal should now be open');
  };

  const closeCreateModal = () => {
    setCreateModalOpened(false);
    setCurrentStep(0);
    createForm.reset();
  };
  const [currentStep, setCurrentStep] = useState(0);
  const [createLoading, setCreateLoading] = useState(false);

  // Edit channel modal
  const [editModalOpened, setEditModalOpened] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<DiscordChannel | null>(null);
  const [editData, setEditData] = useState<ChannelEditData>({
    send_announcements: false,
    send_reminders: false,
    send_match_start: false,
    send_signup_updates: false
  });

  const createForm = useForm<CreateChannelForm>({
    initialValues: {
      discord_channel_id: '',
      send_announcements: false,
      send_reminders: false,
      send_match_start: false,
      send_signup_updates: false,
    },
    validate: {
      discord_channel_id: (value) => {
        if (!value.trim()) return 'Channel ID is required';
        if (!/^\d{17,19}$/.test(value.trim())) return 'Invalid Discord channel ID format';
        return null;
      },
    },
  });

  const steps = [
    { title: 'Channel ID', description: 'Enter the Discord channel ID' },
    { title: 'Notifications', description: 'Configure notification settings for this text channel' },
    { title: 'Review', description: 'Review and create the channel' }
  ];

  const totalSteps = steps.length;
  const progressValue = ((currentStep + 1) / totalSteps) * 100;

  useEffect(() => {
    fetchChannels();
    fetchVoiceCategoryId();
  }, []);

  useEffect(() => {
    logger.debug('Modal state changed:', createModalOpened);
  }, [createModalOpened]);

  const fetchChannels = async () => {
    try {
      const response = await fetch('/api/channels');
      if (response.ok) {
        const data = await response.json();
        setChannels(data);
      }
    } catch (error) {
      logger.error('Error fetching channels:', error);
    }
  };

  const fetchVoiceCategoryId = async () => {
    try {
      const response = await fetch('/api/settings/discord');
      if (response.ok) {
        const data = await response.json();
        setVoiceCategoryId(data.voice_channel_category_id || '');
      }
    } catch (error) {
      logger.error('Error fetching voice category ID:', error);
    }
  };

  const saveVoiceCategoryId = async () => {
    setSavingCategory(true);
    try {
      const response = await fetch('/api/settings/discord', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voice_channel_category_id: voiceCategoryId }),
      });

      if (response.ok) {
        setMessage({ type: 'success', text: 'Voice channel category saved successfully!' });
      } else {
        setMessage({ type: 'error', text: 'Failed to save voice channel category' });
      }
    } catch (error) {
      logger.error('Error saving voice category ID:', error);
      setMessage({ type: 'error', text: 'An error occurred while saving' });
    } finally {
      setSavingCategory(false);
    }
  };

  const handleFinish = async () => {
    try {
      const response = await fetch('/api/welcome-flow', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ setupType: 'get_started' }),
      });
      
      if (response.ok) {
        router.push('/');
      }
    } catch (error) {
      logger.error('Error completing welcome flow:', error);
    }
  };

  const handleCreateChannel = async () => {
    setCreateLoading(true);
    
    try {
      const response = await fetch('/api/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createForm.values),
      });

      if (response.ok) {
        setMessage({ type: 'success', text: 'Channel created successfully!' });
        closeCreateModal();
        setCurrentStep(0);
        createForm.reset();
        await fetchChannels();
      } else {
        const errorData = await response.json();
        setMessage({ 
          type: 'error', 
          text: errorData.error || 'Failed to create channel' 
        });
      }
    } catch (error) {
      logger.error('Error creating channel:', error);
      setMessage({ type: 'error', text: 'An error occurred while creating the channel' });
    } finally {
      setCreateLoading(false);
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
    setEditModalOpened(true);
  };

  const closeEditModal = () => {
    setEditModalOpened(false);
    setSelectedChannel(null);
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
      logger.error('Error updating notifications:', error);
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
      logger.error('Error deleting channel:', error);
      setMessage({ type: 'error', text: 'An error occurred while deleting the channel' });
    }
  };

  const handleCreateNext = () => {
    if (currentStep === 0) {
      const validation = createForm.validate();
      if (validation.hasErrors) return;
    }

    if (currentStep < totalSteps - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleCreatePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const renderCreateStepContent = () => {
    switch (currentStep) {
      case 0:
        return (
          <Stack gap="md">
            <Text size="sm" c="dimmed">
              Enter the Discord channel ID. You can get this by right-clicking the channel in Discord and selecting &quot;Copy ID&quot;.
            </Text>
            <TextInput
              label="Discord Channel ID"
              placeholder="123456789012345678"
              description="Right-click the channel in Discord and select &apos;Copy ID&apos;"
              {...createForm.getInputProps('discord_channel_id')}
              required
            />
            <Alert color="blue" variant="light">
              <Text size="sm">
                <strong>How to get a channel ID:</strong><br />
                1. Enable Developer Mode in Discord (Settings → Advanced → Developer Mode)<br />
                2. Right-click the channel you want to add<br />
                3. Select &quot;Copy ID&quot;
              </Text>
            </Alert>
          </Stack>
        );

      case 1:
        return (
          <Stack gap="md">
            <Text size="sm" c="dimmed">
              Configure which notifications should be sent to this text channel.
            </Text>
            <Stack gap="sm">
              <Checkbox
                label="Match Announcements"
                description="Send new match announcements to this channel"
                {...createForm.getInputProps('send_announcements', { type: 'checkbox' })}
              />
              <Checkbox
                label="Match Reminders"
                description="Send match start reminders to this channel"
                {...createForm.getInputProps('send_reminders', { type: 'checkbox' })}
              />
              <Checkbox
                label="Live Updates"
                description="Send live updates about matches starting and their scores"
                {...createForm.getInputProps('send_match_start', { type: 'checkbox' })}
              />
              <Checkbox
                label="Signup Updates"
                description="Send updates when players sign up or leave matches"
                {...createForm.getInputProps('send_signup_updates', { type: 'checkbox' })}
              />
            </Stack>
          </Stack>
        );

      case 2:
        return renderCreateReviewStep();

      default:
        return null;
    }
  };

  const renderCreateReviewStep = () => (
    <Stack gap="md">
      <Text size="sm" c="dimmed">
        Review the channel configuration before creating it.
      </Text>
      <Card p="md" withBorder>
        <Stack gap="sm">
          <Group justify="space-between">
            <Text size="sm" fw={500}>Channel ID:</Text>
            <Text size="sm" ff="monospace">{createForm.values.discord_channel_id}</Text>
          </Group>
          <Text size="sm" fw={500} mt="sm">Notifications:</Text>
          <Stack gap="xs" pl="md">
            {createForm.values.send_announcements && <Text size="sm">✓ Match Announcements</Text>}
            {createForm.values.send_reminders && <Text size="sm">✓ Match Reminders</Text>}
            {createForm.values.send_match_start && <Text size="sm">✓ Live Updates</Text>}
            {createForm.values.send_signup_updates && <Text size="sm">✓ Signup Updates</Text>}
            {!createForm.values.send_announcements &&
             !createForm.values.send_reminders &&
             !createForm.values.send_match_start &&
             !createForm.values.send_signup_updates && (
              <Text size="sm" c="dimmed">No notifications enabled</Text>
            )}
          </Stack>
        </Stack>
      </Card>
    </Stack>
  );

  const textChannels = channels.filter(ch => ch.channel_type === 'text');

  return (
    <Stack gap="lg">
      <div>
        <Title order={1} ta="center" mb="xs">
          Setup Discord Channels 📢
        </Title>
        <Text ta="center" c="dimmed">
          Add text channels for match notifications and configure voice channel settings
        </Text>
      </div>

      <Text>
        Add Discord text channels to receive match notifications and announcements.
        Voice channels for matches are created automatically. You can always add more channels later from the main channels page.
      </Text>

      {message && (
        <Alert color={message.type === 'success' ? 'green' : 'red'} onClose={() => setMessage(null)}>
          {message.text}
        </Alert>
      )}

      <Card shadow="sm" padding="lg" radius="md" withBorder>
        <Group justify="space-between" mb="md">
          <Group>
            <IconMessage size="1.2rem" />
            <Text size="lg" fw={600}>Channels</Text>
            <Badge color="blue" variant="light">{textChannels.length}</Badge>
          </Group>
          <Button
            leftSection={<IconPlus size="1rem" />}
            onClick={handleOpenCreateModal}
          >
            Add Channel
          </Button>
        </Group>

        <Stack gap="sm">
          {textChannels.length === 0 ? (
            <Text c="dimmed" ta="center" py="md" size="sm">No channels added yet</Text>
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

      <Card shadow="sm" padding="lg" radius="md" withBorder>
        <Group mb="md">
          <IconMicrophone size="1.2rem" />
          <Text size="lg" fw={600}>Voice Channel Category</Text>
        </Group>

        <Text size="sm" c="dimmed" mb="md">
          Voice channels will be automatically created in this category when matches start.
          Right-click a Discord category and select &quot;Copy ID&quot; to get the category ID.
        </Text>

        <TextInput
          label="Discord Category ID"
          placeholder="123456789012345678"
          description="Category where match voice channels will be auto-created"
          value={voiceCategoryId}
          onChange={(e) => setVoiceCategoryId(e.target.value)}
          error={voiceCategoryId && !/^\d{17,19}$/.test(voiceCategoryId) ? 'Invalid Discord category ID format' : null}
        />

        <Group justify="flex-end" mt="md">
          <Button
            onClick={saveVoiceCategoryId}
            loading={savingCategory}
            disabled={!voiceCategoryId || !/^\d{17,19}$/.test(voiceCategoryId)}
          >
            Save Category
          </Button>
        </Group>
      </Card>

      <Group justify="space-between" mt="xl">
        <Button 
          variant="subtle" 
          onClick={handleFinish}
        >
          Skip for now
        </Button>
        <Button 
          rightSection={<IconArrowRight size={16} />}
          onClick={handleFinish}
        >
          Finish Setup
        </Button>
      </Group>

      {/* Create Channel Modal */}
      <Modal
        opened={createModalOpened}
        onClose={closeCreateModal}
        title="Add Discord Channel"
        size="lg"
        zIndex={1001}
      >
        <Stack gap="lg">
          <div>
            <Group justify="space-between" mb="xs">
              <Text size="sm" fw={500}>
                Step {currentStep + 1} of {totalSteps}: {steps[currentStep].title}
              </Text>
              <Text size="sm" c="dimmed">
                {Math.round(progressValue)}%
              </Text>
            </Group>
            <Progress value={progressValue} size="sm" mb="sm" />
            <Text size="xs" c="dimmed">
              {steps[currentStep].description}
            </Text>
          </div>

          <div>
            {renderCreateStepContent()}
          </div>

          <Group justify="space-between" mt="lg">
            <Button
              variant="outline"
              onClick={handleCreatePrevious}
              disabled={currentStep === 0}
            >
              Previous
            </Button>

            {currentStep === totalSteps - 1 ? (
              <Button
                onClick={handleCreateChannel}
                loading={createLoading}
                leftSection={<IconCheck size="1rem" />}
              >
                Create Channel
              </Button>
            ) : (
              <Button
                onClick={handleCreateNext}
                rightSection={<IconArrowRight size="1rem" />}
              >
                Next
              </Button>
            )}
          </Group>
        </Stack>
      </Modal>

      {/* Edit Notifications Modal */}
      <Modal
        opened={editModalOpened}
        onClose={closeEditModal}
        title="Channel Notification Settings"
        size="md"
        zIndex={1001}
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
  );
}