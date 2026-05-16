'use client'

import { logger } from '@/lib/logger/client';
import { useState, useEffect, useCallback } from 'react';
import type { JSX } from 'react';
import { useRouter } from 'next/navigation';
import {
  Container,
  Stack,
  Group,
  Text,
  Badge,
  Button,
  Card,
  Table,
  Loader,
  Center,
  Alert,
  Anchor,
  Tabs,
  ActionIcon,
  Modal,
  Select,
  NumberInput,
  Divider,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconTimeline,
  IconAlertCircle,
  IconPlus,
  IconTrash,
  IconEdit,
  IconTrophy,
  IconSwords,
  IconMedal,
} from '@tabler/icons-react';
import { PageHeader } from '@/components/PageHeader';
import { showError, showSuccess } from '@/lib/notifications';
import { parseDbTimestamp } from '@/lib/utils/dates';

interface SeriesRow {
  id: string;
  name: string;
  description?: string;
  status: 'created' | 'active' | 'complete' | 'cancelled';
  start_date?: string;
  end_date?: string;
  livestream_link?: string;
  announcements: boolean;
  player_notifications: boolean;
  created_at: string;
  updated_at: string;
}

interface SeriesEventRow {
  id: string;
  series_id: string;
  event_type: 'match' | 'tournament';
  match_id?: string;
  tournament_id?: string;
  event_order: number;
  event_date?: string;
  points_multiplier: number;
}

interface StandingRow {
  rank: number;
  username: string;
  participant_id: string;
  total_points: number;
  events_played: number;
}

interface MatchOption { id: string; name: string; }
interface TournamentOption { id: string; name: string; }

const STATUS_COLOR: Record<SeriesRow['status'], string> = {
  created: 'gray',
  active: 'green',
  complete: 'blue',
  cancelled: 'red',
};

