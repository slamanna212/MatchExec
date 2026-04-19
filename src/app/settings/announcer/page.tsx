'use client'

import { Card, Text, Stack, Group, Grid, NumberInput, Skeleton, Switch, Badge, ThemeIcon } from '@mantine/core';
import { SettingsSaveButton } from '@/components/SettingsSaveButton';
import { useForm } from '@mantine/form';
import { useEffect, useState } from 'react';
import { IconVolume, IconCrown, IconPlayFootball, IconRadio, IconMicrophone, IconMicrophone2, IconCheck } from '@tabler/icons-react';
import { notificationHelper } from '@/lib/notifications';
import { logger } from '@/lib/logger/client';
import { PageLayout } from '@/components/PageLayout';
import { PageHeader } from '@/components/PageHeader';

interface AnnouncerSettings {
  announcer_voice?: string;
  voice_announcements_enabled?: boolean;
  match_start_delay_seconds?: number;
}

interface Voice {
  id: string;
  name: string;
}

const VOICE_META: Record<string, { icon: React.ComponentType<{ size: number | string }>; color: string; description: string }> = {
  'aria': {
    icon: IconCrown,
    color: 'violet',
    description: 'Neutral, professional stadium presence',
  },
  'british-football': {
    icon: IconPlayFootball,
    color: 'green',
    description: 'High-energy Premier League commentary',
  },
  'london-radio': {
    icon: IconRadio,
    color: 'blue',
    description: 'Smooth BBC broadcast delivery',
  },
  'wrestling-announcer': {
    icon: IconMicrophone2,
    color: 'orange',
    description: 'Over-the-top WWE arena hype',
  },
};

const VOICE_GLOW: Record<string, string> = {
  violet: 'rgba(139, 92, 246, 0.25)',
  green:  'rgba(34, 197, 94, 0.25)',
  blue:   'rgba(59, 130, 246, 0.25)',
  orange: 'rgba(230, 126, 34, 0.25)',
};

const VOICE_BORDER: Record<string, string> = {
  violet: 'var(--mantine-color-violet-5)',
  green:  'var(--mantine-color-green-5)',
  blue:   'var(--mantine-color-blue-5)',
  orange: 'var(--mantine-color-orange-5)',
};

const VOICE_BG: Record<string, string> = {
  violet: 'rgba(139, 92, 246, 0.07)',
  green:  'rgba(34, 197, 94, 0.07)',
  blue:   'rgba(59, 130, 246, 0.07)',
  orange: 'rgba(230, 126, 34, 0.07)',
};

