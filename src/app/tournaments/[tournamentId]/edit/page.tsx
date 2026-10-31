'use client'

import { use, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Container,
  Stack,
  TextInput,
  Textarea,
  Button,
  Group,
  Text,
  Card,
  Loader,
  Center,
  Checkbox,
  Switch,
  Divider,
  ActionIcon,
  Select,
  NumberInput,
} from '@mantine/core';
import { IconPencil, IconPlus, IconX } from '@tabler/icons-react';
import { logger } from '@/lib/logger/client';
import { showError, notificationHelper } from '@/lib/notifications';
import { PageHeader } from '@/components/PageHeader';

interface AnnouncementTime {
  id: string;
  value: number;
  unit: 'minutes' | 'hours' | 'days';
}

interface TournamentData {
  id: string;
  name: string;
  description?: string;
  status: string;
  game_name?: string;
  start_date?: string;
  start_time?: string;
  event_image_url?: string;
  livestream_link?: string;
  announcements?: string;
  player_notifications?: number;
  allow_match_editing?: number;
  ruleset?: string;
  format?: string;
  rounds_per_match?: number;
  game_id?: string;
}

function sortAnnouncements(announcements: AnnouncementTime[]) {
  return [...announcements].sort((a, b) => {
    const toMinutes = (ann: AnnouncementTime) => {
      switch (ann.unit) {
        case 'minutes': return ann.value;
        case 'hours': return ann.value * 60;
        case 'days': return ann.value * 24 * 60;
        default: return 0;
      }
    };
    return toMinutes(a) - toMinutes(b);
  });
}

