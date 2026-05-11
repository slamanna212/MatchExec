'use client'

import { useState, useEffect } from 'react';
import type { JSX } from 'react';
import { useRouter } from 'next/navigation';
import {
  Stack,
  Group,
  Text,
  Button,
  TextInput,
  SegmentedControl
} from '@mantine/core';
import { IconDeviceFloppy } from '@tabler/icons-react';
import type { MatchWithGameDetails, MatchGameResult, SignupConfig } from '@/shared/types';
import { ParticipantsList } from './ParticipantsList';
import { RemindersList } from './RemindersList';
import { MapResultsSection } from './MapResultsSection';
import { StatsVisualization } from '@/components/stats/StatsVisualization';
import classes from '../gradient-segmented-control.module.css';

function MapsTabContent({
  maps,
  mapDetails,
  mapNotes,
  formatMapName,
  matchGames,
  showWinner,
  onMatchPlayers,
  onScoring,
  matchInBattle,
}: {
  maps?: string[];
  mapDetails: {[key: string]: {name: string, imageUrl?: string, modeName?: string, location?: string, note?: string}};
  mapNotes: {[key: string]: string};
  formatMapName: (mapId: string) => string;
  matchGames?: MatchGameResult[];
  showWinner: boolean;
  onMatchPlayers?: (gameId: string) => void;
  onScoring?: (gameId: string) => void;
  matchInBattle?: boolean;
}) {
  if (!maps || maps.length === 0) {
    return <Text size="sm" c="dimmed" ta="center" py="md">No maps configured for this match</Text>;
  }

  const gameIdByMapId = new Map(
    (matchGames ?? []).map(g => [g.map_id, g.id])
  );
  const gameStatusByMapId = new Map(
    (matchGames ?? []).map(g => [g.map_id, g.status])
  );

  return (
    <MapResultsSection
      maps={maps}
      mapDetails={mapDetails}
      mapNotes={mapNotes}
      formatMapName={formatMapName}
      matchGames={matchGames}
      showWinner={showWinner}
    >
      {(mapId) => {
        const gameId = gameIdByMapId.get(mapId);
        const gameStatus = gameStatusByMapId.get(mapId);
        if (!gameId) return null;

        const showScoring = matchInBattle && onScoring;
        const showMatchPlayers = onMatchPlayers;
        if (!showScoring && !showMatchPlayers) return null;

        return (
          <>
            {showScoring && (
              <Button
                size="xs"
                variant="light"
                color="violet"
                disabled={gameStatus !== 'ongoing'}
                onClick={() => onScoring(gameId)}
              >
                Scoring
              </Button>
            )}
            {showMatchPlayers && (
              <Button
                size="xs"
                variant="light"
                color="violet"
                disabled={gameStatus !== 'completed'}
                onClick={() => onMatchPlayers(gameId)}
              >
                Match Players
              </Button>
            )}
          </>
        );
      }}
    </MapResultsSection>
  );
}

function MapCodesTabContent({
  maps,
  mapDetails,
  mapNotes,
  formatMapName,
  mapCodes,
  onMapCodeChange,
  onMapCodesSave,
  mapCodesSaving
}: {
  maps?: string[];
  mapDetails: {[key: string]: {name: string, imageUrl?: string, modeName?: string, location?: string, note?: string}};
  mapNotes: {[key: string]: string};
  formatMapName: (mapId: string) => string;
  mapCodes: Record<string, string>;
  onMapCodeChange?: (mapId: string, code: string) => void;
  onMapCodesSave?: () => void;
  mapCodesSaving: boolean;
}) {
  if (!maps || maps.length === 0) {
    return <Text size="sm" c="dimmed" ta="center" py="md">No maps configured for this match</Text>;
  }
  return (
    <Stack gap="md">
      <MapResultsSection
        maps={maps}
        mapDetails={mapDetails}
        mapNotes={mapNotes}
        formatMapName={formatMapName}
      >
        {(mapId) => (
          onMapCodeChange && (
            <TextInput
              placeholder="Enter map code"
              value={mapCodes[mapId] || ''}
              onChange={(event) => onMapCodeChange(mapId, event.currentTarget.value)}
              maxLength={24}
              size="sm"
              variant="filled"
              w={200}
              styles={{ input: { fontFamily: 'monospace', fontSize: '0.9em' } }}
            />
          )
        )}
      </MapResultsSection>
      {onMapCodesSave && (
        <Group justify="center">
          <Button
            size="sm"
            loading={mapCodesSaving}
            onClick={onMapCodesSave}
            leftSection={<IconDeviceFloppy size={16} />}
          >
            Save Codes
          </Button>
        </Group>
      )}
    </Stack>
  );
}

// Use shared types as local aliases
type MatchWithGame = MatchWithGameDetails;

interface MatchParticipant {
  id: string;
  user_id: string;
  username: string;
  avatar_url?: string | null;
  joined_at: string;
  signup_data: Record<string, unknown>;
  team_assignment?: 'reserve' | 'blue' | 'red';
  receives_map_codes?: boolean;
}

interface ReminderData {
  id: string;
  match_id: string;
  reminder_time: string;
  status: 'pending' | 'sent' | 'failed' | 'processed' | 'completed' | 'scheduled';
  error_message?: string;
  created_at: string;
  sent_at?: string;
  processed_at?: string;
  type: 'discord_general' | 'discord_match' | 'discord_player' | 'timed_announcement';
  description?: string;
}

