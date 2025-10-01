'use client'

import { Text, Stack, Group } from '@mantine/core';
import { useEffect, useState } from 'react';
import { IconClock } from '@tabler/icons-react';
import SchedulerConfig from '@/components/SchedulerConfig';
import { notificationHelper } from '@/lib/notifications';
import { logger } from '@/lib/logger/client';

interface SchedulerSettings {
  match_check_cron: string;
  cleanup_check_cron: string;
  channel_refresh_cron: string;
}

export default function SchedulerSettingsPage() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [schedulerSettings, setSchedulerSettings] = useState<SchedulerSettings>({
    match_check_cron: '0 */1 * * * *',
    cleanup_check_cron: '0 0 2 * * *',
    channel_refresh_cron: '0 0 0 * * *',
  });

  useEffect(() => {
    async function fetchSettings() {
      setLoading(true);
      try {
        const response = await fetch('/api/settings');
        
        if (response.ok) {
          const data = await response.json();
          
          // Set Scheduler settings
          setSchedulerSettings(data.scheduler);
        }
      } catch (error) {
        logger.error('Error fetching settings:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchSettings();
  }, []);

  const handleSchedulerSubmit = async (values: SchedulerSettings) => {
    setSaving(true);

    try {
      const response = await fetch('/api/settings/scheduler', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });

      if (response.ok) {
        notificationHelper.success({
          title: 'Settings Saved',
          message: 'Scheduler settings saved successfully!'
        });
      } else {
        const errorData = await response.json();
        notificationHelper.error({
          title: 'Save Failed',
          message: errorData.error || 'Failed to save scheduler settings.'
        });
      }
    } catch (error) {
      logger.error('Error saving scheduler settings:', error);
      notificationHelper.error({
        title: 'Connection Error',
        message: 'An error occurred while saving scheduler settings.'
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
            <IconClock size="1.5rem" />
            <div>
              <Text size="xl" fw={700}>Scheduler Settings</Text>
              <Text size="sm" c="dimmed">Configure automated tasks and their timing</Text>
            </div>
          </Group>
        </div>

        <SchedulerConfig
          value={schedulerSettings}
          onChange={setSchedulerSettings}
          onSubmit={handleSchedulerSubmit}
          loading={loading}
          saving={saving}
        />
      </Stack>
    </div>
  );
}