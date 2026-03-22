'use client'

import {
  Card, Text, Stack, Button, Group, Switch, Select, PasswordInput, Badge, Divider, Skeleton, ActionIcon, Alert, Modal, SimpleGrid
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useDisclosure } from '@mantine/hooks';
import { useEffect, useState } from 'react';
import {
  IconChartBar, IconArrowUp, IconArrowDown, IconInfoCircle, IconCheck, IconTrash, IconPlus
} from '@tabler/icons-react';
import { showSuccess, showError } from '@/lib/notifications';
import { PROVIDER_REGISTRY, type ProviderDescriptor } from '@/components/settings/stats/ai-provider-registry';

interface StatsSettings {
  enabled: boolean;
  both_sides_required: boolean;
  auto_advance_on_match: boolean;
  providers: Array<{ instanceId: string; providerId: string; model: string; hasKey: boolean }>;
}

interface ProviderInstance {
  instanceId: string;
  providerId: string;
  model: string;
  apiKey: string;
  keyConfigured: boolean;
}

interface ProviderCardProps {
  descriptor: ProviderDescriptor;
  state: ProviderInstance;
  order: number;
  isFirst: boolean;
  isLast: boolean;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onApiKeyChange: (val: string) => void;
}

function ProviderCard({
  descriptor,
  state,
  order,
  isFirst,
  isLast,
  onDelete,
  onMoveUp,
  onMoveDown,
  onApiKeyChange,
}: ProviderCardProps) {
  const { Icon } = descriptor;
  const activeModel = descriptor.models.find(m => m.value === state.model);
  const modelLabel = activeModel
    ? activeModel.label.replace(' (Recommended)', '').replace(' (Faster)', '')
    : descriptor.modelShortLabel;

  const statusPill = state.keyConfigured
    ? <Badge color="green" size="sm" variant="light" style={{ fontWeight: 500 }}>Active</Badge>
    : <Badge color="orange" size="sm" variant="light" style={{ fontWeight: 500 }}>No key</Badge>;

  return (
    <Card
      padding={0}
      style={{
        border: `1px solid ${state.keyConfigured ? 'var(--mantine-primary-color)' : 'var(--mantine-color-default-border)'}`,
        transition: 'border-color 0.15s ease',
        overflow: 'hidden',
      }}
    >
      {/* Header row */}
      <Group px="md" py="sm" justify="space-between" wrap="nowrap">
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
              backgroundColor: 'var(--mantine-color-violet-6)',
              color: '#fff',
              fontSize: '0.75rem',
              fontWeight: 700,
            }}
          >
            {order}
          </div>

          {/* Logo + name */}
          <div style={{ flexShrink: 0 }}>
            <Icon size="1.25rem" />
          </div>
          <div style={{ minWidth: 0 }}>
            <Text fw={600} size="sm">
              {descriptor.name}
            </Text>
            <Text size="xs" c="dimmed">
              {modelLabel}
              {state.keyConfigured && (
                <span style={{ color: 'var(--mantine-primary-color)' }}> · Key configured</span>
              )}
              {!state.keyConfigured && (
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
          <ActionIcon
            variant="subtle"
            color="red"
            size="sm"
            onClick={onDelete}
            aria-label="Remove provider"
          >
            <IconTrash size="0.85rem" />
          </ActionIcon>
        </Group>
      </Group>

      {/* Always-visible API key section */}
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
      </Stack>
    </Card>
  );
}

