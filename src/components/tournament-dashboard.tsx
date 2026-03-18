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
  useMantineColorScheme,
  Badge,
  Image
} from '@mantine/core';
import { modals } from '@mantine/modals';
import type { Tournament} from '@/shared/types';
import { StageRing } from './StageRing';
import { notificationHelper } from '@/lib/notifications';

// Utility function to properly convert SQLite UTC timestamps to Date objects
const parseDbTimestamp = (timestamp: string | null | undefined): Date | null => {
  if (!timestamp) return null;
  
  // Check if timestamp already includes timezone info
  if (timestamp.includes('Z') || /[+-]\d{2}:?\d{2}$/.test(timestamp)) {
    return new Date(timestamp);
  }
  
  // SQLite CURRENT_TIMESTAMP returns format like "2025-08-08 22:52:51" (UTC)
  return new Date(`${timestamp  }Z`);
};

interface TournamentWithGame extends Tournament {
  game_name?: string;
  game_icon?: string;
  game_color?: string;
  event_image_url?: string;
  participant_count?: number;
  has_bracket?: boolean;
}

interface TournamentCardProps {
  tournament: TournamentWithGame;
  onViewDetails: (tournament: TournamentWithGame) => void;
  getNextStatusButton: (tournament: TournamentWithGame) => React.JSX.Element | null;
}

const TournamentCard = memo(({ 
  tournament, 
  onViewDetails, 
  getNextStatusButton 
}: TournamentCardProps) => {
  const { colorScheme } = useMantineColorScheme();
  
  const accentColor = tournament.game_color || '#7c3aed';

  return (
    <Card
      shadow={colorScheme === 'light' ? 'lg' : 'sm'}
      padding={0}
      radius="md"
      withBorder
      bg={colorScheme === 'light' ? 'white' : undefined}
      style={{
        cursor: 'pointer',
        transition: 'all 0.25s ease',
        borderColor: colorScheme === 'light' ? 'var(--mantine-color-gray-3)' : `${accentColor}33`,
      }}
      onMouseOver={(e) => {
        e.currentTarget.style.transform = 'translateY(-4px) scale(1.01)';
        e.currentTarget.style.boxShadow = `0 12px 32px ${accentColor}44`;
      }}
      onMouseOut={(e) => {
        e.currentTarget.style.transform = 'translateY(0) scale(1)';
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
          style={{ objectFit: 'cover', transition: 'transform 0.3s ease' }}
          onMouseOver={(e) => { (e.currentTarget as HTMLImageElement).style.transform = 'scale(1.04)'; }}
          onMouseOut={(e) => { (e.currentTarget as HTMLImageElement).style.transform = 'scale(1)'; }}
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

      <Stack gap="xs" px="lg">
        {tournament.description && (
          <Text size="sm" c="dimmed">{tournament.description}</Text>
        )}

        <Divider mb="xs" />

        <Group gap="xl" justify="center">
          <Stack gap={2} align="center">
            <Text size="xs" c="dimmed">Format</Text>
            <Badge size="sm" variant="light">
              {tournament.format === 'single-elimination' ? 'Single Elim' : 'Double Elim'}
            </Badge>
          </Stack>
          <Stack gap={2} align="center">
            <Text size="xs" c="dimmed">Participants</Text>
            <Text size="sm" fw={500}>
              {tournament.participant_count || 0}
              {tournament.max_participants ? ` / ${tournament.max_participants}` : ''}
            </Text>
          </Stack>
          <Stack gap={2} align="center">
            <Text size="xs" c="dimmed">Starts</Text>
            <Text size="sm" fw={500}>
              {tournament.start_time
                ? parseDbTimestamp(tournament.start_time?.toString())?.toLocaleDateString()
                : 'N/A'}
            </Text>
          </Stack>
        </Group>
      </Stack>

      <Group mt="md" px="lg" pb="lg" grow>
        <Button
          size="sm"
          color={tournament.game_color || 'blue'}
          onClick={(e) => {
            e.stopPropagation();
            onViewDetails(tournament);
          }}
        >
          Details
        </Button>
        {getNextStatusButton(tournament)}
      </Group>
    </Card>
  );
});

// Performance optimization for card rendering
TournamentCard.displayName = 'TournamentCard';

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
        <Group grow mt="sm">
          <Skeleton height={32} radius="sm" />
          <Skeleton height={32} radius="sm" />
        </Group>
      </Stack>
    </Card>
  );
}

