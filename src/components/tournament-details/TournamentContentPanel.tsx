'use client'

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Stack,
  Group,
  Text,
  Badge,
  Card,
  SimpleGrid,
  Avatar,
  Divider,
  Skeleton,
  SegmentedControl,
  Button,
  ActionIcon
} from '@mantine/core';
import { IconTrophy, IconStar, IconUsers, IconSwords, IconBrandDiscord } from '@tabler/icons-react';
import type { TournamentWithGameDetails, TournamentTeam, TournamentTeamMember } from '@/shared/types';
import { TournamentBracket } from '../tournament-bracket';
import { StageRing } from '../StageRing';
import { EmptyState } from '../EmptyState';
import { SectionLabel } from '../SectionLabel';
import classes from '../gradient-segmented-control.module.css';

// Use shared type as local alias
type TournamentWithGame = TournamentWithGameDetails;

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
  rawStatus: string;
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
  onStartMatch: (matchId: string) => Promise<void>;
  onStartAllMatches: (matchIds: string[]) => Promise<void>;
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
  onBracketAssignment,
  onStartMatch,
  onStartAllMatches
}: TournamentContentPanelProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'teams' | 'bracket' | 'standings' | 'control'>(() => {
    if (typeof window === 'undefined') return 'teams';
    const saved = localStorage.getItem(`tournament_tab_${tournament.id}`);
    const valid = ['teams', 'bracket', 'standings', 'control'] as const;
    return (valid as readonly string[]).includes(saved ?? '') ? (saved as typeof valid[number]) : 'teams';
  });

  return (
    <Stack gap="md">
      {/* Tab Navigation */}
      <div style={{ width: '100%', overflowX: 'auto' }}>
        <Group justify="center" mb="sm">
          <SegmentedControl
            radius="xl"
            size="sm"
            data={[
              {
                label: <span>Teams<span className="hidden md:inline"> ({teams.length})</span></span>,
                value: 'teams'
              },
              { label: 'Bracket', value: 'bracket' },
              { label: 'Standings', value: 'standings' },
              { label: 'Control', value: 'control' }
            ]}
            value={activeTab}
            onChange={(value) => {
              localStorage.setItem(`tournament_tab_${tournament.id}`, value);
              setActiveTab(value as 'teams' | 'bracket' | 'standings' | 'control');
            }}
            classNames={classes}
            style={{ minWidth: 'fit-content' }}
          />
        </Group>
      </div>

      {/* Teams Tab */}
      {activeTab === 'teams' && (
        <Stack gap="md">
          {loading ? (
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
              {Array.from({ length: 4 }).map((_, i) => (
                <Card key={i} withBorder p="md" style={{ minHeight: '200px' }}>
                  <Stack gap="sm">
                    <Group>
                      <Skeleton height={20} width={20} />
                      <Skeleton height={16} style={{ flex: 1 }} />
                      <Skeleton height={20} width={70} radius="xl" />
                    </Group>
                    <Skeleton height={1} />
                    <Stack gap="xs">
                      {Array.from({ length: 3 }).map((_, j) => (
                        <Group key={j} gap="sm">
                          <Skeleton height={26} width={26} circle />
                          <Skeleton height={14} width="50%" />
                        </Group>
                      ))}
                    </Stack>
                  </Stack>
                </Card>
              ))}
            </SimpleGrid>
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
                      flexDirection: 'column',
                      borderLeft: `4px solid ${teamStyles.borderColor}`
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
                            <Group key={member.id} gap="sm" justify="space-between">
                              <Group gap="sm">
                                <Avatar
                                  size="sm"
                                  src={member.avatar_url || null}
                                  color={badgeColor}
                                  variant={member.avatar_url ? undefined : 'filled'}
                                >
                                  {!member.avatar_url && (memberIndex + 1)}
                                </Avatar>
                                <Text size="sm">{member.username}</Text>
                                {member.discord_user_id && (
                                  <ActionIcon
                                    component="a"
                                    href={`https://discord.com/users/${member.discord_user_id}`}
                                    target="_blank"
                                    variant="subtle"
                                    color="indigo"
                                    size="xs"
                                    title="View Discord profile"
                                  >
                                    <IconBrandDiscord size={12} />
                                  </ActionIcon>
                                )}
                              </Group>
                              {member.is_captain && (
                                <IconStar size={14} color="var(--mantine-color-yellow-5)" fill="var(--mantine-color-yellow-5)" />
                              )}
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
            <Card withBorder>
              <EmptyState
                icon={IconUsers}
                title="No teams registered yet"
                description="Teams will appear here once participants are assigned"
              />
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
            <Stack gap="xs" style={{ width: '80%', margin: '0 auto' }}>
              {Array.from({ length: 5 }).map((_, i) => (
                <Card key={i} withBorder p="md">
                  <Group justify="space-between">
                    <Group gap="md">
                      <Skeleton height={40} width={40} circle />
                      <Stack gap={4}>
                        <Skeleton height={14} width={120} />
                        <Skeleton height={12} width={80} />
                      </Stack>
                    </Group>
                    <Group gap="lg">
                      <Skeleton height={40} width={40} />
                      <Skeleton height={40} width={40} />
                    </Group>
                  </Group>
                </Card>
              ))}
            </Stack>
          ) : standings.length > 0 ? (
            <Stack gap="xs" style={{ width: '80%', margin: '0 auto' }}>
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
                        <SectionLabel>Wins</SectionLabel>
                        <Text size="lg" fw={700} c="green">{team.wins}</Text>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <SectionLabel>Losses</SectionLabel>
                        <Text size="lg" fw={700} c="red">{team.losses}</Text>
                      </div>
                    </Group>
                  </Group>
                </Card>
              ))}
            </Stack>
          ) : (
            <Card withBorder>
              <EmptyState
                icon={IconTrophy}
                title="No standings yet"
                description="Standings will appear once matches are played"
              />
            </Card>
          )}
        </Stack>
      )}

      {/* Control Tab */}
      {activeTab === 'control' && (() => {
        const activeMatches = matches.filter(m =>
          m.rawStatus === 'assign' || m.rawStatus === 'gather' || m.rawStatus === 'battle'
        );
        const startableMatches = activeMatches.filter(m => m.rawStatus === 'assign' || m.rawStatus === 'gather');

        return (
          <Stack gap="md">
            {activeMatches.length === 0 ? (
              <Card withBorder>
                <EmptyState
                  icon={IconSwords}
                  title="No active matches"
                  description="No matches are currently running"
                />
              </Card>
            ) : (
              <>
                {startableMatches.length > 0 && (
                  <Group justify="center">
                    <Button
                      color="violet"
                      variant="filled"
                      onClick={() => onStartAllMatches(startableMatches.map(m => m.id))}
                    >
                      Start All Matches
                    </Button>
                  </Group>
                )}
                <Stack gap="xs" style={{ width: '80%', margin: '0 auto' }}>
                  {activeMatches.map((match) => (
                    <Card
                      key={match.id}
                      withBorder
                      p="md"
                      style={{ cursor: 'pointer' }}
                      onClick={() => router.push(`/matches/${match.id}`)}
                    >
                      <Group justify="space-between" wrap="nowrap">
                        <Group gap="md">
                          <StageRing status={match.rawStatus} type="match" size={44} thickness={4} gameColor={tournament.game_color} />
                          <div>
                            <Text fw={500} size="sm">
                              {match.team1?.name ?? 'TBD'} vs {match.team2?.name ?? 'TBD'}
                            </Text>
                            <Text size="xs" c="dimmed">
                              Round {match.round}
                              {match.bracket_type !== 'winners' && ` (${match.bracket_type})`}
                            </Text>
                          </div>
                          <Badge
                            color={match.rawStatus === 'battle' ? 'green' : 'blue'}
                            variant="filled"
                            size="sm"
                          >
                            {match.rawStatus === 'battle' ? 'In Progress' : 'Ready to Start'}
                          </Badge>
                        </Group>
                        {match.rawStatus === 'battle' ? (
                          <Button
                            variant="light"
                            color="violet"
                            size="sm"
                            onClick={(e) => { e.stopPropagation(); router.push(`/matches/${match.id}/scoring`); }}
                          >
                            Score
                          </Button>
                        ) : (
                          <Button
                            variant="filled"
                            color="violet"
                            size="sm"
                            onClick={(e) => { e.stopPropagation(); onStartMatch(match.id); }}
                          >
                            Start Match
                          </Button>
                        )}
                      </Group>
                    </Card>
                  ))}
                </Stack>
              </>
            )}
          </Stack>
        );
      })()}
    </Stack>
  );
}