export default function EditTournamentPage({
  params
}: {
  params: Promise<{ tournamentId: string }>
}) {
  const { tournamentId } = use(params);
  const router = useRouter();

  const [tournament, setTournament] = useState<TournamentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [livestreamLink, setLivestreamLink] = useState('');
  const [playerNotifications, setPlayerNotifications] = useState(true);
  const [allowMatchEditing, setAllowMatchEditing] = useState(true);
  const [announcements, setAnnouncements] = useState<AnnouncementTime[]>([]);

  useEffect(() => {
    const fetchTournament = async () => {
      try {
        const res = await fetch(`/api/tournaments/${tournamentId}`);
        if (!res.ok) {
          showError('Tournament not found');
          router.push('/tournaments');
          return;
        }
        const data: TournamentData = await res.json();

        if (data.status === 'complete' || data.status === 'cancelled') {
          showError('Cannot edit a completed or cancelled tournament');
          router.push(`/tournaments/${tournamentId}`);
          return;
        }

        setTournament(data);
        setName(data.name || '');
        setDescription(data.description || '');
        setLivestreamLink(data.livestream_link || '');
        setPlayerNotifications(data.player_notifications !== 0);
        setAllowMatchEditing(data.allow_match_editing !== 0);

        if (data.announcements) {
          try {
            const parsed = JSON.parse(data.announcements);
            setAnnouncements(Array.isArray(parsed) ? parsed : []);
          } catch {
            setAnnouncements([]);
          }
        }

        if (data.start_time) {
          const d = new Date(`${data.start_time}${data.start_time.includes('Z') || /[+-]\d{2}:?\d{2}$/.test(data.start_time) ? '' : 'Z'}`);
          setDate(d.toISOString().split('T')[0]);
          setTime(d.toISOString().split('T')[1].substring(0, 5));
        }
      } catch (error) {
        logger.error('Error fetching tournament:', error);
        showError('Failed to load tournament');
      } finally {
        setLoading(false);
      }
    };

    fetchTournament();
  }, [tournamentId, router]);

  const addAnnouncement = () => {
    const newAnn: AnnouncementTime = {
      id: Math.random().toString(36).substring(2, 15), // NOSONAR: non-security internal ID generation
      value: 1,
      unit: 'hours',
    };
    setAnnouncements(prev => sortAnnouncements([...prev, newAnn]));
  };

  const updateAnnouncement = (id: string, field: keyof AnnouncementTime, value: unknown) => {
    setAnnouncements(prev =>
      sortAnnouncements(prev.map(ann => ann.id === id ? { ...ann, [field]: value } : ann))
    );
  };

  const removeAnnouncement = (id: string) => {
    setAnnouncements(prev => prev.filter(ann => ann.id !== id));
  };

  const handleSave = async () => {
    if (!name.trim()) {
      showError('Tournament name is required');
      return;
    }

    setSaving(true);
    const notificationId = 'tournament-edit-save';
    notificationHelper.loading({ id: notificationId, message: 'Saving changes...' });

    try {
      let startDate: string | null = null;
      let startTime: string | null = null;
      if (date && time) {
        const dt = new Date(`${date}T${time}:00`).toISOString();
        startDate = dt;
        startTime = dt;
      }

      const res = await fetch(`/api/tournaments/${tournamentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description || null,
          startDate,
          startTime,
          livestreamLink: livestreamLink || null,
          playerNotifications,
          allowMatchEditing,
          announcements: announcements.length > 0 ? announcements : null,
        }),
      });

      if (res.ok) {
        notificationHelper.update(notificationId, {
          type: 'success',
          message: 'Tournament updated successfully!',
        });
        router.push(`/tournaments/${tournamentId}`);
      } else {
        const err = await res.json();
        notificationHelper.update(notificationId, {
          type: 'error',
          message: err.error || 'Failed to save changes',
        });
      }
    } catch (error) {
      logger.error('Error saving tournament:', error);
      notificationHelper.update(notificationId, {
        type: 'error',
        message: 'An error occurred while saving',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Container>
        <Center style={{ minHeight: '400px' }}>
          <Loader size="lg" />
        </Center>
      </Container>
    );
  }

  if (!tournament) return null;

  return (
    <Container size="md" py="xl">
      <Stack gap="lg">
        <PageHeader
          icon={IconPencil}
          title="Edit Tournament"
          subtitle={tournament.name}
          breadcrumbs={[
            { title: 'Tournaments', href: '/tournaments' },
            { title: tournament.name, href: `/tournaments/${tournamentId}` },
          ]}
        />

        <Card withBorder padding="lg" shadow="sm">
          <Stack gap="md">
            <TextInput
              label="Tournament Name"
              placeholder="Enter tournament name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />

            <Textarea
              label="Description"
              placeholder="Enter tournament description (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />

            <Group grow>
              <TextInput
                label="Date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
              <TextInput
                label="Time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                step="60"
              />
            </Group>

            <TextInput
              label="Livestream Link"
              placeholder="https://twitch.tv/... (optional)"
              value={livestreamLink}
              onChange={(e) => setLivestreamLink(e.target.value)}
            />

            <Divider
              label={
                <Text size="xs" fw={500} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.06em' }}>
                  Read-only
                </Text>
              }
              labelPosition="left"
            />

            <Group grow>
              <TextInput
                label="Ruleset"
                value={tournament.ruleset || 'casual'}
                disabled
              />
              <TextInput
                label="Format"
                value={tournament.format === 'single-elimination' ? 'Single Elimination' : 'Double Elimination'}
                disabled
              />
            </Group>

            <Divider
              label={
                <Text size="xs" fw={500} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.06em' }}>
                  Options
                </Text>
              }
              labelPosition="left"
            />

            <Checkbox
              label="Player Notifications"
              description="Send Discord DMs to players before each tournament match starts"
              checked={playerNotifications}
              onChange={(e) => setPlayerNotifications(e.currentTarget.checked)}
            />

            <Switch
              label="Allow Match Editing"
              description="When enabled, tournament matches can be edited before they reach the battle phase"
              checked={allowMatchEditing}
              onChange={(e) => setAllowMatchEditing(e.currentTarget.checked)}
            />
          </Stack>
        </Card>

        <Card withBorder padding="lg" shadow="sm">
          <Stack gap="md">
            <Text fw={500}>Announcements</Text>
            <Text size="sm" c="dimmed">
              Schedule notifications before the tournament starts. These will be applied to all tournament matches.
            </Text>

            {announcements.length > 0 && (
              <Stack gap="sm">
                {announcements.map((ann) => (
                  <Card key={ann.id} withBorder padding="sm">
                    <Group justify="space-between" align="center">
                      <Group align="center" gap="xs">
                        <NumberInput
                          size="sm"
                          value={ann.value}
                          onChange={(value) => updateAnnouncement(ann.id, 'value', Number(value) || 1)}
                          min={1}
                          max={999}
                          style={{ width: 80 }}
                        />
                        <Select
                          size="sm"
                          data={[
                            { value: 'minutes', label: 'minutes' },
                            { value: 'hours', label: 'hours' },
                            { value: 'days', label: 'days' },
                          ]}
                          value={ann.unit}
                          onChange={(value) => updateAnnouncement(ann.id, 'unit', value)}
                          style={{ width: 100 }}
                        />
                        <Text size="sm" c="dimmed">before event</Text>
                      </Group>
                      <ActionIcon color="red" variant="light" onClick={() => removeAnnouncement(ann.id)}>
                        <IconX size={16} />
                      </ActionIcon>
                    </Group>
                  </Card>
                ))}
              </Stack>
            )}

            <Card
              withBorder
              padding="md"
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={addAnnouncement}
              style={{
                borderStyle: 'dashed',
                borderColor: 'var(--mantine-color-default-border)',
                backgroundColor: 'var(--mantine-color-body)',
              }}
            >
              <Stack align="center" justify="center" style={{ minHeight: 60 }}>
                <ActionIcon size="lg" variant="light">
                  <IconPlus />
                </ActionIcon>
                <Text size="sm" c="dimmed">Add Announcement</Text>
              </Stack>
            </Card>
          </Stack>
        </Card>

        <Group justify="space-between">
          <Button variant="outline" onClick={() => router.push(`/tournaments/${tournamentId}`)}>
            Cancel
          </Button>
          <Button onClick={handleSave} loading={saving} disabled={!name.trim()}>
            Save Changes
          </Button>
        </Group>
      </Stack>
    </Container>
  );
}
