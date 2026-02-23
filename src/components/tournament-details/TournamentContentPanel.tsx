'use client'

import { useState } from 'react';
import {
  Stack,
  Group,
  Text,
  Badge,
  Card,
  SimpleGrid,
  Avatar,
  Divider,
  Loader,
  SegmentedControl
} from '@mantine/core';
import { IconTrophy } from '@tabler/icons-react';
import type { Tournament, TournamentTeam, TournamentTeamMember } from '@/shared/types';
import { TournamentBracket } from '../tournament-bracket';
import classes from '../gradient-segmented-control.module.css';

interface TournamentWithGame extends Omit<Tournament, 'created_at' | 'updated_at' | 'start_date' | 'start_time'> {
  game_name?: string;
  game_icon?: string;
  game_color?: string;
  participant_count?: number;
  created_at: string;
  updated_at: string;
  start_time?: string;
}

interface TeamWithMembers extends TournamentTeam {
  members: TournamentTeamMember[];
}

interface BracketMatch {
  id: string;
  round: number;
  bracket_type: 'winners' | 'losers' | 'final';
  team1?: { id: string; name: string };
  team2?: { id: string; name: string };
  winner?: string;
  status: 'pending' | 'ongoing' | 'complete';
  match_order: number;
}

interface BracketAssignment {
  position: number;
  teamId: string;
}

interface TeamStanding {
  team_id: string;
  team_name: string;
  matches_played: number;
  wins: number;
  losses: number;
}

interface TournamentContentPanelProps {
  tournament: TournamentWithGame;
  teams: TeamWithMembers[];
  matches: BracketMatch[];
  standings: TeamStanding[];
  loading: boolean;
  onGenerateMatches: () => Promise<void>;
  onBracketAssignment: (assignments: BracketAssignment[]) => Promise<void>;
}

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

export function TournamentContentPanel({
  tournament,
  teams,
  matches,
  standings,
  loading,
  onGenerateMatches,
  onBracketAssignment
}: TournamentContentPanelProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'teams' | 'bracket' | 'standings'>('overview');

  return (
    <Stack gap="md">
      {/* Tab Navigation */}
      <div style={{ width: '100%', overflowX: 'auto' }}>
        <Group justify="center" mb="sm">
          <SegmentedControl
            radius="xl"
            size="sm"
            data={[
              { label: 'Overview', value: 'overview' },
              {
                label: <span>Teams<span className="hidden md:inline"> ({teams.length})</span></span>,
                value: 'teams'
              },
              { label: 'Bracket', value: 'bracket' },
              { label: 'Standings', value: 'standings' }
            ]}
            value={activeTab}
            onChange={(value) => setActiveTab(value as 'overview' | 'teams' | 'bracket' | 'standings')}
            classNames={classes}
            style={{ minWidth: 'fit-content' }}
          />
        </Group>
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
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
      )}

      {/* Teams Tab */}
      {activeTab === 'teams' && (
        <Stack gap="md">
          {loading ? (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
              <Loader size="md" />
            </div>
          ) : teams.length > 0 ? (
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
              {teams.map((team, teamIndex) => {
                const teamStyles = getTeamCardStyles(teamIndex);
                const badgeColor = getTeamBadgeColor(teamIndex);

                return (
                  <Card
                    key={team.id}
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
                              <Avatar
                                size="sm"
                                src={member.avatar_url || null}
                                color={badgeColor}
                                variant={member.avatar_url ? undefined : 'filled'}
                              >
                                {!member.avatar_url && (memberIndex + 1)}
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
                );
              })}
            </SimpleGrid>
          ) : (
            <Card withBorder p="xl">
              <Text size="sm" c="dimmed" ta="center">No teams registered yet</Text>
            </Card>
          )}
        </Stack>
      )}

      {/* Bracket Tab */}
      {activeTab === 'bracket' && (
        <TournamentBracket
          tournamentId={tournament.id}
          format={tournament.format}
          teams={teams.map(team => ({
            id: team.id,
            name: team.team_name,
            members: team.members || []
          }))}
          matches={matches}
          isAssignMode={tournament.status === 'assign'}
          onGenerateMatches={onGenerateMatches}
          onBracketAssignment={onBracketAssignment}
        />
      )}

      {/* Standings Tab */}
      {activeTab === 'standings' && (
        <Stack gap="md">
          {loading ? (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
              <Loader size="md" />
            </div>
          ) : standings.length > 0 ? (
            <Stack gap="xs">
              {standings.map((team, index) => (
                <Card
                  key={team.team_id}
                  withBorder
                  p="md"
                  style={{
                    borderLeft: index === 0 ? '4px solid var(--mantine-color-yellow-5)' : undefined
                  }}
                >
                  <Group justify="space-between" wrap="nowrap">
                    <Group gap="md">
                      <Avatar size="md" color={index === 0 ? 'yellow' : 'blue'} variant="filled">
                        {index + 1}
                      </Avatar>
                      <div>
                        <Text fw={500} size="sm">{team.team_name}</Text>
                        <Text size="xs" c="dimmed">
                          {team.matches_played} {team.matches_played === 1 ? 'match' : 'matches'} played
                        </Text>
                      </div>
                    </Group>
                    <Group gap="lg">
                      <div style={{ textAlign: 'center' }}>
                        <Text size="xs" c="dimmed" fw={500}>WINS</Text>
                        <Text size="lg" fw={700} c="green">{team.wins}</Text>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <Text size="xs" c="dimmed" fw={500}>LOSSES</Text>
                        <Text size="lg" fw={700} c="red">{team.losses}</Text>
                      </div>
                    </Group>
                  </Group>
                </Card>
              ))}
            </Stack>
          ) : (
            <Card withBorder p="xl">
              <Text size="sm" c="dimmed" ta="center">No standings available yet</Text>
            </Card>
          )}
        </Stack>
      )}
    </Stack>
  );
}
