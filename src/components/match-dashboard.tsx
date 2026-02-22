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
  Loader,
  Group,
  Stack,
  Grid,
  TextInput,
  Image,
  useMantineColorScheme
} from '@mantine/core';
import type { Match } from '@/shared/types';

import { StageRing } from './StageRing';
import { showError, showSuccess } from '@/lib/notifications';

// Utility function to properly convert SQLite UTC timestamps to Date objects
const parseDbTimestamp = (timestamp: string | null | undefined): Date | null => {
  if (!timestamp) return null;
  
  // Check if timestamp already includes timezone info (Z, +offset, or -offset at the end)
  // Note: SQLite date format "2025-08-09 00:40:16" contains dashes but they're part of the date, not timezone
  if (timestamp.includes('Z') || /[+-]\d{2}:?\d{2}$/.test(timestamp)) {
    return new Date(timestamp);
  }
  
  // SQLite CURRENT_TIMESTAMP returns format like "2025-08-08 22:52:51" (UTC)
  // We need to treat this as UTC, so append 'Z'
  return new Date(`${timestamp  }Z`);
};

interface MatchWithGame extends Omit<Match, 'created_at' | 'updated_at' | 'start_date' | 'end_date'> {
  game_name?: string;
  game_icon?: string;
  game_color?: string;
  rules?: string;
  rounds?: number;
  maps?: string[];
  livestream_link?: string;
  tournament_name?: string;
  tournament_round?: number;
  tournament_bracket_type?: string;
  event_image_url?: string;
  created_at: string;
  updated_at: string;
  start_date?: string;
  end_date?: string;
}

const NEXT_STATUS: Partial<Record<string, { status: string; label: string; color: string }>> = {
  created: { status: 'gather',   label: 'Start Signups', color: 'blue' },
  gather:  { status: 'assign',   label: 'Close Signups', color: 'orange' },
  assign:  { status: 'battle',   label: 'Start Match',   color: 'green' },
  battle:  { status: 'complete', label: 'End Match',     color: 'red' },
};

const TRANSITION_SUCCESS: Record<string, string> = {
  gather:   'Signups opened successfully!',
  assign:   'Signups closed successfully!',
  battle:   'Match started successfully!',
  complete: 'Match ended successfully!',
};

interface MatchCardProps {
  match: MatchWithGame;
  onViewDetails: (match: MatchWithGame) => void;
  onNextPhase: (match: MatchWithGame) => void;
  isTransitioning: boolean;
}

