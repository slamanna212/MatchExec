'use client'

import { Card, Text, Stack, TextInput, Button, Group, PasswordInput, Alert, NumberInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useEffect, useState } from 'react';
import { IconInfoCircle, IconClock } from '@tabler/icons-react';

interface DiscordSettings {
  application_id?: string;
  bot_token?: string;
  guild_id?: string;
  announcement_channel_id?: string;
  results_channel_id?: string;
  participant_role_id?: string;
  event_duration_minutes?: number;
}

interface SchedulerSettings {
  match_check_cron: string;
  reminder_check_cron: string;
  cleanup_check_cron: string;
  report_generation_cron: string;
}

export default function SettingsPage() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [schedulerSaving, setSchedulerSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [schedulerMessage, setSchedulerMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const form = useForm<DiscordSettings>({
    initialValues: {
      application_id: '',
      bot_token: '',
      guild_id: '',
      announcement_channel_id: '',
      results_channel_id: '',
      participant_role_id: '',
      event_duration_minutes: 45,
    },
  });

  const schedulerForm = useForm<SchedulerSettings>({
    initialValues: {
      match_check_cron: '0 */5 * * * *',
      reminder_check_cron: '0 0 */4 * * *',
      cleanup_check_cron: '0 0 2 * * *',
      report_generation_cron: '0 0 0 * * 0',
    },
  });

  useEffect(() => {
    async function fetchSettings() {
      setLoading(true);
      try {
        const [discordResponse, schedulerResponse] = await Promise.all([
          fetch('/api/settings/discord'),
          fetch('/api/settings/scheduler')
        ]);
        
        if (discordResponse.ok) {
          const discordData = await discordResponse.json();
          // Ensure all values are proper types, not null
          const sanitizedData = {
            application_id: discordData.application_id || '',
            bot_token: discordData.bot_token || '',
            guild_id: discordData.guild_id || '',
            announcement_channel_id: discordData.announcement_channel_id || '',
            results_channel_id: discordData.results_channel_id || '',
            participant_role_id: discordData.participant_role_id || '',
            event_duration_minutes: discordData.event_duration_minutes || 45
          };
          form.setValues(sanitizedData);
        }
        
        if (schedulerResponse.ok) {
          const schedulerData = await schedulerResponse.json();
          schedulerForm.setValues(schedulerData);
        }
      } catch (error) {
        console.error('Error fetching settings:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchSettings();
  }, []);

  const handleSubmit = async (values: DiscordSettings) => {
    setSaving(true);
    setMessage(null);
    
    try {
      const response = await fetch('/api/settings/discord', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });

      if (response.ok) {
        setMessage({ type: 'success', text: 'Discord settings saved successfully!' });
      } else {
        setMessage({ type: 'error', text: 'Failed to save Discord settings.' });
      }
    } catch (error) {
      console.error('Error saving Discord settings:', error);
      setMessage({ type: 'error', text: 'An error occurred while saving settings.' });
    } finally {
      setSaving(false);
    }
  };

  const handleSchedulerSubmit = async (values: SchedulerSettings) => {
    setSchedulerSaving(true);
    setSchedulerMessage(null);
    
    try {
      const response = await fetch('/api/settings/scheduler', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });

      if (response.ok) {
        setSchedulerMessage({ type: 'success', text: 'Scheduler settings saved successfully!' });
      } else {
        const errorData = await response.json();
        setSchedulerMessage({ type: 'error', text: errorData.error || 'Failed to save scheduler settings.' });
      }
    } catch (error) {
      console.error('Error saving scheduler settings:', error);
      setSchedulerMessage({ type: 'error', text: 'An error occurred while saving scheduler settings.' });
    } finally {
      setSchedulerSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <Stack gap="xl">
        <div>
          <Text size="xl" fw={700}>Settings</Text>
          <Text c="dimmed" mt="xs">Configure application and match settings</Text>
        </div>

        <Stack gap="lg">
          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Text size="lg" fw={600} mb="md">Discord Configuration</Text>

            {message && (
              <Alert color={message.type === 'success' ? 'green' : 'red'} mb="md">
                {message.text}
              </Alert>
            )}

            <form onSubmit={form.onSubmit(handleSubmit)}>
              <Stack gap="md">
                <Group align="end">
                  <TextInput
                    label="Application ID"
                    placeholder="Discord application ID"
                    description="Application ID from Discord Developer Portal"
                    {...form.getInputProps('application_id')}
                    disabled={loading}
                    style={{ flex: 1 }}
                  />
                  <Button
                    variant="outline"
                    disabled={!form.values.application_id || loading}
                    onClick={() => {
                      if (form.values.application_id) {
                        const url = `https://discord.com/api/oauth2/authorize?client_id=${form.values.application_id}&permissions=581636017618000&scope=bot%20applications.commands`;
                        window.open(url, '_blank');
                      }
                    }}
                  >
                    Add Bot
                  </Button>
                </Group>

                <PasswordInput
                  label="Bot Token"
                  placeholder="Your Discord bot token"
                  description="Token from Discord Developer Portal"
                  {...form.getInputProps('bot_token')}
                  disabled={loading}
                />

                <TextInput
                  label="Guild ID"
                  placeholder="Discord server ID"
                  description="Right-click your Discord server and copy ID"
                  {...form.getInputProps('guild_id')}
                  disabled={loading}
                />

                <Group grow visibleFrom="md">
                  <TextInput
                    label="Announcement Channel"
                    placeholder="Channel ID for announcements"
                    {...form.getInputProps('announcement_channel_id')}
                    disabled={loading}
                  />
                  <TextInput
                    label="Results Channel"
                    placeholder="Channel ID for match results"
                    {...form.getInputProps('results_channel_id')}
                    disabled={loading}
                  />
                </Group>

                <Stack hiddenFrom="md">
                  <TextInput
                    label="Announcement Channel"
                    placeholder="Channel ID for announcements"
                    {...form.getInputProps('announcement_channel_id')}
                    disabled={loading}
                  />
                  <TextInput
                    label="Results Channel"
                    placeholder="Channel ID for match results"
                    {...form.getInputProps('results_channel_id')}
                    disabled={loading}
                  />
                </Stack>

                <TextInput
                  label="Participant Role"
                  placeholder="Role ID for match participants"
                  {...form.getInputProps('participant_role_id')}
                  disabled={loading}
                />

                <NumberInput
                  label="Event Duration (per round/map)"
                  placeholder="45"
                  description="Duration in minutes for Discord events (default: 45 minutes per round/map)"
                  min={5}
                  max={720}
                  {...form.getInputProps('event_duration_minutes')}
                  disabled={loading}
                />

                <Group justify="flex-end" mt="lg">
                  <Button type="submit" loading={saving} disabled={loading}>
                    Save Discord Settings
                  </Button>
                </Group>
              </Stack>
            </form>
          </Card>

          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Group mb="md">
              <IconClock size="1.2rem" />
              <Text size="lg" fw={600}>Scheduler Configuration</Text>
            </Group>

            {schedulerMessage && (
              <Alert color={schedulerMessage.type === 'success' ? 'green' : 'red'} mb="md">
                {schedulerMessage.text}
              </Alert>
            )}

            <form onSubmit={schedulerForm.onSubmit(handleSchedulerSubmit)}>
              <Stack gap="md">

                <TextInput
                  label="Match Check"
                  placeholder="0 */5 * * * *"
                  description="Cron expression for checking match start times (format: second minute hour day month dayOfWeek)"
                  {...schedulerForm.getInputProps('match_check_cron')}
                  disabled={loading}
                />

                <TextInput
                  label="Reminder Check"
                  placeholder="0 0 */4 * * *"
                  description="Cron expression for sending participant reminders"
                  {...schedulerForm.getInputProps('reminder_check_cron')}
                  disabled={loading}
                />

                <TextInput
                  label="Data Cleanup"
                  placeholder="0 0 2 * * *"
                  description="Cron expression for cleaning up old match data"
                  {...schedulerForm.getInputProps('cleanup_check_cron')}
                  disabled={loading}
                />

                <TextInput
                  label="Report Generation"
                  placeholder="0 0 0 * * 0"
                  description="Cron expression for generating match reports"
                  {...schedulerForm.getInputProps('report_generation_cron')}
                  disabled={loading}
                />

                <Alert color="blue" icon={<IconInfoCircle size="1rem" />}>
                  <Text size="sm">
                    For help with setting these, visit this website: <a href="https://crontab.guru/" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }}>https://crontab.guru/</a>
                  </Text>
                </Alert>

                <Group justify="flex-end" mt="lg">
                  <Button type="submit" loading={schedulerSaving} disabled={loading}>
                    Save Scheduler Settings
                  </Button>
                </Group>
              </Stack>
            </form>
          </Card>

        </Stack>
      </Stack>
    </div>
  );
}