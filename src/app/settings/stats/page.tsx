'use client'

import {
  Card, Text, Stack, Button, Group, Switch, Select, PasswordInput, Badge, Divider, Skeleton, Collapse, ActionIcon, Alert
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useEffect, useState } from 'react';
import {
  IconChartBar, IconArrowUp, IconArrowDown, IconInfoCircle, IconCheck
} from '@tabler/icons-react';
import { showSuccess, showError } from '@/lib/notifications';

interface StatsSettings {
  enabled: boolean;
  both_sides_required: boolean;
  auto_advance_on_match: boolean;
  providers: Array<{ id: string; model: string; enabled: boolean; hasKey: boolean }>;
}

function AnthropicLogo({ size = '1.5rem' }: { size?: number | string }) {
  const px = typeof size === 'number' ? size : size;
  return (
    <svg width={px} height={px} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-2.266-.122-.571-.121L0 11.784l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.055-.157-.134-.098-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.145-.103.019-.073-.164-.274-1.355-2.446-1.446-2.49-.644-1.032-.17-.619a2.97 2.97 0 01-.104-.729L6.283.134 6.696 0l.996.134.42.364.62 1.414 1.002 2.229 1.555 3.03.456.898.243.832.091.255h.158V9.01l.128-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.584.28.48.685-.067.444-.286 1.851-.559 2.903-.364 1.942h.212l.243-.242.985-1.306 1.652-2.064.73-.82.85-.904.547-.431h1.033l.76 1.129-.34 1.166-1.064 1.347-.881 1.142-1.264 1.7-.79 1.36.073.11.188-.02 2.856-.606 1.543-.28 1.841-.315.833.388.091.395-.328.807-1.969.486-2.309.462-3.439.813-.042.03.049.061 1.549.146.662.036h1.622l3.02.225.79.522.474.638-.079.485-1.215.62-1.64-.389-3.829-.91-1.312-.329h-.182v.11l1.093 1.068 2.006 1.81 2.509 2.33.127.578-.322.455-.34-.049-2.205-1.657-.851-.747-1.926-1.62h-.128v.17l.444.649 2.345 3.521.122 1.08-.17.353-.608.213-.668-.122-1.374-1.925-1.415-2.167-1.143-1.943-.14.08-.674 7.254-.316.37-.729.28-.607-.461-.322-.747.322-1.476.389-1.924.315-1.53.286-1.9.17-.632-.012-.042-.14.018-1.434 1.967-2.18 2.945-1.726 1.845-.414.164-.717-.37.067-.662.401-.589 2.388-3.036 1.44-1.882.93-1.086-.006-.158h-.055L4.132 18.56l-1.13.146-.487-.456.061-.746.231-.243 1.908-1.312-.006.006z" fill="#D97757" fillRule="nonzero"/>
    </svg>
  );
}

function GeminiLogo({ size = '1.5rem' }: { size?: number | string }) {
  const px = typeof size === 'number' ? size : size;
  return (
    <svg width={px} height={px} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M12 2C12 2 13.5 8.5 18 10C13.5 11.5 12 18 12 18C12 18 10.5 11.5 6 10C10.5 8.5 12 2 12 2Z"
        fill="url(#gemini-grad)"
      />
      <defs>
        <linearGradient id="gemini-grad" x1="6" y1="2" x2="18" y2="18" gradientUnits="userSpaceOnUse">
          <stop stopColor="#4285F4" />
          <stop offset="1" stopColor="#8B5CF6" />
        </linearGradient>
      </defs>
    </svg>
  );
}

interface ProviderDescriptor {
  id: string;
  name: string;
  modelShortLabel: string;
  Icon: React.ComponentType<{ size?: number | string }>;
  models: { value: string; label: string }[];
  apiKeyPlaceholder: string;
  apiKeyLink: string;
}

