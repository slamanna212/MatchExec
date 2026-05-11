'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Text, Button, Stack, Group, ActionIcon, Modal, Checkbox,
  TextInput, Badge,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { modals } from '@mantine/modals';
import {
  IconPlus, IconSettings, IconTrash, IconMicrophone, IconArrowLeft, IconSparkles, IconHash,
} from '@tabler/icons-react';
import { logger } from '@/lib/logger/client';
import { showSuccess, showError } from '@/lib/notifications';

interface DiscordChannel {
  id: string;
  discord_channel_id: string;
  channel_name?: string;
  channel_type: 'text' | 'voice';
  send_announcements?: boolean;
  send_reminders?: boolean;
  send_match_start?: boolean;
  send_signup_updates?: boolean;
  send_health_alerts?: boolean;
}

interface CreateChannelForm {
  discord_channel_id: string;
  send_announcements: boolean;
  send_reminders: boolean;
  send_match_start: boolean;
  send_signup_updates: boolean;
  send_health_alerts: boolean;
}

interface ChannelEditData {
  send_announcements: boolean;
  send_reminders: boolean;
  send_match_start: boolean;
  send_signup_updates: boolean;
  send_health_alerts: boolean;
}

function fireConfetti() {
  const container = document.createElement('div');
  container.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9999;overflow:hidden;';
  document.body.appendChild(container);

  const style = document.createElement('style');
  style.textContent = `
    @keyframes confetti-burst {
      0%   { transform: translate(0,0) rotate(0deg) scale(1); opacity:1; }
      100% { transform: translate(var(--tx),var(--ty)) rotate(var(--rot)) scale(0.3); opacity:0; }
    }
  `;
  document.head.appendChild(style);

  const colors = ['#7c3aed', '#c084fc', '#f7cc02', '#4ade80', '#60a5fa', '#f472b6', '#a855f7'];

  for (let i = 0; i < 80; i++) {
    const piece = document.createElement('div');
    const color = colors[Math.floor(Math.random() * colors.length)];
    const w = 6 + Math.random() * 6;
    const h = Math.random() < 0.5 ? w : w * 2;
    const startX = 45 + Math.random() * 10;
    const tx = (Math.random() - 0.5) * 240;
    const ty = -(40 + Math.random() * 60);
    const rot = (Math.random() - 0.5) * 900;
    const delay = Math.random() * 0.25;

    piece.style.cssText = `
      position:absolute; bottom:8%; left:${startX}%;
      width:${w}px; height:${h}px;
      background:${color}; border-radius:${Math.random() < 0.5 ? '50%' : '2px'};
      animation:confetti-burst 1.4s cubic-bezier(0.2,0.6,0.4,1) ${delay}s forwards;
      --tx:${tx}vw; --ty:${ty}vh; --rot:${rot}deg;
    `;
    container.appendChild(piece);
  }

  setTimeout(() => {
    container.remove();
    style.remove();
  }, 2200);
}

