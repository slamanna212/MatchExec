'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Stack, Table, Badge, Button, Select, Group, Text, ActionIcon,
  Tooltip, Loader, Center, Card, Divider, TextInput, Modal,
  ColorSwatch,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconShield, IconPlus, IconTrash, IconEdit, IconBrandDiscord,
  IconRefresh, IconAlertCircle,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { PageLayout } from '@/components/PageLayout';
import { PageHeader } from '@/components/PageHeader';
import { ROLE_LABELS, ROLE_COLORS, ALL_ROLES, type AppRole } from '@/lib/permissions';

type DiscordRole = {
  id: string;
  name: string;
  color: number;
  position: number;
  managed: boolean;
};

type RoleMapping = {
  id: number;
  discord_role_id: string;
  discord_role_name: string;
  discord_role_color: number;
  app_role: AppRole;
};

function colorIntToHex(color: number): string {
  if (!color) return '#99aab5'; // Discord default grey
  return `#${color.toString(16).padStart(6, '0')}`;
}

const APP_ROLE_OPTIONS = ALL_ROLES.map(r => ({
  value: r,
  label: ROLE_LABELS[r],
}));

export default function RolesSettingsPage() {
  const [mappings, setMappings] = useState<RoleMapping[]>([]);
  const [discordRoles, setDiscordRoles] = useState<DiscordRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [rolesError, setRolesError] = useState<string | null>(null);

  // Add mapping form
  const [selectedDiscordRole, setSelectedDiscordRole] = useState<string | null>(null);
  const [selectedAppRole, setSelectedAppRole] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Edit modal
  const [editTarget, setEditTarget] = useState<RoleMapping | null>(null);
  const [editAppRole, setEditAppRole] = useState<string | null>(null);
  const [editOpen, { open: openEdit, close: closeEdit }] = useDisclosure(false);

  // Create Discord role modal
  const [createOpen, { open: openCreate, close: closeCreate }] = useDisclosure(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setRolesError(null);
    try {
      const [mappingsRes, rolesRes] = await Promise.all([
        fetch('/api/settings/roles'),
        fetch('/api/discord/server-roles'),
      ]);

      if (mappingsRes.ok) {
        const data = await mappingsRes.json();
        setMappings(data.mappings);
      }

      if (rolesRes.ok) {
        const data = await rolesRes.json();
        setDiscordRoles(data.roles);
      } else {
        const err = await rolesRes.json();
        setRolesError(err.error || 'Failed to load Discord roles');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const unmappedDiscordRoles = discordRoles.filter(
    r => !mappings.some(m => m.discord_role_id === r.id),
  );

  const discordRoleOptions = unmappedDiscordRoles.map(r => ({
    value: r.id,
    label: r.name,
  }));

  async function handleAddMapping() {
    if (!selectedDiscordRole || !selectedAppRole) return;
    const role = discordRoles.find(r => r.id === selectedDiscordRole);
    if (!role) return;

    setSaving(true);
    try {
      const res = await fetch('/api/settings/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          discord_role_id: role.id,
          discord_role_name: role.name,
          discord_role_color: role.color,
          app_role: selectedAppRole,
        }),
      });

      if (res.ok) {
        notifications.show({ message: 'Role mapping added', color: 'green' });
        setSelectedDiscordRole(null);
        setSelectedAppRole(null);
        fetchData();
      } else {
        const err = await res.json();
        notifications.show({ message: err.error || 'Failed to add mapping', color: 'red' });
      }
    } finally {
      setSaving(false);
    }
  }

  function startEdit(mapping: RoleMapping) {
    setEditTarget(mapping);
    setEditAppRole(mapping.app_role);
    openEdit();
  }

  async function handleEditSave() {
    if (!editTarget || !editAppRole) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/settings/roles/${editTarget.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app_role: editAppRole }),
      });
      if (res.ok) {
        notifications.show({ message: 'Mapping updated', color: 'green' });
        closeEdit();
        fetchData();
      } else {
        const err = await res.json();
        notifications.show({ message: err.error || 'Failed to update', color: 'red' });
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number, roleName: string) {
    if (!confirm(`Remove mapping for "${roleName}"?`)) return;
    const res = await fetch(`/api/settings/roles/${id}`, { method: 'DELETE' });
    if (res.ok) {
      notifications.show({ message: 'Mapping removed', color: 'green' });
      fetchData();
    } else {
      notifications.show({ message: 'Failed to remove mapping', color: 'red' });
    }
  }

  async function handleCreateDiscordRole() {
    if (!newRoleName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/discord/server-roles/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newRoleName.trim() }),
      });
      if (res.ok) {
        const { role } = await res.json();
        notifications.show({ message: `Role "${role.name}" created on Discord`, color: 'green' });
        setNewRoleName('');
        closeCreate();
        fetchData();
      } else {
        const err = await res.json();
        notifications.show({ message: err.error || 'Failed to create role', color: 'red' });
      }
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <PageLayout>
        <Center style={{ height: 200 }}>
          <Loader color="violet" />
        </Center>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <Stack gap="lg">
        <PageHeader
          icon={IconShield}
          title="Role Management"
          subtitle="Map Discord server roles to MatchExec permission levels"
        />

        {/* Permission level reference */}
        <Card withBorder radius="md" padding="md" style={{ borderColor: 'rgba(124,58,237,0.2)' }}>
          <Text fw={600} mb="sm" size="sm">Permission Levels</Text>
          <Group gap="sm">
            {ALL_ROLES.map(role => (
              <Badge
                key={role}
                style={{ background: `${ROLE_COLORS[role]}22`, color: ROLE_COLORS[role], border: `1px solid ${ROLE_COLORS[role]}44` }}
              >
                {ROLE_LABELS[role]}
              </Badge>
            ))}
          </Group>
          <Text size="xs" c="dimmed" mt="xs">
            Owner &gt; Admin &gt; Moderator &gt; Viewer. Users get the highest level matched across all their Discord roles.
            The Discord guild owner always receives Owner access automatically.
          </Text>
        </Card>

        {/* Current mappings */}
        <Card withBorder radius="md" padding="md" style={{ borderColor: 'rgba(124,58,237,0.2)' }}>
          <Group justify="space-between" mb="md">
            <Text fw={600}>Current Mappings</Text>
            <Tooltip label="Refresh">
              <ActionIcon variant="subtle" color="violet" onClick={fetchData}>
                <IconRefresh size="1rem" />
              </ActionIcon>
            </Tooltip>
          </Group>

          {mappings.length === 0 ? (
            <Text c="dimmed" size="sm">
              No mappings configured. Add one below — users without a mapped role get No Access.
            </Text>
          ) : (
            <Table horizontalSpacing="sm" verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Discord Role</Table.Th>
                  <Table.Th>Permission Level</Table.Th>
                  <Table.Th style={{ width: 80 }} />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {mappings.map(m => (
                  <Table.Tr key={m.id}>
                    <Table.Td>
                      <Group gap="xs">
                        <ColorSwatch color={colorIntToHex(m.discord_role_color)} size={14} />
                        <Text size="sm">{m.discord_role_name}</Text>
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Badge
                        style={{
                          background: `${ROLE_COLORS[m.app_role]}22`,
                          color: ROLE_COLORS[m.app_role],
                          border: `1px solid ${ROLE_COLORS[m.app_role]}44`,
                        }}
                      >
                        {ROLE_LABELS[m.app_role]}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Group gap={4} justify="flex-end">
                        <Tooltip label="Edit">
                          <ActionIcon variant="subtle" color="violet" onClick={() => startEdit(m)}>
                            <IconEdit size="0.9rem" />
                          </ActionIcon>
                        </Tooltip>
                        <Tooltip label="Remove">
                          <ActionIcon
                            variant="subtle"
                            color="red"
                            onClick={() => handleDelete(m.id, m.discord_role_name)}
                          >
                            <IconTrash size="0.9rem" />
                          </ActionIcon>
                        </Tooltip>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </Card>

        {/* Add mapping */}
        <Card withBorder radius="md" padding="md" style={{ borderColor: 'rgba(124,58,237,0.2)' }}>
          <Text fw={600} mb="md">Add Mapping</Text>

          {rolesError ? (
            <Group gap="xs" mb="md">
              <IconAlertCircle size="1rem" style={{ color: '#f59e0b' }} />
              <Text size="sm" c="yellow">{rolesError}</Text>
            </Group>
          ) : null}

          <Group align="flex-end" gap="sm">
            <Select
              label="Discord Role"
              placeholder="Select a Discord role"
              data={discordRoleOptions}
              value={selectedDiscordRole}
              onChange={setSelectedDiscordRole}
              style={{ flex: 1 }}
              disabled={discordRoleOptions.length === 0}
            />
            <Select
              label="Permission Level"
              placeholder="Select level"
              data={APP_ROLE_OPTIONS}
              value={selectedAppRole}
              onChange={setSelectedAppRole}
              style={{ flex: 1 }}
            />
            <Button
              leftSection={<IconPlus size="0.9rem" />}
              onClick={handleAddMapping}
              disabled={!selectedDiscordRole || !selectedAppRole}
              loading={saving}
              color="violet"
            >
              Add
            </Button>
          </Group>

          {discordRoleOptions.length === 0 && !rolesError && (
            <Text size="xs" c="dimmed" mt="xs">
              All Discord roles are already mapped.
            </Text>
          )}
        </Card>

        {/* Create Discord role */}
        <Card withBorder radius="md" padding="md" style={{ borderColor: 'rgba(124,58,237,0.2)' }}>
          <Group justify="space-between" align="center">
            <div>
              <Text fw={600}>Create Discord Role</Text>
              <Text size="xs" c="dimmed" mt={2}>
                Create a new role directly on your Discord server
              </Text>
            </div>
            <Button
              variant="light"
              color="indigo"
              leftSection={<IconBrandDiscord size="1rem" />}
              onClick={openCreate}
            >
              Create Role
            </Button>
          </Group>
        </Card>
      </Stack>

      {/* Edit mapping modal */}
      <Modal
        opened={editOpen}
        onClose={closeEdit}
        title="Edit Role Mapping"
        centered
      >
        {editTarget && (
          <Stack>
            <Group gap="xs">
              <ColorSwatch color={colorIntToHex(editTarget.discord_role_color)} size={14} />
              <Text fw={600}>{editTarget.discord_role_name}</Text>
            </Group>
            <Select
              label="Permission Level"
              data={APP_ROLE_OPTIONS}
              value={editAppRole}
              onChange={setEditAppRole}
            />
            <Group justify="flex-end" mt="sm">
              <Button variant="subtle" onClick={closeEdit}>Cancel</Button>
              <Button onClick={handleEditSave} loading={saving} color="violet">Save</Button>
            </Group>
          </Stack>
        )}
      </Modal>

      {/* Create Discord role modal */}
      <Modal
        opened={createOpen}
        onClose={closeCreate}
        title="Create Discord Role"
        centered
      >
        <Stack>
          <TextInput
            label="Role Name"
            placeholder="e.g. Tournament Admin"
            value={newRoleName}
            onChange={e => setNewRoleName(e.currentTarget.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreateDiscordRole()}
          />
          <Text size="xs" c="dimmed">
            This creates the role on your Discord server. You can then map it to a permission level above.
          </Text>
          <Group justify="flex-end" mt="sm">
            <Button variant="subtle" onClick={closeCreate}>Cancel</Button>
            <Button
              onClick={handleCreateDiscordRole}
              loading={creating}
              disabled={!newRoleName.trim()}
              color="violet"
              leftSection={<IconBrandDiscord size="1rem" />}
            >
              Create on Discord
            </Button>
          </Group>
        </Stack>
      </Modal>
    </PageLayout>
  );
}
