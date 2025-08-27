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
  Divider,
  ActionIcon
} from '@mantine/core';
import { IconMapRoute } from '@tabler/icons-react';

interface SignupField {
  id: string;
  label: string;
  type: 'text' | 'select' | 'number';
  required?: boolean;
  options?: string[];
  placeholder?: string;
}

interface SignupConfig {
  id: string;
  name: string;
  fields: SignupField[];
  created_at: string;
  updated_at: string;
}

interface MatchParticipant {
  id: string;
  user_id: string;
  username: string;
  joined_at: string;
  signup_data: Record<string, unknown>;
  team_assignment?: 'reserve' | 'blue' | 'red';
  receives_map_codes?: boolean;
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
  const [signupConfig, setSignupConfig] = useState<SignupConfig | null>(null);
  const [draggedParticipant, setDraggedParticipant] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [mapCodesSupported, setMapCodesSupported] = useState(false);

  // Check if screen is mobile size (same breakpoint as Navigation component)
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768); // md breakpoint from Mantine
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const fetchParticipants = useCallback(async () => {
    setLoading(true);
    try {
      const [participantsResponse, voiceChannelsResponse, matchResponse] = await Promise.all([
        fetch(`/api/matches/${matchId}/participants`),
        fetch(`/api/matches/${matchId}/voice-channels`),
        fetch(`/api/matches/${matchId}`)
      ]);
      
      if (participantsResponse.ok) {
        const data = await participantsResponse.json();
        setParticipants(data.participants.map((p: MatchParticipant) => ({
          ...p,
          team_assignment: p.team_assignment || 'reserve',
          receives_map_codes: p.receives_map_codes || false
        })));
        
        // Set signup config if available
        if (data.signupConfig) {
          setSignupConfig(data.signupConfig);
        }
      }
      
      if (voiceChannelsResponse.ok) {
        const voiceData = await voiceChannelsResponse.json();
        setVoiceChannels(voiceData.voiceChannels);
        setVoiceChannelAssignments(voiceData.currentAssignments);
      }

      if (matchResponse.ok) {
        const matchData = await matchResponse.json();
        console.log('Match data received:', matchData);
        console.log('Map codes supported:', matchData.map_codes_supported);
        setMapCodesSupported(matchData.map_codes_supported || false);
      } else {
        console.error('Failed to fetch match data:', matchResponse.status);
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

  const handleMapCodesToggle = (participantId: string) => {
    setParticipants(prev => 
      prev.map(p => 
        p.id === participantId 
          ? { ...p, receives_map_codes: !p.receives_map_codes }
          : p
      )
    );
  };

  const handleDragStart = (e: React.DragEvent, participantId: string) => {
    e.dataTransfer.setData('text/plain', participantId);
    e.dataTransfer.effectAllowed = 'move';
    setDraggedParticipant(participantId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetTeam: 'reserve' | 'blue' | 'red') => {
    e.preventDefault();
    const participantId = e.dataTransfer.getData('text/plain');
    if (participantId) {
      handleTeamChange(participantId, targetTeam);
    }
    setDraggedParticipant(null);
  };

  const handleDragEnd = () => {
    setDraggedParticipant(null);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const teamAssignments = participants.map(p => ({
        participantId: p.id,
        team: p.team_assignment,
        receives_map_codes: p.receives_map_codes || false
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

  const getPlayerCardStyles = (team: 'reserve' | 'blue' | 'red') => {
    switch(team) {
      case 'blue':
        return { 
          backgroundColor: 'var(--mantine-color-blue-2)',
          borderColor: 'var(--mantine-color-blue-4)'
        };
      case 'red':
        return { 
          backgroundColor: 'var(--mantine-color-red-2)',
          borderColor: 'var(--mantine-color-red-4)'
        };
      case 'reserve':
        return { 
          backgroundColor: '#FFD54F',
          borderColor: '#FFC107'
        };
      default:
        return {};
    }
  };

  const getBadgeColor = (team: 'reserve' | 'blue' | 'red') => {
    switch(team) {
      case 'blue': return 'orange';    // Contrasts with blue
      case 'red': return 'cyan';       // Contrasts with red  
      case 'reserve': return 'violet'; // Primary site color
      default: return 'dark';
    }
  };

  const renderParticipantCard = (participant: MatchParticipant, index: number) => {
    const isDragging = draggedParticipant === participant.id;
    const isDragDisabled = isMobile;
    
    return (
      <Card 
        key={participant.id} 
        shadow="md" 
        padding="md" 
        radius="md" 
        withBorder 
        mb="sm"
        style={{
          ...(isDragging 
            ? { backgroundColor: 'var(--mantine-color-gray-2)', borderColor: 'var(--mantine-color-gray-4)', opacity: 0.6 }
            : getPlayerCardStyles(participant.team_assignment)
          ),
          cursor: isDragDisabled ? 'default' : 'grab'
        }}
        draggable={!isDragDisabled}
        onDragStart={isDragDisabled ? undefined : (e) => handleDragStart(e, participant.id)}
        onDragEnd={isDragDisabled ? undefined : handleDragEnd}
      >
      <Group justify="space-between" align="center" mb="xs">
        <Group align="center">
          <Avatar size="sm" color={getBadgeColor(participant.team_assignment)} variant="filled">
            {index + 1}
          </Avatar>
          <div>
            <Text fw={500} size="sm" c="dark">{participant.username}</Text>
            <Text size="xs" c="gray.7">
              Joined: {new Date(participant.joined_at).toLocaleDateString('en-US')}
            </Text>
          </div>
        </Group>
        {mapCodesSupported && (
          <ActionIcon
            size="xl"
            variant="subtle"
            onClick={() => handleMapCodesToggle(participant.id)}
            title={participant.receives_map_codes ? "Will receive map codes" : "Click to receive map codes"}
            style={{
              border: 'none',
              padding: 0,
              minWidth: 'unset',
              minHeight: 'unset',
              width: 'auto',
              height: 'auto',
              backgroundColor: 'transparent',
              color: participant.receives_map_codes 
                ? `var(--mantine-color-${getBadgeColor(participant.team_assignment)}-6)`
                : 'var(--mantine-color-gray-5)'
            }}
            styles={{
              root: {
                '&:hover': {
                  backgroundColor: 'transparent'
                }
              }
            }}
          >
            <IconMapRoute size={30} />
          </ActionIcon>
        )}
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
        mb="xs"
        styles={{
          input: {
            backgroundColor: 'light-dark(rgba(255,255,255,0.8), rgba(37, 38, 43, 0.8))',
            border: '1px solid var(--mantine-color-gray-5)',
            backdropFilter: 'blur(2px)',
            color: 'light-dark(var(--mantine-color-black), var(--mantine-color-white))'
          }
        }}
      />
      
      {participant.signup_data && Object.keys(participant.signup_data).length > 0 && (
        <Group mt="xs" gap="xs">
          {Object.entries(participant.signup_data).map(([key, value]) => {
            const field = signupConfig?.fields.find(f => f.id === key);
            const displayLabel = field?.label || key.replace(/([A-Z])/g, ' $1').trim();
            
            return (
              <Badge key={key} size="xs" variant="filled" color={getBadgeColor(participant.team_assignment)}>
                {displayLabel}: {String(value)}
              </Badge>
            );
          })}
        </Group>
      )}
    </Card>
    );
  };

  const renderTeamSection = (team: 'reserve' | 'blue' | 'red', title: string, color: string) => {
    const teamParticipants = getTeamParticipants(team);
    
    return (
      <Card 
        shadow="xs" 
        padding="lg" 
        radius="md" 
        withBorder
        onDragOver={isMobile ? undefined : handleDragOver}
        onDrop={isMobile ? undefined : (e) => handleDrop(e, team)}
        style={{ minHeight: '200px' }}
      >
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