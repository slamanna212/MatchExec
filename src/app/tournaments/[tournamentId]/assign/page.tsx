'use client'

import { logger } from '@/lib/logger/client';
import { use, useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useMediaQuery } from '@mantine/hooks';
import {
  Container,
  Stack,
  Group,
  Text,
  Title,
  Breadcrumbs,
  Anchor,
  Loader,
  Center,
  Alert,
  Button,
  ThemeIcon,
  Card,
  Grid,
  Badge,
  Avatar,
  Divider,
  ActionIcon,
  TextInput,
  Select
} from '@mantine/core';
import { IconUsers, IconAlertCircle, IconPlus, IconX, IconSearch, IconStar } from '@tabler/icons-react';
import type { TournamentTeam, TournamentTeamMember } from '@/shared/types';
import { showError, showSuccess } from '@/lib/notifications';

interface SignupField {
  id: string;
  label: string;
  type: 'text' | 'select' | 'number';
  required?: boolean;
  options?: string[];
  placeholder?: string;
}

interface SignupConfig {
  id: string;
  name: string;
  fields: SignupField[];
  created_at: string;
  updated_at: string;
}

interface TournamentParticipant {
  id: string;
  user_id: string;
  username: string;
  joined_at: string;
  team_assignment?: string;
  signup_data?: Record<string, unknown>;
}

interface ParticipantApiResponse {
  id: string;
  user_id: string;
  username: string;
  joined_at: string;
  team_assignment: string | null;
  signup_data: Record<string, unknown> | null;
}

interface TeamWithMembers extends TournamentTeam {
  members: TournamentTeamMember[];
}

interface TournamentData {
  id: string;
  name: string;
  status: string;
}

