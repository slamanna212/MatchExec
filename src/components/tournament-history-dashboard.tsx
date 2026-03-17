'use client'

import { logger } from '@/lib/logger/client';
import { useState, useEffect, useCallback, useMemo, memo } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Card,
  Text,
  Button,
  Avatar,
  Divider,
  Skeleton,
  Group,
  Stack,
  Grid,
  TextInput,
  Badge,
  Image,
  useMantineColorScheme
} from '@mantine/core';
import type { Tournament} from '@/shared/types';
import { StageRing } from './StageRing';

interface TournamentWithGame extends Tournament {
  game_name?: string;
  game_icon?: string;
  game_color?: string;
  event_image_url?: string;
  participant_count?: number;
}

interface HistoryTournamentCardProps {
  tournament: TournamentWithGame;
  onViewDetails: (tournament: TournamentWithGame) => void;
}

const HistoryTournamentCard = memo(({
  tournament,
  onViewDetails
}: HistoryTournamentCardProps) => {
  const { colorScheme } = useMantineColorScheme();

  return (
    <Card
      shadow={colorScheme === 'light' ? 'lg' : 'sm'}
      padding={0}
      radius="md"
      withBorder
      bg={colorScheme === 'light' ? 'white' : undefined}
      style={{
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        borderColor: colorScheme === 'light' ? 'var(--mantine-color-gray-3)' : undefined
      }}
      onMouseOver={(e) => {
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
      }}
      onMouseOut={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = colorScheme === 'light' ? '0 1px 3px rgba(0,0,0,0.12)' : '0 1px 3px rgba(0,0,0,0.24)';
      }}
      onClick={() => onViewDetails(tournament)}
    >
      <Card.Section style={{ height: 140, overflow: 'hidden' }}>
        <Image
          src={tournament.event_image_url || '/assets/placeholder-cover.png'}
          alt={`${tournament.name} event image`}
          h={140}
          w="100%"
          fit="cover"
          style={{ objectFit: 'cover' }}
        />
      </Card.Section>

      <Group mb="md" p="lg" pb={0}>
        <Avatar
          src={tournament.game_icon}
          alt={tournament.game_name}
          size="md"
        />
        <Stack gap="xs" style={{ flex: 1 }}>
          <Text fw={600}>{tournament.name}</Text>
          <Text size="sm" c="dimmed">{tournament.game_name}</Text>
        </Stack>
        <StageRing status={tournament.status} gameColor={tournament.game_color} type="tournament" />
      </Group>

      <Divider mb="md" mx="lg" />

      <Stack gap="xs" px="lg" pb="lg" style={{ minHeight: '100px' }}>
        <div style={{ minHeight: '20px' }}>
          {tournament.description && (
            <Text size="sm" c="dimmed">{tournament.description}</Text>
          )}
        </div>

        <Group justify="space-between">
          <Text size="sm" c="dimmed">Format:</Text>
          <Badge size="sm" variant="light">
            {tournament.format === 'single-elimination' ? 'Single Elim' : 'Double Elim'}
          </Badge>
        </Group>

        <Group justify="space-between">
          <Text size="sm" c="dimmed">Participants:</Text>
          <Text size="sm">
            {tournament.participant_count || 0}
            {tournament.max_participants ? ` / ${tournament.max_participants}` : ''}
          </Text>
        </Group>

        {tournament.start_time && (
          <Group justify="space-between">
            <Text size="sm" c="dimmed">Started:</Text>
            <Text size="sm">{new Date(tournament.start_time).toLocaleDateString('en-US')}</Text>
          </Group>
        )}

        <Group justify="space-between">
          <Text size="sm" c="dimmed">Completed:</Text>
          <Text size="sm">{new Date(tournament.updated_at).toLocaleDateString('en-US')}</Text>
        </Group>
      </Stack>
    </Card>
  );
});

HistoryTournamentCard.displayName = 'HistoryTournamentCard';

function SkeletonCard() {
  return (
    <Card shadow="sm" padding={0} radius="md" withBorder>
      <Card.Section><Skeleton height={140} /></Card.Section>
      <Stack p="lg" gap="xs">
        <Group>
          <Skeleton height={40} width={40} radius="md" />
          <Stack gap={4} style={{ flex: 1 }}>
            <Skeleton height={16} width="70%" />
            <Skeleton height={12} width="40%" />
          </Stack>
        </Group>
        <Skeleton height={12} width="60%" />
        <Skeleton height={12} width="40%" />
      </Stack>
    </Card>
  );
}

