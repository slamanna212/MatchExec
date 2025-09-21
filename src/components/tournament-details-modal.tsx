'use client'

import { useState, useEffect } from 'react';
import { 
  Modal,
  Stack,
  Group,
  Avatar,
  Text,
  RingProgress,
  Divider,
  Button,
  Badge,
  Card,
  Grid,
  Loader,
  SegmentedControl
} from '@mantine/core';
import { IconTrophy } from '@tabler/icons-react';
import { modals } from '@mantine/modals';
import { Tournament, TOURNAMENT_FLOW_STEPS, TournamentTeam, TournamentTeamMember } from '@/shared/types';
import { TournamentBracket } from './tournament-bracket';

interface TournamentWithGame extends Tournament {
  game_name?: string;
  game_icon?: string;
  game_color?: string;
  participant_count?: number;
}

interface BracketMatch {
  id: string;
  round: number;
  bracket_type: 'winners' | 'losers' | 'final';
  team1?: {
    id: string;
    name: string;
  };
  team2?: {
    id: string;
    name: string;
  };
  winner?: string;
  status: 'pending' | 'ongoing' | 'completed';
  match_order: number;
}

interface TournamentWithDetails extends TournamentWithGame {
  teams?: (TournamentTeam & { members?: TournamentTeamMember[] })[];
  matches?: BracketMatch[];
}

interface TournamentDetailsModalProps {
  opened: boolean;
  onClose: () => void;
  tournament: TournamentWithGame | null;
  onDelete?: (tournament: TournamentWithGame) => void;
  onAssign?: (tournament: TournamentWithGame) => void;
}

