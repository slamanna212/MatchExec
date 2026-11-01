import { useState } from 'react';
import type { JSX } from 'react';
import { useNavigate } from 'react-router';
import {
  Stack,
  Group,
  Text,
  Badge,
  Card,
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
import { LeaderboardView, type CumulativeStanding } from '../tournament/leaderboard-view';
import { RankedTable } from '../shared/RankedTable';
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

function isCumulativeStanding(s: TeamStanding | CumulativeStanding): s is CumulativeStanding {
  return 'participant_id' in s;
}

/** Adds a 1-based rank in API order (same numbering as the previous card list). */
function rankTeamStandings(list: TeamStanding[]): (TeamStanding & { rank: number })[] {
  return list.map((t, i) => ({ ...t, rank: i + 1 }));
}

interface TournamentContentPanelProps {
  tournament: TournamentWithGame;
  teams: TeamWithMembers[];
  matches: BracketMatch[];
  standings: (TeamStanding | CumulativeStanding)[];
  loading: boolean;
  onGenerateMatches: () => Promise<void>;
  onBracketAssignment: (assignments: BracketAssignment[]) => Promise<void>;
  onStartMatch: (matchId: string) => Promise<void>;
  onStartAllMatches: (matchIds: string[]) => Promise<void>;
}

const TEAM_COLORS = ['blue', 'red', 'green', 'grape', 'orange', 'teal'];
const teamColor = (teamIndex: number): string => TEAM_COLORS[teamIndex % TEAM_COLORS.length];

const TEAM_GRID_STYLE = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
  gap: 'var(--mantine-spacing-md)',
} as const;

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
}: TournamentContentPanelProps): JSX.Element {
  const navigate = useNavigate();
  // Cumulative-points tournaments (FFA/Position) have no bracket, so the
  // Bracket tab is hidden. The Teams tab stays (shown as "Participants") —
  // each participant is a solo team, and it is the only place to see/manage
  // who is playing.
  const isCumulative = tournament.format === 'cumulative-points';
  const teamStandings = rankTeamStandings(standings.filter((s): s is TeamStanding => !isCumulativeStanding(s)));
  const defaultTab = isCumulative ? 'standings' : 'teams';

  const [activeTab, setActiveTab] = useState<'teams' | 'bracket' | 'standings' | 'control'>(() => {
    if (typeof window === 'undefined') return defaultTab;
    const saved = localStorage.getItem(`tournament_tab_${tournament.id}`);
    const valid = isCumulative
      ? (['teams', 'standings', 'control'] as const)
      : (['teams', 'bracket', 'standings', 'control'] as const);
    return (valid as readonly string[]).includes(saved ?? '') ? (saved as typeof valid[number]) : defaultTab;
  });

  return (
    <Stack gap="md">
      {/* Tab Navigation */}
      <div style={{ width: '100%', overflowX: 'auto' }}>
        <Group justify="center" mb="sm">
          <SegmentedControl
            radius="xl"
            size="sm"
            data={
              isCumulative
                ? [
                    {
                      label: <span>Participants<span className="hidden md:inline"> ({teams.length})</span></span>,
                      value: 'teams'
                    },
                    { label: 'Standings', value: 'standings' },
                    { label: 'Control', value: 'control' }
                  ]
                : [
                    {
                      label: <span>Teams<span className="hidden md:inline"> ({teams.length})</span></span>,
                      value: 'teams'
                    },
                    { label: 'Bracket', value: 'bracket' },
                    { label: 'Standings', value: 'standings' },
                    { label: 'Control', value: 'control' }
                  ]
            }
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
            <div style={TEAM_GRID_STYLE}>
              {Array.from({ length: 4 }).map((_, i) => (
                <Card key={i} withBorder radius="md" p="md" style={{ minHeight: '200px' }}>
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
            </div>
          ) : teams.length > 0 ? (
            <div style={TEAM_GRID_STYLE}>
              {teams.map((team, teamIndex) => {
                const color = teamColor(teamIndex);
                const memberCount = team.members?.length || 0;

                return (
                  <Card
                    key={team.id}
                    withBorder
                    radius="md"
                    p="md"
                    style={{ height: '100%', minHeight: '200px', display: 'flex', flexDirection: 'column' }}
                  >
                    <Group mb="sm" gap="sm" wrap="nowrap">
                      <span
                        aria-hidden
                        style={{
                          width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                          backgroundColor: `var(--mantine-color-${color}-6)`,
                        }}
                      />
                      <Text fw={500} lineClamp={2} style={{ flex: 1 }}>{team.team_name}</Text>
                      <Badge size="sm" variant="light" color="gray" style={{ flexShrink: 0 }}>
                        {memberCount} {memberCount === 1 ? 'member' : 'members'}
                      </Badge>
                    </Group>
                    <Divider mb="sm" opacity={0.7} />

                    <div style={{ flex: 1, overflow: 'auto' }}>
                      {team.members && team.members.length > 0 ? (
                        <Stack gap="xs">
                          {team.members.map((member, memberIndex) => (
                            <Group key={member.id} gap="sm" justify="space-between" wrap="nowrap">
                              <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
                                <Avatar
                                  size="sm"
                                  src={member.avatar_url || null}
                                  color={color}
                                  variant="filled"
                                >
                                  {!member.avatar_url && (memberIndex + 1)}
                                </Avatar>
                                <Text size="sm" truncate>{member.username}</Text>
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
            </div>
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

      {/* Bracket Tab — only reachable when isCumulative is false (see SegmentedControl data above) */}
      {activeTab === 'bracket' && (
        <TournamentBracket
          tournamentId={tournament.id}
          format={tournament.format as 'single-elimination' | 'double-elimination'}
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
            <Stack gap="xs">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} height={52} radius="md" />
              ))}
            </Stack>
          ) : isCumulative ? (
            <LeaderboardView standings={standings.filter(isCumulativeStanding)} />
          ) : teamStandings.length > 0 ? (
            <RankedTable
              rows={teamStandings}
              getKey={(t) => t.team_id}
              getRank={(t) => t.rank}
              primaryHeader="Team"
              renderPrimary={(t) => (
                <>
                  <Text fw={500} size="sm" truncate>{t.team_name}</Text>
                  <Text size="xs" c="dimmed">
                    {t.matches_played} {t.matches_played === 1 ? 'match' : 'matches'} played
                  </Text>
                </>
              )}
              columns={[
                {
                  key: 'wins', header: 'Wins', width: '64px', align: 'center',
                  render: (t) => <Text size="lg" fw={700} c="green">{t.wins}</Text>,
                },
                {
                  key: 'losses', header: 'Losses', width: '64px', align: 'center',
                  render: (t) => <Text size="lg" fw={700} c="red">{t.losses}</Text>,
                },
              ]}
            />
          ) : (
            <Card withBorder radius="md">
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
                      onClick={() => navigate(`/matches/${match.id}`)}
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
                            onClick={(e) => { e.stopPropagation(); navigate(`/matches/${match.id}/scoring`); }}
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
