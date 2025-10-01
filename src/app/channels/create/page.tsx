'use client'

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Card,
  Text,
  Stack,
  Button,
  Group,
  Progress,
  TextInput,
  Checkbox,
  Radio,
  Alert,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconArrowLeft, IconArrowRight, IconCheck } from '@tabler/icons-react';
import { logger } from '@/lib/logger/client';

interface CreateChannelForm {
  channel_type: 'text' | 'voice';
  discord_channel_id: string;
  send_announcements: boolean;
  send_reminders: boolean;
  send_match_start: boolean;
  send_signup_updates: boolean;
}

export default function CreateChannelPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const form = useForm<CreateChannelForm>({
    initialValues: {
      channel_type: 'text',
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
    {
      title: 'Channel Type',
      description: 'Select whether this is a text or voice channel'
    },
    {
      title: 'Channel ID',
      description: 'Enter the Discord channel ID'
    },
    ...(form.values.channel_type === 'text' ? [{
      title: 'Notifications',
      description: 'Configure notification settings for this text channel'
    }] : []),
    {
      title: 'Review',
      description: 'Review and create the channel'
    }
  ];

  const totalSteps = steps.length;
  const progressValue = ((currentStep + 1) / totalSteps) * 100;

  const handleNext = () => {
    if (currentStep === 1) {
      // Validate channel ID before proceeding
      const validation = form.validate();
      if (validation.hasErrors) {
        return;
      }
    }
    
    if (currentStep < totalSteps - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    setMessage(null);

    try {
      const response = await fetch('/api/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form.values),
      });

      if (response.ok) {
        setMessage({ type: 'success', text: 'Channel created successfully!' });
        setTimeout(() => {
          router.push('/channels');
        }, 1500);
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
      setLoading(false);
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return (
          <Stack gap="md">
            <Text size="sm" c="dimmed">
              Choose the type of Discord channel you want to add to the bot.
            </Text>
            <Radio.Group
              value={form.values.channel_type}
              onChange={(value) => form.setFieldValue('channel_type', value as 'text' | 'voice')}
            >
              <Stack gap="sm">
                <Radio
                  value="text"
                  label="Text Channel"
                  description="A channel where users can send messages. Supports notification settings."
                />
                <Radio
                  value="voice"
                  label="Voice Channel"
                  description="A channel where users can join voice calls. Used for voice match coordination."
                />
              </Stack>
            </Radio.Group>
          </Stack>
        );

      case 1:
        return (
          <Stack gap="md">
            <Text size="sm" c="dimmed">
              Enter the Discord channel ID. You can get this by right-clicking the channel in Discord and selecting &quot;Copy ID&quot;.
            </Text>
            <TextInput
              label="Discord Channel ID"
              placeholder="123456789012345678"
              description="Right-click the channel in Discord and select &apos;Copy ID&apos;"
              {...form.getInputProps('discord_channel_id')}
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

      case 2:
        if (form.values.channel_type === 'voice') {
          // Skip notification settings for voice channels
          return renderReviewStep();
        }
        return (
          <Stack gap="md">
            <Text size="sm" c="dimmed">
              Configure which notifications should be sent to this text channel.
            </Text>
            <Stack gap="sm">
              <Checkbox
                label="Match Announcements"
                description="Send new match announcements to this channel"
                {...form.getInputProps('send_announcements', { type: 'checkbox' })}
              />
              <Checkbox
                label="Match Reminders"
                description="Send match start reminders to this channel"
                {...form.getInputProps('send_reminders', { type: 'checkbox' })}
              />
              <Checkbox
                label="Live Updates"
                description="Send live updates about matches starting and their scores"
                {...form.getInputProps('send_match_start', { type: 'checkbox' })}
              />
              <Checkbox
                label="Signup Updates"
                description="Send updates when players sign up or leave matches"
                {...form.getInputProps('send_signup_updates', { type: 'checkbox' })}
              />
            </Stack>
          </Stack>
        );

      case 3:
        return renderReviewStep();

      default:
        return null;
    }
  };

  const renderReviewStep = () => (
    <Stack gap="md">
      <Text size="sm" c="dimmed">
        Review the channel configuration before creating it.
      </Text>
      <Card p="md" withBorder>
        <Stack gap="sm">
          <Group justify="space-between">
            <Text size="sm" fw={500}>Channel Type:</Text>
            <Text size="sm" tt="capitalize">{form.values.channel_type}</Text>
          </Group>
          <Group justify="space-between">
            <Text size="sm" fw={500}>Channel ID:</Text>
            <Text size="sm" ff="monospace">{form.values.discord_channel_id}</Text>
          </Group>
          {form.values.channel_type === 'text' && (
            <>
              <Text size="sm" fw={500} mt="sm">Notifications:</Text>
              <Stack gap="xs" pl="md">
                {form.values.send_announcements && (
                  <Text size="sm">✓ Match Announcements</Text>
                )}
                {form.values.send_reminders && (
                  <Text size="sm">✓ Match Reminders</Text>
                )}
                {form.values.send_match_start && (
                  <Text size="sm">✓ Live Updates</Text>
                )}
                {form.values.send_signup_updates && (
                  <Text size="sm">✓ Signup Updates</Text>
                )}
                {!form.values.send_announcements && 
                 !form.values.send_reminders && 
                 !form.values.send_match_start && 
                 !form.values.send_signup_updates && (
                  <Text size="sm" c="dimmed">No notifications enabled</Text>
                )}
              </Stack>
            </>
          )}
        </Stack>
      </Card>
    </Stack>
  );

  return (
    <div className="max-w-2xl mx-auto">
      <Stack gap="xl">
        <div>
          <Group mb="md">
            <Button
              variant="outline"
              leftSection={<IconArrowLeft size="1rem" />}
              onClick={() => router.push('/channels')}
            >
              Back to Channels
            </Button>
          </Group>
        </div>

        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Stack gap="lg">
            {/* Progress Bar */}
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

            {message && (
              <Alert color={message.type === 'success' ? 'green' : 'red'}>
                {message.text}
              </Alert>
            )}

            {/* Step Content */}
            <div>
              {renderStepContent()}
            </div>

            {/* Navigation Buttons */}
            <Group justify="space-between" mt="lg">
              <Button
                variant="outline"
                onClick={handlePrevious}
                disabled={currentStep === 0}
                leftSection={<IconArrowLeft size="1rem" />}
              >
                Previous
              </Button>

              {currentStep === totalSteps - 1 ? (
                <Button
                  onClick={handleSubmit}
                  loading={loading}
                  leftSection={<IconCheck size="1rem" />}
                >
                  Create Channel
                </Button>
              ) : (
                <Button
                  onClick={handleNext}
                  rightSection={<IconArrowRight size="1rem" />}
                >
                  Next
                </Button>
              )}
            </Group>
          </Stack>
        </Card>
      </Stack>
    </div>
  );
}