const MatchCard = memo(({
  match,
  onViewDetails,
  onNextPhase,
  isTransitioning,
}: MatchCardProps) => {
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
      onClick={() => onViewDetails(match)}
    >
      <Card.Section style={{ height: 140, overflow: 'hidden' }}>
        <Image
          src={match.event_image_url || '/assets/placeholder-cover.png'}
          alt={`${match.name} event image`}
          h={140}
          w="100%"
          fit="cover"
          style={{ objectFit: 'cover' }}
        />
      </Card.Section>

      <Group mb="md" p="lg" pb={0}>
        <Avatar
          src={match.game_icon}
          alt={match.game_name}
          size="md"
        />
        <Stack gap="xs" style={{ flex: 1 }}>
          <Text fw={600}>{match.name}</Text>
          <Text size="sm" c="dimmed">{match.game_name}</Text>
          {match.tournament_name && (
            <Text size="xs" c="violet" fw={500}>
              {match.tournament_name} - Round {match.tournament_round} ({match.tournament_bracket_type})
            </Text>
          )}
        </Stack>
        <StageRing status={match.status} gameColor={match.game_color} />
      </Group>

      <Stack gap="xs" px="lg" style={{ minHeight: '100px' }}>
        <div style={{ minHeight: '20px' }}>
          {match.description && (
            <Text size="sm" c="dimmed">{match.description}</Text>
          )}
        </div>

        <Divider mb="xs" />

        <Group gap="xl" justify="center">
          <Stack gap={2} align="center">
            <Text size="xs" c="dimmed">Participants</Text>
            <Text size="sm" fw={500}>
              {(match as MatchWithGame & { participant_count?: number }).participant_count || 0}/{match.max_participants}
            </Text>
          </Stack>
          <Stack gap={2} align="center">
            <Text size="xs" c="dimmed">Rounds</Text>
            <Text size="sm" fw={500}>
              {match.rounds ?? 'N/A'}
            </Text>
          </Stack>
          <Stack gap={2} align="center">
            <Text size="xs" c="dimmed">Starts</Text>
            <Text size="sm" fw={500}>
              {parseDbTimestamp(match.start_date)
                ? parseDbTimestamp(match.start_date)!.toLocaleString('en-US', {
                    month: 'numeric',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true,
                  })
                : 'N/A'}
            </Text>
          </Stack>
        </Group>
      </Stack>

      <Group mt="md" px="lg" pb="lg" grow>
        <Button
          size="sm"
          color={match.game_color || '#95a5a6'}
          onClick={(e) => {
            e.stopPropagation();
            onViewDetails(match);
          }}
        >
          Details
        </Button>
        {NEXT_STATUS[match.status] && (
          <Button
            size="sm"
            color={NEXT_STATUS[match.status]!.color}
            loading={isTransitioning}
            onClick={(e) => {
              e.stopPropagation();
              onNextPhase(match);
            }}
          >
            {NEXT_STATUS[match.status]!.label}
          </Button>
        )}
      </Group>
    </Card>
  );
}, (prevProps, nextProps) => {
  // Custom comparison to ensure re-render when match status or other critical props change
  return (
    prevProps.match.id === nextProps.match.id &&
    prevProps.match.status === nextProps.match.status &&
    prevProps.match.name === nextProps.match.name &&
    prevProps.match.updated_at === nextProps.match.updated_at &&
    prevProps.match.game_color === nextProps.match.game_color &&
    prevProps.isTransitioning === nextProps.isTransitioning
  );
});

MatchCard.displayName = 'MatchCard';

