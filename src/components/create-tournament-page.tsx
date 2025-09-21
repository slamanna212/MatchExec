'use client'

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Text, Stack, Card, Group, Grid, Badge, TextInput, Textarea, Select, NumberInput, Container, Title, Breadcrumbs, Anchor, Progress, Avatar, FileButton, ActionIcon, Image, Box } from '@mantine/core';
import { IconArrowLeft, IconUpload, IconTrash } from '@tabler/icons-react';
import { TournamentFormat } from '@/shared/types';

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

interface TournamentFormData {
  gameId: string;
  name: string;
  description: string;
  date: string;
  time: string;
  format: TournamentFormat;
  roundsPerMatch: number;
  maxParticipants?: number;
  eventImageUrl?: string;
}

export function CreateTournamentPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentStep = parseInt(searchParams.get('step') || '1');
  
  const [games, setGames] = useState<GameWithIcon[]>([]);
  const [formData, setFormData] = useState<Partial<TournamentFormData>>({
    format: 'single-elimination',
    roundsPerMatch: 3
  });
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

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

    fetchGames();

    // Restore form data from session storage
    const savedFormData = sessionStorage.getItem('tournamentFormData');
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
  }, []);

  // Save form data to session storage whenever it changes
  useEffect(() => {
    sessionStorage.setItem('tournamentFormData', JSON.stringify(formData));
  }, [formData]);

  const updateFormData = (key: keyof TournamentFormData, value: string | number | TournamentFormat | undefined) => {
    setFormData(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const clearFormData = () => {
    setFormData({
      format: 'single-elimination',
      roundsPerMatch: 3
    });
    sessionStorage.removeItem('tournamentFormData');
  };

  const navigateToStep = (step: number) => {
    const url = new URL(window.location.href);
    url.searchParams.set('step', step.toString());
    router.push(url.pathname + url.search);
  };

  const handleNext = () => {
    navigateToStep(currentStep + 1);
  };

  const handleBack = () => {
    if (currentStep === 1) {
      // Clear form data when going back to tournaments from step 1
      clearFormData();
      router.push('/tournaments');
    } else {
      navigateToStep(currentStep - 1);
    }
  };

  const handleCreateTournament = async (shouldStartSignups = false) => {
    try {
      // Combine date and time into proper datetime format
      const startDateTime = formData.date && formData.time
        ? new Date(`${formData.date}T${formData.time}`)
        : null;

      const tournamentData = {
        name: formData.name,
        description: formData.description,
        gameId: formData.gameId,
        format: formData.format,
        startDate: startDateTime?.toISOString(),
        startTime: startDateTime?.toISOString(),
        roundsPerMatch: formData.roundsPerMatch,
        maxParticipants: formData.maxParticipants,
        eventImageUrl: formData.eventImageUrl || null
      };

      const response = await fetch('/api/tournaments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(tournamentData),
      });

      if (response.ok) {
        const tournament = await response.json();

        // Clear form data on successful creation
        clearFormData();

        // Transition to gather stage if signups should be started
        if (shouldStartSignups) {
          await fetch(`/api/tournaments/${tournament.id}/transition`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ newStatus: 'gather' }),
          });
        }

        router.push('/tournaments');
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to create tournament');
      }
    } catch (error) {
      console.error('Error creating tournament:', error);
      alert('Failed to create tournament');
    }
  };

  const handleImageUpload = async (file: File | null) => {
    if (!file) return;

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      alert('File size must be less than 5MB');
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

  const getProgressValue = () => {
    return (currentStep / 4) * 100;
  };

  const canProceedFromStep = (step: number): boolean => {
    switch (step) {
      case 1:
        return !!formData.gameId;
      case 2:
        return !!(formData.name && formData.format && formData.roundsPerMatch);
      case 3:
        return true; // Team settings are optional
      default:
        return true;
    }
  };

  return (
    <Container size="lg" py="md">
      <Stack gap="md">
        {/* Breadcrumbs */}
        <Breadcrumbs>
          <Anchor onClick={() => router.push('/tournaments')}>Tournaments</Anchor>
          <span>Create Tournament</span>
        </Breadcrumbs>

        {/* Header */}
        <Group justify="space-between" align="center">
          <Title order={2}>Create New Tournament</Title>
          <Button variant="outline" leftSection={<IconArrowLeft size="1rem" />} onClick={handleBack}>
            Back
          </Button>
        </Group>

        {/* Progress */}
        <Progress value={getProgressValue()} size="sm" />

        {/* Step 1: Select Game */}
        {currentStep === 1 && (
          <Stack>
            <Text mb="md">Select the game for your tournament:</Text>
            <Grid>
              {games.map((game) => (
                <Grid.Col key={game.id} span={{ base: 12, sm: 6 }}>
                  <Card
                    shadow="sm"
                    padding="md"
                    radius="md"
                    withBorder
                    style={{
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                    onClick={() => {
                      updateFormData('gameId', game.id);
                      handleNext();
                    }}
                  >
                    <Group align="center">
                      <Avatar src={game.iconUrl} alt={game.name} size="lg" />
                      <div className="flex-1">
                        <Text fw={500}>{game.name}</Text>
                        <Text size="sm" c="dimmed">{game.genre}</Text>
                        <Group gap="xs" mt="xs">
                          <Badge size="xs" variant="light">{game.mapCount} maps</Badge>
                          <Badge size="xs" variant="light">{game.modeCount} modes</Badge>
                        </Group>
                      </div>
                    </Group>
                  </Card>
                </Grid.Col>
              ))}
            </Grid>
            
            <Group justify="end" mt="md">
              <Button onClick={handleNext} disabled={!canProceedFromStep(1)}>
                Next: Event Info
              </Button>
            </Group>
          </Stack>
        )}

        {/* Step 2: Event Info */}
        {currentStep === 2 && (
          <Stack>
            <Text mb="md">Enter tournament information:</Text>
            
            <TextInput
              label="Tournament Name"
              placeholder="Enter tournament name"
              required
              value={formData.name || ''}
              onChange={(e) => updateFormData('name', e.target.value)}
            />

            <Textarea
              label="Description"
              placeholder="Tournament description (optional)"
              minRows={3}
              value={formData.description || ''}
              onChange={(e) => updateFormData('description', e.target.value)}
            />

            <Group grow>
              <TextInput
                label="Start Date"
                type="date"
                value={formData.date || ''}
                onChange={(e) => updateFormData('date', e.target.value)}
              />
              <TextInput
                label="Start Time"
                type="time"
                value={formData.time || ''}
                onChange={(e) => updateFormData('time', e.target.value)}
              />
            </Group>

            <Select
              label="Tournament Format"
              required
              data={[
                { value: 'single-elimination', label: 'Single Elimination' },
                { value: 'double-elimination', label: 'Double Elimination' }
              ]}
              value={formData.format || 'single-elimination'}
              onChange={(value) => updateFormData('format', (value as TournamentFormat) || 'single-elimination')}
            />

            <NumberInput
              label="Rounds per Match"
              description="Number of rounds to play in each tournament match"
              required
              min={1}
              max={9}
              value={formData.roundsPerMatch || 3}
              onChange={(value) => updateFormData('roundsPerMatch', value || 3)}
            />

            <Box>
              <Text size="sm" fw={500} mb="xs">Tournament Image (Optional)</Text>
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
                    alt="Tournament preview"
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
                          {uploadingImage ? 'Uploading...' : 'Click to upload tournament image'}
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
              <Button onClick={handleNext} disabled={!canProceedFromStep(2)}>
                Next: Team Settings
              </Button>
            </Group>
          </Stack>
        )}

        {/* Step 3: Team Settings */}
        {currentStep === 3 && (
          <Stack>
            <Text mb="md">Configure team settings:</Text>
            
            <NumberInput
              label="Max Participants (Optional)"
              description="Maximum number of players that can register (leave empty for unlimited)"
              min={4}
              max={256}
              value={formData.maxParticipants || ''}
              onChange={(value) => updateFormData('maxParticipants', value || undefined)}
            />

            <Text size="sm" c="dimmed" mt="md">
              <strong>Note:</strong> Maps and modes will be automatically assigned when tournament matches are generated. 
              Teams will be formed during the signup phase, and bracket seeding will be done manually by administrators.
            </Text>

            <Group justify="space-between" mt="md">
              <Button variant="outline" onClick={handleBack}>
                Back
              </Button>
              <Button onClick={handleNext}>
                Next: Review
              </Button>
            </Group>
          </Stack>
        )}

        {/* Step 4: Review */}
        {currentStep === 4 && (
          <Stack>
            <Text mb="md">Review tournament details:</Text>
            
            <Card withBorder>
              <Stack gap="md">
                <Group>
                  <Text fw={500}>Tournament Name:</Text>
                  <Text>{formData.name}</Text>
                </Group>
                
                {formData.description && (
                  <Group>
                    <Text fw={500}>Description:</Text>
                    <Text>{formData.description}</Text>
                  </Group>
                )}

                <Group>
                  <Text fw={500}>Game:</Text>
                  <Text>{games.find(g => g.id === formData.gameId)?.name}</Text>
                </Group>

                <Group>
                  <Text fw={500}>Format:</Text>
                  <Badge variant="light">
                    {formData.format === 'single-elimination' ? 'Single Elimination' : 'Double Elimination'}
                  </Badge>
                </Group>

                <Group>
                  <Text fw={500}>Rounds per Match:</Text>
                  <Text>{formData.roundsPerMatch}</Text>
                </Group>

                {formData.maxParticipants && (
                  <Group>
                    <Text fw={500}>Max Participants:</Text>
                    <Text>{formData.maxParticipants}</Text>
                  </Group>
                )}

                {formData.date && formData.time && (
                  <Group>
                    <Text fw={500}>Start:</Text>
                    <Text>{new Date(`${formData.date}T${formData.time}`).toLocaleString()}</Text>
                  </Group>
                )}
              </Stack>
            </Card>

            <Group justify="space-between" mt="md" align="center">
              <Button variant="outline" onClick={handleBack}>
                Back
              </Button>
              <Group align="center" gap="md">
                <Button
                  variant="outline"
                  onClick={() => handleCreateTournament(false)}
                  disabled={!canProceedFromStep(4)}
                >
                  Create Tournament
                </Button>
                <Button
                  onClick={() => handleCreateTournament(true)}
                  disabled={!canProceedFromStep(4)}
                >
                  Create & Open Signups
                </Button>
              </Group>
            </Group>
          </Stack>
        )}
      </Stack>
    </Container>
  );
}