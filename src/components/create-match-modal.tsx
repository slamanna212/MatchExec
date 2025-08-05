'use client'

import { useState, useEffect } from 'react';
import { Modal, Button, Text, Stack, Card, Avatar, Group, Grid, Badge, TextInput, Textarea, Select, NumberInput, Checkbox } from '@mantine/core';
import { Match, GameMap } from '../../shared/types';

interface GameWithIcon {
  id: string;
  name: string;
  genre: string;
  developer: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
  iconUrl: string;
  coverUrl: string;
  mapCount: number;
  modeCount: number;
}

interface CreateMatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMatchCreated: (match: Match) => void;
  games: GameWithIcon[];
}

interface MatchFormData {
  gameId: string;
  name: string;
  description: string;
  date: string;
  time: string;
  livestreamLink: string;
  rules: 'casual' | 'competitive';
  rounds: number;
  maps: string[];
}

interface GameMapWithMode extends GameMap {
  modeName?: string;
  modeDescription?: string;
}

export function CreateMatchModal({
  isOpen,
  onClose,
  onMatchCreated,
  games
}: CreateMatchModalProps) {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState<Partial<MatchFormData>>({
    rules: 'casual',
    rounds: 1
  });
  const [availableMaps, setAvailableMaps] = useState<GameMapWithMode[]>([]);
  const [loadingMaps, setLoadingMaps] = useState(false);

  const handleClose = () => {
    setStep(1);
    setFormData({ rules: 'casual', rounds: 1 });
    setAvailableMaps([]);
    onClose();
  };

  const handleGameSelect = (gameId: string) => {
    setFormData(prev => ({ ...prev, gameId }));
    setStep(2);
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const handleEventInfoNext = async () => {
    if (formData.name && formData.date && formData.time && formData.gameId) {
      setLoadingMaps(true);
      try {
        const response = await fetch(`/api/games/${formData.gameId}/maps`);
        if (response.ok) {
          const maps = await response.json();
          setAvailableMaps(maps);
        }
      } catch (error) {
        console.error('Error fetching maps:', error);
      } finally {
        setLoadingMaps(false);
      }
      setStep(3);
    }
  };

  const updateFormData = (field: keyof MatchFormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleMapToggle = (mapId: string) => {
    const currentMaps = formData.maps || [];
    const isSelected = currentMaps.includes(mapId);
    
    if (isSelected) {
      updateFormData('maps', currentMaps.filter(id => id !== mapId));
    } else {
      updateFormData('maps', [...currentMaps, mapId]);
    }
  };

  const canCreateMatch = () => {
    return formData.rounds && 
           formData.maps && 
           formData.maps.length >= (formData.rounds || 0);
  };

  const convertToUTC = (date: string, time: string): Date => {
    // Combine date and time strings into a local Date object
    const localDateTime = new Date(`${date}T${time}`);
    // The Date object automatically handles timezone conversion when sent to server
    return localDateTime;
  };

  const handleCreateMatch = async () => {
    if (!formData.name || !formData.date || !formData.time || !formData.gameId) {
      return;
    }

    try {
      const utcDateTime = convertToUTC(formData.date, formData.time);
      
      const matchData = {
        name: formData.name,
        description: formData.description || '',
        gameId: formData.gameId,
        startDate: utcDateTime.toISOString(), // Convert to ISO string in UTC
        livestreamLink: formData.livestreamLink || '',
        rules: formData.rules,
        rounds: formData.rounds || 1,
        maps: formData.maps || []
      };

      // TODO: Implement API call to create match
      console.log('Creating match with data:', matchData);
      
      // For now, just close the modal
      handleClose();
    } catch (error) {
      console.error('Error creating match:', error);
    }
  };

  const getModalTitle = () => {
    switch (step) {
      case 1: return 'Create Match - Select Game';
      case 2: return 'Create Match - Event Info';
      case 3: return 'Create Match - Maps & Rounds';
      default: return 'Create Match';
    }
  };

  return (
    <Modal 
      opened={isOpen} 
      onClose={handleClose} 
      title={getModalTitle()}
      size="lg"
    >
      {step === 1 && (
        <Stack>
          <Text mb="md">Select the game for your match:</Text>
          <Grid>
            {games.map((game) => (
              <Grid.Col key={game.id} span={{ base: 12, sm: 6 }}>
                <Card
                  shadow="sm"
                  padding="md"
                  radius="md"
                  withBorder
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => handleGameSelect(game.id)}
                >
                  <Group>
                    <Avatar
                      src={game.iconUrl}
                      alt={game.name}
                      size="lg"
                    />
                    <Stack gap={4} style={{ flex: 1 }}>
                      <Text fw={600}>{game.name}</Text>
                      <Text size="sm" c="dimmed">{game.genre}</Text>
                      <Badge size="xs" variant="light">
                        {game.minPlayers}-{game.maxPlayers} players
                      </Badge>
                    </Stack>
                  </Group>
                </Card>
              </Grid.Col>
            ))}
          </Grid>
        </Stack>
      )}

      {step === 2 && (
        <Stack>
          <Text mb="md">Enter event information:</Text>
          
          <TextInput
            label="Event Name"
            placeholder="Enter match name"
            required
            value={formData.name || ''}
            onChange={(e) => updateFormData('name', e.target.value)}
          />
          
          <Textarea
            label="Description"
            placeholder="Enter match description (optional)"
            value={formData.description || ''}
            onChange={(e) => updateFormData('description', e.target.value)}
            rows={3}
          />
          
          <Group grow>
            <TextInput
              label="Date"
              type="date"
              required
              value={formData.date || ''}
              onChange={(e) => updateFormData('date', e.target.value)}
              min={new Date().toISOString().split('T')[0]}
            />
            <TextInput
              label="Time (24-hour format)"
              type="time"
              required
              value={formData.time || ''}
              onChange={(e) => updateFormData('time', e.target.value)}
              step="60"
            />
          </Group>
          
          <TextInput
            label="Livestream Link"
            placeholder="https://twitch.tv/... (optional)"
            value={formData.livestreamLink || ''}
            onChange={(e) => updateFormData('livestreamLink', e.target.value)}
          />
          
          <Select
            label="Rules Type"
            placeholder="Select rules type"
            required
            value={formData.rules}
            onChange={(value) => updateFormData('rules', value)}
            data={[
              { value: 'casual', label: 'Casual' },
              { value: 'competitive', label: 'Competitive' }
            ]}
          />
          
          <Group justify="space-between" mt="md">
            <Button variant="outline" onClick={handleBack}>
              Back
            </Button>
            <Button 
              onClick={handleEventInfoNext}
              disabled={!formData.name || !formData.date || !formData.time}
            >
              Next
            </Button>
          </Group>
        </Stack>
      )}

      {step === 3 && (
        <Stack>
          <Text mb="md">Maps & Rounds Configuration:</Text>
          <Text size="sm" c="dimmed">This step will be implemented with full maps picker functionality.</Text>
          
          <Group justify="space-between" mt="md">
            <Button variant="outline" onClick={handleBack}>
              Back
            </Button>
            <Button onClick={handleCreateMatch}>
              Create Match
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}