export function TournamentDetailsModal({
  opened,
  onClose,
  tournament,
  onDelete,
  onAssign
}: TournamentDetailsModalProps) {
  const [activeTab, setActiveTab] = useState('overview');
  const [tournamentDetails, setTournamentDetails] = useState<TournamentWithDetails | null>(null);
  const [loading, setLoading] = useState(false);

  // Fetch tournament details when modal opens
  useEffect(() => {
    if (opened && tournament) {
      const fetchTournamentDetails = async () => {
        setLoading(true);
        try {
          // Fetch tournament details and matches in parallel
          const [tournamentResponse, matchesResponse] = await Promise.all([
            fetch(`/api/tournaments/${tournament.id}`),
            fetch(`/api/tournaments/${tournament.id}/matches`)
          ]);

          if (tournamentResponse.ok) {
            const tournamentData = await tournamentResponse.json();
            let matches: BracketMatch[] = [];

            if (matchesResponse.ok) {
              const matchesData = await matchesResponse.json();
              matches = matchesData.matches || [];
            }

            setTournamentDetails({
              ...tournamentData,
              matches
            });
          }
        } catch (error) {
          console.error('Error fetching tournament details:', error);
        } finally {
          setLoading(false);
        }
      };

      fetchTournamentDetails();
    }
  }, [opened, tournament]);

  if (!tournament) return null;

  const handleDelete = () => {
    if (!onDelete) return;

    const hasActiveMatches = tournament.status === 'battle';
    const hasParticipants = (tournament.participant_count || 0) > 0;

    modals.openConfirmModal({
      title: 'Delete Tournament',
      children: (
        <Stack gap="sm">
          <Text size="sm">
            Are you sure you want to delete the tournament &quot;{tournament.name}&quot;?
          </Text>
          {hasActiveMatches && (
            <Text size="sm" c="orange" fw={500}>
              ⚠️ This tournament has active matches that will also be deleted.
            </Text>
          )}
          {hasParticipants && (
            <Text size="sm" c="orange" fw={500}>
              ⚠️ This tournament has {tournament.participant_count} registered participants.
            </Text>
          )}
          <Text size="sm" c="red" fw={500}>
            This action cannot be undone.
          </Text>
        </Stack>
      ),
      labels: { confirm: 'Delete Tournament', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: () => onDelete(tournament),
    });
  };

  const renderOverviewTab = () => (
    <Stack gap="sm">
      {tournament.description && (
        <div>
          <Text size="sm" fw={500} c="dimmed">Description:</Text>
          <Text size="sm">{tournament.description}</Text>
        </div>
      )}

      <Group justify="space-between">
        <Text size="sm" fw={500} c="dimmed">Format:</Text>
        <Badge variant="light">
          {tournament.format === 'single-elimination' ? 'Single Elimination' : 'Double Elimination'}
        </Badge>
      </Group>

      <Group justify="space-between">
        <Text size="sm" fw={500} c="dimmed">Rounds/Match:</Text>
        <Text size="sm">{tournament.rounds_per_match}</Text>
      </Group>

      <Group justify="space-between">
        <Text size="sm" fw={500} c="dimmed">Participants:</Text>
        <Text size="sm">
          {tournament.participant_count || 0}
          {tournament.max_participants ? ` / ${tournament.max_participants}` : ''}
        </Text>
      </Group>

      {tournament.start_time && (
        <Group justify="space-between">
          <Text size="sm" fw={500} c="dimmed">Start Time:</Text>
          <Text size="sm">{new Date(tournament.start_time).toLocaleString('en-US', {
            year: 'numeric',
            month: 'numeric',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
          })}</Text>
        </Group>
      )}

      <Group justify="space-between">
        <Text size="sm" fw={500} c="dimmed">Created:</Text>
        <Text size="sm">{new Date(tournament.created_at).toLocaleString('en-US', {
          year: 'numeric',
          month: 'numeric',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        })}</Text>
      </Group>
    </Stack>
  );

  const getTeamCardStyles = (teamIndex: number) => {
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

  const getTeamBadgeColor = (teamIndex: number) => {
    const colors = ['orange', 'cyan', 'yellow', 'grape', 'lime', 'indigo'];
    return colors[teamIndex % colors.length] || 'dark';
  };

  const renderTeamsTab = () => (
    <Stack gap="md">
      {loading ? (
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <Loader size="md" />
        </div>
      ) : tournamentDetails?.teams && tournamentDetails.teams.length > 0 ? (
        <Grid>
          {tournamentDetails.teams.map((team, teamIndex) => {
            const teamStyles = getTeamCardStyles(teamIndex);
            const badgeColor = getTeamBadgeColor(teamIndex);

            return (
              <Grid.Col key={team.id} span={{ base: 12, sm: 6 }}>
                <Card
                  withBorder
                  p="md"
                  style={{
                    height: '100%',
                    minHeight: '200px',
                    display: 'flex',
                    flexDirection: 'column'
                  }}
                >
                  <Group mb="sm">
                    <IconTrophy size="1.2rem" color={teamStyles.borderColor} />
                    <Text fw={500} lineClamp={2} style={{ flex: 1 }}>{team.team_name}</Text>
                    <Badge size="sm" variant="filled" color={badgeColor}>
                      {team.members?.length || 0} members
                    </Badge>
                  </Group>
                  <Divider mb="sm" opacity={0.7} />

                  <div style={{ flex: 1, overflow: 'auto' }}>
                    {team.members && team.members.length > 0 ? (
                      <Stack gap="xs">
                        {team.members.map((member, memberIndex) => (
                          <Group key={member.id} gap="sm">
                            <Avatar size="sm" color={badgeColor} variant="filled">
                              {memberIndex + 1}
                            </Avatar>
                            <Text size="sm">{member.username}</Text>
                          </Group>
                        ))}
                      </Stack>
                    ) : (
                      <Text size="sm" c="dimmed" fs="italic">No members yet</Text>
                    )}
                  </div>
                </Card>
              </Grid.Col>
            );
          })}
        </Grid>
      ) : (
        <Card withBorder p="xl">
          <Text size="sm" c="dimmed" ta="center">No teams registered yet</Text>
        </Card>
      )}
    </Stack>
  );

  const renderBracketTab = () => (
    <Stack gap="md">
      {tournamentDetails ? (
        <TournamentBracket
          tournamentId={tournament.id}
          format={tournament.format}
          teams={(tournamentDetails.teams || []).map(team => ({
            id: team.id,
            name: team.team_name,
            members: team.members || []
          }))}
          matches={tournamentDetails.matches || []}
          isAssignMode={tournament.status === 'assign'}
          onGenerateMatches={async () => {
            try {
              const response = await fetch(`/api/tournaments/${tournament.id}/generate-matches`, {
                method: 'POST'
              });
              if (response.ok) {
                // Refresh tournament details to show generated matches
                const [tournamentResponse, matchesResponse] = await Promise.all([
                  fetch(`/api/tournaments/${tournament.id}`),
                  fetch(`/api/tournaments/${tournament.id}/matches`)
                ]);

                if (tournamentResponse.ok) {
                  const tournamentData = await tournamentResponse.json();
                  let matches: BracketMatch[] = [];

                  if (matchesResponse.ok) {
                    const matchesData = await matchesResponse.json();
                    matches = matchesData.matches || [];
                  }

                  setTournamentDetails({
                    ...tournamentData,
                    matches
                  });
                }
              } else {
                console.error('Failed to generate matches');
              }
            } catch (error) {
              console.error('Error generating matches:', error);
            }
          }}
          onBracketAssignment={async (assignments) => {
            try {
              const response = await fetch(`/api/tournaments/${tournament.id}/bracket-assignments`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({ assignments })
              });
              if (!response.ok) {
                console.error('Failed to save bracket assignments');
              }
            } catch (error) {
              console.error('Error saving bracket assignments:', error);
            }
          }}
        />
      ) : (
        <Card withBorder p="xl">
          <Text size="sm" c="dimmed" ta="center">Loading bracket...</Text>
        </Card>
      )}
    </Stack>
  );

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Tournament Details"
      size="lg"
    >
      <Stack gap="md">
        <Group>
          <Avatar
            src={tournament.game_icon}
            alt={tournament.game_name}
            size="lg"
          />
          <Stack gap="xs" style={{ flex: 1 }}>
            <Text size="xl" fw={600}>{tournament.name}</Text>
            <Text size="md" c="dimmed">{tournament.game_name}</Text>
          </Stack>
          <RingProgress
            size={60}
            thickness={6}
            sections={[
              {
                value: TOURNAMENT_FLOW_STEPS[tournament.status]?.progress || 0,
                color: tournament.game_color || '#95a5a6'
              }
            ]}
          />
        </Group>

        <Divider />

        <SegmentedControl
          value={activeTab}
          onChange={setActiveTab}
          data={[
            { label: 'Overview', value: 'overview' },
            { label: 'Teams', value: 'teams' },
            { label: 'Bracket', value: 'bracket' }
          ]}
          fullWidth
        />

        {activeTab === 'overview' && renderOverviewTab()}
        {activeTab === 'teams' && renderTeamsTab()}
        {activeTab === 'bracket' && renderBracketTab()}

        <Divider />

        <Group justify="space-between">
          <Group gap="xs">
            {onDelete && tournament.status !== 'complete' && (
              <Button
                color="red"
                variant="light"
                onClick={handleDelete}
              >
                Delete Tournament
              </Button>
            )}
            {(tournament.status === 'gather' || tournament.status === 'assign') && (
              <Button
                variant="light"
                onClick={() => {
                  onClose();
                  onAssign?.(tournament);
                }}
              >
                Assign
              </Button>
            )}
          </Group>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}