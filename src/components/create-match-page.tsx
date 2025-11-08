'use client'

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Container, Stack, Group, ActionIcon, Title, Breadcrumbs, Anchor, Progress, Box, Text } from '@mantine/core';
import { IconArrowLeft } from '@tabler/icons-react';
import { showError, showSuccess } from '@/lib/notifications';
import { logger } from '@/lib/logger/client';
import { MapNoteModal } from './map-note-modal';

import { useMatchForm, type GameWithIcon, type GameMode, type GameMapWithMode, type SelectedMapCard } from './create-match/useMatchForm';
import { buildMatchPayload, saveMapNotes, startMatchSignups } from './create-match/match-helpers';
import { GameSelectionStep } from './create-match/GameSelectionStep';
import { EventInfoStep } from './create-match/EventInfoStep';
import { AnnouncementsStep } from './create-match/AnnouncementsStep';
import { MapConfigurationStep } from './create-match/MapConfigurationStep';

export function CreateMatchPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentStep = parseInt(searchParams.get('step') || '1');

  const {
    formData,
    selectedMaps,
    imagePreview,
    startSignups,
    updateFormData,
    clearFormData,
    addMap,
    removeMap,
    updateMapNote,
    setImagePreview,
    setStartSignups,
  } = useMatchForm();

  const [games, setGames] = useState<GameWithIcon[]>([]);
  const [loadingMaps, setLoadingMaps] = useState(false);
  const [availableModes, setAvailableModes] = useState<GameMode[]>([]);
  const [showMapSelector, setShowMapSelector] = useState(false);
  const [selectedMode, setSelectedMode] = useState<string>('');
  const [mapsForMode, setMapsForMode] = useState<GameMapWithMode[]>([]);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [currentGameSupportsAllModes, setCurrentGameSupportsAllModes] = useState(false);
  const [allMaps, setAllMaps] = useState<GameMapWithMode[]>([]);
  const [mapNoteModalOpen, setMapNoteModalOpen] = useState(false);
  const [selectedMapForNote, setSelectedMapForNote] = useState<SelectedMapCard | null>(null);

  // Load games on mount
  useEffect(() => {
    const fetchGames = async () => {
      try {
        const response = await fetch('/api/games');
        if (response.ok) {
          const gamesData = await response.json();
          setGames(gamesData);
        } else {
          showError('Failed to load games. Please refresh the page.');
        }
      } catch (error) {
        logger.error('Error fetching games:', error);
        showError('Failed to load games. Please refresh the page.');
      }
    };

    fetchGames();
  }, []);

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
    updateFormData('gameId', gameId);
    navigateToStep(2);
  };

  const handleBack = () => {
    if (currentStep > 1) {
      navigateToStep(currentStep - 1);
    } else {
      clearFormData();
      router.push('/matches');
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
      const selectedGame = games.find(game => game.id === formData.gameId);
      const supportsAllModes = selectedGame?.supportsAllModes || false;
      setCurrentGameSupportsAllModes(supportsAllModes);

      const modesResponse = await fetch(`/api/games/${formData.gameId}/modes`);
      if (modesResponse.ok) {
        const modes = await modesResponse.json();
        setAvailableModes(modes);
      }

      if (supportsAllModes) {
        const mapsResponse = await fetch(`/api/games/${formData.gameId}/maps`);
        if (mapsResponse.ok) {
          const maps = await mapsResponse.json();
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
      logger.error('Error fetching game data:', error);
      showError('Failed to load game modes and maps.');
    } finally {
      setLoadingMaps(false);
    }
    navigateToStep(4);
  };

  const handleOpenNoteModal = (map: SelectedMapCard) => {
    setSelectedMapForNote(map);
    setMapNoteModalOpen(true);
  };

  const handleSaveNote = (note: string) => {
    if (selectedMapForNote) {
      updateMapNote(selectedMapForNote.id, note);
    }
  };

  const handleImageUpload = async (file: File | null) => {
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      showError('Invalid file type. Only JPEG, PNG, WebP, and GIF are allowed.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      showError('File too large. Maximum size is 5MB.');
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
        showSuccess('Image uploaded successfully!');
      } else {
        const error = await response.json();
        showError(error.error || 'Failed to upload image');
      }
    } catch (error) {
      logger.error('Error uploading image:', error);
      showError('Failed to upload image');
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
        logger.error('Error deleting image:', error);
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
      logger.error('Error fetching maps for mode:', error);
    } finally {
      setLoadingMaps(false);
    }
  };

  const handleMapSelect = (map: GameMapWithMode) => {
    const mode = availableModes.find(m => m.id === selectedMode);
    if (!mode) return;

    const timestampedId = `${map.id}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const selectedMap: SelectedMapCard = {
      id: timestampedId,
      name: map.name,
      modeId: selectedMode,
      modeName: mode.name,
      imageUrl: map.imageUrl
    };

    addMap(selectedMap);
    resetMapSelector();
  };

  const handleFlexibleMapSelect = (map: GameMapWithMode, modeId: string) => {
    const mode = availableModes.find(m => m.id === modeId);
    if (!mode) return;

    if (!map.id) {
      logger.error('Map ID is undefined:', map);
      return;
    }

    const baseMapId = map.id.includes('-') ? map.id.replace(/-[^-]+$/, '') : map.id;
    const combinedId = `${baseMapId}-${modeId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const selectedMap: SelectedMapCard = {
      id: combinedId,
      name: map.name,
      modeId: modeId,
      modeName: mode.name,
      imageUrl: map.imageUrl
    };

    addMap(selectedMap);
    resetMapSelector();
  };

  const handleAddMapClick = () => {
    setShowMapSelector(true);
    setSelectedMode('');
    setMapsForMode([]);
  };

  const resetMapSelector = () => {
    setShowMapSelector(false);
    setSelectedMode('');
    setMapsForMode([]);
  };

  const handleCreateMatch = async () => {
    try {
      const matchData = buildMatchPayload(formData);

      const response = await fetch('/api/matches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(matchData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        logger.error('Failed to create match:', errorData.error);
        showError(errorData.error || 'Failed to create match. Please try again.');
        return;
      }

      const newMatch = await response.json();

      try {
        await saveMapNotes(newMatch.id, selectedMaps);
      } catch {
        showError('Failed to save map notes.');
      }

      if (startSignups) {
        await startMatchSignups(newMatch.id);
      }

      clearFormData();
      showSuccess('Match created successfully!');
      router.push('/matches');

    } catch (error) {
      if (error instanceof Error && error.message === 'Missing required fields') {
        return;
      }
      logger.error('Error creating match:', error);
      showError('An error occurred while creating the match.');
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
          <GameSelectionStep games={games} onGameSelect={handleGameSelect} />
        )}

        {currentStep === 2 && (
          <EventInfoStep
            formData={formData}
            imagePreview={imagePreview}
            updateFormData={updateFormData}
            onBack={handleBack}
            onNext={handleEventInfoNext}
            onImageUpload={handleImageUpload}
            onRemoveImage={handleRemoveImage}
            uploadingImage={uploadingImage}
          />
        )}

        {currentStep === 3 && (
          <AnnouncementsStep
            announcements={formData.announcements || []}
            updateFormData={updateFormData}
            onBack={handleBack}
            onNext={handleAnnouncementsNext}
          />
        )}

        {currentStep === 4 && (
          <MapConfigurationStep
            selectedMaps={selectedMaps}
            showMapSelector={showMapSelector}
            availableModes={availableModes}
            currentGameSupportsAllModes={currentGameSupportsAllModes}
            allMaps={allMaps}
            mapsForMode={mapsForMode}
            selectedMode={selectedMode}
            loadingMaps={loadingMaps}
            startSignups={startSignups}
            onAddMapClick={handleAddMapClick}
            onRemoveMap={removeMap}
            onOpenNoteModal={handleOpenNoteModal}
            onModeSelect={handleModeSelect}
            onMapSelect={handleMapSelect}
            onFlexibleMapSelect={handleFlexibleMapSelect}
            onCancelMapSelector={resetMapSelector}
            onBack={handleBack}
            onCreate={handleCreateMatch}
            setStartSignups={setStartSignups}
          />
        )}
      </Stack>

      <MapNoteModal
        opened={mapNoteModalOpen}
        onClose={() => setMapNoteModalOpen(false)}
        mapName={selectedMapForNote?.name || ''}
        initialNote={selectedMapForNote?.note || ''}
        onSave={handleSaveNote}
      />
    </Container>
  );
}
