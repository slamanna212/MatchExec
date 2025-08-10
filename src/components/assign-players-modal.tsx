'use client'

import { useState, useEffect, useCallback } from 'react';
import { 
  Modal, 
  Text, 
  Button, 
  Card, 
  Group, 
  Stack, 
  Select, 
  Grid,
  Badge,
  Avatar,
  Loader,
  Divider
} from '@mantine/core';

interface MatchParticipant {
  id: string;
  user_id: string;
  username: string;
  joined_at: string;
  signup_data: Record<string, unknown>;
  team_assignment?: 'reserve' | 'blue' | 'red';
}

interface VoiceChannel {
  value: string;
  label: string;
}

interface VoiceChannelAssignments {
  blueTeamVoiceChannel: string | null;
  redTeamVoiceChannel: string | null;
}

interface AssignPlayersModalProps {
  isOpen: boolean;
  onClose: () => void;
  matchId: string;
  matchName: string;
}

export function AssignPlayersModal({ isOpen, onClose, matchId, matchName }: AssignPlayersModalProps) {
  const [participants, setParticipants] = useState<MatchParticipant[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [voiceChannels, setVoiceChannels] = useState<VoiceChannel[]>([]);
  const [voiceChannelAssignments, setVoiceChannelAssignments] = useState<VoiceChannelAssignments>({
    blueTeamVoiceChannel: null,
    redTeamVoiceChannel: null
  });

  const fetchParticipants = useCallback(async () => {
    setLoading(true);
    try {
      const [participantsResponse, voiceChannelsResponse] = await Promise.all([
        fetch(`/api/matches/${matchId}/participants`),
        fetch(`/api/matches/${matchId}/voice-channels`)
      ]);
      
      if (participantsResponse.ok) {
        const data = await participantsResponse.json();
        setParticipants(data.participants.map((p: MatchParticipant) => ({
          ...p,
          team_assignment: p.team_assignment || 'reserve'
        })));
      }
      
      if (voiceChannelsResponse.ok) {
        const voiceData = await voiceChannelsResponse.json();
        setVoiceChannels(voiceData.voiceChannels);
        setVoiceChannelAssignments(voiceData.currentAssignments);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  }, [matchId]);

  useEffect(() => {
    if (isOpen && matchId) {
      fetchParticipants();
    }
  }, [isOpen, matchId, fetchParticipants]);

  const handleTeamChange = (participantId: string, newTeam: 'reserve' | 'blue' | 'red') => {
    setParticipants(prev => 
      prev.map(p => 
        p.id === participantId 
          ? { ...p, team_assignment: newTeam }
          : p
      )
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const teamAssignments = participants.map(p => ({
        participantId: p.id,
        team: p.team_assignment
      }));

      const response = await fetch(`/api/matches/${matchId}/assign-teams`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          teamAssignments,
          blueTeamVoiceChannel: voiceChannelAssignments.blueTeamVoiceChannel,
          redTeamVoiceChannel: voiceChannelAssignments.redTeamVoiceChannel
        }),
      });

      if (response.ok) {
        onClose();
      } else {
        console.error('Failed to save team assignments');
      }
    } catch (error) {
      console.error('Error saving team assignments:', error);
    } finally {
      setSaving(false);
    }
  };

  const getTeamParticipants = (team: 'reserve' | 'blue' | 'red') => {
    return participants.filter(p => p.team_assignment === team);
  };

  const renderParticipantCard = (participant: MatchParticipant, index: number) => (
    <Card key={participant.id} shadow="sm" padding="md" radius="md" withBorder mb="sm">
      <Group justify="space-between" align="center">
        <Group align="center">
          <Avatar size="sm" color="blue">
            {index + 1}
          </Avatar>
          <div>
            <Text fw={500} size="sm">{participant.username}</Text>
            <Text size="xs" c="dimmed">
              Joined: {new Date(participant.joined_at).toLocaleDateString('en-US')}
            </Text>
          </div>
        </Group>
        
        <Select
          size="xs"
          value={participant.team_assignment}
          onChange={(value) => handleTeamChange(participant.id, value as 'reserve' | 'blue' | 'red')}
          data={[
            { value: 'reserve', label: 'Reserve' },
            { value: 'blue', label: 'Blue Team' },
            { value: 'red', label: 'Red Team' }
          ]}
          w={120}
        />
      </Group>
      
      {participant.signup_data && Object.keys(participant.signup_data).length > 0 && (
        <Group mt="xs" gap="xs">
          {Object.entries(participant.signup_data).map(([key, value]) => (
            <Badge key={key} size="xs" variant="light">
              {key}: {String(value)}
            </Badge>
          ))}
        </Group>
      )}
    </Card>
  );

  const renderTeamSection = (team: 'reserve' | 'blue' | 'red', title: string, color: string) => {
    const teamParticipants = getTeamParticipants(team);
    
    return (
      <Card shadow="sm" padding="lg" radius="md" withBorder>
        <Group justify="space-between" mb="md">
          <Text size="lg" fw={600} c={color}>{title}</Text>
          <Badge size="lg" color={color} variant="light">
            {teamParticipants.length}
          </Badge>
        </Group>
        
        {/* Voice Channel Selector for Blue and Red teams */}
        {(team === 'blue' || team === 'red') && voiceChannels.length > 0 && (
          <Select
            label="Voice Channel"
            placeholder="Select voice channel"
            value={team === 'blue' ? voiceChannelAssignments.blueTeamVoiceChannel : voiceChannelAssignments.redTeamVoiceChannel}
            onChange={(value) => setVoiceChannelAssignments(prev => ({
              ...prev,
              [team === 'blue' ? 'blueTeamVoiceChannel' : 'redTeamVoiceChannel']: value
            }))}
            data={[
              { value: '', label: 'No voice channel' },
              ...voiceChannels
            ]}
            mb="md"
            clearable
          />
        )}
        
        <Stack gap="sm">
          {teamParticipants.length === 0 ? (
            <Text size="sm" c="dimmed" ta="center" py="xl">
              No players assigned
            </Text>
          ) : (
            teamParticipants.map((participant, index) => 
              renderParticipantCard(participant, index)
            )
          )}
        </Stack>
      </Card>
    );
  };

  return (
    <Modal
      opened={isOpen}
      onClose={onClose}
      title={`Assign - ${matchName}`}
      size="xxl"
      centered
      styles={{
        body: { maxHeight: '80vh', overflowY: 'auto' },
        content: { maxWidth: '95vw' }
      }}
    >
      <Stack gap="md">
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader size="lg" />
          </div>
        ) : (
          <>
            <Text size="sm" c="dimmed" mb="md">
              Use the dropdown to assign players to Reserve, Blue Team, or Red Team.
            </Text>
            
            {/* Desktop Layout */}
            <div className="hidden md:block">
              <Grid>
                <Grid.Col span={4}>
                  {renderTeamSection('reserve', 'Reserve', 'gray')}
                </Grid.Col>
                <Grid.Col span={4}>
                  {renderTeamSection('blue', 'Blue Team', 'blue')}
                </Grid.Col>
                <Grid.Col span={4}>
                  {renderTeamSection('red', 'Red Team', 'red')}
                </Grid.Col>
              </Grid>
            </div>
            
            {/* Mobile Layout */}
            <div className="block md:hidden">
              <Stack gap="lg">
                {renderTeamSection('reserve', 'Reserve', 'gray')}
                {renderTeamSection('blue', 'Blue Team', 'blue')}
                {renderTeamSection('red', 'Red Team', 'red')}
              </Stack>
            </div>
            
            <Divider />
            
            <Group justify="space-between">
              <Button
                variant="outline"
                onClick={onClose}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                loading={saving}
                disabled={participants.length === 0}
              >
                Save Team Assignments
              </Button>
            </Group>
          </>
        )}
      </Stack>
    </Modal>
  );
}