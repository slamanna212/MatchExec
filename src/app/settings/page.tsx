'use client'

export const dynamic = 'force-dynamic';

import { Card, Text, Stack, TextInput, Button, Group, PasswordInput, Alert, NumberInput, Checkbox, Select, Box, Grid } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useEffect, useState } from 'react';
import { IconSettings, IconVolume, IconMicrophone } from '@tabler/icons-react';
import SchedulerConfig from '@/components/SchedulerConfig';

interface DiscordSettings {
  application_id?: string;
  bot_token?: string;
  guild_id?: string;
  announcement_role_id?: string;
  mention_everyone?: boolean;
}

interface ApplicationSettings {
  event_duration_minutes?: number;
  match_reminder_minutes?: number;
  player_reminder_minutes?: number;
}

interface SchedulerSettings {
  match_check_cron: string;
  cleanup_check_cron: string;
  channel_refresh_cron: string;
}

interface UISettings {
  auto_refresh_interval_seconds: number;
}

interface AnnouncerSettings {
  announcer_voice?: string;
  voice_announcements_enabled?: boolean;
  announcement_voice_channel?: string;
}

interface VoiceChannel {
  id: string;
  discord_channel_id: string;
  channel_name: string;
  channel_type: 'voice';
}

interface Voice {
  id: string;
  name: string;
}

