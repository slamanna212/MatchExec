'use client'

import { logger } from '@/lib/logger/client';
import { use, useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Container,
  Stack,
  Group,
  Text,
  Anchor,
  Loader,
  Center,
  Alert,
  Button,
  Card,
  Grid,
  Badge,
  Avatar,
  Divider,
  ActionIcon,
  Select
} from '@mantine/core';
import { IconUsers, IconAlertCircle, IconMapRoute, IconGripVertical } from '@tabler/icons-react';
import { PageHeader } from '@/components/PageHeader';
import { SetupPhase } from '@/components/setup/setup-phase';

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

interface MatchParticipant {
  id: string;
  user_id: string;
  username: string;
  avatar_url?: string | null;
  joined_at: string;
  signup_data: Record<string, unknown>;
  team_id?: string | null;
  receives_map_codes?: boolean;
}

interface MatchTeam {
  id: string;
  team_name: string;
  team_color?: string;
  team_order: number;
  is_reserve: boolean;
}

interface MatchData {
  id: string;
  name: string;
  status: string;
  map_codes_supported?: boolean;
  scoring_type?: 'Normal' | 'FFA' | 'Position';
  setup_components?: string[] | null;
}

const TEAM_COLORS = ['blue', 'red', 'green', 'orange', 'grape', 'cyan', 'yellow', 'pink'];

