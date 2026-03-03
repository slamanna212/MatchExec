'use client'

import { logger } from '@/lib/logger/client';
import { use, useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
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
  Select
} from '@mantine/core';
import { IconUsers, IconAlertCircle, IconMapRoute } from '@tabler/icons-react';

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
  team_assignment?: 'reserve' | 'blue' | 'red';
  receives_map_codes?: boolean;
}

interface MatchData {
  id: string;
  name: string;
  status: string;
  map_codes_supported?: boolean;
}

export default function AssignPage({
  params
}: {
  params: Promise<{ matchId: string }>
}) {
  const { matchId } = use(params);
  const router = useRouter();

  const [match, setMatch] = useState<MatchData | null>(null);
  const [participants, setParticipants] = useState<MatchParticipant[]>([]);
  const [signupConfig, setSignupConfig] = useState<SignupConfig | null>(null);
  const [mapCodesSupported, setMapCodesSupported] = useState(false);
  const [scoringType, setScoringType] = useState<'Normal' | 'FFA' | 'Position'>('Normal');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [draggedParticipant, setDraggedParticipant] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);

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

        const [participantsRes, matchRes, gamesRes] = await Promise.all([
          fetch(`/api/matches/${matchId}/participants`),
          fetch(`/api/matches/${matchId}`),
          fetch(`/api/matches/${matchId}/games`)
        ]);

        if (!matchRes.ok) {
          setError(matchRes.status === 404 ? 'Match not found' : 'Failed to load match');
          return;
        }

        const matchData: MatchData = await matchRes.json();
        setMatch(matchData);
        setMapCodesSupported(matchData.map_codes_supported || false);

        if (participantsRes.ok) {
          const data = await participantsRes.json();
          setParticipants(data.participants.map((p: MatchParticipant) => ({
            ...p,
            team_assignment: p.team_assignment || 'reserve',
            receives_map_codes: p.receives_map_codes || false
          })));
          if (data.signupConfig) {
            setSignupConfig(data.signupConfig);
          }
        }

        if (gamesRes.ok) {
          const gamesData = await gamesRes.json();
          if (gamesData.games?.length > 0) {
            setScoringType(gamesData.games[0].mode_scoring_type || 'Normal');
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

  const handleTeamChange = useCallback((participantId: string, newTeam: 'reserve' | 'blue' | 'red') => {
    setParticipants(prev =>
      prev.map(p =>
        p.id === participantId
          ? { ...p, team_assignment: newTeam }
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

  const handleDrop = (e: React.DragEvent, targetTeam: 'reserve' | 'blue' | 'red') => {
    e.preventDefault();
    const participantId = e.dataTransfer.getData('text/plain');
    if (participantId) {
      handleTeamChange(participantId, targetTeam);
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
        team: p.team_assignment,
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

  const getTeamParticipants = (team: 'reserve' | 'blue' | 'red') => {
    return participants.filter(p => p.team_assignment === team);
  };

  const getPlayerCardStyles = (team: 'reserve' | 'blue' | 'red') => {
    switch (team) {
      case 'blue':
        return {
          backgroundColor: 'var(--mantine-color-blue-2)',
          borderColor: 'var(--mantine-color-blue-4)'
        };
      case 'red':
        return {
          backgroundColor: 'var(--mantine-color-red-2)',
          borderColor: 'var(--mantine-color-red-4)'
        };
      case 'reserve':
        return {
          backgroundColor: '#FFD54F',
          borderColor: '#FFC107'
        };
      default:
        return {};
    }
  };

  const getBadgeColor = (team: 'reserve' | 'blue' | 'red') => {
    switch (team) {
      case 'blue': return 'orange';
      case 'red': return 'cyan';
      case 'reserve': return 'violet';
      default: return 'dark';
    }
  };

  const renderParticipantCard = (participant: MatchParticipant, index: number) => {
    const isDragging = draggedParticipant === participant.id;
    const isDragDisabled = isMobile;

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
            : getPlayerCardStyles(participant.team_assignment || 'reserve')
          ),
          cursor: isDragDisabled ? 'default' : 'grab'
        }}
        draggable={!isDragDisabled}
        onDragStart={isDragDisabled ? undefined : (e) => handleDragStart(e, participant.id)}
        onDragEnd={isDragDisabled ? undefined : handleDragEnd}
      >
        <Group justify="space-between" align="center" mb="xs">
          <Group align="center">
            <Avatar size="sm" color={getBadgeColor(participant.team_assignment || 'reserve')} variant="filled" src={participant.avatar_url || undefined}>
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
                  ? `var(--mantine-color-${getBadgeColor(participant.team_assignment || 'reserve')}-6)`
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
          value={participant.team_assignment}
          onChange={(value) => handleTeamChange(participant.id, value as 'reserve' | 'blue' | 'red')}
          data={
            scoringType === 'Position'
              ? [
                  { value: 'reserve', label: 'Reserve' },
                  { value: 'blue', label: 'Blue Team' }
                ]
              : [
                  { value: 'reserve', label: 'Reserve' },
                  { value: 'blue', label: 'Blue Team' },
                  { value: 'red', label: 'Red Team' }
                ]
          }
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
              const displayLabel = field?.label || key.replace(/([A-Z])/g, ' $1').trim();

              return (
                <Badge key={key} size="xs" variant="filled" color={getBadgeColor(participant.team_assignment || 'reserve')}>
                  {displayLabel}: {String(value)}
                </Badge>
              );
            })}
          </Group>
        )}
      </Card>
    );
  };

  const renderTeamSection = (team: 'reserve' | 'blue' | 'red', title: string, color: string) => {
    const teamParticipants = getTeamParticipants(team);

    return (
      <Card
        shadow="xs"
        padding="lg"
        radius="md"
        withBorder
        onDragOver={isMobile ? undefined : handleDragOver}
        onDrop={isMobile ? undefined : (e) => handleDrop(e, team)}
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

  return (
    <Container size="xl" py="xl">
      <Stack gap="lg">
        <div>
          <Breadcrumbs mb="sm">
            <Anchor onClick={() => router.push('/matches')} style={{ cursor: 'pointer' }}>Matches</Anchor>
            <Anchor onClick={() => router.push(`/matches/${matchId}`)} style={{ cursor: 'pointer' }}>{match.name}</Anchor>
            <Text>Assign Players</Text>
          </Breadcrumbs>

          <Group align="center" gap="sm">
            <ThemeIcon size="lg" variant="light" color="violet">
              <IconUsers size={20} />
            </ThemeIcon>
            <Title order={2}>{match.name}</Title>
          </Group>
        </div>

        <Text size="sm" c="dimmed">
          Use the dropdown or drag players between columns to assign them to Reserve, Blue Team, or Red Team.
        </Text>

        {/* Desktop Layout */}
        <div className="hidden md:block">
          <Grid>
            <Grid.Col span={scoringType === 'Position' ? 6 : 4}>
              {renderTeamSection('reserve', 'Reserve', 'gray')}
            </Grid.Col>
            <Grid.Col span={scoringType === 'Position' ? 6 : 4}>
              {renderTeamSection('blue', 'Blue Team', 'blue')}
            </Grid.Col>
            {scoringType !== 'Position' && (
              <Grid.Col span={4}>
                {renderTeamSection('red', 'Red Team', 'red')}
              </Grid.Col>
            )}
          </Grid>
        </div>

        {/* Mobile Layout */}
        <div className="block md:hidden">
          <Stack gap="lg">
            {renderTeamSection('reserve', 'Reserve', 'gray')}
            {renderTeamSection('blue', 'Blue Team', 'blue')}
            {scoringType !== 'Position' && renderTeamSection('red', 'Red Team', 'red')}
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
