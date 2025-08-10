'use client'

export const dynamic = 'force-dynamic';

import { Card, Text, Stack, TextInput, Button, Group, PasswordInput, Alert, NumberInput, Checkbox } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useEffect, useState } from 'react';
import { IconInfoCircle, IconClock, IconSettings } from '@tabler/icons-react';

interface DiscordSettings {
  application_id?: string;
  bot_token?: string;
  guild_id?: string;
  announcement_channel_id?: string;
  results_channel_id?: string;
  participant_role_id?: string;
  announcement_role_id?: string;
  mention_everyone?: boolean;
  event_duration_minutes?: number;
  match_reminder_minutes?: number;
}

interface SchedulerSettings {
  match_check_cron: string;
  reminder_check_cron: string;
  cleanup_check_cron: string;
  report_generation_cron: string;
}

interface UISettings {
  auto_refresh_interval_seconds: number;
}

export default function SettingsPage() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [schedulerSaving, setSchedulerSaving] = useState(false);
  const [uiSaving, setUiSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [schedulerMessage, setSchedulerMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [uiMessage, setUiMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const form = useForm<DiscordSettings>({
    initialValues: {
      application_id: '',
      bot_token: '',
      guild_id: '',
      announcement_channel_id: '',
      results_channel_id: '',
      participant_role_id: '',
      announcement_role_id: '',
      mention_everyone: false,
      event_duration_minutes: 45,
      match_reminder_minutes: 10,
    },
  });

  const schedulerForm = useForm<SchedulerSettings>({
    initialValues: {
      match_check_cron: '0 */1 * * * *',
      reminder_check_cron: '0 0 */4 * * *',
      cleanup_check_cron: '0 0 2 * * *',
      report_generation_cron: '0 0 0 * * 0',
    },
  });

  const uiForm = useForm<UISettings>({
    initialValues: {
      auto_refresh_interval_seconds: 10,
    },
  });

  useEffect(() => {
    async function fetchSettings() {
      setLoading(true);
      try {
        const [discordResponse, schedulerResponse, uiResponse] = await Promise.all([
          fetch('/api/settings/discord'),
          fetch('/api/settings/scheduler'),
          fetch('/api/settings/ui')
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
            announcement_role_id: discordData.announcement_role_id || '',
            mention_everyone: discordData.mention_everyone || false,
            event_duration_minutes: discordData.event_duration_minutes || 45,
            match_reminder_minutes: discordData.match_reminder_minutes || 10
          };
          form.setValues(sanitizedData);
        }
        
        if (schedulerResponse.ok) {
          const schedulerData = await schedulerResponse.json();
          schedulerForm.setValues(schedulerData);
        }

        if (uiResponse.ok) {
          const uiData = await uiResponse.json();
          uiForm.setValues(uiData);
        }
      } catch (error) {
        console.error('Error fetching settings:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchSettings();
  }, []); // Empty dependency array - only run once on mount

  const handleSubmit = async (values: DiscordSettings) => {
    setSaving(true);
    setMessage(null);
    
    try {
      // Don't send the masked bot token, let the server keep the existing one
      const payload = { ...values };
      if (values.bot_token === '••••••••') {
        delete payload.bot_token;
      }

      const response = await fetch('/api/settings/discord', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        setMessage({ type: 'success', text: 'Discord settings saved successfully!' });
        // Refresh the form to get the latest data
        const refreshResponse = await fetch('/api/settings/discord');
        if (refreshResponse.ok) {
          const refreshedData = await refreshResponse.json();
          const sanitizedData = {
            application_id: refreshedData.application_id || '',
            bot_token: refreshedData.bot_token || '',
            guild_id: refreshedData.guild_id || '',
            announcement_channel_id: refreshedData.announcement_channel_id || '',
            results_channel_id: refreshedData.results_channel_id || '',
            participant_role_id: refreshedData.participant_role_id || '',
            announcement_role_id: refreshedData.announcement_role_id || '',
            mention_everyone: refreshedData.mention_everyone || false,
            event_duration_minutes: refreshedData.event_duration_minutes || 45,
            match_reminder_minutes: refreshedData.match_reminder_minutes || 10
          };
          form.setValues(sanitizedData);
        }
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

  const handleUISubmit = async (values: UISettings) => {
    setUiSaving(true);
    setUiMessage(null);
    
    try {
      const response = await fetch('/api/settings/ui', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });

      if (response.ok) {
        setUiMessage({ type: 'success', text: 'UI settings saved successfully!' });
      } else {
        const errorData = await response.json();
        setUiMessage({ type: 'error', text: errorData.error || 'Failed to save UI settings.' });
      }
    } catch (error) {
      console.error('Error saving UI settings:', error);
      setUiMessage({ type: 'error', text: 'An error occurred while saving UI settings.' });
    } finally {
      setUiSaving(false);
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
                    onClick={async () => {
                      if (form.values.application_id) {
                        // Save the application ID first
                        try {
                          setSaving(true);
                          const response = await fetch('/api/settings/discord', {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify((() => {
                              const payload = { ...form.values };
                              if (form.values.bot_token === '••••••••') {
                                delete payload.bot_token;
                              }
                              return payload;
                            })()),
                          });

                          if (response.ok) {
                            setMessage({ type: 'success', text: 'Application ID saved! Opening Discord authorization...' });
                            // Open Discord authorization URL
                            const url = `https://discord.com/api/oauth2/authorize?client_id=${form.values.application_id}&permissions=581636017618000&scope=bot%20applications.commands`;
                            window.open(url, '_blank');
                          } else {
                            setMessage({ type: 'error', text: 'Failed to save application ID.' });
                          }
                        } catch (error) {
                          console.error('Error saving application ID:', error);
                          setMessage({ type: 'error', text: 'An error occurred while saving application ID.' });
                        } finally {
                          setSaving(false);
                        }
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

                <Stack gap="sm">
                  <Text size="sm" fw={500}>Announcement Role</Text>
                  <Text size="xs" c="dimmed">Role to mention in match announcements</Text>
                  
                  <Group align="center" gap="md">
                    <TextInput
                      placeholder="Role ID for announcements"
                      {...form.getInputProps('announcement_role_id')}
                      disabled={loading || form.values.mention_everyone}
                      style={{ flex: 1 }}
                    />
                    
                    <Checkbox
                      label={<Text fw="bold">@Everyone</Text>}
                      size="md"
                      {...form.getInputProps('mention_everyone', { type: 'checkbox' })}
                      disabled={loading}
                      onChange={(event) => {
                        form.setFieldValue('mention_everyone', event.currentTarget.checked);
                        // Clear the role ID when @everyone is checked
                        if (event.currentTarget.checked) {
                          form.setFieldValue('announcement_role_id', '');
                        }
                      }}
                    />
                  </Group>
                </Stack>

                <Group grow visibleFrom="md">
                  <NumberInput
                    label="Event Duration (per round/map)"
                    placeholder="45"
                    description="Duration in minutes for Discord events"
                    min={5}
                    max={720}
                    {...form.getInputProps('event_duration_minutes')}
                    disabled={loading}
                  />
                  <NumberInput
                    label="Match Reminder Minutes"
                    placeholder="10"
                    description="Minutes before match start to send reminder"
                    min={1}
                    max={1440}
                    {...form.getInputProps('match_reminder_minutes')}
                    disabled={loading}
                  />
                </Group>

                <Stack hiddenFrom="md">
                  <NumberInput
                    label="Event Duration (per round/map)"
                    placeholder="45"
                    description="Duration in minutes for Discord events"
                    min={5}
                    max={720}
                    {...form.getInputProps('event_duration_minutes')}
                    disabled={loading}
                  />
                  <NumberInput
                    label="Match Reminder Minutes"
                    placeholder="10"
                    description="Minutes before match start to send reminder"
                    min={1}
                    max={1440}
                    {...form.getInputProps('match_reminder_minutes')}
                    disabled={loading}
                  />
                </Stack>

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
                  placeholder="0 */1 * * * *"
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

          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Group mb="md">
              <IconSettings size="1.2rem" />
              <Text size="lg" fw={600}>UI Settings</Text>
            </Group>

            {uiMessage && (
              <Alert color={uiMessage.type === 'success' ? 'green' : 'red'} mb="md">
                {uiMessage.text}
              </Alert>
            )}

            <form onSubmit={uiForm.onSubmit(handleUISubmit)}>
              <Stack gap="md">
                <NumberInput
                  label="Auto Refresh Interval"
                  placeholder="30"
                  description="How often (in seconds) the match dashboard should automatically refresh"
                  min={5}
                  max={300}
                  {...uiForm.getInputProps('auto_refresh_interval_seconds')}
                  disabled={loading}
                />


                <Group justify="flex-end" mt="lg">
                  <Button type="submit" loading={uiSaving} disabled={loading}>
                    Save UI Settings
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