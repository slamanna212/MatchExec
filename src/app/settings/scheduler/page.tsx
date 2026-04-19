'use client'

import { Stack, Group, Card, Skeleton } from '@mantine/core';
import { SettingsSaveButton } from '@/components/SettingsSaveButton';
import { useEffect, useState } from 'react';
import { IconClock } from '@tabler/icons-react';
import SchedulerConfig from '@/components/SchedulerConfig';
import { notificationHelper } from '@/lib/notifications';
import { logger } from '@/lib/logger/client';
import { PageLayout } from '@/components/PageLayout';
import { PageHeader } from '@/components/PageHeader';

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
    <PageLayout narrow>
      <Stack gap="lg">
        <PageHeader
          icon={IconClock}
          title="Scheduler Settings"
          subtitle="Configure automated tasks and their timing"
        />

        {loading ? (
          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Stack gap="lg">
              {Array.from({ length: 3 }).map((_, i) => (
                <Stack key={i} gap="xs">
                  <Skeleton height={14} width={120} />
                  <Skeleton height={12} width={200} />
                  <Group gap="xs">
                    <Skeleton height={36} width={80} />
                    <Skeleton height={36} width={100} />
                  </Group>
                </Stack>
              ))}
            </Stack>
          </Card>
        ) : (
          <SchedulerConfig
            value={schedulerSettings}
            onChange={setSchedulerSettings}
            loading={loading}
          />
        )}

        <SettingsSaveButton
          type="button"
          onClick={() => handleSchedulerSubmit(schedulerSettings)}
          loading={saving}
          disabled={loading}
        />
      </Stack>
    </PageLayout>
  );
}