'use client'

import { Card, Text, Stack, TextInput, Button, Switch, Group, PasswordInput, Alert } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useEffect, useState } from 'react';
import { IconInfoCircle } from '@tabler/icons-react';

interface DiscordSettings {
  application_id?: string;
  bot_token?: string;
  guild_id?: string;
  announcement_channel_id?: string;
  results_channel_id?: string;
  participant_role_id?: string;
}

export default function SettingsPage() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const form = useForm<DiscordSettings>({
    initialValues: {
      application_id: '',
      bot_token: '',
      guild_id: '',
      announcement_channel_id: '',
      results_channel_id: '',
      participant_role_id: '',
    },
  });

  useEffect(() => {
    async function fetchSettings() {
      setLoading(true);
      try {
        const response = await fetch('/api/settings/discord');
        if (response.ok) {
          const data = await response.json();
          form.setValues(data);
        }
      } catch (error) {
        console.error('Error fetching Discord settings:', error);
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
                  placeholder="Role ID for tournament participants"
                  {...form.getInputProps('participant_role_id')}
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

        </Stack>
      </Stack>
    </div>
  );
}