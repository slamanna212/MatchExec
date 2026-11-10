import { Card, Text, Stack, TextInput, Button, Group, PasswordInput, Checkbox, Skeleton, Switch, NumberInput, Collapse, UnstyledButton, SimpleGrid, Menu, ActionIcon } from '@mantine/core';
import { modals } from '@mantine/modals';
import { Link } from 'react-router';
import { SettingsSaveButton } from '@/components/SettingsSaveButton';
import { useForm } from '@mantine/form';
import { useEffect, useState } from 'react';
import { IconBrandDiscord, IconRefresh, IconPlus, IconHash, IconX, IconKey, IconServer, IconMessageCircle, IconChevronDown } from '@tabler/icons-react';
import type { DiscordChannel } from '@/shared/types';
import { notificationHelper, showError, showSuccess } from '@/lib/notifications';
import { logger } from '@/lib/logger/client';
import { PageLayout } from '@/components/PageLayout';
import { PageHeader } from '@/components/PageHeader';
import { discordIdError } from '@/shared/discord-ids';

interface DiscordSettings {
  application_id?: string;
  bot_token?: string;
  guild_id?: string;
  announcement_role_id?: string;
  mention_everyone?: boolean;
  voice_channel_category_id?: string;
  voice_channel_cleanup_delay_minutes?: number;
  voice_channel_lead_minutes?: number;
  signup_dm_enabled?: boolean;
  commander_dm_enabled?: boolean;
}

type FlagKey = 'send_announcements' | 'send_reminders' | 'send_match_start' | 'send_signup_updates' | 'send_health_alerts' | 'send_series_updates';

const NOTIFICATION_TYPES: Array<{ flag: FlagKey; label: string; description: string }> = [
  { flag: 'send_announcements', label: 'Announcements', description: 'New match announcements' },
  { flag: 'send_reminders', label: 'Reminders', description: 'Match start reminders' },
  { flag: 'send_match_start', label: 'Live Updates', description: 'Matches starting and their scores' },
  { flag: 'send_signup_updates', label: 'Signup Updates', description: 'When players sign up or leave' },
  { flag: 'send_health_alerts', label: 'Health Alerts', description: 'Scheduler heartbeat, database errors, process crashes' },
  { flag: 'send_series_updates', label: 'Series Updates', description: 'Weekly schedules and standings for seasons and series' },
];

type SectionKey = 'credentials' | 'server' | 'dms';

function shortId(id?: string): string {
  if (!id) return 'not set';
  return id.length > 10 ? `${id.slice(0, 4)}…${id.slice(-4)}` : id;
}

