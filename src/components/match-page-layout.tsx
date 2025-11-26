'use client'

import { Grid } from '@mantine/core';
import { MatchInfoPanel } from './match-details/MatchInfoPanel';
import { MatchContentPanel } from './match-details/MatchContentPanel';
import type { Match } from '@/shared/types';

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
  event_image_url?: string;
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

interface SignupField {
  id: string;
  label: string;
  type: string;
}

interface SignupConfig {
  fields: SignupField[];
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

interface MatchGameResult {
  id: string;
  match_id: string;
  round: number;
  map_id: string;
  map_name: string;
  winner_id?: string;
  status: 'pending' | 'ongoing' | 'completed';
}

interface MatchPageLayoutProps {
  match: MatchWithGame;
  participants: MatchParticipant[];
  reminders: ReminderData[];
  matchGames?: MatchGameResult[];
  gamesLoading?: boolean;
  mapDetails: {[key: string]: {name: string, imageUrl?: string, modeName?: string, location?: string, note?: string}};
  mapNotes: {[key: string]: string};
  signupConfig: SignupConfig | null;
  mapCodes?: Record<string, string>;
  onMapCodeChange?: (mapId: string, code: string) => void;
  onMapCodesSave?: () => void;
  mapCodesSaving?: boolean;
  onAssignPlayers?: () => void;
  onScoring?: () => void;
  onDelete?: () => void;
  onStatusTransition?: (newStatus: string) => void;
  parseDbTimestamp: (timestamp: string | null | undefined) => Date | null;
  formatMapName: (mapId: string) => string;
  showActions?: boolean;
  isHistory?: boolean;
  participantsLoading?: boolean;
  remindersLoading?: boolean;
}

export function MatchPageLayout({
  match,
  participants,
  reminders,
  matchGames,
  gamesLoading,
  mapDetails,
  mapNotes,
  signupConfig,
  mapCodes,
  onMapCodeChange,
  onMapCodesSave,
  mapCodesSaving,
  onAssignPlayers,
  onScoring,
  onDelete,
  onStatusTransition,
  parseDbTimestamp,
  formatMapName,
  showActions = true,
  isHistory = false,
  participantsLoading = false,
  remindersLoading = false
}: MatchPageLayoutProps) {
  return (
    <div className="container mx-auto py-6 pl-2 pr-2">
      <Grid gutter="lg">
        {/* Left column - 40% width on desktop, full width on mobile */}
        <Grid.Col span={{ base: 12, sm: 12, md: 5, lg: 5 }} pl={{ base: 'md', md: 0 }}>
          <MatchInfoPanel
            match={match}
            mapDetails={mapDetails}
            mapNotes={mapNotes}
            matchGames={matchGames}
            gamesLoading={gamesLoading}
            formatMapName={formatMapName}
            parseDbTimestamp={parseDbTimestamp}
            showActions={showActions}
            isHistory={isHistory}
            onAssignPlayers={onAssignPlayers}
            onScoring={onScoring}
            onDelete={onDelete}
            onStatusTransition={onStatusTransition}
          />
        </Grid.Col>

        {/* Right column - 60% width on desktop, full width on mobile */}
        <Grid.Col span={{ base: 12, sm: 12, md: 7, lg: 7 }} pr={{ base: 'md', md: 0 }}>
          <MatchContentPanel
            match={match}
            participants={participants}
            reminders={reminders}
            mapDetails={mapDetails}
            mapNotes={mapNotes}
            signupConfig={signupConfig}
            parseDbTimestamp={parseDbTimestamp}
            formatMapName={formatMapName}
            matchGames={matchGames}
            gamesLoading={gamesLoading}
            mapCodes={mapCodes}
            onMapCodeChange={onMapCodeChange}
            onMapCodesSave={onMapCodesSave}
            mapCodesSaving={mapCodesSaving}
            participantsLoading={participantsLoading}
            remindersLoading={remindersLoading}
          />
        </Grid.Col>
      </Grid>
    </div>
  );
}