export default function AssignTournamentPage({
  params
}: {
  params: Promise<{ tournamentId: string }>
}) {
  const { tournamentId } = use(params);
  const router = useRouter();
  const isMobile = useMediaQuery('(max-width: 768px)');

  const [tournament, setTournament] = useState<TournamentData | null>(null);
  const [participants, setParticipants] = useState<TournamentParticipant[]>([]);
  const [teams, setTeams] = useState<TeamWithMembers[]>([]);
  const [signupConfig, setSignupConfig] = useState<SignupConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draggedParticipant, setDraggedParticipant] = useState<string | null>(null);
  const [newTeamName, setNewTeamName] = useState('');
  const [selectedTeamId, setSelectedTeamId] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [captainByTeam, setCaptainByTeam] = useState<Record<string, string>>({});

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);

      const [tournamentRes, participantsRes, teamsRes] = await Promise.all([
        fetch(`/api/tournaments/${tournamentId}`),
        fetch(`/api/tournaments/${tournamentId}/participants`),
        fetch(`/api/tournaments/${tournamentId}/teams`)
      ]);

      if (!tournamentRes.ok) {
        setError(tournamentRes.status === 404 ? 'Tournament not found' : 'Failed to load tournament');
        return;
      }

      const tournamentData = await tournamentRes.json();
      setTournament({ id: tournamentData.id, name: tournamentData.name, status: tournamentData.status });

      if (teamsRes.ok) {
        const teamsData = await teamsRes.json();
        setTeams(teamsData);
        const captains: Record<string, string> = {};
        for (const team of teamsData) {
          const captain = team.members?.find((m: TournamentTeamMember) => m.is_captain);
          if (captain) captains[team.id] = captain.user_id;
        }
        setCaptainByTeam(captains);
      }

      if (participantsRes.ok) {
        const participantsData = await participantsRes.json();
        const allParticipants: TournamentParticipant[] = participantsData.participants.map((p: ParticipantApiResponse) => ({
          id: p.id,
          user_id: p.user_id,
          username: p.username,
          joined_at: p.joined_at,
          team_assignment: p.team_assignment || 'reserve',
          signup_data: p.signup_data
        }));
        setParticipants(allParticipants);

        if (participantsData.signupConfig) {
          setSignupConfig(participantsData.signupConfig);
        }
      }
    } catch (err) {
      logger.error('Error fetching tournament assignment data:', err);
      setError('An error occurred while loading the assignment interface');
    } finally {
      setLoading(false);
    }
  }, [tournamentId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCreateTeam = async () => {
    if (!newTeamName.trim()) return;

    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/teams`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamName: newTeamName.trim() })
      });

      if (response.ok) {
        const newTeam = await response.json();
        setTeams(prev => [...prev, { ...newTeam, members: [] }]);
        setNewTeamName('');
      }
    } catch (err) {
      logger.error('Error creating team:', err);
    }
  };

  const handleDeleteTeam = async (teamId: string) => {
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/teams?teamId=${teamId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        setTeams(prev => prev.filter(team => team.id !== teamId));
        setParticipants(prev => prev.map(p =>
          p.team_assignment === teamId ? { ...p, team_assignment: 'reserve' } : p
        ));
      }
    } catch (err) {
      logger.error('Error deleting team:', err);
    }
  };

  const handleTeamChange = (participantId: string, newTeamId: string) => {
    setParticipants(prev => prev.map(p =>
      p.id === participantId ? { ...p, team_assignment: newTeamId } : p
    ));
    // Clear captain if player moves to reserve
    if (newTeamId === 'reserve') {
      const participant = participants.find(p => p.id === participantId);
      if (participant) {
        setCaptainByTeam(prev => {
          const updated = { ...prev };
          for (const [teamId, userId] of Object.entries(updated)) {
            if (userId === participant.user_id) delete updated[teamId];
          }
          return updated;
        });
      }
    }
  };

  const handleCaptainToggle = (teamId: string, userId: string) => {
    setCaptainByTeam(prev => ({
      ...prev,
      [teamId]: prev[teamId] === userId ? '' : userId
    }));
  };

  const handleSaveAssignments = async () => {
    setSaving(true);
    try {
      const teamAssignments = teams.map(team => ({
        teamId: team.id,
        members: participants
          .filter(p => p.team_assignment === team.id)
          .map(p => ({ userId: p.user_id, username: p.username, isCaptain: captainByTeam[team.id] === p.user_id }))
      }));

      const response = await fetch(`/api/tournaments/${tournamentId}/teams`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teams: teamAssignments })
      });

      if (response.ok) {
        showSuccess('Team assignments saved successfully!');
        router.push(`/tournaments/${tournamentId}`);
      } else {
        const errData = await response.json();
        showError(errData.error || 'Failed to save team assignments');
      }
    } catch (err) {
      logger.error('Error saving team assignments:', err);
      showError('Failed to save team assignments');
    } finally {
      setSaving(false);
    }
  };

  const getParticipantsByTeam = (teamId: string) => {
    return participants.filter(p => p.team_assignment === teamId);
  };

  const getReserveParticipants = () => {
    const reserveParticipants = participants.filter(p => !p.team_assignment || p.team_assignment === 'reserve');

    if (!searchTerm.trim()) {
      return reserveParticipants;
    }

    return reserveParticipants.filter(participant =>
      participant.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (participant.signup_data && Object.values(participant.signup_data).some(value =>
        String(value).toLowerCase().includes(searchTerm.toLowerCase())
      ))
    );
  };

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, participantId: string) => {
    if (isMobile) {
      e.preventDefault();
      return;
    }
    setDraggedParticipant(participantId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (isMobile) {
      e.preventDefault();
      return;
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, targetTeamId: string) => {
    if (isMobile) {
      e.preventDefault();
      return;
    }
    e.preventDefault();
    if (draggedParticipant) {
      handleTeamChange(draggedParticipant, targetTeamId);
      setDraggedParticipant(null);
    }
  };

  const getPlayerCardStyles = (teamId: string | undefined) => {
    if (teamId === 'reserve' || !teamId) {
      return { backgroundColor: '#FFD54F', borderColor: '#FFC107' };
    }
    const teamIndex = teams.findIndex(t => t.id === teamId);
    const colors = [
      { backgroundColor: 'var(--mantine-color-blue-2)', borderColor: 'var(--mantine-color-blue-4)' },
      { backgroundColor: 'var(--mantine-color-red-2)', borderColor: 'var(--mantine-color-red-4)' },
      { backgroundColor: 'var(--mantine-color-green-2)', borderColor: 'var(--mantine-color-green-4)' },
      { backgroundColor: 'var(--mantine-color-purple-2)', borderColor: 'var(--mantine-color-purple-4)' },
      { backgroundColor: 'var(--mantine-color-orange-2)', borderColor: 'var(--mantine-color-orange-4)' },
      { backgroundColor: 'var(--mantine-color-teal-2)', borderColor: 'var(--mantine-color-teal-4)' }
    ];
    return colors[teamIndex % colors.length] || { backgroundColor: 'var(--mantine-color-gray-2)', borderColor: 'var(--mantine-color-gray-4)' };
  };

  const getBadgeColor = (teamId: string | undefined) => {
    if (teamId === 'reserve' || !teamId) return 'violet';
    const teamIndex = teams.findIndex(t => t.id === teamId);
    const colors = ['orange', 'cyan', 'yellow', 'grape', 'lime', 'indigo'];
    return colors[teamIndex % colors.length] || 'dark';
  };

  if (loading) {
    return (
      <Container>
        <Center style={{ minHeight: '400px' }}>
          <Stack align="center" gap="md">
            <Loader size="lg" />
            <Text c="dimmed">Loading assignment interface...</Text>
          </Stack>
        </Center>
      </Container>
    );
  }

  if (error || !tournament) {
    return (
      <Container size="md" py="xl">
        <Stack gap="md">
          <Alert color="red" icon={<IconAlertCircle size={16} />}>
            {error || 'Tournament not found'}
          </Alert>
          <Anchor onClick={() => router.push('/tournaments')} style={{ cursor: 'pointer' }}>
            ← Back to Tournaments
          </Anchor>
        </Stack>
      </Container>
    );
  }

  return (
    <Container size="xl" py="xl">
      <Stack gap="lg">
        <div>
          <Breadcrumbs mb="sm">
            <Anchor onClick={() => router.push('/tournaments')} style={{ cursor: 'pointer' }}>Tournaments</Anchor>
            <Anchor onClick={() => router.push(`/tournaments/${tournamentId}`)} style={{ cursor: 'pointer' }}>{tournament.name}</Anchor>
            <Text>Assign Teams</Text>
          </Breadcrumbs>

          <Group align="center" gap="sm">
            <ThemeIcon size="lg" variant="light" color="violet">
              <IconUsers size={20} />
            </ThemeIcon>
            <Title order={2}>{tournament.name} — Assign Teams</Title>
          </Group>
        </div>

        {/* Create new team section */}
        <Card withBorder p="md">
          <Group>
            <TextInput
              placeholder="Enter team name"
              value={newTeamName}
              onChange={(e) => setNewTeamName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newTeamName.trim()) {
                  handleCreateTeam();
                }
              }}
              style={{ flex: 1 }}
            />
            <Button
              leftSection={<IconPlus size="1rem" />}
              onClick={handleCreateTeam}
              disabled={!newTeamName.trim()}
            >
              Create Team
            </Button>
          </Group>
        </Card>

        <Grid>
          {/* Reserve column - Left side */}
          <Grid.Col span={{ base: 12, md: 6 }}>
            <Card
              withBorder
              p="md"
              style={{ height: '600px', overflow: 'auto' }}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, 'reserve')}
            >
              <Group justify="space-between" mb="sm">
                <Text fw={500}>Reserve Players</Text>
                <Badge size="sm" variant="light">
                  {getReserveParticipants().length}
                </Badge>
              </Group>
              <TextInput
                placeholder="Search players..."
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.currentTarget.value)}
                leftSection={<IconSearch size="0.9rem" />}
                size="sm"
                mb="sm"
                styles={{ input: { fontSize: '0.875rem' } }}
              />
              <Divider mb="sm" />
              <Stack gap="xs">
                {getReserveParticipants().map((participant, index) => (
                  <Card
                    key={participant.id}
                    shadow="md"
                    padding="md"
                    radius="md"
                    withBorder
                    style={{
                      ...getPlayerCardStyles(participant.team_assignment),
                      cursor: isMobile ? 'default' : 'grab'
                    }}
                    draggable={!isMobile}
                    onDragStart={(e) => handleDragStart(e, participant.id)}
                  >
                    <Group justify="space-between" align="center" mb="xs">
                      <Group align="center">
                        <Avatar size="sm" color={getBadgeColor(participant.team_assignment)} variant="filled">
                          {index + 1}
                        </Avatar>
                        <div>
                          <Text fw={500} size="sm" c="dark">{participant.username}</Text>
                          <Text size="xs" c="gray.7">
                            Joined: {new Date(participant.joined_at).toLocaleDateString('en-US')}
                          </Text>
                        </div>
                      </Group>
                    </Group>

                    <Select
                      size="xs"
                      value={participant.team_assignment || 'reserve'}
                      onChange={(value) => handleTeamChange(participant.id, value || 'reserve')}
                      data={[
                        { value: 'reserve', label: 'Reserve' },
                        ...teams.map(team => ({
                          value: team.id,
                          label: team.team_name
                        }))
                      ]}
                      w={120}
                      mb="xs"
                      styles={{
                        input: {
                          backgroundColor: 'light-dark(rgba(255,255,255,0.8), rgba(37, 38, 43, 0.8))',
                          border: '1px solid var(--mantine-color-gray-5)',
                          backdropFilter: 'blur(2px)',
                          color: 'light-dark(var(--mantine-color-black), var(--mantine-color-white))'
                        }
                      }}
                    />

                    {participant.signup_data && Object.keys(participant.signup_data).length > 0 && (
                      <Group mt="xs" gap="xs">
                        {Object.entries(participant.signup_data).map(([key, value]) => {
                          const field = signupConfig?.fields.find(f => f.id === key);
                          let displayLabel = field?.label;

                          if (!displayLabel) {
                            displayLabel = key
                              .replace(/([A-Z])/g, ' $1')
                              .replace(/[-_]/g, ' ')
                              .replace(/\b\w/g, l => l.toUpperCase())
                              .trim();
                          }

                          return (
                            <Badge key={key} size="xs" variant="filled" color={getBadgeColor(participant.team_assignment)}>
                              {displayLabel}: {String(value)}
                            </Badge>
                          );
                        })}
                      </Group>
                    )}
                  </Card>
                ))}
              </Stack>
            </Card>
          </Grid.Col>

          {/* Team roster - Right side */}
          <Grid.Col span={{ base: 12, md: 6 }}>
            <Card
              withBorder
              p={0}
              style={{ height: '600px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
              onDragOver={handleDragOver}
              onDrop={(e) => selectedTeamId && handleDrop(e, selectedTeamId)}
            >
              <Group justify="space-between" p="md" pb="sm">
                {teams.length > 0 ? (
                  <Select
                    placeholder="Choose a team"
                    value={selectedTeamId}
                    onChange={(value) => setSelectedTeamId(value || '')}
                    data={teams.map(team => ({
                      value: team.id,
                      label: team.team_name
                    }))}
                    style={{ flex: 1, maxWidth: '70%' }}
                    size="sm"
                    renderOption={({ option }) => (
                      <Group justify="space-between" w="100%">
                        <span>{option.label}</span>
                        <Badge size="xs" color="violet" variant="filled">
                          {getParticipantsByTeam(option.value).length}
                        </Badge>
                      </Group>
                    )}
                  />
                ) : (
                  <Text fw={500} c="dimmed">No teams created</Text>
                )}
                {selectedTeamId && (
                  <Group gap="xs">
                    <Badge size="sm" variant="light">
                      {getParticipantsByTeam(selectedTeamId).length}
                    </Badge>
                    <ActionIcon
                      variant="light"
                      color="red"
                      size="sm"
                      onClick={() => {
                        handleDeleteTeam(selectedTeamId);
                        setSelectedTeamId('');
                      }}
                    >
                      <IconX size="0.75rem" />
                    </ActionIcon>
                  </Group>
                )}
              </Group>
              <Divider />
              <div style={{ flex: 1, overflow: 'auto', padding: 'var(--mantine-spacing-md)' }}>
                {selectedTeamId ? (
                  <Stack gap="xs">
                    {getParticipantsByTeam(selectedTeamId).map((participant, index) => {
                      const isCaptain = captainByTeam[selectedTeamId] === participant.user_id;
                      return (
                      <Card
                        key={participant.id}
                        shadow="md"
                        padding="md"
                        radius="md"
                        withBorder
                        style={{
                          ...getPlayerCardStyles(participant.team_assignment),
                          cursor: isMobile ? 'default' : 'grab'
                        }}
                        draggable={!isMobile}
                        onDragStart={(e) => handleDragStart(e, participant.id)}
                      >
                        <Group justify="space-between" align="center" mb="xs">
                          <Group align="center">
                            <Avatar size="sm" color={getBadgeColor(participant.team_assignment)} variant="filled">
                              {index + 1}
                            </Avatar>
                            <div>
                              <Text fw={500} size="sm" c="dark">{participant.username}</Text>
                              <Text size="xs" c="gray.7">
                                Joined: {new Date(participant.joined_at).toLocaleDateString('en-US')}
                              </Text>
                            </div>
                          </Group>
                          <ActionIcon
                            size="lg"
                            variant={isCaptain ? 'filled' : 'light'}
                            color={isCaptain ? 'yellow' : 'dark'}
                            onClick={() => handleCaptainToggle(selectedTeamId, participant.user_id)}
                            title={isCaptain ? 'Team Captain (click to unset)' : 'Set as Team Captain'}
                          >
                            <IconStar size={18} fill={isCaptain ? 'currentColor' : 'none'} />
                          </ActionIcon>
                        </Group>

                        <Select
                          size="xs"
                          value={participant.team_assignment || 'reserve'}
                          onChange={(value) => handleTeamChange(participant.id, value || 'reserve')}
                          data={[
                            { value: 'reserve', label: 'Reserve' },
                            ...teams.map(team => ({
                              value: team.id,
                              label: team.team_name
                            }))
                          ]}
                          w={120}
                          mb="xs"
                          styles={{
                            input: {
                              backgroundColor: 'light-dark(rgba(255,255,255,0.8), rgba(37, 38, 43, 0.8))',
                              border: '1px solid var(--mantine-color-gray-5)',
                              backdropFilter: 'blur(2px)',
                              color: 'light-dark(var(--mantine-color-black), var(--mantine-color-white))'
                            }
                          }}
                        />

                        {participant.signup_data && Object.keys(participant.signup_data).length > 0 && (
                          <Group mt="xs" gap="xs">
                            {Object.entries(participant.signup_data).map(([key, value]) => {
                              const field = signupConfig?.fields.find(f => f.id === key);
                              let displayLabel = field?.label;

                              if (!displayLabel) {
                                displayLabel = key
                                  .replace(/([A-Z])/g, ' $1')
                                  .replace(/[-_]/g, ' ')
                                  .replace(/\b\w/g, l => l.toUpperCase())
                                  .trim();
                              }

                              return (
                                <Badge key={key} size="xs" variant="filled" color={getBadgeColor(participant.team_assignment)}>
                                  {displayLabel}: {String(value)}
                                </Badge>
                              );
                            })}
                          </Group>
                        )}
                      </Card>
                      );
                    })}
                  </Stack>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                    <Stack align="center" gap="md">
                      <Text size="lg" c="dimmed">
                        {teams.length === 0 ? 'No teams created yet' : 'Select a team to view and edit'}
                      </Text>
                      <Text size="sm" c="dimmed" ta="center">
                        {teams.length === 0
                          ? 'Create your first team using the form above'
                          : 'Choose a team from the dropdown above to view its members'
                        }
                      </Text>
                    </Stack>
                  </div>
                )}
              </div>
            </Card>
          </Grid.Col>
        </Grid>

        <Text size="sm" c="dimmed" ta="center">
          {isMobile
            ? 'Use the dropdown selectors on each player card to assign teams. Select a team on the right to view its members.'
            : 'Drag players from reserve to the selected team, or use the dropdown selectors. Select a team on the right to view its members.'
          }
        </Text>

        <Divider />

        <Group justify="space-between">
          <Button
            variant="outline"
            onClick={() => router.push(`/tournaments/${tournamentId}`)}
            disabled={saving}
          >
            Back to Tournament
          </Button>
          <Button
            onClick={handleSaveAssignments}
            loading={saving}
          >
            Save Assignments
          </Button>
        </Group>
      </Stack>
    </Container>
  );
}