export default function ChannelsSetupClient() {
  const [channels, setChannels] = useState<DiscordChannel[]>([]);
  const [voiceCategoryId, setVoiceCategoryId] = useState('');
  const [savingCategory, setSavingCategory] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [editModalOpened, setEditModalOpened] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<DiscordChannel | null>(null);
  const [editData, setEditData] = useState<ChannelEditData>({
    send_announcements: false, send_reminders: false,
    send_match_start: false, send_signup_updates: false, send_health_alerts: false,
  });

  const createForm = useForm<CreateChannelForm>({
    initialValues: {
      discord_channel_id: '', send_announcements: false, send_reminders: false,
      send_match_start: false, send_signup_updates: false, send_health_alerts: false,
    },
    validate: {
      discord_channel_id: (v) => {
        if (!v.trim()) return 'Channel ID is required';
        if (!/^\d{17,19}$/.test(v.trim())) return 'Invalid Discord channel ID format';
        return null;
      },
    },
  });

  const fetchChannels = useCallback(async () => {
    try {
      const res = await fetch('/api/channels');
      if (res.ok) setChannels(await res.json());
    } catch (err) {
      logger.error('Error fetching channels:', err);
    }
  }, []);

  const fetchVoiceCategoryId = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/discord');
      if (res.ok) {
        const data = await res.json();
        setVoiceCategoryId(data.voice_channel_category_id || '');
      }
    } catch (err) {
      logger.error('Error fetching voice category ID:', err);
    }
  }, []);

  useEffect(() => {
    fetchChannels();
    fetchVoiceCategoryId();
  }, [fetchChannels, fetchVoiceCategoryId]);

  const saveVoiceCategoryId = async () => {
    setSavingCategory(true);
    try {
      const res = await fetch('/api/settings/discord', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voice_channel_category_id: voiceCategoryId }),
      });
      if (res.ok) showSuccess('Voice channel category saved!');
      else showError('Failed to save voice channel category');
    } catch (err) {
      logger.error('Error saving voice category ID:', err);
      showError('An error occurred while saving');
    } finally {
      setSavingCategory(false);
    }
  };

  const handleFinish = async () => {
    fireConfetti();
    try {
      const res = await fetch('/api/welcome-flow', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ setupType: 'get_started' }),
      });
      if (res.ok) {
        setTimeout(() => { window.location.href = '/'; }, 800);
      }
    } catch (err) {
      logger.error('Error completing welcome flow:', err);
    }
  };

  const handleCreateChannel = async () => {
    const validation = createForm.validate();
    if (validation.hasErrors) return;
    setCreateLoading(true);
    try {
      const res = await fetch('/api/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...createForm.values, channel_type: 'text' }),
      });
      if (res.ok) {
        showSuccess('Channel added!');
        setShowCreateForm(false);
        createForm.reset();
        await fetchChannels();
      } else {
        const err = await res.json();
        showError(err.error || 'Failed to create channel');
      }
    } catch (err) {
      logger.error('Error creating channel:', err);
      showError('An error occurred while creating the channel');
    } finally {
      setCreateLoading(false);
    }
  };

  const handleEditChannel = (channel: DiscordChannel) => {
    setSelectedChannel(channel);
    setEditData({
      send_announcements: channel.send_announcements || false,
      send_reminders: channel.send_reminders || false,
      send_match_start: channel.send_match_start || false,
      send_signup_updates: channel.send_signup_updates || false,
      send_health_alerts: channel.send_health_alerts || false,
    });
    setEditModalOpened(true);
  };

  const handleSaveNotifications = async () => {
    if (!selectedChannel) return;
    try {
      const res = await fetch(`/api/channels/${selectedChannel.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editData),
      });
      if (res.ok) {
        showSuccess('Notification settings updated!');
        setEditModalOpened(false);
        setSelectedChannel(null);
        await fetchChannels();
      } else {
        showError('Failed to update notification settings');
      }
    } catch (err) {
      logger.error('Error updating notifications:', err);
      showError('An error occurred while updating settings');
    }
  };

  const handleDeleteChannel = (channelId: string, channelName?: string) => {
    modals.openConfirmModal({
      title: 'Delete Channel',
      children: <Text size="sm">Are you sure you want to delete {channelName || 'this channel'}? This action cannot be undone.</Text>,
      labels: { confirm: 'Delete', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/channels/${channelId}`, { method: 'DELETE' });
          if (res.ok) { showSuccess('Channel deleted!'); await fetchChannels(); }
          else showError('Failed to delete channel');
        } catch (err) {
          logger.error('Error deleting channel:', err);
          showError('An error occurred while deleting the channel');
        }
      },
    });
  };

  const textChannels = channels.filter((ch) => ch.channel_type === 'text');

  const notifCoverage = [
    textChannels.some((ch) => ch.send_announcements),
    textChannels.some((ch) => ch.send_reminders),
    textChannels.some((ch) => ch.send_match_start),
    textChannels.some((ch) => ch.send_signup_updates),
    textChannels.some((ch) => ch.send_health_alerts),
  ].filter(Boolean).length;

  const statTileStyle: React.CSSProperties = {
    padding: '14px 18px',
    borderRadius: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    background: 'var(--mantine-color-default)',
    border: '1px solid var(--mantine-color-default-border)',
  };

  const statValueStyle = (tone: 'violet' | 'green'): React.CSSProperties => ({
    fontFamily: 'var(--font-outfit, sans-serif)',
    fontSize: 28,
    fontWeight: 800,
    letterSpacing: '-0.02em',
    color: tone === 'green' ? '#4ade80' : 'var(--mantine-color-violet-4, #c084fc)',
  });

  const statLabelStyle: React.CSSProperties = {
    fontSize: 11.5,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: 'var(--mantine-color-dimmed)',
    fontWeight: 700,
  };

  const FLAG_LABELS: Record<string, string> = {
    send_announcements: 'Announcements',
    send_reminders: 'Reminders',
    send_match_start: 'Live Updates',
    send_signup_updates: 'Signups',
    send_health_alerts: 'Health',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Step hero */}
      <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start' }}>
        <div style={{
          fontFamily: 'var(--font-outfit, sans-serif)',
          fontSize: 56, fontWeight: 800, lineHeight: 0.85,
          background: 'linear-gradient(135deg, #c084fc, #7c3aed)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
          letterSpacing: '-0.04em', flexShrink: 0, userSelect: 'none',
        }}>
          03
        </div>
        <div>
          <div style={{
            fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
            color: '#f7cc02', fontFamily: 'var(--font-geist-mono, monospace)',
          }}>
            Channels
          </div>
          <h2 style={{
            fontFamily: 'var(--font-outfit, sans-serif)',
            fontSize: 'clamp(26px, 4vw, 36px)', fontWeight: 800,
            margin: '4px 0 2px', letterSpacing: '-0.025em', lineHeight: 1,
            color: 'var(--mantine-color-text)',
          }}>
            Where do matches go?
          </h2>
          <p style={{ color: 'var(--mantine-color-dimmed)', fontSize: 14, margin: '4px 0 0' }}>
            Pick the channels for announcements, scores, and alerts. Voice channels are created on the fly.
          </p>
        </div>
      </div>

      {/* Stat row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        <div style={statTileStyle}>
          <div style={statValueStyle('violet')}>{textChannels.length}</div>
          <div style={statLabelStyle}>Channels added</div>
        </div>
        <div style={statTileStyle}>
          <div style={statValueStyle('violet')}>{notifCoverage}</div>
          <div style={statLabelStyle}>Categories</div>
        </div>
        <div style={statTileStyle}>
          <div style={statValueStyle('green')}>{voiceCategoryId ? 'Set' : 'None'}</div>
          <div style={statLabelStyle}>Voice category</div>
        </div>
      </div>

      {/* Channels section */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            fontFamily: 'var(--font-outfit, sans-serif)', fontWeight: 700, fontSize: 16, letterSpacing: '-0.01em',
          }}>
            <IconHash size={16} /> Text channels
          </div>
          {!showCreateForm && (
            <Button
              size="xs"
              leftSection={<IconPlus size={14} />}
              onClick={() => { setShowCreateForm(true); createForm.reset(); }}
              style={{ background: 'linear-gradient(135deg, #7c3aed, #4c1d95)', border: 'none' }}
            >
              Add Channel
            </Button>
          )}
        </div>

        {/* Create form */}
        {showCreateForm && (
          <div style={{
            background: 'var(--mantine-color-default)',
            border: '1px solid rgba(124,58,237,0.3)',
            borderRadius: 14,
            padding: '16px 18px 18px',
          }}>
            <Stack gap="md">
              <TextInput
                label="Discord Channel ID"
                placeholder="123456789012345678"
                description='Right-click the channel in Discord → "Copy ID"'
                {...createForm.getInputProps('discord_channel_id')}
              />
              <div>
                <Text size="sm" fw={600} mb="xs">Notifications</Text>
                <Stack gap="xs">
                  <Checkbox label="Match Announcements" {...createForm.getInputProps('send_announcements', { type: 'checkbox' })} />
                  <Checkbox label="Match Reminders" {...createForm.getInputProps('send_reminders', { type: 'checkbox' })} />
                  <Checkbox label="Live Updates" {...createForm.getInputProps('send_match_start', { type: 'checkbox' })} />
                  <Checkbox label="Signup Updates" {...createForm.getInputProps('send_signup_updates', { type: 'checkbox' })} />
                  <Checkbox label="Health Alerts" {...createForm.getInputProps('send_health_alerts', { type: 'checkbox' })} />
                </Stack>
              </div>
              <Group justify="space-between">
                <Button variant="subtle" size="sm" onClick={() => setShowCreateForm(false)} style={{ color: 'var(--mantine-color-dimmed)' }}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  loading={createLoading}
                  onClick={handleCreateChannel}
                  style={{ background: 'linear-gradient(135deg, #7c3aed, #4c1d95)', border: 'none' }}
                >
                  Add Channel
                </Button>
              </Group>
            </Stack>
          </div>
        )}

        {/* Channel list */}
        {textChannels.length === 0 && !showCreateForm ? (
          <div style={{
            background: 'var(--mantine-color-default)',
            border: '1px dashed var(--mantine-color-default-border)',
            borderRadius: 14,
            padding: '28px 18px',
            textAlign: 'center',
            color: 'var(--mantine-color-dimmed)',
            fontSize: 14,
          }}>
            No channels added yet. Add a text channel to receive match notifications.
          </div>
        ) : (
          textChannels.map((channel) => {
            const flags = (Object.keys(FLAG_LABELS) as (keyof typeof FLAG_LABELS)[]).filter(
              (k) => channel[k as keyof DiscordChannel]
            );
            return (
              <div
                key={channel.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '4px 1fr',
                  borderRadius: 14,
                  background: 'var(--mantine-color-default)',
                  border: '1px solid var(--mantine-color-default-border)',
                  overflow: 'hidden',
                }}
              >
                <div style={{ background: 'linear-gradient(180deg, #9333ea, #4c1d95)' }} />
                <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <div style={{
                      width: 36, height: 36,
                      borderRadius: 10,
                      display: 'grid', placeItems: 'center',
                      background: 'rgba(124,58,237,0.18)',
                      color: 'var(--mantine-color-violet-4, #c084fc)',
                      fontFamily: 'var(--font-outfit, sans-serif)',
                      fontWeight: 800,
                      fontSize: 18,
                      border: '1px solid rgba(124,58,237,0.35)',
                    }}>
                      #
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>
                        {channel.channel_name || `Channel ${channel.discord_channel_id}`}
                      </div>
                      <div style={{ fontFamily: 'var(--font-geist-mono, monospace)', fontSize: 11, color: 'var(--mantine-color-dimmed)', marginTop: 1 }}>
                        ID · {channel.discord_channel_id}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <ActionIcon variant="subtle" size="sm" onClick={() => handleEditChannel(channel)}>
                        <IconSettings size={15} />
                      </ActionIcon>
                      <ActionIcon variant="subtle" color="red" size="sm" onClick={() => handleDeleteChannel(channel.id, channel.channel_name)}>
                        <IconTrash size={15} />
                      </ActionIcon>
                    </div>
                  </div>
                  {flags.length > 0 && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {flags.map((f) => (
                        <span key={f} style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          padding: '3px 9px',
                          borderRadius: 999,
                          fontSize: 11.5, fontWeight: 600,
                          background: 'rgba(124,58,237,0.15)',
                          color: 'var(--mantine-color-violet-4, #c084fc)',
                          border: '1px solid rgba(124,58,237,0.3)',
                        }}>
                          {FLAG_LABELS[f]}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Voice category divider */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          fontFamily: 'var(--font-outfit, sans-serif)', fontWeight: 700, fontSize: 16,
          letterSpacing: '-0.01em', flexShrink: 0,
        }}>
          <IconMicrophone size={16} /> Voice category
        </div>
        <div style={{ flex: 1, height: 1, background: 'var(--mantine-color-default-border)' }} />
      </div>

      {/* Voice category */}
      <div style={{
        padding: 18,
        background: 'var(--mantine-color-default)',
        border: '1px solid var(--mantine-color-default-border)',
        borderRadius: 14,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <Badge variant="light" color="gray" size="sm" style={{ fontWeight: 600 }}>Optional</Badge>
        </div>
        <div style={{ color: 'var(--mantine-color-dimmed)', fontSize: 13, marginBottom: 12 }}>
          Match voice channels are auto-created inside this category.
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <TextInput
            placeholder="Discord category ID"
            value={voiceCategoryId}
            onChange={(e) => setVoiceCategoryId(e.target.value)}
            error={voiceCategoryId && !/^\d{17,19}$/.test(voiceCategoryId) ? 'Invalid format' : null}
            style={{ flex: 1 }}
          />
          <Button
            variant="outline"
            onClick={saveVoiceCategoryId}
            loading={savingCategory}
            disabled={!voiceCategoryId || !/^\d{17,19}$/.test(voiceCategoryId)}
            style={{ borderColor: 'rgba(124,58,237,0.4)', color: 'var(--mantine-color-violet-4, #c084fc)' }}
          >
            Save
          </Button>
        </div>
      </div>

      {/* CTA bar */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'auto 1fr auto',
        alignItems: 'center',
        gap: 16,
        padding: '14px 18px',
        background: 'var(--mantine-color-body)',
        border: '1px solid var(--mantine-color-default-border)',
        borderRadius: 14,
        position: 'sticky',
        bottom: 12,
        backdropFilter: 'blur(8px)',
      }}>
        <Button
          variant="subtle"
          leftSection={<IconArrowLeft size={16} />}
          onClick={() => window.history.back()}
          style={{ color: 'var(--mantine-color-dimmed)' }}
        >
          Back
        </Button>
        <div />
        <Button
          size="lg"
          leftSection={<IconSparkles size={16} />}
          onClick={handleFinish}
          style={{
            background: 'linear-gradient(135deg, #7c3aed, #4c1d95)',
            border: 'none',
            boxShadow: '0 4px 16px rgba(124,58,237,0.4)',
          }}
        >
          Launch MatchExec
        </Button>
      </div>

      {/* Edit modal */}
      <Modal
        opened={editModalOpened}
        onClose={() => { setEditModalOpened(false); setSelectedChannel(null); }}
        title={`Edit ${selectedChannel?.channel_name || 'channel'} notifications`}
        size="md"
        zIndex={1001}
      >
        <Stack gap="md">
          <Stack gap="sm">
            <Checkbox label="Match Announcements" description="New match announcements" checked={editData.send_announcements} onChange={(e) => setEditData((d) => ({ ...d, send_announcements: e.target.checked }))} />
            <Checkbox label="Match Reminders" description="Match start reminders" checked={editData.send_reminders} onChange={(e) => setEditData((d) => ({ ...d, send_reminders: e.target.checked }))} />
            <Checkbox label="Live Updates" description="Live match scores and updates" checked={editData.send_match_start} onChange={(e) => setEditData((d) => ({ ...d, send_match_start: e.target.checked }))} />
            <Checkbox label="Signup Updates" description="Player sign-up and leave events" checked={editData.send_signup_updates} onChange={(e) => setEditData((d) => ({ ...d, send_signup_updates: e.target.checked }))} />
            <Checkbox label="Health Alerts" description="System health and error alerts" checked={editData.send_health_alerts} onChange={(e) => setEditData((d) => ({ ...d, send_health_alerts: e.target.checked }))} />
          </Stack>
          <Group justify="flex-end" mt="sm">
            <Button variant="subtle" onClick={() => { setEditModalOpened(false); setSelectedChannel(null); }}>Cancel</Button>
            <Button onClick={handleSaveNotifications}>Save Settings</Button>
          </Group>
        </Stack>
      </Modal>
    </div>
  );
}
