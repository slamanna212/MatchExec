'use client'

import { useState } from 'react';
import { Modal, Button, Text, Stack, Card, Avatar, Group, Grid, Badge, TextInput, Textarea, Select, Checkbox, ActionIcon, Image, FileButton, Box } from '@mantine/core';
import { IconPlus, IconX, IconUpload, IconTrash } from '@tabler/icons-react';
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
  eventImageUrl?: string;
}

interface GameMode {
  id: string;
  name: string;
  description?: string;
}

interface GameMapWithMode extends GameMap {
  modeName?: string;
  modeDescription?: string;
}

interface SelectedMapCard {
  id: string;
  name: string;
  modeId: string;
  modeName: string;
  imageUrl?: string;
}

export function CreateMatchModal({
  isOpen,
  onClose,
  onMatchCreated,
  games
}: CreateMatchModalProps) {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState<Partial<MatchFormData>>({
    rules: 'casual'
  });
  const [loadingMaps, setLoadingMaps] = useState(false);
  const [availableModes, setAvailableModes] = useState<GameMode[]>([]);
  const [selectedMaps, setSelectedMaps] = useState<SelectedMapCard[]>([]);
  const [showMapSelector, setShowMapSelector] = useState(false);
  const [selectedMode, setSelectedMode] = useState<string>('');
  const [mapsForMode, setMapsForMode] = useState<GameMapWithMode[]>([]);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [startSignups, setStartSignups] = useState(true);

  const handleClose = () => {
    setStep(1);
    setFormData({ rules: 'casual' });
    setAvailableMaps([]);
    setAvailableModes([]);
    setSelectedMaps([]);
    setShowMapSelector(false);
    setSelectedMode('');
    setMapsForMode([]);
    setUploadingImage(false);
    setImagePreview(null);
    setStartSignups(true);
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
        const modesResponse = await fetch(`/api/games/${formData.gameId}/modes`);
        if (modesResponse.ok) {
          const modes = await modesResponse.json();
          setAvailableModes(modes);
        }
      } catch (error) {
        console.error('Error fetching modes:', error);
      } finally {
        setLoadingMaps(false);
      }
      setStep(3);
    }
  };

  const updateFormData = (field: keyof MatchFormData, value: unknown) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleImageUpload = async (file: File | null) => {
    if (!file) return;

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      alert('Invalid file type. Only JPEG, PNG, WebP, and GIF are allowed.');
      return;
    }

    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('File too large. Maximum size is 5MB.');
      return;
    }

    setUploadingImage(true);
    try {
      const formDataUpload = new FormData();
      formDataUpload.append('image', file);

      const response = await fetch('/api/upload/event-image', {
        method: 'POST',
        body: formDataUpload,
      });

      if (response.ok) {
        const result = await response.json();
        updateFormData('eventImageUrl', result.imageUrl);
        setImagePreview(result.imageUrl);
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to upload image');
      }
    } catch (error) {
      console.error('Error uploading image:', error);
      alert('Failed to upload image');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleRemoveImage = async () => {
    if (formData.eventImageUrl) {
      try {
        await fetch(`/api/upload/event-image?imageUrl=${encodeURIComponent(formData.eventImageUrl)}`, {
          method: 'DELETE',
        });
      } catch (error) {
        console.error('Error deleting image:', error);
      }
    }
    updateFormData('eventImageUrl', undefined);
    setImagePreview(null);
  };

  const handleModeSelect = async (modeId: string) => {
    setSelectedMode(modeId);
    setLoadingMaps(true);
    try {
      const response = await fetch(`/api/games/${formData.gameId}/modes/${modeId}/maps`);
      if (response.ok) {
        const maps = await response.json();
        setMapsForMode(maps);
      }
    } catch (error) {
      console.error('Error fetching maps for mode:', error);
    } finally {
      setLoadingMaps(false);
    }
  };

  const handleMapSelect = (map: GameMapWithMode) => {
    const mode = availableModes.find(m => m.id === selectedMode);
    if (!mode) return;

    const selectedMap: SelectedMapCard = {
      id: map.id,
      name: map.name,
      modeId: selectedMode,
      modeName: mode.name,
      imageUrl: map.imageUrl
    };

    const newSelectedMaps = [...selectedMaps, selectedMap];
    const newMapIds = [...(formData.maps || []), map.id];
    
    setSelectedMaps(newSelectedMaps);
    updateFormData('maps', newMapIds);
    updateFormData('rounds', newMapIds.length); // Auto-calculate rounds based on map count
    setShowMapSelector(false);
    setSelectedMode('');
    setMapsForMode([]);
  };

  const handleRemoveMap = (mapId: string) => {
    const newSelectedMaps = selectedMaps.filter(map => map.id !== mapId);
    const newMapIds = (formData.maps || []).filter(id => id !== mapId);
    
    setSelectedMaps(newSelectedMaps);
    updateFormData('maps', newMapIds);
    updateFormData('rounds', newMapIds.length); // Auto-calculate rounds based on map count
  };

  const handleAddMapClick = () => {
    setShowMapSelector(true);
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
        rounds: (formData.maps || []).length || 1, // Use map count as rounds
        maps: formData.maps || [],
        eventImageUrl: formData.eventImageUrl || null
      };

      const response = await fetch('/api/matches', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(matchData),
      });

      if (response.ok) {
        const newMatch = await response.json();
        
        // If "Start Signups" is checked, automatically transition to gather stage
        if (startSignups) {
          try {
            const transitionResponse = await fetch(`/api/matches/${newMatch.id}/transition`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ newStatus: 'gather' }),
            });

            if (transitionResponse.ok) {
              const updatedMatch = await transitionResponse.json();
              onMatchCreated(updatedMatch);
              console.log(`✅ Match created and moved to gather stage - Discord announcement will be posted`);
            } else {
              // Still report the created match, even if transition failed
              onMatchCreated(newMatch);
              console.warn('Match created but failed to start signups automatically');
            }
          } catch (transitionError) {
            console.error('Error transitioning match to gather stage:', transitionError);
            onMatchCreated(newMatch);
          }
        } else {
          onMatchCreated(newMatch);
        }
        
        handleClose();
      } else {
        const errorData = await response.json();
        console.error('Failed to create match:', errorData.error);
        // TODO: Show error to user
      }
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
              label="Time"
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

          <Box>
            <Text size="sm" fw={500} mb="xs">Event Image (Optional)</Text>
            {imagePreview ? (
              <Card withBorder padding="md">
                <Group justify="space-between" mb="md">
                  <Text size="sm" c="dimmed">Current Image:</Text>
                  <ActionIcon
                    color="red"
                    variant="light"
                    onClick={handleRemoveImage}
                    disabled={uploadingImage}
                  >
                    <IconTrash size={16} />
                  </ActionIcon>
                </Group>
                <Image
                  src={imagePreview}
                  alt="Event preview"
                  height={200}
                  radius="md"
                  fit="cover"
                />
              </Card>
            ) : (
              <FileButton
                onChange={handleImageUpload}
                accept="image/png,image/jpeg,image/webp,image/gif"
                disabled={uploadingImage}
              >
                {(props) => (
                  <Card
                    {...props}
                    withBorder
                    padding="md"
                    className="cursor-pointer hover:shadow-md transition-shadow"
                    style={{
                      borderStyle: 'dashed',
                      borderColor: 'var(--mantine-color-default-border)',
                      backgroundColor: 'var(--mantine-color-body)'
                    }}
                  >
                    <Stack align="center" justify="center" style={{ minHeight: 100 }}>
                      <ActionIcon size="xl" variant="light" disabled={uploadingImage}>
                        <IconUpload />
                      </ActionIcon>
                      <Text size="sm" c="dimmed" ta="center">
                        {uploadingImage ? 'Uploading...' : 'Click to upload event image'}
                      </Text>
                      <Text size="xs" c="dimmed" ta="center">
                        PNG, JPEG, WebP, GIF up to 5MB
                      </Text>
                    </Stack>
                  </Card>
                )}
              </FileButton>
            )}
          </Box>
          
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
          <Text mb="md">Maps Configuration:</Text>
          
          {selectedMaps.length > 0 && (
            <Text size="sm" c="dimmed" mb="md">
              <strong>Rounds:</strong> {selectedMaps.length} (based on selected maps)
            </Text>
          )}

          <Text size="sm" fw={500} mt="md">Selected Maps:</Text>
          
          <Grid>
            {selectedMaps.map((map) => (
              <Grid.Col key={map.id} span={{ base: 12, sm: 6, md: 4 }}>
                <Card shadow="sm" padding="md" radius="md" withBorder>
                  <Card.Section>
                    <Image
                      src={map.imageUrl}
                      alt={map.name}
                      height={120}
                      fallbackSrc="data:image/svg+xml,%3csvg width='100' height='100' xmlns='http://www.w3.org/2000/svg'%3e%3crect width='100' height='100' fill='%23f1f3f4'/%3e%3c/svg%3e"
                    />
                  </Card.Section>
                  
                  <Group justify="space-between" mt="xs">
                    <Stack gap={2} style={{ flex: 1 }}>
                      <Text fw={500} size="sm">{map.name}</Text>
                      <Badge size="xs" variant="light">{map.modeName}</Badge>
                    </Stack>
                    <ActionIcon
                      color="red"
                      variant="light"
                      onClick={() => handleRemoveMap(map.id)}
                    >
                      <IconX size={16} />
                    </ActionIcon>
                  </Group>
                </Card>
              </Grid.Col>
            ))}
            
            {!showMapSelector && (
              <Grid.Col span={{ base: 12, sm: 6, md: 4 }}>
                <Card
                  shadow="sm"
                  padding="md"
                  radius="md"
                  withBorder
                  className="cursor-pointer hover:shadow-md transition-shadow border-dashed"
                  onClick={handleAddMapClick}
                  style={{ 
                    borderStyle: 'dashed',
                    borderColor: 'var(--mantine-color-default-border)',
                    backgroundColor: 'var(--mantine-color-body)'
                  }}
                >
                  <Stack align="center" justify="center" style={{ minHeight: 120 }}>
                    <ActionIcon size="xl" variant="light">
                      <IconPlus />
                    </ActionIcon>
                    <Text size="sm" c="dimmed">Add Map</Text>
                  </Stack>
                </Card>
              </Grid.Col>
            )}
          </Grid>

          {showMapSelector && (
            <Card withBorder padding="md" mt="md">
              <Text fw={500} mb="md">Select a Map</Text>
              
              <Select
                label="Game Mode"
                placeholder="Choose a game mode"
                data={availableModes.map(mode => ({ value: mode.id, label: mode.name }))}
                value={selectedMode}
                onChange={(value) => value && handleModeSelect(value)}
                mb="md"
              />

              {selectedMode && (
                <>
                  {loadingMaps ? (
                    <Text size="sm" c="dimmed">Loading maps...</Text>
                  ) : (
                    <Grid>
                      {mapsForMode.map((map) => (
                        <Grid.Col key={map.id} span={{ base: 12, sm: 6, md: 4 }}>
                          <Card
                            shadow="sm"
                            padding="md"
                            radius="md"
                            withBorder
                            className="cursor-pointer hover:shadow-md transition-shadow"
                            onClick={() => handleMapSelect(map)}
                          >
                            <Card.Section>
                              <Image
                                src={map.imageUrl}
                                alt={map.name}
                                height={80}
                                fallbackSrc="data:image/svg+xml,%3csvg width='100' height='100' xmlns='http://www.w3.org/2000/svg'%3e%3crect width='100' height='100' fill='%23f1f3f4'/%3e%3c/svg%3e"
                              />
                            </Card.Section>
                            <Text fw={500} size="sm" mt="xs">{map.name}</Text>
                          </Card>
                        </Grid.Col>
                      ))}
                    </Grid>
                  )}
                </>
              )}

              <Group justify="end" mt="md">
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setShowMapSelector(false);
                    setSelectedMode('');
                    setMapsForMode([]);
                  }}
                >
                  Cancel
                </Button>
              </Group>
            </Card>
          )}
          
          <Group justify="space-between" mt="md">
            <Button variant="outline" onClick={handleBack}>
              Back
            </Button>
            <Group align="center" gap="md">
              <Checkbox
                label="Start Signups"
                checked={startSignups}
                onChange={(event) => setStartSignups(event.currentTarget.checked)}
              />
              <Button 
                onClick={handleCreateMatch}
                disabled={!selectedMaps.length}
              >
                Create Match
              </Button>
            </Group>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}