export function TournamentHistoryDashboard() {
  const router = useRouter();
  const [tournaments, setTournaments] = useState<TournamentWithGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchCompletedTournaments = useCallback(async (silent = false) => {
    try {
      const response = await fetch('/api/tournaments?status=complete');
      if (response.ok) {
        const data = await response.json();
        // Only update if data actually changed to prevent unnecessary rerenders
        setTournaments(prevTournaments => {
          if (prevTournaments.length !== data.length) {
            return data;
          }

          const hasChanges = data.some((tournament: TournamentWithGame, index: number) => {
            const prevTournament = prevTournaments[index];
            return !prevTournament ||
              tournament.id !== prevTournament.id ||
              tournament.status !== prevTournament.status ||
              tournament.name !== prevTournament.name ||
              tournament.created_at !== prevTournament.created_at ||
              tournament.updated_at !== prevTournament.updated_at;
          });

          return hasChanges ? data : prevTournaments;
        });
      }
    } catch (error) {
      logger.error('Error fetching completed tournaments:', error);
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchCompletedTournaments();
  }, [fetchCompletedTournaments]);

  // Set up auto-refresh with configurable interval
  useEffect(() => {
    const intervalId = setInterval(() => {
      fetchCompletedTournaments(true); // Silent refresh
    }, 30000); // 30 seconds

    return () => clearInterval(intervalId);
  }, [fetchCompletedTournaments]);

  // Filter tournaments based on search query
  const filteredTournaments = useMemo(() => {
    if (!searchQuery.trim()) return tournaments;

    const query = searchQuery.toLowerCase();
    return tournaments.filter(tournament =>
      tournament.name.toLowerCase().includes(query) ||
      tournament.game_name?.toLowerCase().includes(query) ||
      tournament.description?.toLowerCase().includes(query)
    );
  }, [tournaments, searchQuery]);

  const handleViewDetails = useCallback((tournament: TournamentWithGame) => {
    router.push(`/tournaments/${tournament.id}`);
  }, [router]);

  // Animation variants for staggered entrance
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  // Memoize tournament card rendering
  const memoizedTournamentCards = useMemo(() => {
    const itemVariants = {
      hidden: { opacity: 0, y: 20 },
      visible: {
        opacity: 1,
        y: 0,
        transition: {
          duration: 0.4
        }
      }
    };

    return filteredTournaments.map((tournament, index) => (
      <Grid.Col key={tournament.id} span={{ base: 12, md: 6, lg: 4 }}>
        <motion.div
          variants={itemVariants}
          initial="hidden"
          animate="visible"
          custom={index}
        >
          <HistoryTournamentCard
            tournament={tournament}
            onViewDetails={handleViewDetails}
          />
        </motion.div>
      </Grid.Col>
    ));
  }, [filteredTournaments, handleViewDetails]);

  if (loading) {
    return (
      <div className="container mx-auto p-6 max-w-6xl">
        <Grid>
          {Array.from({ length: 6 }).map((_, i) => (
            <Grid.Col key={i} span={{ base: 12, md: 6, lg: 4 }}>
              <SkeletonCard />
            </Grid.Col>
          ))}
        </Grid>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <Group justify="flex-end" mb="xl">
        {tournaments.length > 0 && (
          <TextInput
            placeholder="Search history..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.currentTarget.value)}
            style={{ width: 300 }}
          />
        )}
      </Group>

      <Divider mb="xl" />

      {tournaments.length === 0 ? (
        <Card p="xl">
          <Stack align="center">
            <Text size="xl" fw={600}>No completed tournaments yet</Text>
            <Text c="dimmed" mb="md">
              Completed tournaments will appear here
            </Text>
            <Button
              component="a"
              href="/tournaments"
            >
              View Active Tournaments
            </Button>
          </Stack>
        </Card>
      ) : filteredTournaments.length === 0 && searchQuery ? (
        <Card p="xl">
          <Stack align="center">
            <Text size="xl" fw={600}>No tournaments found</Text>
            <Text c="dimmed" mb="md">
              No completed tournaments match your search for &quot;{searchQuery}&quot;
            </Text>
            <Button
              component="a"
              href="/tournaments"
            >
              View Active Tournaments
            </Button>
          </Stack>
        </Card>
      ) : (
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          <Grid>
            {memoizedTournamentCards}
          </Grid>
        </motion.div>
      )}

    </div>
  );
}