// Model labels intentionally omit version numbers since they change frequently
const PROVIDER_REGISTRY: ProviderDescriptor[] = [
  {
    id: 'anthropic',
    name: 'Anthropic',
    modelShortLabel: 'Claude Sonnet',
    Icon: AnthropicLogo,
    models: [
      { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet (Recommended)' },
      { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku (Faster)' },
    ],
    apiKeyPlaceholder: 'sk-ant-...',
    apiKeyLink: 'https://platform.claude.com/docs/en/get-started',
  },
  {
    id: 'google',
    name: 'Google',
    modelShortLabel: 'Gemini Flash',
    Icon: GeminiLogo,
    models: [
      { value: 'gemini-2.5-pro', label: 'Gemini Pro (Recommended)' },
      { value: 'gemini-2.0-flash', label: 'Gemini Flash (Faster)' },
    ],
    apiKeyPlaceholder: 'AIza...',
    apiKeyLink: 'https://aistudio.google.com/app/apikey',
  },
];

interface ProviderRowState {
  id: string;
  apiKey: string;
  model: string;
  enabled: boolean;
  keyConfigured: boolean;
}

interface ProviderCardProps {
  descriptor: ProviderDescriptor;
  state: ProviderRowState;
  order: number; // 1-based if enabled, 0 if disabled
  isFirst: boolean;
  isLast: boolean;
  onToggleEnabled: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onApiKeyChange: (val: string) => void;
  onModelChange: (val: string) => void;
}

function ProviderCard({
  descriptor,
  state,
  order,
  isFirst,
  isLast,
  onToggleEnabled,
  onMoveUp,
  onMoveDown,
  onApiKeyChange,
  onModelChange,
}: ProviderCardProps) {
  const { Icon } = descriptor;
  const activeModel = descriptor.models.find(m => m.value === state.model);
  const modelLabel = activeModel
    ? activeModel.label.replace(' (Recommended)', '').replace(' (Faster)', '')
    : descriptor.modelShortLabel;

  const statusPill = state.enabled && state.keyConfigured
    ? <Badge color="green" size="sm" variant="light" style={{ fontWeight: 500 }}>Active</Badge>
    : state.enabled && !state.keyConfigured
    ? <Badge color="orange" size="sm" variant="light" style={{ fontWeight: 500 }}>No key</Badge>
    : null;

  return (
    <Card
      withBorder
      padding={0}
      style={{
        borderColor: state.enabled && state.keyConfigured
          ? 'var(--mantine-primary-color)'
          : undefined,
        transition: 'border-color 0.15s ease',
        overflow: 'hidden',
      }}
    >
      {/* Header row */}
      <Group
        px="md"
        py="sm"
        justify="space-between"
        wrap="nowrap"
      >
        <Group gap="sm" wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
          {/* Order badge */}
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              backgroundColor: state.enabled
                ? 'var(--mantine-primary-color)'
                : 'var(--mantine-color-dark-4)',
              color: state.enabled ? '#fff' : 'var(--mantine-color-dimmed)',
              fontSize: '0.75rem',
              fontWeight: 700,
              transition: 'background-color 0.15s ease',
            }}
          >
            {state.enabled ? order : '—'}
          </div>

          {/* Logo + name */}
          <div style={{ color: state.enabled ? undefined : 'var(--mantine-color-dimmed)', flexShrink: 0 }}>
            <Icon size="1.25rem" />
          </div>
          <div style={{ minWidth: 0 }}>
            <Text
              fw={600}
              size="sm"
              c={state.enabled ? undefined : 'dimmed'}
              style={{ transition: 'color 0.15s ease' }}
            >
              {descriptor.name}
            </Text>
            <Text size="xs" c="dimmed">
              {modelLabel}
              {state.keyConfigured && (
                <span style={{ color: 'var(--mantine-primary-color)' }}> · Key configured</span>
              )}
              {!state.keyConfigured && state.enabled && (
                <span> · No key set</span>
              )}
            </Text>
          </div>
        </Group>

        <Group gap="xs" wrap="nowrap">
          {statusPill}

          <ActionIcon
            variant="subtle"
            color="gray"
            size="sm"
            disabled={isFirst}
            onClick={onMoveUp}
            aria-label="Move up"
          >
            <IconArrowUp size="0.85rem" />
          </ActionIcon>
          <ActionIcon
            variant="subtle"
            color="gray"
            size="sm"
            disabled={isLast}
            onClick={onMoveDown}
            aria-label="Move down"
          >
            <IconArrowDown size="0.85rem" />
          </ActionIcon>

          <Switch
            checked={state.enabled}
            onChange={onToggleEnabled}
            color="teal"
            size="sm"
          />
        </Group>
      </Group>

      {/* Expanded body — shown only when enabled */}
      <Collapse in={state.enabled}>
        <Divider />
        <Stack gap="md" p="md">
          <div>
            <Group justify="space-between" mb={6}>
              <Text size="sm" fw={500}>API key</Text>
              <Text
                size="xs"
                c="teal"
                component="a"
                href={descriptor.apiKeyLink}
                target="_blank"
                rel="noopener noreferrer"
                style={{ textDecoration: 'none' }}
              >
                How do I get a {descriptor.name} key? ↗
              </Text>
            </Group>
            <PasswordInput
              placeholder={
                state.keyConfigured
                  ? `${descriptor.apiKeyPlaceholder.slice(0, 6)}••••••••`
                  : `Paste your API key here…`
              }
              value={state.apiKey}
              onChange={(e) => onApiKeyChange(e.currentTarget.value)}
              styles={{ input: { fontFamily: 'monospace' } }}
            />
            {state.keyConfigured && !state.apiKey && (
              <Group gap="xs" mt="xs">
                <IconCheck size="0.85rem" color="var(--mantine-color-green-5)" />
                <Text size="xs" c="green">Key configured</Text>
              </Group>
            )}
          </div>

          <Select
            label="Model"
            description={`The ${descriptor.name} model used for scorecard image analysis in MatchExec`}
            data={descriptor.models}
            value={state.model}
            onChange={(val) => onModelChange(val ?? descriptor.models[0].value)}
          />
        </Stack>
      </Collapse>
    </Card>
  );
}