export function TournamentDashboard() {
  const router = useRouter();
  const { colorScheme } = useMantineColorScheme();
  const [tournaments, setTournaments] = useState<TournamentWithGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshInterval, setRefreshInterval] = useState(30); // default 30 seconds

  const fetchTournaments = useCallback(async (silent = false) => {
    try {
      const response = await fetch('/api/tournaments');
      if (response.ok) {
        const data = await response.json();
        setTournaments(prevTournaments => {
          // Check if data changed to prevent unnecessary rerenders
          if (prevTournaments.length !== data.length) {
            return data;
          }
          
          const hasChanges = data.some((tournament: TournamentWithGame, index: number) => {
            const prevTournament = prevTournaments[index];
            return !prevTournament || 
              tournament.id !== prevTournament.id ||
              tournament.status !== prevTournament.status ||
              tournament.name !== prevTournament.name ||
              tournament.participant_count !== prevTournament.participant_count ||
              tournament.updated_at !== prevTournament.updated_at;
          });
          
          return hasChanges ? data : prevTournaments;
        });
      }
    } catch (error) {
      logger.error('Error fetching tournaments:', error);
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, []);

  // Fetch UI settings and tournaments on component mount
  useEffect(() => {
    const fetchUISettings = async () => {
      try {
        const response = await fetch('/api/settings/ui');
        if (response.ok) {
          const uiSettings = await response.json();
          setRefreshInterval(uiSettings.auto_refresh_interval_seconds || 30);
        }
      } catch (error) {
        logger.error('Error fetching UI settings:', error);
      }
    };

    fetchTournaments();
    fetchUISettings();
  }, [fetchTournaments]);

  // Set up auto-refresh with configurable interval
  useEffect(() => {
    const intervalId = setInterval(() => {
      fetchTournaments(true); // Silent refresh
    }, refreshInterval * 1000);

    return () => clearInterval(intervalId);
  }, [refreshInterval, fetchTournaments]);

  const handleCreateTournament = () => {
    router.push('/tournaments/create?step=1');
  };

  const handleViewDetails = useCallback((tournament: TournamentWithGame) => {
    router.push(`/tournaments/${tournament.id}`);
  }, [router]);

  const handleStatusTransition = async (tournamentId: string, newStatus: string) => {
    const notificationId = `tournament-transition-${tournamentId}`;

    // Determine the action message based on the new status
    const actionMessages: Record<string, { loading: string; success: string }> = {
      gather: { loading: 'Opening signups...', success: 'Signups opened successfully!' },
      assign: { loading: 'Closing signups...', success: 'Signups closed successfully!' },
      battle: { loading: 'Starting tournament...', success: 'Tournament started successfully!' },
      complete: { loading: 'Ending tournament...', success: 'Tournament ended successfully!' },
    };

    const messages = actionMessages[newStatus] || {
      loading: 'Processing...',
      success: 'Status updated successfully!'
    };

    // Show loading notification
    notificationHelper.loading({
      id: notificationId,
      message: messages.loading
    });

    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/transition`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ newStatus }),
      });

      if (response.ok) {
        const updatedTournament = await response.json();
        setTournaments(prev => prev.map(tournament =>
          tournament.id === tournamentId ? { ...tournament, ...updatedTournament } : tournament
        ));

        // Update notification to success
        notificationHelper.update(notificationId, {
          type: 'success',
          message: messages.success
        });
      } else {
        const error = await response.json();
        logger.error('Failed to transition tournament status:', error);

        // Update notification to error
        notificationHelper.update(notificationId, {
          type: 'error',
          message: error.error || 'Failed to update tournament status'
        });
      }
    } catch (error) {
      logger.error('Error transitioning tournament status:', error);

      // Update notification to error
      notificationHelper.update(notificationId, {
        type: 'error',
        message: 'Failed to update tournament status'
      });
    }
  };

  const handleProgressTournament = useCallback(async (tournamentId: string) => {
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/progress`, {
        method: 'POST',
      });

      if (response.ok) {
        const result = await response.json();
        logger.info('Tournament progressed:', result.message);

        notificationHelper.success({
          title: 'Round Advanced',
          message: result.message
        });

        // Refresh tournaments to show updated status
        fetchTournaments(true);
      } else {
        const error = await response.json();
        notificationHelper.error({
          title: 'Progress Failed',
          message: error.error || 'Failed to progress tournament'
        });
      }
    } catch (error) {
      logger.error('Error progressing tournament:', error);
      notificationHelper.error({
        title: 'Connection Error',
        message: 'Failed to progress tournament'
      });
    }
  }, [fetchTournaments]);

  const handleGenerateBracket = useCallback(async (tournamentId: string) => {
    const notificationId = `bracket-generation-${tournamentId}`;

    // Show loading notification
    notificationHelper.loading({
      id: notificationId,
      message: 'Generating tournament bracket...'
    });

    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/generate-matches`, {
        method: 'POST',
      });

      if (response.ok) {
        const result = await response.json();
        logger.info('Bracket generated:', result.message);

        // Update to success notification
        notificationHelper.update(notificationId, {
          type: 'success',
          title: 'Bracket Generated',
          message: result.message
        });

        // Refresh tournaments to show updated bracket status
        fetchTournaments(true);
      } else {
        const error = await response.json();

        // Update to error notification
        notificationHelper.update(notificationId, {
          type: 'error',
          title: 'Bracket Generation Failed',
          message: error.error || 'Failed to generate bracket'
        });
      }
    } catch (error) {
      logger.error('Error generating bracket:', error);

      // Update to error notification
      notificationHelper.update(notificationId, {
        type: 'error',
        title: 'Connection Error',
        message: 'Failed to generate bracket'
      });
    }
  }, [fetchTournaments]);

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

  const getNextStatusButton = useCallback((tournament: TournamentWithGame): React.JSX.Element | null => {
    switch (tournament.status) {
      case 'created':
        return (
          <Button
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              handleStatusTransition(tournament.id, 'gather');
            }}
          >
            Open Signups
          </Button>
        );
      case 'gather':
        return (
          <Button
            size="sm"
            color="orange"
            onClick={(e) => {
              e.stopPropagation();
              modals.openConfirmModal({
                title: 'Close Signups',
                children: (
                  <Text size="sm">
                    Are you sure you want to close signups for &quot;{tournament.name}&quot;? This will prevent new teams from joining the tournament.
                  </Text>
                ),
                labels: { confirm: 'Close Signups', cancel: 'Cancel' },
                confirmProps: { color: 'orange' },
                onConfirm: () => handleStatusTransition(tournament.id, 'assign'),
              });
            }}
          >
            Close Signups
          </Button>
        );
      case 'assign':
        return tournament.has_bracket ? (
          <Button
            size="sm"
            color="green"
            onClick={(e) => {
              e.stopPropagation();
              handleStatusTransition(tournament.id, 'battle');
            }}
          >
            Start Tournament
          </Button>
        ) : (
          <Button
            size="sm"
            color="blue"
            onClick={(e) => {
              e.stopPropagation();
              handleGenerateBracket(tournament.id);
            }}
          >
            Generate Bracket
          </Button>
        );
      case 'battle':
        return (
          <Button
            size="sm"
            color="green"
            onClick={(e) => {
              e.stopPropagation();
              handleProgressTournament(tournament.id);
            }}
          >
            Next Round
          </Button>
        );
      default:
        return null;
    }
  }, [handleProgressTournament, handleGenerateBracket]);

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

  // Memoize tournament cards for better performance
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
          <TournamentCard
            tournament={tournament}
            onViewDetails={handleViewDetails}
            getNextStatusButton={getNextStatusButton}
          />
        </motion.div>
      </Grid.Col>
    ));
  }, [filteredTournaments, handleViewDetails, getNextStatusButton]);

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
      <div className="flex justify-center md:justify-end mb-6">
        <Group gap="sm" wrap="nowrap">
          {tournaments.length > 0 && (
            <TextInput
              placeholder="Search tournaments..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.currentTarget.value)}
              style={{ 
                width: 'clamp(150px, 50vw, 300px)',
                flexShrink: 1
              }}
            />
          )}
          <Button 
            size="md"
            onClick={handleCreateTournament}
            style={{ flexShrink: 0 }}
          >
            Create Tournament
          </Button>
        </Group>
      </div>
      <Divider mb="xl" />
      {tournaments.length === 0 ? (
        <Card 
          shadow="sm" 
          padding="xl" 
          radius="md" 
          withBorder
          className="text-center py-12"
          style={{ 
            borderColor: colorScheme === 'light' ? 'var(--mantine-color-gray-3)' : undefined
          }}
        >
          <Stack align="center">
            <Text size="xl" fw={600}>No tournaments yet</Text>
            <Text c="dimmed">
              Create a tournament to get started
            </Text>
          </Stack>
        </Card>
      ) : filteredTournaments.length === 0 ? (
        <div className="text-center py-12">
          <Text size="lg" c="dimmed">No tournaments match your search</Text>
        </div>
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