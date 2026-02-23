'use client'

import { useState } from 'react';
import { Group, SegmentedControl } from '@mantine/core';
import { ParticipantsList } from './ParticipantsList';
import { RemindersList } from './RemindersList';
import { MapCodesTab } from './MapCodesTab';
import classes from '../gradient-segmented-control.module.css';

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

interface TabbedMatchDetailsProps {
  selectedMatch: {
    status: string;
    max_participants: number;
    map_codes_supported?: boolean;
    maps?: string[];
  };
  participants: MatchParticipant[];
  participantsLoading: boolean;
  signupConfig: SignupConfig | null;
  reminders: ReminderData[];
  remindersLoading: boolean;
  mapDetails: {[key: string]: {name: string; imageUrl?: string; modeName?: string; location?: string; note?: string}};
  mapNotes: {[key: string]: string};
  formatMapName: (mapId: string) => string;
  parseDbTimestamp: (timestamp: string | null | undefined) => Date | null;
  mapCodes: Record<string, string>;
  mapCodesSaving: boolean;
  saveMapCodes: () => void;
  updateMapCode: (mapId: string, value: string) => void;
}

export function TabbedMatchDetails({
  selectedMatch,
  participants,
  participantsLoading,
  signupConfig,
  reminders,
  remindersLoading,
  mapDetails,
  mapNotes,
  formatMapName,
  parseDbTimestamp,
  mapCodes,
  mapCodesSaving,
  saveMapCodes,
  updateMapCode
}: TabbedMatchDetailsProps) {
  const [activeTab, setActiveTab] = useState<'participants' | 'announcements' | 'mapcodes'>('participants');

  return (
    <>
      <div style={{ width: '100%', overflowX: 'auto' }}>
        <Group justify="center" mb="sm">
          <SegmentedControl
            radius="xl"
            size="sm"
            data={[
              {
                label: `Players (${participants.length}/${selectedMatch.max_participants})`,
                value: 'participants'
              },
              {
                label: `Alerts (${reminders.length})`,
                value: 'announcements'
              },
              ...(selectedMatch.map_codes_supported ? [{ label: 'Map Codes', value: 'mapcodes' }] : [])
            ]}
            value={activeTab}
            onChange={(value) => setActiveTab(value as 'participants' | 'announcements' | 'mapcodes')}
            classNames={classes}
            style={{ minWidth: 'fit-content' }}
          />
        </Group>
      </div>

      {activeTab === 'participants' && (
        <ParticipantsList
          participants={participants}
          loading={participantsLoading}
          matchStatus={selectedMatch.status}
          signupConfig={signupConfig}
          parseDbTimestamp={parseDbTimestamp}
        />
      )}

      {activeTab === 'announcements' && (
        <RemindersList
          reminders={reminders}
          loading={remindersLoading}
          matchStatus={selectedMatch.status}
          parseDbTimestamp={parseDbTimestamp}
          showDescription={true}
        />
      )}

      {activeTab === 'mapcodes' && selectedMatch.map_codes_supported && (
        <MapCodesTab
          maps={selectedMatch.maps}
          mapDetails={mapDetails}
          mapNotes={mapNotes}
          formatMapName={formatMapName}
          mapCodes={mapCodes}
          mapCodesSaving={mapCodesSaving}
          saveMapCodes={saveMapCodes}
          updateMapCode={updateMapCode}
        />
      )}
    </>
  );
}