export default function StatsSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [providers, setProviders] = useState<ProviderRowState[]>(
    PROVIDER_REGISTRY.map((p, i) => ({
      id: p.id,
      apiKey: '',
      model: p.models[0].value,
      enabled: i === 0,
      keyConfigured: false,
    }))
  );

  const form = useForm({
    initialValues: {
      enabled: false,
      both_sides_required: false,
      auto_advance_on_match: false,
    },
  });

  useEffect(() => {
    fetch('/api/settings/stats')
      .then((r) => r.json())
      .then((data: StatsSettings) => {
        form.setValues({
          enabled: data.enabled,
          both_sides_required: data.both_sides_required,
          auto_advance_on_match: data.auto_advance_on_match,
        });

        setProviders(
          PROVIDER_REGISTRY.map((p) => {
            const saved = (data.providers ?? []).find(s => s.id === p.id);
            return {
              id: p.id,
              apiKey: '',
              model: saved?.model ?? p.models[0].value,
              enabled: saved?.enabled ?? false,
              keyConfigured: saved?.hasKey ?? false,
            };
          })
        );
      })
      .catch(() => showError('Failed to load stats settings'))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleToggleProvider = (id: string) => {
    setProviders(prev =>
      prev.map(p => p.id === id ? { ...p, enabled: !p.enabled } : p)
    );
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    setProviders(prev => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
  };

  const handleMoveDown = (index: number) => {
    setProviders(prev => {
      if (index >= prev.length - 1) return prev;
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next;
    });
  };

  const handleSave = async (formValues: { enabled: boolean; both_sides_required: boolean; auto_advance_on_match: boolean }) => {
    setSaving(true);
    try {
      const body = {
        ...formValues,
        providers: providers.map((p, i) => ({
          id: p.id,
          model: p.model,
          enabled: p.enabled,
          sortOrder: i,
          ...(p.apiKey ? { apiKey: p.apiKey } : {}),
        })),
      };

      const res = await fetch('/api/settings/stats', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error('Save failed');
      showSuccess('Stats settings saved');

      // Refresh key-configured state
      const updated = await fetch('/api/settings/stats').then((r) => r.json()) as StatsSettings;
      setProviders(prev =>
        prev.map(p => {
          const savedProvider = (updated.providers ?? []).find(s => s.id === p.id);
          return { ...p, apiKey: '', keyConfigured: savedProvider?.hasKey ?? false };
        })
      );

    } catch {
      showError('Failed to save stats settings');
    } finally {
      setSaving(false);
    }
  };

  const enabledCount = providers.filter(p => p.enabled).length;

  // Precompute 1-based order for each enabled provider
  const providerOrders = (() => {
    let n = 0;
    return providers.map(p => (p.enabled ? ++n : 0));
  })();

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto">
        <Stack gap="lg">
          <Skeleton height={200} />
          <Skeleton height={300} />
        </Stack>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
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

          {/* AI Providers */}
          <Stack gap="sm">
            <Group justify="space-between">
              <Text size="xs" fw={700} tt="uppercase" c="dimmed" style={{ letterSpacing: '0.08em' }}>
                AI Providers
              </Text>
              <Text size="xs" c="dimmed">{enabledCount} active</Text>
            </Group>

            <Alert
              icon={<IconInfoCircle size="1rem" />}
              variant="light"
              color="gray"
              p="sm"
              styles={{
                root: {
                  borderLeft: '3px solid var(--mantine-color-teal-5)',
                  borderRadius: 'var(--mantine-radius-sm)',
                  backgroundColor: 'var(--mantine-color-dark-7)',
                },
              }}
            >
              <Text size="sm">
                MatchExec uses the active providers below for stats extraction. Configure as many services as you want, they will be used in the order listed.
              </Text>
            </Alert>

            <Stack gap="sm">
              {providers.map((providerState, index) => {
                const descriptor = PROVIDER_REGISTRY.find(d => d.id === providerState.id)!;

                return (
                  <ProviderCard
                    key={providerState.id}
                    descriptor={descriptor}
                    state={providerState}
                    order={providerOrders[index]}
                    isFirst={index === 0}
                    isLast={index === providers.length - 1}
                    onToggleEnabled={() => handleToggleProvider(providerState.id)}
                    onMoveUp={() => handleMoveUp(index)}
                    onMoveDown={() => handleMoveDown(index)}
                    onApiKeyChange={(val) =>
                      setProviders(prev =>
                        prev.map(p => p.id === providerState.id ? { ...p, apiKey: val } : p)
                      )
                    }
                    onModelChange={(val) =>
                      setProviders(prev =>
                        prev.map(p => p.id === providerState.id ? { ...p, model: val } : p)
                      )
                    }
                  />
                );
              })}
            </Stack>
          </Stack>

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
