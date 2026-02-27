'use client'

import { Card, Text, Stack, Group, Button, useMantineColorScheme, SimpleGrid, Table, Badge, Avatar } from '@mantine/core';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useMemo } from 'react';
import { IconTrophy, IconSwords, IconUsers, IconCornerDownRight, IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { motion } from 'framer-motion';
import { AnimatedCounter } from './AnimatedCounter';

import { logger } from '@/lib/logger/client';
import { StageRing } from './StageRing';

interface Stats {
  totalMatches: number;
  totalTournaments: number;
  totalSignups: number;
}

interface StatItem {
  title: string;
  value: number;
  icon: typeof IconSwords;
  color: string;
}

interface MatchItem {
  id: string;
  name: string;
  game_name?: string;
  game_icon?: string;
  game_color?: string;
  status: string;
  start_time?: string;
  tournament_name?: string;
  participant_count?: number;
  max_participants?: number;
}

interface TournamentItem {
  id: string;
  name: string;
  game_name?: string;
  game_icon?: string;
  game_color?: string;
  status: string;
  start_time?: string;
  participant_count?: number;
  max_participants?: number;
}

// Unified row type for the combined table
interface MissionControlRow {
  key: string;
  name: string;
  game_icon?: string;
  game_color?: string;
  status: string;
  start_time?: string;
  participant_count?: number;
  max_participants?: number;
  type: 'match' | 'tournament';
  isTournamentChild: boolean;
  navigateTo: string;
}

const IN_PROGRESS_STATUSES = new Set(['battle']);

function isInProgress(status: string) {
  return IN_PROGRESS_STATUSES.has(status);
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'battle':
      return (
        <Badge color="orange" variant="filled" size="sm" style={{ overflow: 'visible' }}>
          <span className="live-pulse-dot" style={{ color: 'white' }} />
          Battle
        </Badge>
      );
    case 'gather':
      return <Badge color="green" variant="filled" size="sm">Signups Open</Badge>;
    case 'assign':
      return <Badge color="yellow" variant="filled" size="sm">Assigning</Badge>;
    case 'created':
      return <Badge color="gray" variant="filled" size="sm">Created</Badge>;
    default:
      return <Badge color="gray" variant="light" size="sm">{status}</Badge>;
  }
}

