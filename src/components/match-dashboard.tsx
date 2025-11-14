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
  useMantineColorScheme
} from '@mantine/core';
import { modals } from '@mantine/modals';
import type { Match, MatchResult, SignupConfig, ReminderData } from '@/shared/types';
import { MATCH_FLOW_STEPS } from '@/shared/types';

import { AssignPlayersModal } from './assign-players-modal';
import { ScoringModal } from './scoring/ScoringModal';
import { AnimatedRingProgress } from './AnimatedRingProgress';
import { MatchDetailsModal } from './match-details-modal';
import { showError, notificationHelper } from '@/lib/notifications';

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
  created_at: string;
  updated_at: string;
  start_date?: string;
  end_date?: string;
}

interface MatchCardProps {
  match: MatchWithGame;
  mapNames: {[key: string]: string};
  onViewDetails: (match: MatchWithGame) => void;
  onAssignPlayers: (match: MatchWithGame) => void;
  getNextStatusButton: (match: MatchWithGame) => React.JSX.Element | null;
}

const MatchCard = memo(({ 
  match, 
  mapNames, 
  onViewDetails, 
  onAssignPlayers, 
  getNextStatusButton 
}: MatchCardProps) => {
  const { colorScheme } = useMantineColorScheme();
  
  return (
    <Card 
      shadow={colorScheme === 'light' ? 'lg' : 'sm'}
      padding="lg" 
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
      <Group mb="md">
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
        <AnimatedRingProgress
          size={50}
          thickness={4}
          sections={[
            {
              value: MATCH_FLOW_STEPS[match.status]?.progress || 0,
              color: match.game_color || '#95a5a6'
            }
          ]}
        />
      </Group>
      
      <Divider mb="md" />
      
      <Stack gap="xs" style={{ minHeight: '140px' }}>
        <div style={{ minHeight: '20px' }}>
          {match.description && (
            <Text size="sm" c="dimmed">{match.description}</Text>
          )}
        </div>
        
        <Group justify="space-between">
          <Text size="sm" c="dimmed">Rules:</Text>
          <Text size="sm" tt="capitalize">{match.rules || 'Not specified'}</Text>
        </Group>
        
        <Group justify="space-between">
          <Text size="sm" c="dimmed">Rounds:</Text>
          <Text size="sm">{match.rounds || 'Not specified'}</Text>
        </Group>
        
        <Group justify="space-between" align="center">
          <Text size="sm" c="dimmed">Maps:</Text>
          <Text size="sm" ta="right" style={{ maxWidth: '60%' }} truncate="end">
            {match.maps && match.maps.length > 0 ? (
              (() => {
                const cleanMapId = match.maps[0].replace(/-\d+-[a-zA-Z0-9]+$/, '');
                const mapName = mapNames[cleanMapId];
                
                if (!mapName) {
                  return 'Loading...';
                }
                
                return match.maps.length > 1
                  ? `${mapName} +${match.maps.length - 1} more`
                  : mapName;
              })()
            ) : (
              'None selected'
            )}
          </Text>
        </Group>
        
        <Group justify="space-between">
          <Text size="sm" c="dimmed">Participants:</Text>
          <Text size="sm">{(match as MatchWithGame & { participant_count?: number }).participant_count || 0}/{match.max_participants}</Text>
        </Group>
        <Group justify="space-between">
          <Text size="sm" c="dimmed">Starts:</Text>
          <Text size="sm">{parseDbTimestamp(match.start_date)?.toLocaleString('en-US') || 'N/A'}</Text>
        </Group>
      </Stack>
      
      <Group mt="md" gap="xs">
        {(match.status === 'gather' || match.status === 'assign') && (
          <Button 
            size="sm" 
            onClick={(e) => {
              e.stopPropagation();
              onAssignPlayers(match);
            }}
            style={{ flex: 1 }}
          >
            Assign
          </Button>
        )}
        {getNextStatusButton(match)}
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
    JSON.stringify(prevProps.mapNames) === JSON.stringify(nextProps.mapNames)
  );
});

MatchCard.displayName = 'MatchCard';

