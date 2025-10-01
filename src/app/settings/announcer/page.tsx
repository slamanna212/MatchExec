'use client'

import { Card, Text, Stack, Button, Group, Checkbox, Box, Grid } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useEffect, useState } from 'react';
import { IconVolume, IconCrown, IconPlayFootball, IconRadio, IconMicrophone, IconMicrophone2 } from '@tabler/icons-react';
import { notificationHelper } from '@/lib/notifications';
import { logger } from '@/lib/logger/client';

interface AnnouncerSettings {
  announcer_voice?: string;
  voice_announcements_enabled?: boolean;
  announcement_voice_channel?: string;
}

interface Voice {
  id: string;
  name: string;
}

export default function AnnouncerSettingsPage() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [availableVoices, setAvailableVoices] = useState<Voice[]>([]);

  // Helper function to get icon for voice type
  const getVoiceIcon = (voiceId: string) => {
    switch (voiceId) {
      case 'aria':
        return IconCrown;
      case 'british-football':
        return IconPlayFootball;
      case 'london-radio':
        return IconRadio;
      case 'wrestling-announcer':
        return IconMicrophone2;
      default:
        return IconMicrophone;
    }
  };

  const form = useForm<AnnouncerSettings>({
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
        const response = await fetch('/api/settings');
        
        if (response.ok) {
          const data = await response.json();
          
          // Set available voices
          setAvailableVoices(data.voices.map((voice: {id: string; name: string}) => ({
            id: voice.id,
            name: voice.name
          })));
          
          // Set Announcer form values
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
        // Refresh the form to get the latest data
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

  return (
    <div className="max-w-4xl mx-auto">
      <Stack gap="lg">
        <div>
          <Group>
            <IconVolume size="1.5rem" />
            <div>
              <Text size="xl" fw={700}>Announcer Settings</Text>
              <Text size="sm" c="dimmed">Configure voice announcements for matches</Text>
            </div>
          </Group>
        </div>

        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <form onSubmit={form.onSubmit(handleSubmit)}>
            <Stack gap="md">
              <Checkbox
                label="Voice Announcements"
                description="Enable voice announcements in Discord voice channels"
                {...form.getInputProps('voice_announcements_enabled', { type: 'checkbox' })}
                disabled={loading}
              />

              {form.values.voice_announcements_enabled && (
                <>
                  <Box>
                    <Text size="sm" fw={500} mb="xs">Announcer Voice</Text>
                    <Text size="xs" c="dimmed" mb="md">Select the voice style for match announcements</Text>
                    
                    <Grid>
                      {availableVoices.map((voice) => {
                        const IconComponent = getVoiceIcon(voice.id);
                        return (
                          <Grid.Col span={{ base: 12, sm: 6 }} key={voice.id}>
                            <Card 
                              shadow="sm" 
                              padding="md" 
                              radius="md" 
                              withBorder
                              style={{ 
                                cursor: 'pointer',
                                backgroundColor: form.values.announcer_voice === voice.id ? 'var(--mantine-primary-color-light)' : undefined,
                                borderColor: form.values.announcer_voice === voice.id ? 'var(--mantine-primary-color)' : undefined
                              }}
                              onClick={() => form.setFieldValue('announcer_voice', voice.id)}
                            >
                              <Group gap="sm">
                                <IconComponent size="1.5rem" />
                                <Text fw={form.values.announcer_voice === voice.id ? 600 : 400}>
                                  {voice.name}
                                </Text>
                              </Group>
                            </Card>
                          </Grid.Col>
                        );
                      })}
                    </Grid>
                  </Box>
                </>
              )}

              <Group justify="flex-end" mt="lg">
                <Button type="submit" loading={saving} disabled={loading}>
                  Save Announcer Settings
                </Button>
              </Group>
            </Stack>
          </form>
        </Card>
      </Stack>
    </div>
  );
}