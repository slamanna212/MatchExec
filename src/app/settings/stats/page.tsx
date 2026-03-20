'use client'

import {
  Card, Text, Stack, Button, Group, Switch, Select, PasswordInput, Badge, Divider, Skeleton
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useEffect, useState } from 'react';
import { IconChartBar, IconBrain } from '@tabler/icons-react';
import { showSuccess, showError } from '@/lib/notifications';

interface StatsSettings {
  enabled: boolean;
  ai_provider: string;
  ai_api_key: string;
  ai_model: string;
  both_sides_required: boolean;
  auto_advance_on_match: boolean;
}

const AI_MODELS = [
  { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4 (Recommended)' },
  { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (Faster)' },
];

export default function StatsSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false);

  const form = useForm<StatsSettings>({
    initialValues: {
      enabled: false,
      ai_provider: 'anthropic',
      ai_api_key: '',
      ai_model: 'claude-sonnet-4-20250514',
      both_sides_required: false,
      auto_advance_on_match: false,
    },
  });

  useEffect(() => {
    fetch('/api/settings/stats')
      .then((r) => r.json())
      .then((data: StatsSettings) => {
        setApiKeyConfigured(data.ai_api_key === '***configured***');
        form.setValues({
          ...data,
          ai_api_key: '', // don't pre-fill masked key
        });
      })
      .catch(() => showError('Failed to load stats settings'))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = async (values: StatsSettings) => {
    setSaving(true);
    try {
      const body = { ...values };
      // Don't send empty key if already configured and no new key entered
      if (!body.ai_api_key && apiKeyConfigured) {
        body.ai_api_key = '***configured***';
      }

      const res = await fetch('/api/settings/stats', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error('Save failed');
      showSuccess('Stats settings saved');

      // Re-fetch to update configured state
      const updated = await fetch('/api/settings/stats').then((r) => r.json()) as StatsSettings;
      setApiKeyConfigured(updated.ai_api_key === '***configured***');
    } catch {
      showError('Failed to save stats settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto">
        <Stack gap="lg">
          <Skeleton height={200} />
          <Skeleton height={300} />
        </Stack>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <form onSubmit={form.onSubmit(handleSave)}>
        <Stack gap="lg">
          <Group>
            <IconChartBar size="2rem" />
            <div>
              <Text size="xl" fw={700}>Stats Settings</Text>
              <Text size="sm" c="dimmed">Configure AI-powered scorecard analysis and stat tracking</Text>
            </div>
          </Group>

          {/* General Settings */}
          <Card withBorder padding="lg">
            <Stack gap="md">
              <Text fw={600} size="lg">General Settings</Text>
              <Divider />

              <Switch
                label="Enable Stats Feature"
                description="Allow match commanders to upload scorecards for AI analysis"
                checked={form.values.enabled}
                onChange={(e) => form.setFieldValue('enabled', e.currentTarget.checked)}
              />

              <Switch
                label="Require Both Sides"
                description="Both team commanders must submit scorecards. If stats match, the map auto-advances."
                checked={form.values.both_sides_required}
                onChange={(e) => form.setFieldValue('both_sides_required', e.currentTarget.checked)}
              />

              <Switch
                label="Auto-Advance on Match"
                description="Automatically progress to next map when submitted scorecards agree."
                checked={form.values.auto_advance_on_match}
                onChange={(e) => form.setFieldValue('auto_advance_on_match', e.currentTarget.checked)}
              />
            </Stack>
          </Card>

          {/* AI Provider */}
          <Card withBorder padding="lg">
            <Stack gap="md">
              <Group justify="space-between">
                <Group gap="sm">
                  <IconBrain size="1.3rem" />
                  <Text fw={600} size="lg">AI Provider</Text>
                </Group>
                {apiKeyConfigured ? (
                  <Badge color="green" variant="light">Configured</Badge>
                ) : (
                  <Badge color="red" variant="light">Not Configured</Badge>
                )}
              </Group>
              <Text size="sm" c="dimmed">Configure AI model for scorecard image analysis</Text>
              <Divider />

              <PasswordInput
                label="Anthropic API Key"
                description={apiKeyConfigured ? 'API key is configured. Enter a new key to replace it.' : 'Enter your Anthropic API key'}
                placeholder={apiKeyConfigured ? '••••••••••••••••' : 'sk-ant-...'}
                {...form.getInputProps('ai_api_key')}
              />

              <Select
                label="Model"
                description="Select the Claude model to use for scorecard analysis"
                data={AI_MODELS}
                {...form.getInputProps('ai_model')}
              />
            </Stack>
          </Card>

          <Group justify="flex-end">
            <Button type="submit" loading={saving}>
              Save Settings
            </Button>
          </Group>
        </Stack>
      </form>
    </div>
  );
}
