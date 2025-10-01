'use client'

import { Card, Text, Stack, TextInput, Button, Group, PasswordInput, Checkbox } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useEffect, useState } from 'react';
import { IconBrandDiscord } from '@tabler/icons-react';
import { notificationHelper } from '@/lib/notifications';
import { logger } from '@/lib/logger/client';

interface DiscordSettings {
  application_id?: string;
  bot_token?: string;
  guild_id?: string;
  announcement_role_id?: string;
  mention_everyone?: boolean;
}

export default function DiscordSettingsPage() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const form = useForm<DiscordSettings>({
    initialValues: {
      application_id: '',
      bot_token: '',
      guild_id: '',
      announcement_role_id: '',
      mention_everyone: false,
    },
  });

  useEffect(() => {
    async function fetchSettings() {
      setLoading(true);
      try {
        const response = await fetch('/api/settings');
        
        if (response.ok) {
          const data = await response.json();
          
          // Set Discord form values
          form.setValues({
            application_id: data.discord.application_id || '',
            bot_token: data.discord.bot_token || '',
            guild_id: data.discord.guild_id || '',
            announcement_role_id: data.discord.announcement_role_id || '',
            mention_everyone: data.discord.mention_everyone || false,
          });
        }
      } catch (error) {
        logger.error('Error fetching settings:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchSettings();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async (values: DiscordSettings) => {
    setSaving(true);

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
        notificationHelper.success({
          title: 'Settings Saved',
          message: 'Discord settings saved successfully!'
        });
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
        notificationHelper.error({
          title: 'Save Failed',
          message: 'Failed to save Discord settings.'
        });
      }
    } catch (error) {
      logger.error('Error saving Discord settings:', error);
      notificationHelper.error({
        title: 'Connection Error',
        message: 'An error occurred while saving settings.'
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <Stack gap="lg">
        <div>
          <Group>
            <IconBrandDiscord size="1.5rem" />
            <div>
              <Text size="xl" fw={700}>Discord Settings</Text>
              <Text size="sm" c="dimmed">Configure Discord bot connection and permissions</Text>
            </div>
          </Group>
        </div>

        <Card shadow="sm" padding="lg" radius="md" withBorder>
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
                          notificationHelper.success({
                            title: 'Application ID Saved',
                            message: 'Application ID saved! Opening Discord authorization...'
                          });
                          // Open Discord authorization URL
                          const url = `https://discord.com/api/oauth2/authorize?client_id=${form.values.application_id}&permissions=17929378196480&scope=bot%20applications.commands`;
                          window.open(url, '_blank');
                        } else {
                          notificationHelper.error({
                            title: 'Save Failed',
                            message: 'Failed to save application ID.'
                          });
                        }
                      } catch (error) {
                        logger.error('Error saving application ID:', error);
                        notificationHelper.error({
                          title: 'Connection Error',
                          message: 'An error occurred while saving application ID.'
                        });
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
      </Stack>
    </div>
  );
}