function SectionHeader({ icon, title, summary, open, onToggle, last }: {
  icon: React.ReactNode; title: string; summary: string; open: boolean; onToggle: () => void; last?: boolean;
}) {
  return (
    <UnstyledButton
      onClick={onToggle}
      aria-expanded={open}
      w="100%"
      px="md"
      py="sm"
      mih={44}
      style={{ display: 'flex', alignItems: 'center', gap: 12, borderBottom: last && !open ? 'none' : '1px solid var(--mantine-color-default-border)' }}
    >
      <span style={{ display: 'flex', color: 'var(--mantine-color-indigo-4)' }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Text fw={600} size="sm">{title}</Text>
        <Text size="xs" c="dimmed" truncate>{summary}</Text>
      </div>
      <IconChevronDown size={18} style={{ transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 0.2s ease' }} />
    </UnstyledButton>
  );
}

export default function DiscordSettingsPage() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [channels, setChannels] = useState<DiscordChannel[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>({ credentials: false, server: false, dms: false });
  const toggleSection = (key: SectionKey) => setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));

  const fetchChannels = async () => {
    try {
      const response = await fetch('/api/channels');
      if (response.ok) {
        setChannels(await response.json());
      } else {
        showError('Failed to fetch channels');
      }
    } catch (error) {
      logger.error('Error fetching channels:', error);
      showError('An error occurred while fetching channels');
    } finally {
      setChannelsLoading(false);
    }
  };

  useEffect(() => {
    fetchChannels();
  }, []);

  const textChannels = channels.filter(ch => ch.channel_type === 'text');
  const channelLabel = (ch: DiscordChannel) => ch.channel_name || `Channel ${ch.discord_channel_id}`;

  const refreshChannelNames = async () => {
    try {
      setRefreshing(true);
      const response = await fetch('/api/channels/refresh-names', { method: 'POST' });
      if (response.ok) {
        const result = await response.json();
        showSuccess(`Refreshed ${result.updated_count} of ${result.total_channels} channels`);
        await fetchChannels();
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

  const flagsOf = (ch: DiscordChannel): Record<FlagKey, boolean> => ({
    send_announcements: Boolean(ch.send_announcements),
    send_reminders: Boolean(ch.send_reminders),
    send_match_start: Boolean(ch.send_match_start),
    send_signup_updates: Boolean(ch.send_signup_updates),
    send_health_alerts: Boolean(ch.send_health_alerts),
    send_series_updates: Boolean(ch.send_series_updates),
  });

  const deleteChannel = (ch: DiscordChannel) => {
    modals.openConfirmModal({
      title: 'Remove Channel',
      children: (
        <Text size="sm">
          {channelLabel(ch)} would have no notification types left, so it will be removed. This cannot be undone.
        </Text>
      ),
      labels: { confirm: 'Remove', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        try {
          const response = await fetch(`/api/channels/${ch.id}`, { method: 'DELETE' });
          if (response.ok) {
            showSuccess('Channel removed');
            await fetchChannels();
          } else {
            showError('Failed to remove channel');
          }
        } catch (error) {
          logger.error('Error deleting channel:', error);
          showError('An error occurred while removing the channel');
        }
      },
    });
  };

  const setChannelFlag = async (ch: DiscordChannel, flag: FlagKey, value: boolean) => {
    const next = { ...flagsOf(ch), [flag]: value };
    if (!Object.values(next).some(Boolean)) {
      deleteChannel(ch);
      return;
    }
    try {
      const response = await fetch(`/api/channels/${ch.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
      if (response.ok) {
        await fetchChannels();
      } else {
        showError('Failed to update notification settings');
      }
    } catch (error) {
      logger.error('Error updating notifications:', error);
      showError('An error occurred while updating settings');
    }
  };

  const form = useForm<DiscordSettings>({
    initialValues: {
      application_id: '',
      bot_token: '',
      guild_id: '',
      announcement_role_id: '',
      mention_everyone: false,
      voice_channel_category_id: '',
      voice_channel_cleanup_delay_minutes: 10,
      voice_channel_lead_minutes: 15,
      signup_dm_enabled: true,
      commander_dm_enabled: true,
    },
    // Optional here (the setup flow requires the first two); a filled-in value must be a real Discord ID.
    validate: {
      application_id: (v) => discordIdError(v, 'Application ID'),
      guild_id: (v) => discordIdError(v, 'Guild ID'),
      announcement_role_id: (v) => discordIdError(v, 'Announcement role ID'),
      voice_channel_category_id: (v) => discordIdError(v, 'Voice channel category ID'),
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
            voice_channel_cleanup_delay_minutes: data.discord.voice_channel_cleanup_delay_minutes ?? 10,
            voice_channel_lead_minutes: data.discord.voice_channel_lead_minutes ?? 15,
            signup_dm_enabled: data.discord.signup_dm_enabled !== undefined ? data.discord.signup_dm_enabled : true,
            commander_dm_enabled: data.discord.commander_dm_enabled !== undefined ? data.discord.commander_dm_enabled : true,
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
      const payload = {
        ...values,
        ...(values.bot_token && values.bot_token !== '••••••••' ? { bot_token: values.bot_token.trim() } : {}),
        ...(values.application_id ? { application_id: values.application_id.trim() } : {}),
        ...(values.guild_id ? { guild_id: values.guild_id.trim() } : {}),
        ...(values.announcement_role_id ? { announcement_role_id: values.announcement_role_id.trim() } : {}),
        ...(values.voice_channel_category_id ? { voice_channel_category_id: values.voice_channel_category_id.trim() } : {}),
      };
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
            voice_channel_cleanup_delay_minutes: refreshedData.voice_channel_cleanup_delay_minutes ?? 10,
            voice_channel_lead_minutes: refreshedData.voice_channel_lead_minutes ?? 15,
            signup_dm_enabled: refreshedData.signup_dm_enabled !== undefined ? refreshedData.signup_dm_enabled : true,
            commander_dm_enabled: refreshedData.commander_dm_enabled !== undefined ? refreshedData.commander_dm_enabled : true,
          });
        }
      } else {
        const body = await response.json().catch(() => ({} as { error?: string }));
        notificationHelper.error({
          title: 'Save Failed',
          message: body.error || 'Failed to save Discord settings.'
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
    <PageLayout>
      <form onSubmit={form.onSubmit(handleSubmit, (errors) => {
        setOpenSections(prev => ({
          credentials: prev.credentials || Boolean(errors.application_id),
          server: prev.server || Boolean(errors.guild_id || errors.announcement_role_id || errors.voice_channel_category_id),
          dms: prev.dms,
        }));
      })}>
        <Stack gap="lg">
          <PageHeader
            icon={IconBrandDiscord}
            title="Discord"
            subtitle="Bot connection, server configuration, player DMs and notification channels"
            breadcrumbs={[{ title: 'Settings', href: '/settings' }]}
            docLink="https://docs.matchexec.com/docs/settings/discord-settings/"
            action={
              <Group gap="xs">
                <Button variant="outline" leftSection={<IconRefresh size="1rem" />} onClick={refreshChannelNames} loading={refreshing}>
                  Refresh Names
                </Button>
                <Button component={Link} to="/settings/channels/create" leftSection={<IconPlus size="1rem" />}>
                  Add Channel
                </Button>
              </Group>
            }
          />

          {/* Where notifications post */}
          <div>
            <Group justify="space-between" align="baseline" mb="sm">
              <Text size="xs" fw={600} tt="uppercase" c="dimmed" style={{ letterSpacing: '0.05em' }}>Where notifications post</Text>
              {!channelsLoading && (
                <Text size="xs" c="dimmed">
                  {NOTIFICATION_TYPES.filter(t => textChannels.some(ch => ch[t.flag])).length} of {NOTIFICATION_TYPES.length} types have a channel
                </Text>
              )}
            </Group>
            <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
              {channelsLoading
                ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} height={120} radius="md" />)
                : NOTIFICATION_TYPES.map((type) => {
                  const assigned = textChannels.filter(ch => ch[type.flag]);
                  const available = textChannels.filter(ch => !ch[type.flag]);
                  const ok = assigned.length > 0;
                  return (
                    <Card
                      key={type.flag}
                      padding="md"
                      radius="md"
                      withBorder
                      style={ok ? undefined : { borderColor: 'rgba(255,107,107,0.45)' }}
                    >
                      <Stack gap="sm">
                        <Group gap={8} wrap="nowrap">
                          <span
                            aria-hidden
                            style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: ok ? '#51cf66' : '#ff6b6b', boxShadow: `0 0 8px ${ok ? '#51cf66' : '#ff6b6b'}` }}
                          />
                          <Text fw={600} size="sm" style={{ flex: 1 }}>{type.label}</Text>
                        </Group>
                        <Text size="xs" c="dimmed" mih={34}>{type.description}</Text>
                        <Group gap={6}>
                          {assigned.map(ch => (
                            <Group key={ch.id} gap={4} wrap="nowrap" px="xs" mih={{ base: 36, sm: 28 }} style={{ borderRadius: 4, background: 'var(--mantine-color-default-hover)' }}>
                              <IconHash size={13} style={{ opacity: 0.6 }} />
                              <Text size="sm">{channelLabel(ch)}</Text>
                              <ActionIcon
                                variant="transparent"
                                size="xs"
                                color="gray"
                                aria-label={`Stop sending ${type.label} to ${channelLabel(ch)}`}
                                onClick={() => setChannelFlag(ch, type.flag, false)}
                              >
                                <IconX size={13} />
                              </ActionIcon>
                            </Group>
                          ))}
                          {available.length > 0 ? (
                            <Menu position="bottom-start" withinPortal>
                              <Menu.Target>
                                <Button
                                  variant="default"
                                  size="compact-sm"
                                  mih={{ base: 36, sm: 28 }}
                                  leftSection={<IconPlus size={13} />}
                                  style={{ borderStyle: 'dashed', color: ok ? undefined : '#ff8787' }}
                                >
                                  {ok ? 'Add' : 'Assign a channel'}
                                </Button>
                              </Menu.Target>
                              <Menu.Dropdown>
                                {available.map(ch => (
                                  <Menu.Item key={ch.id} leftSection={<IconHash size={14} />} onClick={() => setChannelFlag(ch, type.flag, true)}>
                                    {channelLabel(ch)}
                                  </Menu.Item>
                                ))}
                              </Menu.Dropdown>
                            </Menu>
                          ) : (
                            <Button
                              component={Link}
                              to="/settings/channels/create"
                              variant="default"
                              size="compact-sm"
                              mih={{ base: 36, sm: 28 }}
                              leftSection={<IconPlus size={13} />}
                              style={{ borderStyle: 'dashed', color: ok ? undefined : '#ff8787' }}
                            >
                              {textChannels.length === 0 ? 'Add a channel' : 'New channel'}
                            </Button>
                          )}
                        </Group>
                      </Stack>
                    </Card>
                  );
                })}
            </SimpleGrid>
          </div>

          {/* Configuration */}
          <div>
            <Text size="xs" fw={600} tt="uppercase" c="dimmed" mb="sm" style={{ letterSpacing: '0.05em' }}>Configuration</Text>
            <Card padding={0} radius="md" withBorder style={{ overflow: 'hidden' }}>
              <SectionHeader
                icon={<IconKey size={18} />}
                title="Bot Credentials"
                summary={`Application ID ${shortId(form.values.application_id)} · Token ${form.values.bot_token ? 'set' : 'not set'}`}
                open={openSections.credentials}
                onToggle={() => toggleSection('credentials')}
              />
              <Collapse expanded={openSections.credentials}>
                <Stack gap="md" p="md" style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}>
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
              </Collapse>

              <SectionHeader
                icon={<IconServer size={18} />}
                title="Server Configuration"
                summary={`Guild ${shortId(form.values.guild_id)} · Voice category ${form.values.voice_channel_category_id ? 'set' : 'not set'} · Cleanup after ${form.values.voice_channel_cleanup_delay_minutes ?? 10} min · ${form.values.mention_everyone ? 'Mentions @everyone' : form.values.announcement_role_id ? 'Mentions role' : 'No mention'}`}
                open={openSections.server}
                onToggle={() => toggleSection('server')}
              />
              <Collapse expanded={openSections.server}>
                <Stack gap="md" p="md" style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}>
              {loading ? skeletonRows(3) : (
                <>
                  <TextInput
                    label="Guild ID"
                    placeholder="Discord server ID"
                    description="Right-click your Discord server and copy ID"
                    {...form.getInputProps('guild_id')}
                    disabled={loading}
                  />

                  <NumberInput
                    label="Create voice channels before match start (minutes)"
                    description="Voice channels are created this many minutes before a match's start time. A match started by hand gets its channels when it starts."
                    min={0} max={1440} allowDecimal={false}
                    {...form.getInputProps('voice_channel_lead_minutes')}
                  />
                  <NumberInput
                    label="Voice channel cleanup delay (minutes)"
                    description="After a match finishes, is cancelled, or is deleted, wait this long and then remove channels once everyone has left."
                    min={0} max={10080} allowDecimal={false}
                    {...form.getInputProps('voice_channel_cleanup_delay_minutes')}
                  />
                  <TextInput
                    label="Voice Channel Category ID"
                    placeholder="Category ID for auto-created voice channels"
                    description="Voice channels will be automatically created in this category shortly before matches start"
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
              </Collapse>

              <SectionHeader
                icon={<IconMessageCircle size={18} />}
                title="Player DM Notifications"
                summary={`Welcome DMs ${form.values.signup_dm_enabled ? 'on' : 'off'} · Commander DMs ${form.values.commander_dm_enabled ? 'on' : 'off'}`}
                open={openSections.dms}
                onToggle={() => toggleSection('dms')}
                last
              />
              <Collapse expanded={openSections.dms}>
                <Stack gap="md" p="md">
              {loading ? skeletonRows(2) : (
                <>
                  <Switch
                    label="Welcome DMs on Signup"
                    description="Send players a DM when they register for an event, with confirmation, slash commands, and what to expect."
                    checked={form.values.signup_dm_enabled}
                    onChange={(e) => form.setFieldValue('signup_dm_enabled', e.currentTarget.checked)}
                  />
                  <Switch
                    label="Commander Assignment DMs"
                    description="Send a DM when a player is designated as team commander, explaining their role and responsibilities."
                    checked={form.values.commander_dm_enabled}
                    onChange={(e) => form.setFieldValue('commander_dm_enabled', e.currentTarget.checked)}
                  />
                </>
              )}
                </Stack>
              </Collapse>
            </Card>
          </div>

          <SettingsSaveButton loading={saving} disabled={loading} />
        </Stack>
      </form>
    </PageLayout>
  );
}