export function SeriesDetailPage({ seriesId }: { seriesId: string }): JSX.Element {
  const router = useRouter();
  const [series, setSeries] = useState<SeriesRow | null>(null);
  const [events, setEvents] = useState<SeriesEventRow[]>([]);
  const [standings, setStandings] = useState<StandingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addEventOpened, { open: openAddEvent, close: closeAddEvent }] = useDisclosure(false);

  const [addEventType, setAddEventType] = useState<'match' | 'tournament'>('match');
  const [addEventId, setAddEventId] = useState<string>('');
  const [addEventMultiplier, setAddEventMultiplier] = useState<number>(1);
  const [addingSaving, setAddingSaving] = useState(false);
  const [matchOptions, setMatchOptions] = useState<MatchOption[]>([]);
  const [tournamentOptions, setTournamentOptions] = useState<TournamentOption[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [seriesRes, eventsRes, standingsRes] = await Promise.all([
        fetch(`/api/series/${seriesId}`),
        fetch(`/api/series/${seriesId}/events`),
        fetch(`/api/series/${seriesId}/standings`),
      ]);

      if (!seriesRes.ok) {
        setError(seriesRes.status === 404 ? 'Series not found' : 'Failed to load series');
        return;
      }

      setSeries((await seriesRes.json()).series);
      if (eventsRes.ok) setEvents((await eventsRes.json()).events ?? []);
      if (standingsRes.ok) setStandings((await standingsRes.json()).standings ?? []);
    } catch (err) {
      logger.error('Error loading series:', err);
      setError('Failed to load series data');
    } finally {
      setLoading(false);
    }
  }, [seriesId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const fetchOptions = useCallback(async () => {
    try {
      const [matchRes, tournamentRes] = await Promise.all([
        fetch('/api/matches?status=complete&status=battle&status=assign&status=gather'),
        fetch('/api/tournaments'),
      ]);
      if (matchRes.ok) {
        const data = await matchRes.json();
        setMatchOptions((data.matches ?? data ?? []).map((m: MatchOption) => ({ id: m.id, name: m.name })));
      }
      if (tournamentRes.ok) {
        const data = await tournamentRes.json();
        setTournamentOptions((data.tournaments ?? data ?? []).map((t: TournamentOption) => ({ id: t.id, name: t.name })));
      }
    } catch (err) {
      logger.error('Error fetching options:', err);
    }
  }, []);

  const handleOpenAddEvent = () => {
    setAddEventType('match');
    setAddEventId('');
    setAddEventMultiplier(1);
    fetchOptions();
    openAddEvent();
  };

  const handleAddEvent = async () => {
    if (!addEventId) { showError('Please select an event'); return; }
    setAddingSaving(true);
    try {
      const res = await fetch(`/api/series/${seriesId}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_type: addEventType,
          match_id: addEventType === 'match' ? addEventId : undefined,
          tournament_id: addEventType === 'tournament' ? addEventId : undefined,
          points_multiplier: addEventMultiplier,
        }),
      });
      if (!res.ok) {
        showError('Failed to add event');
        return;
      }
      showSuccess('Event added to series');
      closeAddEvent();
      fetchData();
    } catch (err) {
      logger.error('Error adding event:', err);
      showError('An error occurred');
    } finally {
      setAddingSaving(false);
    }
  };

  const handleRemoveEvent = async (eventId: string) => {
    try {
      const res = await fetch(`/api/series/${seriesId}/events/${eventId}`, { method: 'DELETE' });
      if (res.ok) {
        showSuccess('Event removed');
        fetchData();
      } else {
        showError('Failed to remove event');
      }
    } catch (err) {
      logger.error('Error removing event:', err);
    }
  };

  if (loading) {
    return (
      <Container>
        <Center style={{ minHeight: 400 }}>
          <Loader size="lg" />
        </Center>
      </Container>
    );
  }

  if (error || !series) {
    return (
      <Container size="md" py="xl">
        <Stack>
          <Alert color="red" icon={<IconAlertCircle size={16} />}>{error ?? 'Series not found'}</Alert>
          <Anchor onClick={() => router.push('/series')} style={{ cursor: 'pointer' }}>← Back to Series</Anchor>
        </Stack>
      </Container>
    );
  }

  const eventOptions = addEventType === 'match'
    ? matchOptions.map(m => ({ value: m.id, label: m.name }))
    : tournamentOptions.map(t => ({ value: t.id, label: t.name }));

  return (
    <Container size="xl" py="xl">
      <Stack gap="lg">
        <PageHeader
          icon={IconTimeline}
          title={series.name}
          subtitle={series.description ?? 'Championship Series'}
          breadcrumbs={[{ title: 'Series', href: '/series' }]}
          action={
            <Group gap="xs">
              <Badge color={STATUS_COLOR[series.status]} variant="light">{series.status}</Badge>
              <Button
                size="xs"
                variant="outline"
                leftSection={<IconEdit size={14} />}
                onClick={() => router.push(`/series/${seriesId}/edit`)}
              >
                Edit
              </Button>
            </Group>
          }
        />

        {series.livestream_link && (
          <Text size="sm">
            🎥 Livestream:{' '}
            <Anchor href={series.livestream_link} target="_blank" rel="noopener noreferrer">
              {series.livestream_link}
            </Anchor>
          </Text>
        )}

        {(series.start_date || series.end_date) && (
          <Group gap="xs">
            {series.start_date && (
              <Text size="sm" c="dimmed">
                Starts: {parseDbTimestamp(series.start_date)?.toLocaleDateString()}
              </Text>
            )}
            {series.end_date && (
              <Text size="sm" c="dimmed">
                → Ends: {parseDbTimestamp(series.end_date)?.toLocaleDateString()}
              </Text>
            )}
          </Group>
        )}

        <Tabs defaultValue="events">
          <Tabs.List>
            <Tabs.Tab value="events" leftSection={<IconSwords size={14} />}>Events ({events.length})</Tabs.Tab>
            <Tabs.Tab value="standings" leftSection={<IconMedal size={14} />}>Standings ({standings.length})</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="events" pt="md">
            <Stack gap="md">
              <Group justify="flex-end">
                <Button
                  size="sm"
                  leftSection={<IconPlus size={14} />}
                  onClick={handleOpenAddEvent}
                >
                  Add Event
                </Button>
              </Group>

              {events.length === 0 ? (
                <Card withBorder p="xl" ta="center">
                  <Text c="dimmed">No events added yet. Add matches or tournaments to this series.</Text>
                </Card>
              ) : (
                <Table striped>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>#</Table.Th>
                      <Table.Th>Type</Table.Th>
                      <Table.Th>ID</Table.Th>
                      <Table.Th>Date</Table.Th>
                      <Table.Th>Multiplier</Table.Th>
                      <Table.Th></Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {events.map((ev) => (
                      <Table.Tr key={ev.id}>
                        <Table.Td>{ev.event_order}</Table.Td>
                        <Table.Td>
                          <Badge variant="light" color={ev.event_type === 'match' ? 'blue' : 'violet'} size="sm">
                            {ev.event_type}
                          </Badge>
                        </Table.Td>
                        <Table.Td>
                          <Anchor
                            size="sm"
                            onClick={() => router.push(ev.event_type === 'match' ? `/matches/${ev.match_id}` : `/tournaments/${ev.tournament_id}`)}
                            style={{ cursor: 'pointer' }}
                          >
                            {ev.match_id ?? ev.tournament_id}
                          </Anchor>
                        </Table.Td>
                        <Table.Td>
                          {ev.event_date ? (parseDbTimestamp(ev.event_date)?.toLocaleDateString() ?? '—') : '—'}
                        </Table.Td>
                        <Table.Td>×{ev.points_multiplier}</Table.Td>
                        <Table.Td>
                          <ActionIcon
                            color="red"
                            variant="subtle"
                            size="sm"
                            onClick={() => handleRemoveEvent(ev.id)}
                          >
                            <IconTrash size={14} />
                          </ActionIcon>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              )}
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="standings" pt="md">
            {standings.length === 0 ? (
              <Card withBorder p="xl" ta="center">
                <Text c="dimmed">No standings yet. Add events and complete matches to see standings.</Text>
              </Card>
            ) : (
              <Table striped>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Rank</Table.Th>
                    <Table.Th>Player</Table.Th>
                    <Table.Th>Points</Table.Th>
                    <Table.Th>Events Played</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {standings.map((row) => (
                    <Table.Tr key={row.participant_id}>
                      <Table.Td>
                        <Group gap="xs">
                          {row.rank === 1 && <IconTrophy size={16} color="gold" />}
                          {row.rank === 2 && <IconTrophy size={16} color="silver" />}
                          {row.rank === 3 && <IconTrophy size={16} color="#cd7f32" />}
                          <Text fw={row.rank <= 3 ? 700 : 400}>#{row.rank}</Text>
                        </Group>
                      </Table.Td>
                      <Table.Td><Text fw={500}>{row.username}</Text></Table.Td>
                      <Table.Td><Text fw={700}>{row.total_points.toFixed(1)}</Text></Table.Td>
                      <Table.Td>{row.events_played}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
          </Tabs.Panel>
        </Tabs>
      </Stack>

      <Modal
        opened={addEventOpened}
        onClose={closeAddEvent}
        title="Add Event to Series"
        size="md"
      >
        <Stack gap="md">
          <Select
            label="Event Type"
            data={[
              { value: 'match', label: 'Match' },
              { value: 'tournament', label: 'Tournament' },
            ]}
            value={addEventType}
            onChange={(v) => { setAddEventType(v as 'match' | 'tournament'); setAddEventId(''); }}
          />

          <Select
            label={addEventType === 'match' ? 'Select Match' : 'Select Tournament'}
            placeholder={`Search ${addEventType}s...`}
            data={eventOptions}
            value={addEventId || null}
            onChange={(v) => setAddEventId(v ?? '')}
            searchable
            nothingFoundMessage={`No ${addEventType}s found`}
          />

          <NumberInput
            label="Points Multiplier"
            description="Points from this event are multiplied by this value"
            value={addEventMultiplier}
            onChange={(v) => setAddEventMultiplier(Number(v) || 1)}
            min={0.1}
            max={10}
            step={0.5}
            decimalScale={1}
          />

          <Divider />

          <Group justify="flex-end">
            <Button variant="outline" onClick={closeAddEvent} disabled={addingSaving}>Cancel</Button>
            <Button onClick={handleAddEvent} loading={addingSaving}>Add Event</Button>
          </Group>
        </Stack>
      </Modal>
    </Container>
  );
}