function formatDate(dateStr?: string) {
  if (!dateStr) return '—';
  const date = new Date(dateStr);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/**
 * Build the combined mission control rows.
 * - Tournaments appear as top-level rows
 * - Matches that belong to a tournament are nested directly below their tournament
 * - Standalone matches appear as top-level rows
 * - In-progress items sort to top, then by soonest start_time
 */
function buildMissionControlRows(matches: MatchItem[], tournaments: TournamentItem[]): MissionControlRow[] {
  // Group matches by tournament name
  const tournamentMatchMap = new Map<string, MatchItem[]>();
  const standaloneMatches: MatchItem[] = [];

  for (const match of matches) {
    if (match.tournament_name) {
      const existing = tournamentMatchMap.get(match.tournament_name) || [];
      existing.push(match);
      tournamentMatchMap.set(match.tournament_name, existing);
    } else {
      standaloneMatches.push(match);
    }
  }

  // Build top-level items (tournaments + standalone matches) for sorting
  type TopLevelItem =
    | { kind: 'tournament'; tournament: TournamentItem; childMatches: MatchItem[] }
    | { kind: 'match'; match: MatchItem };

  const topLevel: TopLevelItem[] = [];

  for (const t of tournaments) {
    const childMatches = tournamentMatchMap.get(t.name) || [];
    topLevel.push({ kind: 'tournament', tournament: t, childMatches });
  }

  for (const m of standaloneMatches) {
    topLevel.push({ kind: 'match', match: m });
  }

  // Sort: in-progress first, then by start_time ascending (soonest first)
  topLevel.sort((a, b) => {
    const statusA = a.kind === 'tournament' ? a.tournament.status : a.match.status;
    const statusB = b.kind === 'tournament' ? b.tournament.status : b.match.status;
    const aInProgress = isInProgress(statusA) ? 0 : 1;
    const bInProgress = isInProgress(statusB) ? 0 : 1;
    if (aInProgress !== bInProgress) return aInProgress - bInProgress;

    const timeA = a.kind === 'tournament' ? a.tournament.start_time : a.match.start_time;
    const timeB = b.kind === 'tournament' ? b.tournament.start_time : b.match.start_time;
    const dateA = timeA ? new Date(timeA).getTime() : Infinity;
    const dateB = timeB ? new Date(timeB).getTime() : Infinity;
    return dateA - dateB;
  });

  // Flatten into rows
  const rows: MissionControlRow[] = [];

  for (const item of topLevel) {
    if (item.kind === 'tournament') {
      const t = item.tournament;
      rows.push({
        key: `tournament-${t.id}`,
        name: t.name,
        game_icon: t.game_icon,
        game_color: t.game_color,
        status: t.status,
        start_time: t.start_time,
        participant_count: t.participant_count,
        max_participants: t.max_participants,
        type: 'tournament',
        isTournamentChild: false,
        navigateTo: `/tournaments/${t.id}`,
      });
      // Sort child matches: in-progress first, then by start_time
      const children = [...item.childMatches].sort((a, b) => {
        const aIP = isInProgress(a.status) ? 0 : 1;
        const bIP = isInProgress(b.status) ? 0 : 1;
        if (aIP !== bIP) return aIP - bIP;
        const dateA = a.start_time ? new Date(a.start_time).getTime() : Infinity;
        const dateB = b.start_time ? new Date(b.start_time).getTime() : Infinity;
        return dateA - dateB;
      });
      for (const m of children) {
        rows.push({
          key: `match-${m.id}`,
          name: m.name,
          game_icon: m.game_icon,
          game_color: m.game_color,
          status: m.status,
          start_time: m.start_time,
          participant_count: m.participant_count,
          max_participants: m.max_participants,
          type: 'match',
          isTournamentChild: true,
          navigateTo: `/matches/${m.id}`,
        });
      }
    } else {
      const m = item.match;
      rows.push({
        key: `match-${m.id}`,
        name: m.name,
        game_icon: m.game_icon,
        game_color: m.game_color,
        status: m.status,
        start_time: m.start_time,
        participant_count: m.participant_count,
        max_participants: m.max_participants,
        type: 'match',
        isTournamentChild: false,
        navigateTo: `/matches/${m.id}`,
      });
    }
  }

  return rows;
}

export function HomePage() {
  const router = useRouter();
  const { colorScheme } = useMantineColorScheme();
  const [stats, setStats] = useState<Stats>({ totalMatches: 0, totalTournaments: 0, totalSignups: 0 });
  const [matches, setMatches] = useState<MatchItem[]>([]);
  const [tournaments, setTournaments] = useState<TournamentItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/stats').then(res => res.json()),
      fetch('/api/matches').then(res => res.json()),
      fetch('/api/tournaments').then(res => res.json()),
    ])
      .then(([statsData, matchesData, tournamentsData]) => {
        setStats(statsData);
        setMatches(Array.isArray(matchesData) ? matchesData : []);
        setTournaments(Array.isArray(tournamentsData) ? tournamentsData : []);
        setLoading(false);
      })
      .catch(err => {
        logger.error('Failed to load homepage data:', err);
        setLoading(false);
      });
  }, []);

  const missionControlRows = useMemo(
    () => buildMissionControlRows(matches, tournaments),
    [matches, tournaments]
  );

  const ROWS_PER_PAGE = 8;
  const [mcPage, setMcPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(missionControlRows.length / ROWS_PER_PAGE));
  // Clamp page to valid range when data changes (e.g. items removed)
  const safePage = mcPage >= totalPages ? 0 : mcPage;
  const pagedRows = missionControlRows.slice(safePage * ROWS_PER_PAGE, (safePage + 1) * ROWS_PER_PAGE);

  const statItems = [
    {
      title: 'Total Matches',
      value: stats.totalMatches,
      icon: IconSwords,
      color: '#06B6D4'
    },
    {
      title: 'Total Tournaments',
      value: stats.totalTournaments,
      icon: IconTrophy,
      color: '#4895EF'
    },
    {
      title: 'Total Signups',
      value: stats.totalSignups,
      icon: IconUsers,
      color: '#763c62'
    }
  ];

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.15
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.5
      }
    }
  };

  return (
    <div className="container mx-auto px-6 pt-3 pb-6 max-w-6xl">
      <Stack gap="lg">
        {/* Mission Control Card */}
        <Card
          shadow={colorScheme === 'light' ? 'lg' : 'sm'}
          p={{ base: 'xs', md: 'xl' }}
          radius="md"
          withBorder
          bg={colorScheme === 'light' ? 'white' : undefined}
          style={{
            borderColor: colorScheme === 'light' ? 'var(--mantine-color-gray-3)' : undefined,
          }}
        >
          <Stack gap="md">
            <Text size="xl" fw={700}>Mission Control</Text>

            <Table horizontalSpacing="md" verticalSpacing="xs" striped highlightOnHover stripedColor={colorScheme === 'dark' ? 'rgba(255,255,255,0.04)' : undefined}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Name</Table.Th>
                  <Table.Th style={{ width: 56, textAlign: 'center' }}>Stage</Table.Th>
                  <Table.Th className="hidden md:table-cell" style={{ width: 130 }}>Status</Table.Th>
                  <Table.Th className="hidden md:table-cell" style={{ width: 70, textAlign: 'center' }}>Players</Table.Th>
                  <Table.Th className="hidden md:table-cell" style={{ width: 140 }}>Start</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {pagedRows.length > 0 ? (
                  pagedRows.map((row) => (
                    <Table.Tr
                      key={row.key}
                      style={{ cursor: 'pointer' }}
                      onClick={() => router.push(row.navigateTo)}
                    >
                      <Table.Td>
                        <Group gap="sm" wrap="nowrap">
                          {row.game_icon ? (
                            <Avatar src={row.game_icon} size={24} radius="sm" style={{ flexShrink: 0 }} />
                          ) : null}
                          {row.isTournamentChild && (
                            <IconCornerDownRight size={16} style={{ color: 'var(--mantine-color-dimmed)', flexShrink: 0 }} />
                          )}
                          {row.type === 'tournament' && (
                            <IconTrophy size={16} style={{ color: 'var(--mantine-color-yellow-6)', flexShrink: 0 }} />
                          )}
                          <Text size="sm" lineClamp={1}>{row.name}</Text>
                        </Group>
                      </Table.Td>
                      <Table.Td style={{ textAlign: 'center' }}>
                        <StageRing status={row.status} gameColor={row.game_color} type={row.type} size={28} thickness={3} />
                      </Table.Td>
                      <Table.Td className="hidden md:table-cell">{getStatusBadge(row.status)}</Table.Td>
                      <Table.Td className="hidden md:table-cell" style={{ textAlign: 'center' }}>
                        <Text size="sm" c="dimmed">
                          {row.participant_count ?? 0}{row.max_participants ? `/${row.max_participants}` : ''}
                        </Text>
                      </Table.Td>
                      <Table.Td className="hidden md:table-cell"><Text size="sm" c="dimmed">{formatDate(row.start_time)}</Text></Table.Td>
                    </Table.Tr>
                  ))
                ) : null}
                {/* Always show at least 1 row */}
                {pagedRows.length === 0 && (
                  <Table.Tr>
                    <Table.Td><Text size="sm" c="dimmed">&nbsp;</Text></Table.Td>
                    <Table.Td />
                    <Table.Td className="hidden md:table-cell" />
                    <Table.Td className="hidden md:table-cell" />
                    <Table.Td className="hidden md:table-cell" />
                  </Table.Tr>
                )}
              </Table.Tbody>
            </Table>

            {totalPages > 1 && (
              <Group justify="center" gap="sm">
                <Button
                  size="xs"
                  variant="subtle"
                  disabled={mcPage === 0}
                  onClick={() => setMcPage(p => p - 1)}
                  leftSection={<IconChevronLeft size={14} />}
                >
                  Back
                </Button>
                <Text size="sm" c="dimmed">{mcPage + 1} / {totalPages}</Text>
                <Button
                  size="xs"
                  variant="subtle"
                  disabled={mcPage >= totalPages - 1}
                  onClick={() => setMcPage(p => p + 1)}
                  rightSection={<IconChevronRight size={14} />}
                >
                  Next
                </Button>
              </Group>
            )}
          </Stack>
        </Card>

        {/* Stats Section */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="lg">
            {statItems.map((stat: StatItem) => {
              const Icon = stat.icon;
              return (
                <motion.div key={stat.title} variants={itemVariants}>
                  <Card
                key={stat.title}
                shadow={colorScheme === 'light' ? 'lg' : 'sm'}
                p="lg"
                radius="md"
                withBorder
                bg={colorScheme === 'light' ? 'white' : undefined}
                style={{
                  borderColor: colorScheme === 'light' ? 'var(--mantine-color-gray-3)' : `${stat.color}22`,
                  transition: 'all 0.25s ease',
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.transform = 'translateY(-3px) scale(1.01)';
                  e.currentTarget.style.boxShadow = `0 8px 24px ${stat.color}33`;
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.transform = 'translateY(0) scale(1)';
                  e.currentTarget.style.boxShadow = '';
                }}
              >
                <Group justify="space-between">
                  <div>
                    <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                      {stat.title}
                    </Text>
                    <Text
                      fw={800}
                      size="xl"
                      mt="xs"
                      style={{
                        background: `linear-gradient(135deg, ${stat.color}, ${stat.color}99)`,
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        backgroundClip: 'text',
                        fontFamily: 'var(--font-outfit, sans-serif)',
                        fontSize: '1.75rem',
                      }}
                    >
                      {loading ? '...' : <AnimatedCounter value={stat.value} />}
                    </Text>
                  </div>
                  <div
                    style={{
                      background: `linear-gradient(135deg, ${stat.color}33, ${stat.color}11)`,
                      border: `1px solid ${stat.color}44`,
                      borderRadius: '12px',
                      padding: '10px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Icon size={28} stroke={1.5} style={{ color: stat.color }} />
                  </div>
                </Group>
                  </Card>
                </motion.div>
              );
            })}
          </SimpleGrid>
        </motion.div>
      </Stack>
    </div>
  );
}
