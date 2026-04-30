'use client'

import { Card, Text, Stack, TextInput, Button, Group, PasswordInput, Checkbox, Skeleton } from '@mantine/core';
import { SettingsSaveButton } from '@/components/SettingsSaveButton';
import { useForm } from '@mantine/form';
import { useEffect, useState } from 'react';
import { IconBrandDiscord } from '@tabler/icons-react';
import { notificationHelper } from '@/lib/notifications';
import { logger } from '@/lib/logger/client';
import { PageLayout } from '@/components/PageLayout';
import { PageHeader } from '@/components/PageHeader';

interface DiscordSettings {
  application_id?: string;
  bot_token?: string;
  guild_id?: string;
  announcement_role_id?: string;
  mention_everyone?: boolean;
  voice_channel_category_id?: string;
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
      voice_channel_category_id: '',
    },
  });

  useEffect(() => {
    async function fetchSettings() {
      setLoading(true);
      try {
        const response = await fetch('/api/settings');

        if (response.ok) {
          const data = await response.json();

          form.setValues({
            application_id: data.discord.application_id || '',
            bot_token: data.discord.bot_token || '',
            guild_id: data.discord.guild_id || '',
            announcement_role_id: data.discord.announcement_role_id || '',
            mention_everyone: data.discord.mention_everyone || false,
            voice_channel_category_id: data.discord.voice_channel_category_id || '',
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
        const refreshResponse = await fetch('/api/settings/discord');
        if (refreshResponse.ok) {
          const refreshedData = await refreshResponse.json();
          form.setValues({
            application_id: refreshedData.application_id || '',
            bot_token: refreshedData.bot_token || '',
            guild_id: refreshedData.guild_id || '',
            announcement_role_id: refreshedData.announcement_role_id || '',
            mention_everyone: refreshedData.mention_everyone || false,
            voice_channel_category_id: refreshedData.voice_channel_category_id || '',
          });
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

  const skeletonRows = (count: number) => (
    <Stack gap="md">
      {Array.from({ length: count }).map((_, i) => (
        <Stack key={i} gap={4}>
          <Skeleton height={14} width={120} />
          <Skeleton height={36} />
        </Stack>
      ))}
    </Stack>
  );

  return (
    <PageLayout narrow>
      <form onSubmit={form.onSubmit(handleSubmit)}>
        <Stack gap="lg">
          <PageHeader
            icon={IconBrandDiscord}
            title="Discord Settings"
            subtitle="Configure Discord bot connection and permissions"
            breadcrumbs={[{ title: 'Settings', href: '/settings' }]}
            docLink="https://docs.matchexec.com/docs/settings/discord-settings/"
          />

          {/* Bot Credentials */}
          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Stack gap="md">
              <Text fw={600} size="lg">Bot Credentials</Text>

              {loading ? skeletonRows(2) : (
                <>
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
                              const url = `https://discord.com/api/oauth2/authorize?client_id=${form.values.application_id}&permissions=2551204168592720&scope=bot%20applications.commands`;
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
                </>
              )}
            </Stack>
          </Card>

          {/* Server Configuration */}
          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Stack gap="md">
              <Text fw={600} size="lg">Server Configuration</Text>

              {loading ? skeletonRows(3) : (
                <>
                  <TextInput
                    label="Guild ID"
                    placeholder="Discord server ID"
                    description="Right-click your Discord server and copy ID"
                    {...form.getInputProps('guild_id')}
                    disabled={loading}
                  />

                  <TextInput
                    label="Voice Channel Category ID"
                    placeholder="Category ID for auto-created voice channels"
                    description="Voice channels will be automatically created in this category when matches start"
                    {...form.getInputProps('voice_channel_category_id')}
                    disabled={loading}
                    error={form.values.voice_channel_category_id && !/^\d{17,19}$/.test(form.values.voice_channel_category_id) ? 'Invalid Discord category ID format' : null}
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
                          if (event.currentTarget.checked) {
                            form.setFieldValue('announcement_role_id', '');
                          }
                        }}
                      />
                    </Group>
                  </Stack>
                </>
              )}
            </Stack>
          </Card>

          <SettingsSaveButton loading={saving} disabled={loading} />
        </Stack>
      </form>
    </PageLayout>
  );
}
