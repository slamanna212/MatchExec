'use client'

import { useState, useEffect, useCallback, useMemo, memo } from 'react';
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
  RingProgress
} from '@mantine/core';
import { Match, MATCH_FLOW_STEPS } from '@/shared/types';
import Link from 'next/link';
import { MatchDetailsModal } from './match-details-modal';

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
  return new Date(timestamp + 'Z');
};

interface MatchWithGame extends Omit<Match, 'created_at' | 'updated_at' | 'start_date' | 'end_date'> {
  game_name?: string;
  game_icon?: string;
  game_color?: string;
  rules?: string;
  rounds?: number;
  maps?: string[];
  livestream_link?: string;
  created_at: string;
  updated_at: string;
  start_date?: string;
  end_date?: string;
}

interface HistoryMatchCardProps {
  match: MatchWithGame;
  mapNames: {[key: string]: string};
  onViewDetails: (match: MatchWithGame) => void;
  formatMapName: (mapId: string) => string;
}

const HistoryMatchCard = memo(({ 
  match, 
  mapNames, 
  onViewDetails, 
  formatMapName 
}: HistoryMatchCardProps) => {
  return (
    <Card 
      shadow="sm" 
      padding="lg" 
      radius="md" 
      withBorder
      style={{ cursor: 'pointer', opacity: 0.9 }}
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
        </Stack>
        <RingProgress
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
              match.maps.length > 1
                ? `${mapNames[match.maps[0]] || formatMapName(match.maps[0])} +${match.maps.length - 1} more`
                : mapNames[match.maps[0]] || formatMapName(match.maps[0])
            ) : (
              'None selected'
            )}
          </Text>
        </Group>
        
        <Group justify="space-between">
          <Text size="sm" c="dimmed">Max Participants:</Text>
          <Text size="sm">{match.max_participants}</Text>
        </Group>
        
        <Group justify="space-between">
          <Text size="sm" c="dimmed">Completed:</Text>
          <Text size="sm">{parseDbTimestamp(match.updated_at)?.toLocaleDateString('en-US') || 'N/A'}</Text>
        </Group>
      </Stack>
    </Card>
  );
});

HistoryMatchCard.displayName = 'HistoryMatchCard';

