'use client'

import { logger } from '@/lib/logger/client';
import { use, useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Loader, Container, Text, Center, Stack } from '@mantine/core';
import { modals } from '@mantine/modals';
import type { Match, SignupConfig, ReminderData } from '@/shared/types';
import { AssignPlayersModal } from '@/components/assign-players-modal';
import { ScoringModal } from '@/components/scoring/ScoringModal';
import { MatchPageLayout } from '@/components/match-page-layout';
import { useMatchGames } from '@/components/match-details/useMatchGames';
import { useMapCodes } from '@/components/match-details/useMapCodes';
import { showError, notificationHelper } from '@/lib/notifications';

// Utility function to properly convert SQLite UTC timestamps to Date objects
const parseDbTimestamp = (timestamp: string | null | undefined): Date | null => {
  if (!timestamp) return null;

  // Check if timestamp already includes timezone info
  if (timestamp.includes('Z') || /[+-]\d{2}:?\d{2}$/.test(timestamp)) {
    return new Date(timestamp);
  }

  // SQLite CURRENT_TIMESTAMP returns format like "2025-08-08 22:52:51" (UTC)
  return new Date(`${timestamp}Z`);
};

const formatMapName = (mapId: string) => {
  // Convert map ID to proper display name
  return mapId
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

interface MatchWithGame extends Omit<Match, 'created_at' | 'updated_at' | 'start_date' | 'end_date'> {
  game_name?: string;
  game_icon?: string;
  game_color?: string;
  map_codes_supported?: boolean;
  rules?: string;
  rounds?: number;
  maps?: string[];
  map_codes?: Record<string, string>;
  livestream_link?: string;
  created_at: string;
  updated_at: string;
  start_date?: string;
  end_date?: string;
}

interface MatchParticipant {
  id: string;
  user_id: string;
  username: string;
  joined_at: string;
  signup_data: Record<string, unknown>;
}

export default function MatchPage({
  params
}: {
  params: Promise<{ matchId: string }>
}) {
  const { matchId } = use(params);
  const router = useRouter();
  const [match, setMatch] = useState<MatchWithGame | null>(null);
  const [participants, setParticipants] = useState<MatchParticipant[]>([]);
  const [reminders, setReminders] = useState<ReminderData[]>([]);
  const [signupConfig, setSignupConfig] = useState<SignupConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [participantsLoading, setParticipantsLoading] = useState(false);
  const [remindersLoading, setRemindersLoading] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState(10);

  // Modal states
  const [assignPlayersModalOpen, setAssignPlayersModalOpen] = useState(false);
  const [scoringModalOpen, setScoringModalOpen] = useState(false);

  // Map data states
  const [_mapNames, setMapNames] = useState<{[key: string]: string}>({});
  const [mapDetails, setMapDetails] = useState<{[key: string]: {name: string, imageUrl?: string, modeName?: string, location?: string, note?: string}}>({});
  const [mapNotes, setMapNotes] = useState<{[key: string]: string}>({});

  // Custom hooks
  const { matchGames, gamesLoading } = useMatchGames(match, true);
  const { mapCodes, mapCodesSaving, saveMapCodes, updateMapCode } = useMapCodes(match, true);

  // Fetch map names
  const fetchMapNames = useCallback(async (gameId: string) => {
    try {
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
          const modesResponse = await fetch(`/api/games/${gameId}/modes`);
          let modes: {id: string, name: string}[] = [];

          if (modesResponse.ok) {
            modes = await modesResponse.json();
          }

          maps.forEach((map: { id: string; name: string; imageUrl?: string; modeName?: string; location?: string }) => {
            mapNamesObj[map.id] = map.name;
            mapDetailsObj[map.id] = {
              name: map.name,
              imageUrl: map.imageUrl,
              modeName: map.modeName,
              location: map.location
            };

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
  }, []);

  // Fetch map notes
  const fetchMapNotes = useCallback(async (matchId: string) => {
    try {
      const response = await fetch(`/api/matches/${matchId}/map-notes`);
      if (response.ok) {
        const { notes } = await response.json();
        setMapNotes(notes);

        setMapDetails(prev => {
          const updated = { ...prev };
          Object.keys(notes).forEach(timestampedMapId => {
            if (!updated[timestampedMapId]) {
              const baseMapId = timestampedMapId.replace(/-\d+-[a-zA-Z0-9]+$/, '');
              const baseMapDetail = updated[baseMapId];

              if (baseMapDetail) {
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
  }, []);

  // Fetch participants
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
  }, []);

  // Fetch reminders
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

  // Fetch UI settings
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

    fetchUISettings();
  }, []);

  // Initial data fetch
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [matchRes, participantsRes, remindersRes] = await Promise.all([
          fetch(`/api/matches/${matchId}`),
          fetch(`/api/matches/${matchId}/participants`),
          fetch(`/api/matches/${matchId}/reminders`)
        ]);

        if (!matchRes.ok) {
          if (matchRes.status === 404) {
            setError('Match not found');
          } else {
            setError('Failed to load match');
          }
          return;
        }

        const matchData = await matchRes.json();
        const participantsData = await participantsRes.json();
        const remindersData = await remindersRes.json();

        setMatch(matchData);
        setParticipants(participantsData.participants || []);
        setSignupConfig(participantsData.signupConfig || null);
        setReminders(remindersData.reminders || []);

        // Fetch map data
        await fetchMapNames(matchData.game_id);
        await fetchMapNotes(matchData.id);
      } catch (err) {
        logger.error('Error fetching match data:', err);
        setError('An error occurred while loading the match');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [matchId, fetchMapNames, fetchMapNotes]);

  // Auto-refresh participants and reminders
  useEffect(() => {
    if (!match || match.status === 'complete') return undefined;

    const interval = setInterval(() => {
      fetchParticipants(match.id, true);
      fetchReminders(match.id, true);
    }, refreshInterval * 1000);

    return () => {
      clearInterval(interval);
    };
  }, [match, refreshInterval, fetchParticipants, fetchReminders]);

  // Handle status transition
  const handleStatusTransition = useCallback(async (newStatus: string) => {
    if (!match) return;

    const notificationId = `match-transition-${match.id}`;

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

    notificationHelper.loading({
      id: notificationId,
      message: messages.loading
    });

    try {
      const response = await fetch(`/api/matches/${match.id}/transition`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ newStatus }),
      });

      if (response.ok) {
        const updatedMatch = await response.json();
        setMatch(updatedMatch);

        notificationHelper.update(notificationId, {
          type: 'success',
          message: messages.success
        });
      } else {
        const error = await response.json();
        logger.error('Failed to transition match status:', error);

        notificationHelper.update(notificationId, {
          type: 'error',
          message: error.error || 'Failed to update match status'
        });
      }
    } catch (error) {
      logger.error('Error transitioning match status:', error);
      notificationHelper.update(notificationId, {
        type: 'error',
        message: 'An error occurred while updating the match status'
      });
    }
  }, [match]);

  // Handle delete match
  const handleDeleteMatch = useCallback(() => {
    if (!match) return;

    modals.openConfirmModal({
      title: 'Delete Match',
      children: (
        <Text size="sm">
          Are you sure you want to delete this match? This action cannot be undone.
        </Text>
      ),
      labels: { confirm: 'Delete', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        try {
          const response = await fetch(`/api/matches/${match.id}`, {
            method: 'DELETE',
          });

          if (response.ok) {
            router.push('/matches');
          } else {
            logger.error('Failed to delete match');
            showError('Failed to delete match. Please try again.');
          }
        } catch (error) {
          logger.error('Error deleting match:', error);
          showError('An error occurred while deleting the match.');
        }
      },
    });
  }, [match, router]);

  // Handle scoring result submit
  const handleResultSubmit = useCallback(async () => {
    setScoringModalOpen(false);
    // Refresh match data
    if (match) {
      await fetchParticipants(match.id, true);
      await fetchReminders(match.id, true);
    }
  }, [match, fetchParticipants, fetchReminders]);

  // Render loading state
  if (loading) {
    return (
      <Container>
        <Center style={{ minHeight: '400px' }}>
          <Loader size="lg" />
        </Center>
      </Container>
    );
  }

  // Render error state
  if (error || !match) {
    return (
      <Container>
        <Center style={{ minHeight: '400px' }}>
          <Stack align="center" gap="md">
            <Text size="xl" fw={600} c="red">
              {error || 'Match not found'}
            </Text>
            <Text size="sm" c="dimmed">
              The match you&apos;re looking for doesn&apos;t exist or has been deleted.
            </Text>
          </Stack>
        </Center>
      </Container>
    );
  }

  return (
    <>
      <MatchPageLayout
        match={match}
        participants={participants}
        reminders={reminders}
        matchGames={matchGames}
        gamesLoading={gamesLoading}
        mapDetails={mapDetails}
        mapNotes={mapNotes}
        signupConfig={signupConfig}
        mapCodes={mapCodes}
        onMapCodeChange={updateMapCode}
        onMapCodesSave={saveMapCodes}
        mapCodesSaving={mapCodesSaving}
        onAssignPlayers={() => setAssignPlayersModalOpen(true)}
        onScoring={() => setScoringModalOpen(true)}
        onDelete={handleDeleteMatch}
        onStatusTransition={handleStatusTransition}
        parseDbTimestamp={parseDbTimestamp}
        formatMapName={formatMapName}
        showActions={true}
        isHistory={false}
        participantsLoading={participantsLoading}
        remindersLoading={remindersLoading}
      />

      <AssignPlayersModal
        isOpen={assignPlayersModalOpen}
        onClose={() => setAssignPlayersModalOpen(false)}
        matchId={match.id}
        matchName={match.name}
      />

      <ScoringModal
        opened={scoringModalOpen}
        onClose={() => setScoringModalOpen(false)}
        matchId={match.id}
        gameId={match.game_id}
        matchFormat={match.match_format || 'casual'}
        onResultSubmit={handleResultSubmit}
      />
    </>
  );
}
