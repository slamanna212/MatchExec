'use client'

import { useState, useEffect, useCallback } from 'react';
import { useMediaQuery } from '@mantine/hooks';
import {
  Modal,
  Text,
  Button,
  Card,
  Group,
  Stack,
  Grid,
  Badge,
  Avatar,
  Loader,
  Divider,
  ActionIcon,
  TextInput,
  Select
} from '@mantine/core';
import { IconPlus, IconX } from '@tabler/icons-react';
import { TournamentTeam, TournamentTeamMember } from '@/shared/types';

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
  team_assignment?: string; // team ID or 'reserve'
  signup_data?: Record<string, unknown>;
}

interface TeamWithMembers extends TournamentTeam {
  members: TournamentTeamMember[];
}

interface AssignTournamentTeamsModalProps {
  isOpen: boolean;
  onClose: () => void;
  tournamentId: string;
  tournamentName: string;
}

export function AssignTournamentTeamsModal({ 
  isOpen, 
  onClose, 
  tournamentId, 
  tournamentName 
}: AssignTournamentTeamsModalProps) {
  const [participants, setParticipants] = useState<TournamentParticipant[]>([]);
  const [teams, setTeams] = useState<TeamWithMembers[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draggedParticipant, setDraggedParticipant] = useState<string | null>(null);
  const [newTeamName, setNewTeamName] = useState('');
  const [signupConfig, setSignupConfig] = useState<SignupConfig | null>(null);
  const isMobile = useMediaQuery('(max-width: 768px)');

  const fetchData = useCallback(async () => {
    if (!tournamentId) return;
    
    setLoading(true);
    try {
      // Fetch both tournament participants and teams
      const [participantsResponse, teamsResponse] = await Promise.all([
        fetch(`/api/tournaments/${tournamentId}/participants`),
        fetch(`/api/tournaments/${tournamentId}/teams`)
      ]);

      if (teamsResponse.ok) {
        const teamsData = await teamsResponse.json();
        setTeams(teamsData);
      }

      if (participantsResponse.ok) {
        const participantsData = await participantsResponse.json();

        // Convert participants to the expected format
        const allParticipants: TournamentParticipant[] = participantsData.participants.map((p: any) => ({
          id: p.id,
          user_id: p.user_id,
          username: p.username,
          joined_at: p.joined_at,
          team_assignment: p.team_assignment || 'reserve',
          signup_data: p.signup_data
        }));

        setParticipants(allParticipants);

        // Set signup config if available
        if (participantsData.signupConfig) {
          setSignupConfig(participantsData.signupConfig);
        }
      }
    } catch (error) {
      console.error('Error fetching tournament data:', error);
    } finally {
      setLoading(false);
    }
  }, [tournamentId]);

  useEffect(() => {
    if (isOpen) {
      fetchData();
    }
  }, [isOpen, fetchData]);

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
    } catch (error) {
      console.error('Error creating team:', error);
    }
  };

  const handleDeleteTeam = async (teamId: string) => {
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/teams?teamId=${teamId}`, {
        method: 'DELETE'
      });
      
      if (response.ok) {
        setTeams(prev => prev.filter(team => team.id !== teamId));
        // Move team members back to reserve
        setParticipants(prev => prev.map(p => 
          p.team_assignment === teamId ? { ...p, team_assignment: 'reserve' } : p
        ));
      }
    } catch (error) {
      console.error('Error deleting team:', error);
    }
  };

  const handleTeamChange = (participantId: string, newTeamId: string) => {
    setParticipants(prev => prev.map(p => 
      p.id === participantId ? { ...p, team_assignment: newTeamId } : p
    ));
  };

  const handleSaveAssignments = async () => {
    setSaving(true);
    try {
      // Group participants by team
      const teamAssignments = teams.map(team => ({
        teamId: team.id,
        members: participants
          .filter(p => p.team_assignment === team.id)
          .map(p => ({ userId: p.user_id, username: p.username }))
      }));

      const response = await fetch(`/api/tournaments/${tournamentId}/teams`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teams: teamAssignments })
      });

      if (response.ok) {
        onClose();
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to save team assignments');
      }
    } catch (error) {
      console.error('Error saving team assignments:', error);
      alert('Failed to save team assignments');
    } finally {
      setSaving(false);
    }
  };

  const getParticipantsByTeam = (teamId: string) => {
    return participants.filter(p => p.team_assignment === teamId);
  };

  const getReserveParticipants = () => {
    return participants.filter(p => !p.team_assignment || p.team_assignment === 'reserve');
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
      return {
        backgroundColor: '#FFD54F',
        borderColor: '#FFC107'
      };
    }
    // For team assignments, use different colors for each team
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
    if (teamId === 'reserve' || !teamId) {
      return 'violet'; // Primary site color
    }
    const teamIndex = teams.findIndex(t => t.id === teamId);
    const colors = ['orange', 'cyan', 'yellow', 'grape', 'lime', 'indigo'];
    return colors[teamIndex % colors.length] || 'dark';
  };

  return (
    <Modal
      opened={isOpen}
      onClose={onClose}
      title={`Assign Teams - ${tournamentName}`}
      size="xl"
      centered
    >
      {loading ? (
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <Loader size="lg" />
        </div>
      ) : (
        <Stack gap="md">
          {/* Create new team section */}
          <Card withBorder p="md">
            <Group>
              <TextInput
                placeholder="Enter team name"
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
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
            {/* Reserve column */}
            <Grid.Col span={{ base: 12, md: 4 }}>
              <Card
                withBorder
                p="md"
                style={{ minHeight: '300px' }}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, 'reserve')}
              >
                <Group justify="space-between" mb="sm">
                  <Text fw={500}>Reserve</Text>
                  <Badge size="sm" variant="light">
                    {getReserveParticipants().length}
                  </Badge>
                </Group>
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
                              // Convert various naming conventions to readable format
                              displayLabel = key
                                .replace(/([A-Z])/g, ' $1') // camelCase to spaces
                                .replace(/[-_]/g, ' ') // kebab-case and snake_case to spaces
                                .replace(/\b\w/g, l => l.toUpperCase()) // capitalize first letter of each word
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

            {/* Team columns */}
            {teams.map((team) => (
              <Grid.Col key={team.id} span={{ base: 12, md: 4 }}>
                <Card
                  withBorder
                  p="md"
                  style={{ minHeight: '300px' }}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, team.id)}
                >
                  <Group justify="space-between" mb="sm">
                    <Text fw={500} truncate style={{ flex: 1 }}>
                      {team.team_name}
                    </Text>
                    <Badge size="sm" variant="light">
                      {getParticipantsByTeam(team.id).length}
                    </Badge>
                    <ActionIcon
                      variant="light"
                      color="red"
                      size="sm"
                      onClick={() => handleDeleteTeam(team.id)}
                    >
                      <IconX size="0.75rem" />
                    </ActionIcon>
                  </Group>
                  <Divider mb="sm" />
                  <Stack gap="xs">
                    {getParticipantsByTeam(team.id).map((participant, index) => (
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
                                // Convert various naming conventions to readable format
                                displayLabel = key
                                  .replace(/([A-Z])/g, ' $1') // camelCase to spaces
                                  .replace(/[-_]/g, ' ') // kebab-case and snake_case to spaces
                                  .replace(/\b\w/g, l => l.toUpperCase()) // capitalize first letter of each word
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
            ))}
          </Grid>

          <Text size="sm" c="dimmed" ta="center">
            {isMobile
              ? "Use the dropdown selectors on each player card to assign teams"
              : "Drag players between teams or use the dropdown selectors on each player card"
            }
          </Text>

          <Divider />

          <Group justify="end">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button 
              onClick={handleSaveAssignments}
              loading={saving}
            >
              Save Assignments
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}