'use client'

import { Card, Text, Stack, Button, Group, NumberInput, Select } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useEffect, useState } from 'react';
import { notificationHelper } from '@/lib/notifications';
import { logger } from '@/lib/logger';

interface ApplicationSettings {
  event_duration_minutes?: number;
  match_reminder_minutes?: number;
  player_reminder_minutes?: number;
  log_level?: string;
}

export default function ApplicationSettingsPage() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [playerReminderValue, setPlayerReminderValue] = useState(2);
  const [playerReminderUnit, setPlayerReminderUnit] = useState('hours');

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

  const form = useForm<ApplicationSettings>({
    initialValues: {
      event_duration_minutes: 45,
      match_reminder_minutes: 10,
      player_reminder_minutes: 120,
      log_level: 'warning',
    },
  });

  useEffect(() => {
    async function fetchSettings() {
      setLoading(true);
      try {
        const [settingsResponse, logLevelResponse] = await Promise.all([
          fetch('/api/settings'),
          fetch('/api/settings/log-level')
        ]);

        if (settingsResponse.ok) {
          const data = await settingsResponse.json();

          // Get log level
          let logLevel = 'warning';
          if (logLevelResponse.ok) {
            const logLevelData = await logLevelResponse.json();
            logLevel = logLevelData.log_level || 'warning';
          }

          // Set Application form values
          form.setValues({
            event_duration_minutes: data.discord.event_duration_minutes || 45,
            match_reminder_minutes: data.discord.match_reminder_minutes || 10,
            player_reminder_minutes: data.discord.player_reminder_minutes || 120,
            log_level: logLevel,
          });

          // Set player reminder display values
          const playerReminderDisplay = minutesToValueUnit(data.discord.player_reminder_minutes || 120);
          setPlayerReminderValue(playerReminderDisplay.value);
          setPlayerReminderUnit(playerReminderDisplay.unit);
        }
      } catch (error) {
        logger.error('Error fetching settings:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchSettings();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async (values: ApplicationSettings) => {
    setSaving(true);

    try {
      // Convert player reminder display values to minutes
      const playerReminderMinutes = valueUnitToMinutes(playerReminderValue, playerReminderUnit);
      const discordPayload = {
        event_duration_minutes: values.event_duration_minutes,
        match_reminder_minutes: values.match_reminder_minutes,
        player_reminder_minutes: playerReminderMinutes
      };

      // Save Discord settings and log level in parallel
      const [discordResponse, logLevelResponse] = await Promise.all([
        fetch('/api/settings/discord', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(discordPayload),
        }),
        fetch('/api/settings/log-level', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ log_level: values.log_level }),
        })
      ]);

      if (discordResponse.ok && logLevelResponse.ok) {
        notificationHelper.success({
          title: 'Settings Saved',
          message: 'Application settings saved successfully!'
        });
      } else {
        notificationHelper.error({
          title: 'Save Failed',
          message: 'Failed to save application settings.'
        });
      }
    } catch (error) {
      logger.error('Error saving application settings:', error);
      notificationHelper.error({
        title: 'Connection Error',
        message: 'An error occurred while saving application settings.'
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <Stack gap="lg">
        <div>
          <Text size="xl" fw={700} mb="xs">Application Settings</Text>
          <Text size="sm" c="dimmed">Configure general application behavior and timing</Text>
        </div>

        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <form onSubmit={form.onSubmit(handleSubmit)}>
            <Stack gap="md">
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
                label="Match Reminder"
                placeholder="10"
                description="Minutes before match start to send reminder"
                min={1}
                max={1440}
                {...form.getInputProps('match_reminder_minutes')}
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
                <Button type="submit" loading={saving} disabled={loading}>
                  Save Application Settings
                </Button>
              </Group>
            </Stack>
          </form>
        </Card>

        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <form onSubmit={form.onSubmit(handleSubmit)}>
            <Stack gap="md">
              <div>
                <Text size="lg" fw={600} mb="xs">Log Level</Text>
                <Text size="sm" c="dimmed">Control the verbosity of application logs</Text>
              </div>

              <Select
                label="Log Level"
                description="Only log messages at or above this level will be displayed"
                placeholder="Select log level"
                data={[
                  { value: 'debug', label: 'Debug (Most verbose - all messages)' },
                  { value: 'info', label: 'Info (Informational messages and above)' },
                  { value: 'warning', label: 'Warning (Warnings and errors only) - Default' },
                  { value: 'error', label: 'Error (Errors only)' },
                  { value: 'critical', label: 'Critical (Critical failures only)' }
                ]}
                {...form.getInputProps('log_level')}
                disabled={loading}
              />

              <Group justify="flex-end" mt="lg">
                <Button type="submit" loading={saving} disabled={loading}>
                  Save Application Settings
                </Button>
              </Group>
            </Stack>
          </form>
        </Card>
      </Stack>
    </div>
  );
}