export function MatchDashboard() {
  const router = useRouter();
  const { colorScheme } = useMantineColorScheme();
  const [matches, setMatches] = useState<MatchWithGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<MatchWithGame | null>(null);
  const [participants, setParticipants] = useState<{
    id: string;
    user_id: string;
    username: string;
    joined_at: string;
    signup_data: Record<string, unknown>;
  }[]>([]);
  const [participantsLoading, setParticipantsLoading] = useState(false);
  const [signupConfig, setSignupConfig] = useState<SignupConfig | null>(null);
  const [assignPlayersModalOpen, setAssignPlayersModalOpen] = useState(false);
  const [selectedMatchForAssignment, setSelectedMatchForAssignment] = useState<MatchWithGame | null>(null);
  const [scoringModalOpen, setScoringModalOpen] = useState(false);
  const [selectedMatchForScoring, setSelectedMatchForScoring] = useState<MatchWithGame | null>(null);
  const [refreshInterval, setRefreshInterval] = useState(10); // default 10 seconds
  const [reminders, setReminders] = useState<ReminderData[]>([]);
  const [remindersLoading, setRemindersLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

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




  const formatMapName = (mapId: string) => {
    // Convert map ID to proper display name
    // Examples: "circuit-royal" -> "Circuit Royal", "kings-row" -> "Kings Row"
    return mapId
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const [mapNames, setMapNames] = useState<{[key: string]: string}>({});
  const [mapDetails, setMapDetails] = useState<{[key: string]: {name: string, imageUrl?: string, modeName?: string, location?: string, note?: string}}>({});
  const [mapNotes, setMapNotes] = useState<{[key: string]: string}>({});

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

  const fetchMapNotes = async (matchId: string) => {
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

  /**
   * Check if participant has changed
   */
  const hasParticipantChanged = useCallback((
    participant: { id: string; user_id: string; username: string; joined_at: string; signup_data: Record<string, unknown> },
    prevParticipant: { id: string; user_id: string; username: string; joined_at: string; signup_data: Record<string, unknown> } | undefined
  ): boolean => {
    if (!prevParticipant) return true;
    return (
      participant.id !== prevParticipant.id ||
      participant.username !== prevParticipant.username ||
      participant.joined_at !== prevParticipant.joined_at
    );
  }, []);

  /**
   * Check if signup config has changed
   */
  const hasSignupConfigChanged = useCallback((
    newConfig: SignupConfig | null,
    prevConfig: SignupConfig | null
  ): boolean => {
    if (!prevConfig && !newConfig) return false;
    if (!prevConfig || !newConfig) return true;
    return prevConfig.fields.length !== newConfig.fields.length;
  }, []);

  const fetchParticipants = useCallback(async (matchId: string, silent = false) => {
    if (!silent) {
      setParticipantsLoading(true);
    }
    try {
      const response = await fetch(`/api/matches/${matchId}/participants`);
      if (response.ok) {
        const data = await response.json();

        setParticipants(prevParticipants => {
          if (prevParticipants.length !== data.participants.length) {
            return data.participants;
          }

          const hasChanges = data.participants.some((participant: {
            id: string;
            user_id: string;
            username: string;
            joined_at: string;
            signup_data: Record<string, unknown>;
          }, index: number) => hasParticipantChanged(participant, prevParticipants[index]));

          return hasChanges ? data.participants : prevParticipants;
        });

        setSignupConfig(prevConfig => {
          return hasSignupConfigChanged(data.signupConfig, prevConfig) ? data.signupConfig : prevConfig;
        });
      } else {
        logger.error('Failed to fetch participants');
        if (!silent) {
          setParticipants([]);
          setSignupConfig(null);
        }
      }
    } catch (error) {
      logger.error('Error fetching participants:', error);
      if (!silent) {
        setParticipants([]);
        setSignupConfig(null);
      }
    } finally {
      if (!silent) {
        setParticipantsLoading(false);
      }
    }
  }, [hasParticipantChanged, hasSignupConfigChanged]);

  const fetchReminders = useCallback(async (matchId: string, silent = false) => {
    if (!silent) {
      setRemindersLoading(true);
    }
    try {
      const response = await fetch(`/api/matches/${matchId}/reminders`);
      if (response.ok) {
        const data = await response.json();
        setReminders(data.reminders || []);
      } else {
        logger.error('Failed to fetch reminders');
        if (!silent) {
          setReminders([]);
        }
      }
    } catch (error) {
      logger.error('Error fetching reminders:', error);
      if (!silent) {
        setReminders([]);
      }
    } finally {
      if (!silent) {
        setRemindersLoading(false);
      }
    }
  }, []);

  const handleViewDetails = useCallback((match: MatchWithGame) => {
    setSelectedMatch(match);
    setDetailsModalOpen(true);
    fetchParticipants(match.id);
    fetchReminders(match.id);
    fetchMapNotes(match.id);
    // Ensure map details are loaded for this game
    fetchMapNames(match.game_id);
  }, [fetchParticipants, fetchReminders]);

  // Auto-refresh participants and reminders when details modal is open
  useEffect(() => {
    if (detailsModalOpen && selectedMatch) {
      // Use the same refresh interval for participants and reminders
      const participantsInterval = setInterval(() => {
        fetchParticipants(selectedMatch.id, true); // Silent refresh
        fetchReminders(selectedMatch.id, true); // Silent refresh
      }, refreshInterval * 1000);

      return () => clearInterval(participantsInterval);
    }
    return undefined;
  }, [detailsModalOpen, selectedMatch, refreshInterval, fetchParticipants, fetchReminders]);

  const handleDeleteMatch = async (matchId: string) => {
    try {
      const response = await fetch(`/api/matches/${matchId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        // Remove the match from the list
        setMatches(prev => prev.filter(match => match.id !== matchId));
        setDetailsModalOpen(false);
      } else {
        logger.error('Failed to delete match');
        showError('Failed to delete match. Please try again.');
      }
    } catch (error) {
      logger.error('Error deleting match:', error);
      showError('An error occurred while deleting the match.');
    }
  };

  const handleStatusTransition = useCallback(async (matchId: string, newStatus: string) => {
    const notificationId = `match-transition-${matchId}`;

    // Determine the action message based on the new status
    const actionMessages: Record<string, { loading: string; success: string }> = {
      gather: { loading: 'Opening signups...', success: 'Signups opened successfully!' },
      assign: { loading: 'Closing signups...', success: 'Signups closed successfully!' },
      battle: { loading: 'Starting match...', success: 'Match started successfully!' },
      complete: { loading: 'Ending match...', success: 'Match ended successfully!' },
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
      const response = await fetch(`/api/matches/${matchId}/transition`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ newStatus }),
      });

      if (response.ok) {
        const updatedMatch = await response.json();
        // Update the match in the list
        setMatches(prev => prev.map(match =>
          match.id === matchId ? updatedMatch : match
        ));

        if (newStatus === 'gather') {
          logger.info(`✅ Match transitioned to gather stage - Discord announcement will be posted`);
        }

        // Update notification to success
        notificationHelper.update(notificationId, {
          type: 'success',
          message: messages.success
        });
      } else {
        const error = await response.json();
        logger.error('Failed to transition match status:', error);

        // Update notification to error
        notificationHelper.update(notificationId, {
          type: 'error',
          message: error.error || 'Failed to update match status'
        });
      }
    } catch (error) {
      logger.error('Error transitioning match status:', error);

      // Update notification to error
      notificationHelper.update(notificationId, {
        type: 'error',
        message: 'An error occurred while updating the match status'
      });
    }
  }, []);

  const getNextStatusButton = useCallback((match: MatchWithGame) => {
    switch (match.status) {
      case 'created':
        return (
          <Button
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              handleStatusTransition(match.id, 'gather');
            }}
            style={{ flex: 1 }}
          >
            Start Signups
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
                    Are you sure you want to close signups for &quot;{match.name}&quot;? This will prevent new players from joining the match.
                  </Text>
                ),
                labels: { confirm: 'Close Signups', cancel: 'Cancel' },
                confirmProps: { color: 'orange' },
                onConfirm: () => handleStatusTransition(match.id, 'assign'),
              });
            }}
            style={{ flex: 1 }}
          >
            Close Signups
          </Button>
        );
      case 'assign':
        return (
          <Button
            size="sm"
            color="green"
            onClick={(e) => {
              e.stopPropagation();
              handleStatusTransition(match.id, 'battle');
            }}
            style={{ flex: 1 }}
          >
            Start Match
          </Button>
        );
      case 'battle':
        return (
          <Group gap="xs" style={{ flex: 1 }}>
            <Button 
              size="sm" 
              onClick={(e) => {
                e.stopPropagation();
                setSelectedMatchForScoring(match);
                setScoringModalOpen(true);
              }}
              style={{ flex: 1 }}
            >
              Scoring
            </Button>
            <Button
              size="sm"
              color="red"
              onClick={(e) => {
                e.stopPropagation();
                modals.openConfirmModal({
                  title: 'End Match',
                  children: (
                    <Text size="sm">
                      Are you sure you want to end the match &quot;{match.name}&quot;? This will mark the match as complete.
                    </Text>
                  ),
                  labels: { confirm: 'End Match', cancel: 'Cancel' },
                  confirmProps: { color: 'red' },
                  onConfirm: () => handleStatusTransition(match.id, 'complete'),
                });
              }}
              style={{ flex: 1 }}
            >
              End Match
            </Button>
          </Group>
        );
      case 'complete':
        return null; // No further transitions
      case 'cancelled':
        return null; // No further transitions
      default:
        return null;
    }
  }, [handleStatusTransition]);

  const handleAssignPlayers = (match: MatchWithGame) => {
    setSelectedMatchForAssignment(match);
    setAssignPlayersModalOpen(true);
  };

  const confirmDelete = (match: MatchWithGame) => {
    modals.openConfirmModal({
      title: 'Delete Match',
      children: (
        <Text size="sm">
          Are you sure you want to delete &quot;{match.name}&quot;? This action cannot be undone.
        </Text>
      ),
      labels: { confirm: 'Delete', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: () => handleDeleteMatch(match.id),
    });
  };

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

  // Memoize expensive match card rendering
  // Handle score submission
  const handleResultSubmit = async (result: MatchResult) => {
    if (!selectedMatchForScoring) return;

    try {
      const response = await fetch(`/api/matches/${selectedMatchForScoring.id}/games/${result.gameId}/result`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(result),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save result');
      }
      
      // Refresh matches to show updated status
      fetchMatches();
      
      // Close modal
      setScoringModalOpen(false);
      setSelectedMatchForScoring(null);
    } catch (error) {
      logger.error('Error submitting result:', error);
      throw error; // Re-throw to let the modal handle the error display
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
            mapNames={mapNames}
            onViewDetails={handleViewDetails}
            onAssignPlayers={handleAssignPlayers}
            getNextStatusButton={getNextStatusButton}
          />
        </motion.div>
      </Grid.Col>
    ));
  }, [filteredMatches, mapNames, handleViewDetails, getNextStatusButton]);


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


      <AssignPlayersModal
        isOpen={assignPlayersModalOpen}
        onClose={() => setAssignPlayersModalOpen(false)}
        matchId={selectedMatchForAssignment?.id || ''}
        matchName={selectedMatchForAssignment?.name || ''}
      />

      {selectedMatchForScoring && (
        <ScoringModal
          opened={scoringModalOpen}
          onClose={() => {
            setScoringModalOpen(false);
            setSelectedMatchForScoring(null);
          }}
          matchId={selectedMatchForScoring.id}
          gameId={selectedMatchForScoring.game_id}
          matchFormat={selectedMatchForScoring.match_format || 'casual'}
          onResultSubmit={handleResultSubmit}
        />
      )}

      <MatchDetailsModal
        opened={detailsModalOpen}
        onClose={() => setDetailsModalOpen(false)}
        title="Match Details"
        selectedMatch={selectedMatch}
        participants={participants}
        participantsLoading={participantsLoading}
        signupConfig={signupConfig}
        reminders={reminders}
        remindersLoading={remindersLoading}
        mapDetails={mapDetails}
        mapNotes={mapNotes}
        formatMapName={formatMapName}
        parseDbTimestamp={parseDbTimestamp}
        showTabs={true}
        showDeleteButton={true}
        showAssignButton={true}
        onDelete={(match) => confirmDelete(match)}
        onAssign={(match) => handleAssignPlayers(match)}
      />
    </div>
  );
}