export default function SettingsPage() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [appSaving, setAppSaving] = useState(false);
  const [schedulerSaving, setSchedulerSaving] = useState(false);
  const [uiSaving, setUiSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [appMessage, setAppMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [schedulerMessage, setSchedulerMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [uiMessage, setUiMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [announcerSaving, setAnnouncerSaving] = useState(false);
  const [announcerMessage, setAnnouncerMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [playerReminderValue, setPlayerReminderValue] = useState(2);
  const [playerReminderUnit, setPlayerReminderUnit] = useState('hours');
  const [voiceChannels, setVoiceChannels] = useState<VoiceChannel[]>([]);
  const [availableVoices, setAvailableVoices] = useState<Voice[]>([]);

  // Helper functions for player reminder conversion
  const minutesToValueUnit = (minutes: number) => {
    if (minutes >= 1440 && minutes % 1440 === 0) {
      return { value: minutes / 1440, unit: 'days' };
    }
    if (minutes >= 60 && minutes % 60 === 0) {
      return { value: minutes / 60, unit: 'hours' };
    }
    return { value: minutes, unit: 'minutes' };
  };

  const valueUnitToMinutes = (value: number, unit: string) => {
    switch (unit) {
      case 'days': return value * 1440;
      case 'hours': return value * 60;
      case 'minutes': return value;
      default: return value;
    }
  };
  
  const [schedulerSettings, setSchedulerSettings] = useState<SchedulerSettings>({
    match_check_cron: '0 */1 * * * *',
    cleanup_check_cron: '0 0 2 * * *',
    channel_refresh_cron: '0 0 0 * * *',
  });

  const form = useForm<DiscordSettings>({
    initialValues: {
      application_id: '',
      bot_token: '',
      guild_id: '',
      announcement_role_id: '',
      mention_everyone: false,
    },
  });

  const appForm = useForm<ApplicationSettings>({
    initialValues: {
      event_duration_minutes: 45,
      match_reminder_minutes: 10,
      player_reminder_minutes: 120,
    },
  });



  const uiForm = useForm<UISettings>({
    initialValues: {
      auto_refresh_interval_seconds: 10,
    },
  });

  const announcerForm = useForm<AnnouncerSettings>({
    initialValues: {
      announcer_voice: 'wrestling-announcer',
      voice_announcements_enabled: false,
      announcement_voice_channel: '',
    },
  });

  useEffect(() => {
    async function fetchSettings() {
      setLoading(true);
      try {
        const [discordResponse, appResponse, schedulerResponse, uiResponse, voicesResponse, channelsResponse, announcerResponse] = await Promise.all([
          fetch('/api/settings/discord'),
          fetch('/api/settings/discord'), // We'll use the same endpoint for now
          fetch('/api/settings/scheduler'),
          fetch('/api/settings/ui'),
          fetch('/api/settings/voices'),
          fetch('/api/channels'),
          fetch('/api/settings/announcer')
        ]);
        
        if (discordResponse.ok) {
          const discordData = await discordResponse.json();
          // Ensure all values are proper types, not null
          const sanitizedDiscordData = {
            application_id: discordData.application_id || '',
            bot_token: discordData.bot_token || '',
            guild_id: discordData.guild_id || '',
            announcement_role_id: discordData.announcement_role_id || '',
            mention_everyone: discordData.mention_everyone || false,
          };
          form.setValues(sanitizedDiscordData);
        }

        if (appResponse.ok) {
          const appData = await appResponse.json();
          const sanitizedAppData = {
            event_duration_minutes: appData.event_duration_minutes || 45,
            match_reminder_minutes: appData.match_reminder_minutes || 10,
            player_reminder_minutes: appData.player_reminder_minutes || 120,
          };
          appForm.setValues(sanitizedAppData);
          
          // Set player reminder display values
          const playerReminderDisplay = minutesToValueUnit(sanitizedAppData.player_reminder_minutes);
          setPlayerReminderValue(playerReminderDisplay.value);
          setPlayerReminderUnit(playerReminderDisplay.unit);

        }
        
        if (schedulerResponse.ok) {
          const schedulerData = await schedulerResponse.json();
          setSchedulerSettings(schedulerData);
        }

        if (uiResponse.ok) {
          const uiData = await uiResponse.json();
          uiForm.setValues(uiData);
        }

        if (voicesResponse.ok) {
          const voicesData = await voicesResponse.json();
          setAvailableVoices(voicesData.map((voice: {id: string; name: string}) => ({
            id: voice.id,
            name: voice.name
          })));
        }

        if (channelsResponse.ok) {
          const channelsData = await channelsResponse.json();
          setVoiceChannels(channelsData.filter((channel: { channel_type: string }) => channel.channel_type === 'voice'));
        }

        if (announcerResponse.ok) {
          const announcerData = await announcerResponse.json();
          announcerForm.setValues(announcerData);
        }

      } catch (error) {
        console.error('Error fetching settings:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchSettings();
  }, []); // Empty dependency array - only run once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps

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
            announcement_role_id: refreshedData.announcement_role_id || '',
            mention_everyone: refreshedData.mention_everyone || false,
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

  const handleAppSubmit = async (values: ApplicationSettings) => {
    setAppSaving(true);
    setAppMessage(null);
    
    try {
      // Convert player reminder display values to minutes
      const playerReminderMinutes = valueUnitToMinutes(playerReminderValue, playerReminderUnit);
      const payload = {
        ...values,
        player_reminder_minutes: playerReminderMinutes
      };

      const response = await fetch('/api/settings/discord', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        setAppMessage({ type: 'success', text: 'Application settings saved successfully!' });
      } else {
        setAppMessage({ type: 'error', text: 'Failed to save application settings.' });
      }
    } catch (error) {
      console.error('Error saving application settings:', error);
      setAppMessage({ type: 'error', text: 'An error occurred while saving application settings.' });
    } finally {
      setAppSaving(false);
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

  const handleAnnouncerSubmit = async (values: AnnouncerSettings) => {
    setAnnouncerSaving(true);
    setAnnouncerMessage(null);
    
    try {
      const response = await fetch('/api/settings/announcer', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });

      if (response.ok) {
        setAnnouncerMessage({ type: 'success', text: 'Announcer settings saved successfully!' });
      } else {
        const errorData = await response.json();
        setAnnouncerMessage({ type: 'error', text: errorData.error || 'Failed to save announcer settings.' });
      }
    } catch (error) {
      console.error('Error saving announcer settings:', error);
      setAnnouncerMessage({ type: 'error', text: 'An error occurred while saving announcer settings.' });
    } finally {
      setAnnouncerSaving(false);
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
          <Card shadow="sm" padding="lg" radius="md" withBorder id="application">
            <Text size="lg" fw={600} mb="md">Application Settings</Text>

            {appMessage && (
              <Alert color={appMessage.type === 'success' ? 'green' : 'red'} mb="md">
                {appMessage.text}
              </Alert>
            )}

            <form onSubmit={appForm.onSubmit(handleAppSubmit)}>
              <Stack gap="md">
                <NumberInput
                  label="Event Duration (per round/map)"
                  placeholder="45"
                  description="Duration in minutes for Discord events"
                  min={5}
                  max={720}
                  {...appForm.getInputProps('event_duration_minutes')}
                  disabled={loading}
                />
                <NumberInput
                  label="Match Reminder"
                  placeholder="10"
                  description="Minutes before match start to send reminder"
                  min={1}
                  max={1440}
                  {...appForm.getInputProps('match_reminder_minutes')}
                  disabled={loading}
                />
                <Stack gap="xs">
                  <Text size="sm" fw={500}>Player Reminder</Text>
                  <Text size="xs" c="dimmed">Time before match to send reminders to signed up players</Text>
                  
                  <Group gap="xs" align="flex-end">
                    <NumberInput
                      size="sm"
                      placeholder="2"
                      value={playerReminderValue}
                      onChange={(value) => setPlayerReminderValue(Number(value) || 1)}
                      min={1}
                      max={playerReminderUnit === 'minutes' ? 1440 : playerReminderUnit === 'hours' ? 168 : 7}
                      disabled={loading}
                      style={{ width: 80 }}
                    />
                    <Select
                      size="sm"
                      placeholder="Unit"
                      data={[
                        { value: 'minutes', label: 'Minutes' },
                        { value: 'hours', label: 'Hours' },
                        { value: 'days', label: 'Days' }
                      ]}
                      value={playerReminderUnit}
                      onChange={(selectedUnit) => {
                        if (selectedUnit) {
                          setPlayerReminderUnit(selectedUnit);
                        }
                      }}
                      disabled={loading}
                      style={{ minWidth: 100 }}
                    />
                  </Group>
                </Stack>


                <Group justify="flex-end" mt="lg">
                  <Button type="submit" loading={appSaving} disabled={loading}>
                    Save Application Settings
                  </Button>
                </Group>
              </Stack>
            </form>
          </Card>

          <Card shadow="sm" padding="lg" radius="md" withBorder id="announcer">
            <Group mb="md">
              <IconVolume size="1.2rem" />
              <Text size="lg" fw={600}>Announcer Settings</Text>
            </Group>

            {announcerMessage && (
              <Alert color={announcerMessage.type === 'success' ? 'green' : 'red'} mb="md">
                {announcerMessage.text}
              </Alert>
            )}

            <form onSubmit={announcerForm.onSubmit(handleAnnouncerSubmit)}>
              <Stack gap="md">
                <Checkbox
                  label="Voice Announcements"
                  description="Enable voice announcements in Discord voice channels"
                  {...announcerForm.getInputProps('voice_announcements_enabled', { type: 'checkbox' })}
                  disabled={loading}
                />

                {announcerForm.values.voice_announcements_enabled && (
                  <>
                    <Box>
                      <Text size="sm" fw={500} mb="xs">Announcer Voice</Text>
                      <Text size="xs" c="dimmed" mb="md">Select the voice style for match announcements</Text>
                      
                      <Grid>
                        {availableVoices.map((voice) => (
                          <Grid.Col span={{ base: 12, sm: 6 }} key={voice.id}>
                            <Card 
                              shadow="sm" 
                              padding="md" 
                              radius="md" 
                              withBorder
                              style={{ 
                                cursor: 'pointer',
                                backgroundColor: announcerForm.values.announcer_voice === voice.id ? 'var(--mantine-primary-color-light)' : undefined,
                                borderColor: announcerForm.values.announcer_voice === voice.id ? 'var(--mantine-primary-color)' : undefined
                              }}
                              onClick={() => announcerForm.setFieldValue('announcer_voice', voice.id)}
                            >
                              <Group gap="sm">
                                <IconMicrophone size="1rem" />
                                <Text fw={announcerForm.values.announcer_voice === voice.id ? 600 : 400}>
                                  {voice.name}
                                </Text>
                              </Group>
                            </Card>
                          </Grid.Col>
                        ))}
                      </Grid>
                    </Box>

                  </>
                )}

                <Group justify="flex-end" mt="lg">
                  <Button type="submit" loading={announcerSaving} disabled={loading}>
                    Save Announcer Settings
                  </Button>
                </Group>
              </Stack>
            </form>
          </Card>

          <div id="scheduler">
            <SchedulerConfig
              value={schedulerSettings}
              onChange={setSchedulerSettings}
              onSubmit={handleSchedulerSubmit}
              loading={loading}
              saving={schedulerSaving}
              message={schedulerMessage}
            />
          </div>

          <Card shadow="sm" padding="lg" radius="md" withBorder id="discord">
            <Text size="lg" fw={600} mb="md">Discord Settings</Text>

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



                <Group justify="flex-end" mt="lg">
                  <Button type="submit" loading={saving} disabled={loading}>
                    Save Discord Settings
                  </Button>
                </Group>
              </Stack>
            </form>
          </Card>

          <Card shadow="sm" padding="lg" radius="md" withBorder id="ui">
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