export function MatchHistoryDashboard() {
  const [matches, setMatches] = useState<MatchWithGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<MatchWithGame | null>(null);
  const [participants, setParticipants] = useState<MatchParticipant[]>([]);
  const [participantsLoading, setParticipantsLoading] = useState(false);
  const [signupConfig, setSignupConfig] = useState<SignupConfig | null>(null);
  const [refreshInterval, setRefreshInterval] = useState(30);
  const [reminders, setReminders] = useState<ReminderData[]>([]);
  const [remindersLoading, setRemindersLoading] = useState(false);

  const fetchMatches = useCallback(async (silent = false) => {
    try {
      // Fetch only completed matches
      const response = await fetch('/api/matches?status=complete');
      if (response.ok) {
        const data = await response.json();
        // Only update if data actually changed to prevent unnecessary rerenders
        setMatches(prevMatches => {
          // More efficient comparison than JSON.stringify for arrays
          if (prevMatches.length !== data.length) {
            return data;
          }
          
          // Check if any match has changed by comparing key properties
          const hasChanges = data.some((match: MatchWithGame, index: number) => {
            const prevMatch = prevMatches[index];
            return !prevMatch || 
              match.id !== prevMatch.id ||
              match.status !== prevMatch.status ||
              match.name !== prevMatch.name ||
              match.created_at !== prevMatch.created_at ||
              match.updated_at !== prevMatch.updated_at;
          });
          
          return hasChanges ? data : prevMatches;
        });
      }
    } catch (error) {
      console.error('Error fetching matches:', error);
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, []);

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
        console.error('Error fetching UI settings:', error);
      }
    };

    fetchMatches();
    fetchUISettings();
  }, [fetchMatches]);

  // Set up auto-refresh with configurable interval (less frequent for history)
  useEffect(() => {
    const intervalId = setInterval(() => {
      fetchMatches(true); // Silent refresh to prevent loading states
    }, refreshInterval * 1000);

    // Cleanup interval on unmount or when refreshInterval changes
    return () => clearInterval(intervalId);
  }, [refreshInterval, fetchMatches]);

  const formatMapName = useCallback((mapId: string) => {
    // Convert map ID to proper display name
    // Examples: "circuit-royal" -> "Circuit Royal", "kings-row" -> "Kings Row"
    return mapId
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }, []);

  const [mapNames, setMapNames] = useState<{[key: string]: string}>({});
  const [mapDetails, setMapDetails] = useState<{[key: string]: {name: string, imageUrl?: string, modeName?: string, location?: string}}>({});

  const fetchMapNames = async (gameId: string) => {
    try {
      const response = await fetch(`/api/games/${gameId}/maps`);
      if (response.ok) {
        const maps = await response.json();
        const mapNamesObj: {[key: string]: string} = {};
        const mapDetailsObj: {[key: string]: {name: string, imageUrl?: string, modeName?: string, location?: string}} = {};
        
        maps.forEach((map: { id: string; name: string; imageUrl?: string; modeName?: string; location?: string }) => {
          mapNamesObj[map.id] = map.name;
          mapDetailsObj[map.id] = {
            name: map.name,
            imageUrl: map.imageUrl,
            modeName: map.modeName,
            location: map.location
          };
        });
        
        setMapNames(prev => ({ ...prev, ...mapNamesObj }));
        setMapDetails(prev => ({ ...prev, ...mapDetailsObj }));
      }
    } catch (error) {
      console.error('Error fetching map names:', error);
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

  const fetchParticipants = useCallback(async (matchId: string, silent = false) => {
    if (!silent) {
      setParticipantsLoading(true);
    }
    try {
      const response = await fetch(`/api/matches/${matchId}/participants`);
      if (response.ok) {
        const data = await response.json();
        setParticipants(data.participants || []);
        setSignupConfig(data.signupConfig || null);
      } else {
        console.error('Failed to fetch participants');
        if (!silent) {
          setParticipants([]);
          setSignupConfig(null);
        }
      }
    } catch (error) {
      console.error('Error fetching participants:', error);
      if (!silent) {
        setParticipants([]);
        setSignupConfig(null);
      }
    } finally {
      if (!silent) {
        setParticipantsLoading(false);
      }
    }
  }, []);

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
        console.error('Failed to fetch reminders');
        if (!silent) {
          setReminders([]);
        }
      }
    } catch (error) {
      console.error('Error fetching reminders:', error);
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
  }, [fetchParticipants, fetchReminders]);

  // Memoize expensive match card rendering
  const memoizedMatchCards = useMemo(() => {
    return matches.map((match) => (
      <Grid.Col key={match.id} span={{ base: 12, md: 6, lg: 4 }}>
        <HistoryMatchCard 
          match={match}
          mapNames={mapNames}
          onViewDetails={handleViewDetails}
          formatMapName={formatMapName}
        />
      </Grid.Col>
    ));
  }, [matches, mapNames, handleViewDetails, formatMapName]);


  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Loader size="lg" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <Group justify="space-between" mb="xl">
        <div>
          <Text size="xl" fw={700}>Match History</Text>
          <Text c="dimmed" mt="xs">View completed matches</Text>
        </div>
      </Group>

      <Divider mb="xl" />

      {matches.length === 0 ? (
        <Card p="xl">
          <Stack align="center">
            <Text size="xl" fw={600}>No completed matches yet</Text>
            <Text c="dimmed" mb="md">
              Completed matches will appear here
            </Text>
            <Button 
              component={Link}
              href="/matches"
            >
              View Active Matches
            </Button>
          </Stack>
        </Card>
      ) : (
        <Grid>
          {memoizedMatchCards}
        </Grid>
      )}

      <MatchDetailsModal
        opened={detailsModalOpen}
        onClose={() => setDetailsModalOpen(false)}
        title="Match History Details"
        selectedMatch={selectedMatch}
        participants={participants}
        participantsLoading={participantsLoading}
        signupConfig={signupConfig}
        reminders={reminders}
        remindersLoading={remindersLoading}
        mapDetails={mapDetails}
        formatMapName={formatMapName}
        parseDbTimestamp={parseDbTimestamp}
        showTabs={true}
        showDeleteButton={false}
        showAssignButton={false}
      />
    </div>
  );
}