export default function AnnouncerSettingsPage() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [availableVoices, setAvailableVoices] = useState<Voice[]>([]);

  const form = useForm<AnnouncerSettings>({
    initialValues: {
      announcer_voice: 'wrestling-announcer',
      voice_announcements_enabled: false,
      match_start_delay_seconds: 45,
    },
  });

  useEffect(() => {
    async function fetchSettings() {
      setLoading(true);
      try {
        const response = await fetch('/api/settings');

        if (response.ok) {
          const data = await response.json();
          setAvailableVoices(data.voices.map((voice: {id: string; name: string}) => ({
            id: voice.id,
            name: voice.name
          })));
          form.setValues(data.announcer);
        }
      } catch (error) {
        logger.error('Error fetching settings:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchSettings();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async (values: AnnouncerSettings) => {
    setSaving(true);

    try {
      const response = await fetch('/api/settings/announcer', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });

      if (response.ok) {
        notificationHelper.success({
          title: 'Settings Saved',
          message: 'Announcer settings saved successfully!'
        });
        const refreshResponse = await fetch('/api/settings/announcer');
        if (refreshResponse.ok) {
          const refreshedData = await refreshResponse.json();
          form.setValues(refreshedData);
        }
      } else {
        const errorData = await response.json();
        notificationHelper.error({
          title: 'Save Failed',
          message: errorData.error || 'Failed to save announcer settings.'
        });
      }
    } catch (error) {
      logger.error('Error saving announcer settings:', error);
      notificationHelper.error({
        title: 'Connection Error',
        message: 'An error occurred while saving announcer settings.'
      });
    } finally {
      setSaving(false);
    }
  };

  const isEnabled = form.values.voice_announcements_enabled;

  return (
    <PageLayout narrow>
      <form onSubmit={form.onSubmit(handleSubmit)}>
        <Stack gap="lg">
          <PageHeader
            icon={IconVolume}
            title="Announcer Settings"
            subtitle="Configure voice announcements for matches"
          />

          {/* Card 1: Voice Control toggle */}
          <Card shadow="sm" padding="lg" radius="md" withBorder>
            {loading ? (
              <Stack gap={4}>
                <Skeleton height={14} width={160} />
                <Skeleton height={28} width={80} />
              </Stack>
            ) : (
              <Group justify="space-between" align="center">
                <Switch
                  color="violet"
                  label="Voice Announcements"
                  description="Enable voice announcements in Discord voice channels"
                  styles={{ body: { alignItems: 'center' } }}
                  {...form.getInputProps('voice_announcements_enabled', { type: 'checkbox' })}
                  disabled={loading}
                />
                {isEnabled && (
                  <Badge color="red" variant="filled" size="md" style={{ flexShrink: 0 }}>
                    <span className="live-pulse-dot" />
                    ON AIR
                  </Badge>
                )}
              </Group>
            )}
          </Card>

          {/* Card 2: Announcement Timing (conditional) */}
          {!loading && isEnabled && (
            <Card shadow="sm" padding="lg" radius="md" withBorder>
              <Stack gap="md">
                <div>
                  <Text size="md" fw={600} mb={2}>Announcement Timing</Text>
                  <Text size="sm" c="dimmed">Control when the announcer speaks after a match begins</Text>
                </div>
                <NumberInput
                  label="Match Start Delay"
                  description="Seconds between match start and the announcer's opening message"
                  min={0}
                  max={300}
                  suffix=" sec"
                  {...form.getInputProps('match_start_delay_seconds')}
                  disabled={loading}
                />
              </Stack>
            </Card>
          )}

          {/* Voice Selection (conditional) — no outer card, sits directly on page */}
          {!loading && isEnabled && (
            <Stack gap="md">
              <div>
                <Text size="md" fw={600} mb={2}>Announcer Voice</Text>
                <Text size="sm" c="dimmed">Choose the personality for match announcements</Text>
              </div>

              <Grid>
                {availableVoices.map((voice) => {
                    const meta = VOICE_META[voice.id] ?? { icon: IconMicrophone, color: 'gray', description: '' };
                    const { icon: IconComponent, color, description } = meta;
                    const selected = form.values.announcer_voice === voice.id;

                    return (
                      <Grid.Col span={{ base: 12, sm: 6 }} key={voice.id}>
                        <div
                          style={{
                            padding: 'var(--mantine-spacing-xl)',
                            borderRadius: 'var(--mantine-radius-md)',
                            border: `${selected ? 2 : 1}px solid ${selected ? VOICE_BORDER[color] : 'var(--mantine-color-dark-4)'}`,
                            backgroundColor: selected ? VOICE_BG[color] : 'var(--mantine-color-dark-6)',
                            boxShadow: selected ? `0 0 16px ${VOICE_GLOW[color]}` : undefined,
                            cursor: 'pointer',
                            position: 'relative',
                            transition: 'box-shadow 0.15s ease, border-color 0.15s ease, background-color 0.15s ease',
                          }}
                          onClick={() => form.setFieldValue('announcer_voice', voice.id)}
                        >
                          {selected && (
                            <ThemeIcon
                              size={24}
                              radius="xl"
                              color={color}
                              variant="filled"
                              style={{ position: 'absolute', top: 12, right: 12 }}
                            >
                              <IconCheck size={14} />
                            </ThemeIcon>
                          )}

                          <Stack gap="xs" align="flex-start">
                            <ThemeIcon size={52} radius="xl" color={color} variant="light">
                              <IconComponent size={28} />
                            </ThemeIcon>
                            <Text size="md" fw={700}>{voice.name}</Text>
                            <Text size="xs" c="dimmed">{description}</Text>
                          </Stack>
                        </div>
                      </Grid.Col>
                    );
                  })}
              </Grid>
            </Stack>
          )}

          {/* Loading skeleton for conditional cards */}
          {loading && (
            <>
              <Card shadow="sm" padding="lg" radius="md" withBorder>
                <Stack gap="md">
                  <Stack gap={4}>
                    <Skeleton height={14} width={160} />
                    <Skeleton height={12} width={260} />
                  </Stack>
                  <Skeleton height={36} />
                </Stack>
              </Card>
              <Card shadow="sm" padding="lg" radius="md" withBorder>
                <Stack gap="md">
                  <Stack gap={4}>
                    <Skeleton height={14} width={120} />
                    <Skeleton height={12} width={220} />
                  </Stack>
                  <Grid>
                    {Array.from({ length: 4 }).map((_, i) => (
                      <Grid.Col span={{ base: 12, sm: 6 }} key={i}>
                        <Skeleton height={130} radius="md" />
                      </Grid.Col>
                    ))}
                  </Grid>
                </Stack>
              </Card>
            </>
          )}

          <SettingsSaveButton loading={saving} disabled={loading} />
        </Stack>
      </form>
    </PageLayout>
  );
}