export default function StatsSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [providers, setProviders] = useState<ProviderInstance[]>([]);

  const [deleteModal, { open: openDelete, close: closeDelete }] = useDisclosure(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [addModal, { open: openAdd, close: closeAdd }] = useDisclosure(false);
  const [addStep, setAddStep] = useState<1 | 2>(1);
  const [addProviderId, setAddProviderId] = useState<string | null>(null);
  const [addModel, setAddModel] = useState('');
  const [addApiKey, setAddApiKey] = useState('');

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
          (data.providers ?? []).map(p => ({
            instanceId: p.instanceId,
            providerId: p.providerId,
            model: p.model,
            apiKey: '',
            keyConfigured: p.hasKey,
          }))
        );
      })
      .catch(() => showError('Failed to load stats settings'))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const handleApiKeyChange = (providerId: string, val: string) => {
    setProviders(prev =>
      prev.map(p => p.providerId === providerId ? { ...p, apiKey: val } : p)
    );
  };

  const requestDelete = (instanceId: string) => {
    setPendingDeleteId(instanceId);
    openDelete();
  };

  const handleDeleteProvider = () => {
    if (!pendingDeleteId) return;
    setProviders(prev => prev.filter(p => p.instanceId !== pendingDeleteId));
    closeDelete();
    setPendingDeleteId(null);
  };

  // Add modal helpers
  const addedModelKeys = providers.map(p => `${p.providerId}-${p.model}`);
  const fullyAddedProviderIds = PROVIDER_REGISTRY
    .filter(p => p.models.every(m => addedModelKeys.includes(`${p.id}-${m.value}`)))
    .map(p => p.id);

  const handleSelectProvider = (providerId: string) => {
    const descriptor = PROVIDER_REGISTRY.find(d => d.id === providerId)!;
    const firstAvailable = descriptor.models.find(
      m => !addedModelKeys.includes(`${providerId}-${m.value}`)
    );
    setAddProviderId(providerId);
    setAddModel(firstAvailable?.value ?? '');
    setAddStep(2);
  };

  const existingKeyConfigured = addProviderId
    ? providers.some(p => p.providerId === addProviderId && p.keyConfigured)
    : false;

  const handleAddProvider = () => {
    if (!addProviderId || !addModel) return;
    const instanceId = `${addProviderId}-${addModel}`;
    const newInstance: ProviderInstance = {
      instanceId,
      providerId: addProviderId,
      model: addModel,
      apiKey: addApiKey,
      keyConfigured: existingKeyConfigured,
    };
    const nextProviders = [...providers, newInstance];
    setProviders(nextProviders);
    handleCloseAddModal();
    saveProviders(nextProviders, form.values);
  };

  const handleCloseAddModal = () => {
    setAddStep(1);
    setAddProviderId(null);
    setAddModel('');
    setAddApiKey('');
    closeAdd();
  };

  const saveProviders = async (providerList: ProviderInstance[], formValues: { enabled: boolean; both_sides_required: boolean; auto_advance_on_match: boolean }) => {
    setSaving(true);
    try {
      const body = {
        ...formValues,
        providers: providerList.map((p, i) => ({
          instanceId: p.instanceId,
          providerId: p.providerId,
          model: p.model,
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
          const savedProvider = (updated.providers ?? []).find(s => s.instanceId === p.instanceId);
          return { ...p, apiKey: '', keyConfigured: savedProvider?.hasKey ?? p.keyConfigured };
        })
      );

    } catch {
      showError('Failed to save stats settings');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async (formValues: { enabled: boolean; both_sides_required: boolean; auto_advance_on_match: boolean }) => {
    await saveProviders(providers, formValues);
  };

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
      {/* Delete confirmation modal */}
      <Modal
        opened={deleteModal}
        onClose={closeDelete}
        title="Remove Provider"
        size="sm"
        centered
      >
        <Text size="sm" mb="lg">
          Are you sure you want to remove this provider? It will no longer be used for stats extraction.
        </Text>
        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={closeDelete}>Cancel</Button>
          <Button color="red" onClick={handleDeleteProvider}>Remove</Button>
        </Group>
      </Modal>

      {/* Add Provider modal */}
      <Modal
        opened={addModal}
        onClose={handleCloseAddModal}
        title={addStep === 1 ? 'Add Provider' : 'Configure Provider'}
        size={addStep === 1 ? 'md' : 'sm'}
        centered
      >
        {addStep === 1 ? (
          <Stack gap="sm">
            <Text size="sm" c="dimmed">Select an AI provider to add</Text>
            <SimpleGrid cols={2}>
              {PROVIDER_REGISTRY.map(descriptor => {
                const isFullyAdded = fullyAddedProviderIds.includes(descriptor.id);
                const { Icon } = descriptor;
                return (
                  <Card
                    key={descriptor.id}
                    withBorder
                    padding="md"
                    style={{
                      cursor: isFullyAdded ? 'not-allowed' : 'pointer',
                      opacity: isFullyAdded ? 0.5 : 1,
                      transition: 'opacity 0.15s ease',
                    }}
                    onClick={() => !isFullyAdded && handleSelectProvider(descriptor.id)}
                  >
                    <Group gap="sm" mb="xs">
                      <Icon size="1.5rem" />
                      <Text fw={600} size="sm">{descriptor.name}</Text>
                    </Group>
                    <Text size="xs" c="dimmed">{descriptor.description}</Text>
                  </Card>
                );
              })}
            </SimpleGrid>
          </Stack>
        ) : (
          <Stack gap="md">
            {addProviderId && (() => {
              const descriptor = PROVIDER_REGISTRY.find(d => d.id === addProviderId)!;
              const { Icon } = descriptor;
              const modelOptions = descriptor.models.map(m => ({
                ...m,
                disabled: addedModelKeys.includes(`${addProviderId}-${m.value}`),
              }));
              return (
                <>
                  <Group gap="sm">
                    <Icon size="1.5rem" />
                    <Text fw={600}>{descriptor.name}</Text>
                  </Group>

                  <Select
                    label="Model"
                    data={modelOptions}
                    value={addModel}
                    onChange={(val) => setAddModel(val ?? '')}
                  />

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
                    {existingKeyConfigured ? (
                      <Group gap="xs">
                        <IconCheck size="0.85rem" color="var(--mantine-color-green-5)" />
                        <Text size="xs" c="green">Key already configured for {descriptor.name}</Text>
                      </Group>
                    ) : (
                      <PasswordInput
                        placeholder={`Paste your ${descriptor.name} API key…`}
                        value={addApiKey}
                        onChange={(e) => setAddApiKey(e.currentTarget.value)}
                        styles={{ input: { fontFamily: 'monospace' } }}
                      />
                    )}
                  </div>

                  <Group justify="space-between" mt="xs">
                    <Button variant="default" onClick={() => setAddStep(1)}>Back</Button>
                    <Button
                      onClick={handleAddProvider}
                      disabled={!addModel || (!existingKeyConfigured && !addApiKey)}
                    >
                      Add Provider
                    </Button>
                  </Group>
                </>
              );
            })()}
          </Stack>
        )}
      </Modal>

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
              <Text size="xs" c="dimmed">{providers.length} active</Text>
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
                },
              }}
            >
              <Text size="sm">
                MatchExec uses the active providers below for stats extraction. Configure as many services as you want, they will be used in the order listed.
              </Text>
            </Alert>

            <Stack gap="sm">
              {providers.map((providerState, index) => {
                const descriptor = PROVIDER_REGISTRY.find(d => d.id === providerState.providerId)!;
                return (
                  <ProviderCard
                    key={providerState.instanceId}
                    descriptor={descriptor}
                    state={providerState}
                    order={index + 1}
                    isFirst={index === 0}
                    isLast={index === providers.length - 1}
                    onDelete={() => requestDelete(providerState.instanceId)}
                    onMoveUp={() => handleMoveUp(index)}
                    onMoveDown={() => handleMoveDown(index)}
                    onApiKeyChange={(val) => handleApiKeyChange(providerState.providerId, val)}
                  />
                );
              })}
            </Stack>

            <Button
              variant="light"
              leftSection={<IconPlus size="0.85rem" />}
              onClick={openAdd}
              size="sm"
              style={{ alignSelf: 'flex-start' }}
            >
              Add Provider
            </Button>
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