interface MatchContentPanelProps {
  match: MatchWithGame;
  participants: MatchParticipant[];
  reminders: ReminderData[];
  mapDetails: {[key: string]: {name: string, imageUrl?: string, modeName?: string, location?: string, note?: string}};
  mapNotes: {[key: string]: string};
  signupConfig: SignupConfig | null;
  parseDbTimestamp: (timestamp: string | null | undefined) => Date | null;
  formatMapName: (mapId: string) => string;

  // Match games
  matchGames?: MatchGameResult[];
  gamesLoading?: boolean;

  // Map codes
  mapCodes?: Record<string, string>;
  onMapCodeChange?: (mapId: string, code: string) => void;
  onMapCodesSave?: () => void;
  mapCodesSaving?: boolean;

  // Loading states
  participantsLoading?: boolean;
  remindersLoading?: boolean;
}

type TabValue = 'participants' | 'announcements' | 'maps' | 'matchcodes' | 'stats';

export function MatchContentPanel({
  match,
  participants,
  reminders,
  mapDetails,
  mapNotes,
  signupConfig,
  parseDbTimestamp,
  formatMapName,
  matchGames,
  gamesLoading: _gamesLoading = false,
  mapCodes = {},
  onMapCodeChange,
  onMapCodesSave,
  mapCodesSaving = false,
  participantsLoading = false,
  remindersLoading = false
}: MatchContentPanelProps): JSX.Element {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabValue>(() => {
    if (typeof window === 'undefined') return 'participants';
    const saved = localStorage.getItem(`match_tab_${match.id}`);
    const valid: TabValue[] = ['participants', 'announcements', 'maps', 'matchcodes', 'stats'];
    return valid.includes(saved as TabValue) ? (saved as TabValue) : 'participants';
  });
  const [statsEnabled, setStatsEnabled] = useState(false);

  useEffect(() => {
    fetch('/api/settings/stats')
      .then(r => r.json())
      .then((data: { enabled?: boolean }) => setStatsEnabled(data.enabled ?? false))
      .catch(() => setStatsEnabled(false));
  }, []);

  const showStats = statsEnabled && (match.status === 'battle' || match.status === 'complete');

  const effectiveTab: TabValue =
    (activeTab === 'stats' && !showStats) || (activeTab === 'matchcodes' && !match.map_codes_supported)
      ? 'participants'
      : activeTab;

  const showMatchPlayers = showStats;

  const tabData = [
    {
      label: <span>Players<span className="hidden md:inline"> ({participants.length}/{match.max_participants})</span></span>,
      value: 'participants'
    },
    {
      label: <span>Maps<span className="hidden md:inline"> ({match.maps?.length || 0})</span></span>,
      value: 'maps'
    },
    {
      label: <span>Alerts<span className="hidden md:inline"> ({reminders.length})</span></span>,
      value: 'announcements'
    },
    ...(match.map_codes_supported ? [{
      label: <span><span className="hidden md:inline">Match </span>Codes</span>,
      value: 'matchcodes'
    }] : []),
    ...(showStats ? [{ label: 'Stats', value: 'stats' }] : []),
  ];

  return (
    <Stack gap="md">
        {/* Tab Navigation */}
        <div style={{ width: '100%', overflowX: 'auto' }}>
          <Group justify="center" mb="sm" w="100%">
            <SegmentedControl
              radius="xl"
              size="sm"
              data={tabData}
              value={effectiveTab}
              onChange={(value) => {
                localStorage.setItem(`match_tab_${match.id}`, value);
                setActiveTab(value as TabValue);
              }}
              classNames={classes}
              style={{ minWidth: 'fit-content' }}
            />
          </Group>
        </div>

        {/* Tab Content */}
        {effectiveTab === 'participants' && (
          <ParticipantsList
            participants={participants}
            loading={participantsLoading}
            matchStatus={match.status}
            signupConfig={signupConfig}
            parseDbTimestamp={parseDbTimestamp}
          />
        )}

        {effectiveTab === 'maps' && (
          <MapsTabContent
            maps={match.maps}
            mapDetails={mapDetails}
            mapNotes={mapNotes}
            formatMapName={formatMapName}
            matchGames={matchGames}
            showWinner={match.status === 'battle' || match.status === 'complete'}
            matchInBattle={match.status === 'battle'}
            onScoring={(gameId) => router.push(`/matches/${match.id}/scoring?gameId=${gameId}`)}
            onMatchPlayers={showMatchPlayers ? (gameId) => router.push(`/matches/${match.id}/stats/${gameId}`) : undefined}
          />
        )}

        {effectiveTab === 'announcements' && (
          <RemindersList
            reminders={reminders}
            loading={remindersLoading}
            matchStatus={match.status}
            parseDbTimestamp={parseDbTimestamp}
            showDescription={true}
          />
        )}

        {effectiveTab === 'matchcodes' && match.map_codes_supported && (
          <MapCodesTabContent
            maps={match.maps}
            mapDetails={mapDetails}
            mapNotes={mapNotes}
            formatMapName={formatMapName}
            mapCodes={mapCodes}
            onMapCodeChange={onMapCodeChange}
            onMapCodesSave={onMapCodesSave}
            mapCodesSaving={mapCodesSaving}
          />
        )}

        {effectiveTab === 'stats' && showStats && (
          <StatsVisualization matchId={match.id} gameId={match.game_id} games={matchGames} />
        )}
    </Stack>
  );
}
