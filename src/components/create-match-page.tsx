'use client'

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Text, Stack, Card, Avatar, Group, Grid, Badge, TextInput, Textarea, Select, Checkbox, ActionIcon, Image, FileButton, Box, Container, Title, Breadcrumbs, Anchor, Progress, NumberInput } from '@mantine/core';
import { IconPlus, IconX, IconUpload, IconTrash, IconArrowLeft } from '@tabler/icons-react';
import { GameMap } from '@/shared/types';

interface GameWithIcon {
  id: string;
  name: string;
  genre: string;
  developer: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
  supportsAllModes?: boolean;
  iconUrl: string;
  coverUrl: string;
  mapCount: number;
  modeCount: number;
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
  playerNotifications?: boolean;
  announcementVoiceChannel?: string;
  announcements?: AnnouncementTime[];
}

interface AnnouncementTime {
  id: string;
  value: number;
  unit: 'minutes' | 'hours' | 'days';
}

interface GameMode {
  id: string;
  name: string;
  description?: string;
}

interface GameMapWithMode extends GameMap {
  modeName?: string;
  modeDescription?: string;
  imageUrl?: string; // API returns camelCase version
}

interface SelectedMapCard {
  id: string;
  name: string;
  modeId: string;
  modeName: string;
  imageUrl?: string;
}