export function MatchDashboard() {
  const router = useRouter();
  const { colorScheme } = useMantineColorScheme();
  const [matches, setMatches] = useState<MatchWithGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(10); // default 10 seconds
  const [searchQuery, setSearchQuery] = useState('');
  const [transitioning, setTransitioning] = useState<Set<string>>(new Set());

  /**
   * Check if a match has changed
   */
  const hasMatchChanged = useCallback((match: MatchWithGame, prevMatch: MatchWithGame | undefined): boolean => {
    if (!prevMatch) return true;
    return (
      match.id !== prevMatch.id ||
      match.status !== prevMatch.status ||
      match.name !== prevMatch.name ||
      match.created_at !== prevMatch.created_at ||
      match.updated_at !== prevMatch.updated_at
    );
  }, []);

  /**
   * Compare matches arrays for changes
   */
  const haveMatchesChanged = useCallback((
    data: MatchWithGame[],
    prevMatches: MatchWithGame[]
  ): boolean => {
    if (prevMatches.length !== data.length) return true;

    return data.some((match, index) => hasMatchChanged(match, prevMatches[index]));
  }, [hasMatchChanged]);

  const fetchMatches = useCallback(async (silent = false) => {
    try {
      const response = await fetch('/api/matches');
      if (response.ok) {
        const data = await response.json();
        setMatches(prevMatches => {
          return haveMatchesChanged(data, prevMatches) ? data : prevMatches;
        });
      }
    } catch (error) {
      logger.error('Error fetching matches:', error);
      if (!silent) {
        showError('Failed to load matches. Please refresh the page.');
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [haveMatchesChanged]);

  // Fetch UI settings on component mount
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

    fetchMatches();
    fetchUISettings();
  }, [fetchMatches]);

  // Set up auto-refresh with configurable interval
  useEffect(() => {
    const intervalId = setInterval(() => {
      fetchMatches(true); // Silent refresh to prevent loading states
    }, refreshInterval * 1000);

    // Cleanup interval on unmount or when refreshInterval changes
    return () => clearInterval(intervalId);
  }, [refreshInterval, fetchMatches]);




  const _formatMapName = (mapId: string) => {
    // Convert map ID to proper display name
    // Examples: "circuit-royal" -> "Circuit Royal", "kings-row" -> "Kings Row"
    return mapId
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const [_mapNames, setMapNames] = useState<{[key: string]: string}>({});
  const [_mapDetails, setMapDetails] = useState<{[key: string]: {name: string, imageUrl?: string, modeName?: string, location?: string, note?: string}}>({});
  const [_mapNotes, setMapNotes] = useState<{[key: string]: string}>({});

  const fetchMapNames = async (gameId: string) => {
    try {
      // Fetch game info to check if it supports all modes
      const gameResponse = await fetch(`/api/games/${gameId}`);
      let supportsAllModes = false;

      if (gameResponse.ok) {
        const gameInfo = await gameResponse.json();
        supportsAllModes = gameInfo.supportsAllModes || false;
      }

      const response = await fetch(`/api/games/${gameId}/maps`);
      if (response.ok) {
        const maps = await response.json();
        const mapNamesObj: {[key: string]: string} = {};
        const mapDetailsObj: {[key: string]: {name: string, imageUrl?: string, modeName?: string, location?: string, note?: string}} = {};
        
        if (supportsAllModes) {
          // For flexible games, get all possible modes and create all combinations
          const modesResponse = await fetch(`/api/games/${gameId}/modes`);
          let modes: {id: string, name: string}[] = [];
          
          if (modesResponse.ok) {
            modes = await modesResponse.json();
          }
          
          maps.forEach((map: { id: string; name: string; imageUrl?: string; modeName?: string; location?: string }) => {
            // Add the original map entry
            mapNamesObj[map.id] = map.name;
            mapDetailsObj[map.id] = {
              name: map.name,
              imageUrl: map.imageUrl,
              modeName: map.modeName,
              location: map.location
            };
            
            // For flexible games, create entries for all possible mode combinations
            // Extract base map name by removing the mode suffix
            const baseMapName = map.id.replace(/-[^-]+$/, '');
            
            modes.forEach(mode => {
              const modeSpecificId = `${baseMapName}-${mode.id}`;
              if (modeSpecificId !== map.id) {
                mapNamesObj[modeSpecificId] = map.name;
                mapDetailsObj[modeSpecificId] = {
                  name: map.name,
                  imageUrl: map.imageUrl,
                  modeName: mode.name,
                  location: map.location
                };
              }
            });
          });
        } else {
          // For fixed mode games, use the API data as-is
          maps.forEach((map: { id: string; name: string; imageUrl?: string; modeName?: string; location?: string }) => {
            mapNamesObj[map.id] = map.name;
            mapDetailsObj[map.id] = {
              name: map.name,
              imageUrl: map.imageUrl,
              modeName: map.modeName,
              location: map.location
            };
          });
        }
        
        setMapNames(prev => ({ ...prev, ...mapNamesObj }));
        setMapDetails(prev => ({ ...prev, ...mapDetailsObj }));
      }
    } catch (error) {
      logger.error('Error fetching map names:', error);
    }
  };

  const _fetchMapNotes = async (matchId: string) => {
    try {
      const response = await fetch(`/api/matches/${matchId}/map-notes`);
      if (response.ok) {
        const { notes } = await response.json();
        setMapNotes(notes);
        
        // Also create mapDetails entries for timestamped map IDs so they can be looked up
        setMapDetails(prev => {
          const updated = { ...prev };
          Object.keys(notes).forEach(timestampedMapId => {
            if (!updated[timestampedMapId]) {
              // Get base map ID by stripping timestamp
              const baseMapId = timestampedMapId.replace(/-\d+-[a-zA-Z0-9]+$/, '');
              const baseMapDetail = updated[baseMapId];
              
              if (baseMapDetail) {
                // Create a copy of base map details for the timestamped ID
                updated[timestampedMapId] = { ...baseMapDetail };
              }
            }
          });
          return updated;
        });
      }
    } catch (error) {
      logger.error('Error fetching map notes:', error);
    }
  };

  useEffect(() => {
    // Fetch all map names for games that have matches
    const gameIds = new Set<string>();
    matches.forEach(match => {
      if (match.maps && match.maps.length > 0) {
        gameIds.add(match.game_id);
      }
    });

    gameIds.forEach(gameId => {
      fetchMapNames(gameId);
    });
  }, [matches]);

  const handleCreateMatch = () => {
    router.push('/matches/create');
  };


  const handleViewDetails = useCallback((match: MatchWithGame) => {
    router.push(`/matches/${match.id}`);
  }, [router]);

  const handleNextPhase = useCallback(async (match: MatchWithGame) => {
    const next = NEXT_STATUS[match.status];
    if (!next) return;

    setTransitioning(prev => new Set(prev).add(match.id));
    try {
      const response = await fetch(`/api/matches/${match.id}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newStatus: next.status }),
      });
      if (response.ok) {
        const updated = await response.json();
        setMatches(prev => prev.map(m => m.id === match.id ? { ...m, ...updated } : m));
        showSuccess(TRANSITION_SUCCESS[next.status]);
      } else {
        const err = await response.json().catch(() => ({}));
        showError(err.error || 'Failed to advance match phase.');
      }
    } catch {
      showError('Failed to advance match phase.');
    } finally {
      setTransitioning(prev => {
        const next = new Set(prev);
        next.delete(match.id);
        return next;
      });
    }
  }, []);

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

  // Filter matches based on search query
  const filteredMatches = useMemo(() => {
    return matches.filter(match =>
      match.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      match.game_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      match.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      match.status.toLowerCase().includes(searchQuery.toLowerCase()) ||
      match.rules?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [matches, searchQuery]);

  const memoizedMatchCards = useMemo(() => {
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

    return filteredMatches.map((match, index) => (
      <Grid.Col key={match.id} span={{ base: 12, md: 6, lg: 4 }}>
        <motion.div
          variants={itemVariants}
          initial="hidden"
          animate="visible"
          custom={index}
        >
          <MatchCard
            match={match}
            onViewDetails={handleViewDetails}
            onNextPhase={handleNextPhase}
            isTransitioning={transitioning.has(match.id)}
          />
        </motion.div>
      </Grid.Col>
    ));
  }, [filteredMatches, handleViewDetails, handleNextPhase, transitioning]);


  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Loader size="lg" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="flex justify-center md:justify-end mb-6">
        <Group gap="sm" wrap="nowrap">
          {matches.length > 0 && (
            <TextInput
              placeholder="Search matches..."
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
            onClick={handleCreateMatch}
            style={{ flexShrink: 0 }}
          >
            Create Match
          </Button>
        </Group>
      </div>

      <Divider mb="xl" />

      {matches.length === 0 ? (
        <Card 
          p="xl" 
          shadow={colorScheme === 'light' ? 'lg' : 'sm'}
          withBorder
          bg={colorScheme === 'light' ? 'white' : undefined}
          style={{ 
            borderColor: colorScheme === 'light' ? 'var(--mantine-color-gray-3)' : undefined
          }}
        >
          <Stack align="center">
            <Text size="xl" fw={600}>No matches yet</Text>
            <Text c="dimmed">
              Create a match to get started
            </Text>
          </Stack>
        </Card>
      ) : filteredMatches.length === 0 && searchQuery ? (
        <Card 
          p="xl" 
          shadow={colorScheme === 'light' ? 'lg' : 'sm'}
          withBorder
          bg={colorScheme === 'light' ? 'white' : undefined}
          style={{ 
            borderColor: colorScheme === 'light' ? 'var(--mantine-color-gray-3)' : undefined
          }}
        >
          <Stack align="center">
            <Text size="xl" fw={600}>No matches found</Text>
            <Text c="dimmed">
              No matches match your search for &quot;{searchQuery}&quot;
            </Text>
          </Stack>
        </Card>
      ) : (
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          <Grid>
            {memoizedMatchCards}
          </Grid>
        </motion.div>
      )}


    </div>
  );
}