export default function AssignPage({
  params
}: {
  params: Promise<{ matchId: string }>
}) {
  const { matchId } = use(params);
  const router = useRouter();

  const [match, setMatch] = useState<MatchData | null>(null);
  const [participants, setParticipants] = useState<MatchParticipant[]>([]);
  const [teams, setTeams] = useState<MatchTeam[]>([]);
  const [signupConfig, setSignupConfig] = useState<SignupConfig | null>(null);
  const [mapCodesSupported, setMapCodesSupported] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [draggedParticipant, setDraggedParticipant] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  const scoringType = match?.scoring_type ?? 'Normal';

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);

    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);

        const matchRes = await fetch(`/api/matches/${matchId}`);
        if (!matchRes.ok) {
          setError(matchRes.status === 404 ? 'Match not found' : 'Failed to load match');
          return;
        }
        const matchData: MatchData = await matchRes.json();
        setMatch(matchData);
        setMapCodesSupported(matchData.map_codes_supported || false);

        // Normal mode needs participants + match_teams to render the
        // team-assignment board. FFA/Position render via SetupPhase, which
        // fetches its own participant list.
        if ((matchData.scoring_type ?? 'Normal') === 'Normal') {
          const [participantsRes, teamsRes] = await Promise.all([
            fetch(`/api/matches/${matchId}/participants`),
            fetch(`/api/matches/${matchId}/teams`),
          ]);

          if (participantsRes.ok) {
            const data = await participantsRes.json();
            setParticipants(data.participants.map((p: MatchParticipant) => ({
              ...p,
              receives_map_codes: p.receives_map_codes || false
            })));
            if (data.signupConfig) {
              setSignupConfig(data.signupConfig);
            }
          }

          if (teamsRes.ok) {
            const teamsData = await teamsRes.json();
            setTeams(teamsData.teams ?? []);
          }
        }
      } catch (err) {
        logger.error('Error loading assign page:', err);
        setError('An error occurred while loading the assignment interface');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [matchId]);

  const activeTeams = useMemo(() => teams.filter(t => !t.is_reserve).sort((a, b) => a.team_order - b.team_order), [teams]);
  const reserveTeam = useMemo(() => teams.find(t => t.is_reserve), [teams]);

  const handleTeamChange = useCallback((participantId: string, newTeamId: string) => {
    setParticipants(prev =>
      prev.map(p =>
        p.id === participantId
          ? { ...p, team_id: newTeamId }
          : p
      )
    );
  }, []);

  const handleMapCodesToggle = useCallback((participantId: string) => {
    setParticipants(prev =>
      prev.map(p =>
        p.id === participantId
          ? { ...p, receives_map_codes: !p.receives_map_codes }
          : p
      )
    );
  }, []);

  const handleDragStart = (e: React.DragEvent, participantId: string) => {
    e.dataTransfer.setData('text/plain', participantId);
    e.dataTransfer.effectAllowed = 'move';
    setDraggedParticipant(participantId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetTeamId: string) => {
    e.preventDefault();
    const participantId = e.dataTransfer.getData('text/plain');
    if (participantId) {
      handleTeamChange(participantId, targetTeamId);
    }
    setDraggedParticipant(null);
  };

  const handleDragEnd = () => {
    setDraggedParticipant(null);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const teamAssignments = participants.map(p => ({
        participantId: p.id,
        teamId: p.team_id ?? reserveTeam?.id,
        receives_map_codes: p.receives_map_codes || false
      }));

      const response = await fetch(`/api/matches/${matchId}/assign-teams`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamAssignments })
      });

      if (response.ok) {
        router.push(`/matches/${matchId}`);
      } else {
        logger.error('Failed to save team assignments');
      }
    } catch (err) {
      logger.error('Error saving team assignments:', err);
    } finally {
      setSaving(false);
    }
  };

  const getTeamParticipants = (teamId: string | undefined) => {
    return participants.filter(p => (p.team_id ?? reserveTeam?.id) === teamId);
  };

  const getTeamColor = (teamId: string | null | undefined) => {
    if (!teamId || teamId === reserveTeam?.id) return 'gray';
    const idx = activeTeams.findIndex(t => t.id === teamId);
    return idx >= 0 ? TEAM_COLORS[idx % TEAM_COLORS.length] : 'gray';
  };

  const renderParticipantCard = (participant: MatchParticipant, index: number) => {
    const isDragging = draggedParticipant === participant.id;
    const isDragDisabled = isMobile;
    const color = getTeamColor(participant.team_id);

    return (
      <Card
        key={participant.id}
        shadow="md"
        padding="md"
        radius="md"
        withBorder
        mb="sm"
        style={{
          ...(isDragging
            ? { backgroundColor: 'var(--mantine-color-gray-2)', borderColor: 'var(--mantine-color-gray-4)', opacity: 0.6 }
            : { backgroundColor: `var(--mantine-color-${color}-2)`, borderColor: `var(--mantine-color-${color}-4)` }
          ),
          cursor: isDragDisabled ? 'default' : 'grab'
        }}
        draggable={!isDragDisabled}
        onDragStart={isDragDisabled ? undefined : (e) => handleDragStart(e, participant.id)}
        onDragEnd={isDragDisabled ? undefined : handleDragEnd}
      >
        <Group justify="space-between" align="center" mb="xs">
          <Group align="center">
            {!isDragDisabled && <IconGripVertical size={16} color="var(--mantine-color-gray-5)" />}
            <Avatar size="sm" color={color} variant="filled" src={participant.avatar_url || undefined}>
              {index + 1}
            </Avatar>
            <div>
              <Text fw={500} size="sm" c="dark">{participant.username}</Text>
              <Text size="xs" c="gray.7">
                Joined: {new Date(participant.joined_at).toLocaleDateString('en-US')}
              </Text>
            </div>
          </Group>
          {mapCodesSupported && (
            <ActionIcon
              size="xl"
              variant="subtle"
              onClick={() => handleMapCodesToggle(participant.id)}
              title={participant.receives_map_codes ? "Will receive map codes" : "Click to receive map codes"}
              style={{
                border: 'none',
                padding: 0,
                minWidth: 'unset',
                minHeight: 'unset',
                width: 'auto',
                height: 'auto',
                backgroundColor: 'transparent',
                color: participant.receives_map_codes
                  ? `var(--mantine-color-${color}-6)`
                  : 'var(--mantine-color-gray-5)'
              }}
              styles={{
                root: {
                  '&:hover': {
                    backgroundColor: 'transparent'
                  }
                }
              }}
            >
              <IconMapRoute size={30} />
            </ActionIcon>
          )}
        </Group>

        <Select
          size="xs"
          value={participant.team_id ?? reserveTeam?.id}
          onChange={(value) => value && handleTeamChange(participant.id, value)}
          data={[
            ...(reserveTeam ? [{ value: reserveTeam.id, label: 'Reserve' }] : []),
            ...activeTeams.map(t => ({ value: t.id, label: t.team_name }))
          ]}
          w={140}
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
              const displayLabel = field?.label || key.replace(/([A-Z])/g, ' $1').trim();

              return (
                <Badge key={key} size="xs" variant="filled" color={color}>
                  {displayLabel}: {String(value)}
                </Badge>
              );
            })}
          </Group>
        )}
      </Card>
    );
  };

  const renderTeamSection = (teamId: string | undefined, title: string, color: string) => {
    const teamParticipants = getTeamParticipants(teamId);

    return (
      <Card
        shadow="xs"
        padding="lg"
        radius="md"
        withBorder
        onDragOver={isMobile ? undefined : handleDragOver}
        onDrop={isMobile || !teamId ? undefined : (e) => handleDrop(e, teamId)}
        style={{ minHeight: '200px' }}
      >
        <Group justify="space-between" mb="md">
          <Text size="lg" fw={600} c={color}>{title}</Text>
          <Badge size="lg" color={color} variant="light">
            {teamParticipants.length}
          </Badge>
        </Group>

        <Stack gap="sm">
          {teamParticipants.length === 0 ? (
            <Text size="sm" c="dimmed" ta="center" py="xl">
              No players assigned
            </Text>
          ) : (
            teamParticipants.map((participant, index) =>
              renderParticipantCard(participant, index)
            )
          )}
        </Stack>
      </Card>
    );
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

  if (error || !match) {
    return (
      <Container size="md" py="xl">
        <Stack gap="md">
          <Alert color="red" icon={<IconAlertCircle size={16} />}>
            {error || 'Match not found'}
          </Alert>
          <Anchor onClick={() => router.push('/matches')} style={{ cursor: 'pointer' }}>
            ← Back to Matches
          </Anchor>
        </Stack>
      </Container>
    );
  }

  // FFA / Position: no team assignment needed — dispatch to the scoring_type-aware
  // setup components (confirm participants, grid order, qualifying, etc).
  if (scoringType !== 'Normal') {
    return (
      <Container size="lg" py="xl">
        <Stack gap="lg">
          <PageHeader
            icon={IconUsers}
            title={match.name}
            subtitle={scoringType === 'FFA' ? 'Confirm participants' : 'Race setup'}
            breadcrumbs={[{ title: 'Matches', href: '/matches' }, { title: match.name, href: `/matches/${matchId}` }]}
          />

          <SetupPhase matchId={matchId} setupComponents={match.setup_components ?? undefined} />

          <Divider />

          <Group justify="flex-end">
            <Button onClick={() => router.push(`/matches/${matchId}`)}>
              Continue
            </Button>
          </Group>
        </Stack>
      </Container>
    );
  }

  const columnSpan = activeTeams.length > 0 ? Math.floor(12 / (activeTeams.length + 1)) : 4;

  return (
    <Container size="xl" py="xl">
      <Stack gap="lg">
        <PageHeader
          icon={IconUsers}
          title={match.name}
          subtitle="Assign players to teams"
          breadcrumbs={[{ title: 'Matches', href: '/matches' }, { title: match.name, href: `/matches/${matchId}` }]}
        />

        <Text size="sm" c="dimmed">
          Use the dropdown or drag players between columns to assign them to a team or Reserve.
        </Text>

        {/* Desktop Layout */}
        <div className="hidden md:block">
          <Grid>
            <Grid.Col span={columnSpan}>
              {renderTeamSection(reserveTeam?.id, 'Reserve', 'gray')}
            </Grid.Col>
            {activeTeams.map((team, idx) => (
              <Grid.Col span={columnSpan} key={team.id}>
                {renderTeamSection(team.id, team.team_name, TEAM_COLORS[idx % TEAM_COLORS.length])}
              </Grid.Col>
            ))}
          </Grid>
        </div>

        {/* Mobile Layout */}
        <div className="block md:hidden">
          <Stack gap="lg">
            {renderTeamSection(reserveTeam?.id, 'Reserve', 'gray')}
            {activeTeams.map((team, idx) => (
              <div key={team.id}>
                {renderTeamSection(team.id, team.team_name, TEAM_COLORS[idx % TEAM_COLORS.length])}
              </div>
            ))}
          </Stack>
        </div>

        <Divider />

        <Group justify="space-between">
          <Button
            variant="outline"
            onClick={() => router.push(`/matches/${matchId}`)}
            disabled={saving}
          >
            Back to Match
          </Button>
          <Button
            onClick={handleSave}
            loading={saving}
          >
            Save Team Assignments
          </Button>
        </Group>
      </Stack>
    </Container>
  );
}