export function CreateMatchPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentStep = parseInt(searchParams.get('step') || '1');
  
  const [games, setGames] = useState<GameWithIcon[]>([]);
  const [formData, setFormData] = useState<Partial<MatchFormData>>({
    rules: 'casual',
    playerNotifications: true,
    announcements: []
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
  const [currentGameSupportsAllModes, setCurrentGameSupportsAllModes] = useState(false);
  const [allMaps, setAllMaps] = useState<GameMapWithMode[]>([]);

  // Load games on mount and restore form data from session storage
  useEffect(() => {
    const fetchGames = async () => {
      try {
        const response = await fetch('/api/games');
        if (response.ok) {
          const gamesData = await response.json();
          setGames(gamesData);
        }
      } catch (error) {
        console.error('Error fetching games:', error);
      }
    };


    // Restore form data from session storage
    const savedFormData = sessionStorage.getItem('createMatchFormData');
    if (savedFormData) {
      try {
        const parsedData = JSON.parse(savedFormData);
        setFormData(parsedData);
        
        // Restore image preview if it exists
        if (parsedData.eventImageUrl) {
          setImagePreview(parsedData.eventImageUrl);
        }
      } catch (error) {
        console.error('Error parsing saved form data:', error);
      }
    }

    // Restore selected maps from session storage
    const savedMaps = sessionStorage.getItem('createMatchSelectedMaps');
    if (savedMaps) {
      try {
        const parsedMaps = JSON.parse(savedMaps);
        setSelectedMaps(parsedMaps);
      } catch (error) {
        console.error('Error parsing saved maps:', error);
      }
    }

    fetchGames();
  }, []);

  // Save form data to session storage whenever it changes
  useEffect(() => {
    sessionStorage.setItem('createMatchFormData', JSON.stringify(formData));
  }, [formData]);

  // Save selected maps to session storage whenever they change
  useEffect(() => {
    sessionStorage.setItem('createMatchSelectedMaps', JSON.stringify(selectedMaps));
  }, [selectedMaps]);

  // Clear session storage when match is successfully created
  const clearFormData = () => {
    sessionStorage.removeItem('createMatchFormData');
    sessionStorage.removeItem('createMatchSelectedMaps');
  };

  const getStepTitle = () => {
    switch (currentStep) {
      case 1: return 'Select Game';
      case 2: return 'Event Information';
      case 3: return 'Announcements';
      case 4: return 'Maps & Configuration';
      default: return 'Create Match';
    }
  };

  const getBreadcrumbs = () => [
    { title: 'Matches', href: '/' },
    { title: 'Create Match', href: '/matches/create' },
    { title: getStepTitle(), href: '#' }
  ];

  const navigateToStep = (step: number) => {
    const params = new URLSearchParams();
    params.set('step', step.toString());
    router.push(`/matches/create?${params.toString()}`);
  };

  const handleGameSelect = (gameId: string) => {
    setFormData(prev => ({ ...prev, gameId }));
    navigateToStep(2);
  };

  const handleBack = () => {
    if (currentStep > 1) {
      navigateToStep(currentStep - 1);
    } else {
      // Clear form data when going back to matches from step 1
      clearFormData();
      router.push('/');
    }
  };

  const handleEventInfoNext = async () => {
    if (formData.name && formData.date && formData.time && formData.gameId) {
      navigateToStep(3);
    }
  };

  const handleAnnouncementsNext = async () => {
    setLoadingMaps(true);
    try {
      // Get the selected game to check if it supports all modes
      const selectedGame = games.find(game => game.id === formData.gameId);
      const supportsAllModes = selectedGame?.supportsAllModes || false;
      setCurrentGameSupportsAllModes(supportsAllModes);

      // Fetch modes
      const modesResponse = await fetch(`/api/games/${formData.gameId}/modes`);
      if (modesResponse.ok) {
        const modes = await modesResponse.json();
        setAvailableModes(modes);
      }

      // If game supports all modes, fetch all maps at once
      if (supportsAllModes) {
        const mapsResponse = await fetch(`/api/games/${formData.gameId}/maps`);
        if (mapsResponse.ok) {
          const maps = await mapsResponse.json();
          // For flexible games, deduplicate maps by base name
          const uniqueMaps: GameMapWithMode[] = [];
          const seenMapNames = new Set<string>();
          
          for (const map of maps) {
            if (!seenMapNames.has(map.name)) {
              uniqueMaps.push(map);
              seenMapNames.add(map.name);
            }
          }
          setAllMaps(uniqueMaps);
        }
      }
    } catch (error) {
      console.error('Error fetching game data:', error);
    } finally {
      setLoadingMaps(false);
    }
    navigateToStep(4);
  };

  const updateFormData = (field: keyof MatchFormData, value: unknown) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const sortAnnouncements = (announcements: AnnouncementTime[]) => {
    return [...announcements].sort((a, b) => {
      // Convert to minutes for comparison
      const getMinutes = (announcement: AnnouncementTime) => {
        switch (announcement.unit) {
          case 'minutes': return announcement.value;
          case 'hours': return announcement.value * 60;
          case 'days': return announcement.value * 24 * 60;
          default: return 0;
        }
      };
      
      return getMinutes(a) - getMinutes(b);
    });
  };

  const addAnnouncement = () => {
    const newAnnouncement: AnnouncementTime = {
      id: Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15),
      value: 1,
      unit: 'hours'
    };
    const currentAnnouncements = formData.announcements || [];
    const updatedAnnouncements = sortAnnouncements([...currentAnnouncements, newAnnouncement]);
    updateFormData('announcements', updatedAnnouncements);
  };

  const updateAnnouncement = (id: string, field: keyof AnnouncementTime, value: unknown) => {
    const currentAnnouncements = formData.announcements || [];
    const updatedAnnouncements = currentAnnouncements.map(announcement => 
      announcement.id === id ? { ...announcement, [field]: value } : announcement
    );
    const sortedAnnouncements = sortAnnouncements(updatedAnnouncements);
    updateFormData('announcements', sortedAnnouncements);
  };

  const removeAnnouncement = (id: string) => {
    const currentAnnouncements = formData.announcements || [];
    const updatedAnnouncements = currentAnnouncements.filter(announcement => announcement.id !== id);
    updateFormData('announcements', updatedAnnouncements);
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
    updateFormData('rounds', newMapIds.length);
    setShowMapSelector(false);
    setSelectedMode('');
    setMapsForMode([]);
  };

  const handleFlexibleMapSelect = (map: GameMapWithMode, modeId: string) => {
    const mode = availableModes.find(m => m.id === modeId);
    if (!mode) return;

    // Extract base map ID (remove mode suffix if it exists)
    const baseMapId = map.id.includes('-') ? map.id.split('-')[0] : map.id;
    const combinedId = `${baseMapId}-${modeId}`;

    const selectedMap: SelectedMapCard = {
      id: combinedId,
      name: map.name,
      modeId: modeId,
      modeName: mode.name,
      imageUrl: map.imageUrl
    };

    const newSelectedMaps = [...selectedMaps, selectedMap];
    const newMapIds = [...(formData.maps || []), combinedId];
    
    setSelectedMaps(newSelectedMaps);
    updateFormData('maps', newMapIds);
    updateFormData('rounds', newMapIds.length);
    setShowMapSelector(false);
  };

  const handleRemoveMap = (mapId: string) => {
    const newSelectedMaps = selectedMaps.filter(map => map.id !== mapId);
    const newMapIds = (formData.maps || []).filter(id => id !== mapId);
    
    setSelectedMaps(newSelectedMaps);
    updateFormData('maps', newMapIds);
    updateFormData('rounds', newMapIds.length);
  };

  const handleAddMapClick = () => {
    setShowMapSelector(true);
  };

  const convertToUTC = (date: string, time: string): Date => {
    const localDateTime = new Date(`${date}T${time}`);
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
        startDate: utcDateTime.toISOString(),
        livestreamLink: formData.livestreamLink || '',
        rules: formData.rules,
        rounds: (formData.maps || []).length || 1,
        maps: formData.maps || [],
        eventImageUrl: formData.eventImageUrl || null,
        playerNotifications: formData.playerNotifications ?? true,
        announcementVoiceChannel: formData.announcementVoiceChannel || null,
        announcements: formData.announcements || []
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
              console.log(`✅ Match created and moved to gather stage - Discord announcement will be posted`);
            } else {
              console.warn('Match created but failed to start signups automatically');
            }
          } catch (transitionError) {
            console.error('Error transitioning match to gather stage:', transitionError);
          }
        }
        
        clearFormData();
        router.push('/');
      } else {
        const errorData = await response.json();
        console.error('Failed to create match:', errorData.error);
      }
    } catch (error) {
      console.error('Error creating match:', error);
    }
  };

  const progressValue = (currentStep / 4) * 100;

  return (
    <Container size="md" py={{ base: "md", sm: "xl" }} px={{ base: "md", sm: "xl" }}>
      <Stack gap="md">
        {/* Header */}
        <Group justify="space-between" align="center">
          <Group align="center" gap="sm">
            <ActionIcon 
              variant="subtle" 
              size="md"
              onClick={handleBack}
              aria-label="Go back"
            >
              <IconArrowLeft />
            </ActionIcon>
            <Title order={2}>Create Match</Title>
          </Group>
        </Group>

        {/* Breadcrumbs */}
        <Breadcrumbs>
          {getBreadcrumbs().map((item, index) => (
            <Anchor key={index} href={item.href} size="sm">
              {item.title}
            </Anchor>
          ))}
        </Breadcrumbs>

        {/* Progress Indicator */}
        <Box>
          <Group justify="space-between" mb="xs">
            <Text size="sm" fw={500}>{getStepTitle()}</Text>
            <Text size="xs" c="dimmed">Step {currentStep} of 4</Text>
          </Group>
          <Progress value={progressValue} size="xs" />
        </Box>

        {/* Step Content */}
        {currentStep === 1 && (
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

        {currentStep === 2 && (
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

            <Checkbox
              label="Player Notifications"
              description="Send Discord DMs to registered players before match starts"
              checked={formData.playerNotifications ?? true}
              onChange={(event) => updateFormData('playerNotifications', event.currentTarget.checked)}
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
            
            <Group justify="space-between" mt="md" gap="xs">
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

        {currentStep === 3 && (
          <Stack>
            <Text mb="md">Configure event announcements:</Text>
            
            <Text size="sm" c="dimmed" mb="md">
              Set up notifications to announce your event before it starts. You can create multiple announcements with different timing.
            </Text>

            {formData.announcements && formData.announcements.length > 0 && (
              <Stack gap="sm">
                <Text size="sm" fw={500}>Scheduled Announcements:</Text>
                {formData.announcements.map((announcement) => (
                  <Card key={announcement.id} withBorder padding="sm">
                    <Group justify="space-between" align="center">
                      <Group align="center" gap="xs">
                        <NumberInput
                          size="sm"
                          placeholder="Time"
                          value={announcement.value}
                          onChange={(value) => updateAnnouncement(announcement.id, 'value', Number(value) || 1)}
                          min={1}
                          max={999}
                          style={{ width: 80 }}
                        />
                        <Select
                          size="sm"
                          data={[
                            { value: 'minutes', label: 'minutes' },
                            { value: 'hours', label: 'hours' },
                            { value: 'days', label: 'days' }
                          ]}
                          value={announcement.unit}
                          onChange={(value) => updateAnnouncement(announcement.id, 'unit', value)}
                          style={{ width: 100 }}
                        />
                        <Text size="sm" c="dimmed">before event</Text>
                      </Group>
                      <ActionIcon
                        color="red"
                        variant="light"
                        onClick={() => removeAnnouncement(announcement.id)}
                      >
                        <IconX size={16} />
                      </ActionIcon>
                    </Group>
                  </Card>
                ))}
              </Stack>
            )}

            <Card
              withBorder
              padding="md"
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={addAnnouncement}
              style={{ 
                borderStyle: 'dashed',
                borderColor: 'var(--mantine-color-default-border)',
                backgroundColor: 'var(--mantine-color-body)'
              }}
            >
              <Stack align="center" justify="center" style={{ minHeight: 60 }}>
                <ActionIcon size="lg" variant="light">
                  <IconPlus />
                </ActionIcon>
                <Text size="sm" c="dimmed">Add Announcement</Text>
              </Stack>
            </Card>

            {formData.announcements && formData.announcements.length > 0 && (
              <Card withBorder padding="md">
                <Text size="sm" fw={500} mb="xs">Announcement Preview</Text>
                <Text size="xs" c="dimmed" mb="sm">This is how your announcement will appear:</Text>
                
                <Card withBorder padding="sm">
                  <Group align="flex-start" gap="sm">
                    {formData.eventImageUrl && (
                      <Image
                        src={formData.eventImageUrl}
                        alt="Event"
                        width={60}
                        height={60}
                        radius="md"
                        fit="cover"
                      />
                    )}
                    <Stack gap="xs" style={{ flex: 1 }}>
                      <Text fw={600} size="sm">🎮 {formData.name}</Text>
                      {formData.description && (
                        <Text size="xs" c="dimmed" lineClamp={2}>{formData.description}</Text>
                      )}
                      <Text size="xs" c="blue" style={{ textDecoration: 'underline' }}>
                        View Event Details →
                      </Text>
                    </Stack>
                  </Group>
                </Card>
              </Card>
            )}
            
            <Group justify="space-between" mt="md" gap="xs">
              <Button variant="outline" onClick={handleBack}>
                Back
              </Button>
              <Button onClick={handleAnnouncementsNext}>
                Next
              </Button>
            </Group>
          </Stack>
        )}

        {currentStep === 4 && (
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
                
                {!currentGameSupportsAllModes ? (
                  // Traditional mode: select mode first, then maps for that mode
                  <>
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
                  </>
                ) : (
                  // Flexible mode: show all maps with mode selection for each
                  <>
                    <Text size="sm" c="dimmed" mb="md">
                      Select any map and choose which mode to play on it.
                    </Text>
                    <Grid>
                      {allMaps.map((map) => (
                        <Grid.Col key={map.id} span={{ base: 12, sm: 6, md: 4 }}>
                          <Card
                            shadow="sm"
                            padding="md"
                            radius="md"
                            withBorder
                          >
                            <Card.Section>
                              <Image
                                src={map.imageUrl}
                                alt={map.name}
                                height={80}
                                fallbackSrc="data:image/svg+xml,%3csvg width='100' height='100' xmlns='http://www.w3.org/2000/svg'%3e%3crect width='100' height='100' fill='%23f1f3f4'/%3e%3c/svg%3e"
                              />
                            </Card.Section>
                            <Text fw={500} size="sm" mt="xs" mb="xs">{map.name}</Text>
                            <Select
                              placeholder="Select mode"
                              size="xs"
                              data={availableModes.map(mode => ({ value: mode.id, label: mode.name }))}
                              onChange={(value) => value && handleFlexibleMapSelect(map, value)}
                            />
                          </Card>
                        </Grid.Col>
                      ))}
                    </Grid>
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
            
            <Group justify="space-between" mt="md" gap="xs" align="center">
              <Button variant="outline" onClick={handleBack}>
                Back
              </Button>
              <Group align="center" gap="xs">
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
      </Stack>
    </Container>
  );
}