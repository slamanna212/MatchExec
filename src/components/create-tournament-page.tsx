'use client'

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Container, Stack, Group, Title, Breadcrumbs, Anchor, Progress, Button } from '@mantine/core';
import { IconArrowLeft } from '@tabler/icons-react';
import { showError, showWarning, showSuccess } from '@/lib/notifications';
import { logger } from '@/lib/logger/client';

import { useTournamentForm, type GameWithIcon } from './create-tournament/useTournamentForm';
import { buildTournamentPayload, createPreDefinedTeams, startTournamentSignups } from './create-tournament/tournament-helpers';
import { TournamentGameSelectionStep } from './create-tournament/TournamentGameSelectionStep';
import { TournamentEventInfoStep } from './create-tournament/TournamentEventInfoStep';
import { TournamentFormatStep } from './create-tournament/TournamentFormatStep';
import { TournamentTeamSettingsStep } from './create-tournament/TournamentTeamSettingsStep';
import { TournamentReviewStep } from './create-tournament/TournamentReviewStep';

export function CreateTournamentPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentStep = parseInt(searchParams.get('step') || '1');

  const {
    formData,
    imagePreview,
    updateFormData,
    clearFormData,
    addTeam,
    removeTeam,
    setImagePreview,
  } = useTournamentForm();

  const [games, setGames] = useState<GameWithIcon[]>([]);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');

  // Load games on mount
  useEffect(() => {
    const fetchGames = async () => {
      try {
        const response = await fetch('/api/games');
        if (response.ok) {
          const gamesData = await response.json();
          setGames(gamesData);
        }
      } catch (error) {
        logger.error('Error fetching games:', error);
      }
    };

    fetchGames();
  }, []);

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
      clearFormData();
      router.push('/tournaments');
    } else {
      navigateToStep(currentStep - 1);
    }
  };

  const handleGameSelect = (gameId: string) => {
    updateFormData('gameId', gameId);
  };

  /**
   * Check if team name already exists (case-insensitive)
   */
  const isDuplicateTeamName = (teamName: string, existingTeams: string[]): boolean => {
    const normalizedName = teamName.trim().toLowerCase();
    return existingTeams.some(team => team.toLowerCase() === normalizedName);
  };

  const handleAddTeam = (teamName: string) => {
    const currentTeams = formData.preCreatedTeams || [];

    if (isDuplicateTeamName(teamName, currentTeams)) {
      showWarning('A team with this name already exists');
      return;
    }

    addTeam(teamName.trim());
    setNewTeamName('');
  };

  const handleImageUpload = async (file: File | null) => {
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      showError('File size must be less than 5MB');
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

  const handleCreateTournament = async (shouldStartSignups: boolean) => {
    try {
      const tournamentData = buildTournamentPayload(formData);

      const response = await fetch('/api/tournaments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tournamentData),
      });

      if (!response.ok) {
        const error = await response.json();
        showError(error.error || 'Failed to create tournament');
        return;
      }

      const tournament = await response.json();

      await createPreDefinedTeams(tournament.id, formData.preCreatedTeams || []);

      if (shouldStartSignups) {
        await startTournamentSignups(tournament.id);
      }

      clearFormData();
      showSuccess('Tournament created successfully!');
      router.push('/tournaments');

    } catch (error) {
      logger.error('Error creating tournament:', error);
      showError('Failed to create tournament');
    }
  };

  const canProceedFromStep = (step: number): boolean => {
    switch (step) {
      case 1:
        return !!formData.gameId;
      case 2:
        return !!(formData.name && formData.roundsPerMatch);
      case 3:
        return !!(formData.format && formData.gameModeId);
      case 4:
        return true;
      case 5:
        return true;
      default:
        return true;
    }
  };

  const getProgressValue = () => {
    return (currentStep / 5) * 100;
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

        {/* Step Content */}
        {currentStep === 1 && (
          <TournamentGameSelectionStep
            games={games}
            onGameSelect={handleGameSelect}
            onNext={handleNext}
            canProceed={canProceedFromStep(1)}
          />
        )}

        {currentStep === 2 && (
          <TournamentEventInfoStep
            formData={formData}
            imagePreview={imagePreview}
            uploadingImage={uploadingImage}
            updateFormData={updateFormData}
            onImageUpload={handleImageUpload}
            onRemoveImage={handleRemoveImage}
            onBack={handleBack}
            onNext={handleNext}
            canProceed={canProceedFromStep(2)}
          />
        )}

        {currentStep === 3 && (
          <TournamentFormatStep
            formData={formData}
            updateFormData={updateFormData}
            onBack={handleBack}
            onNext={handleNext}
            canProceed={canProceedFromStep(3)}
          />
        )}

        {currentStep === 4 && (
          <TournamentTeamSettingsStep
            formData={formData}
            newTeamName={newTeamName}
            updateFormData={updateFormData}
            onAddTeam={handleAddTeam}
            onRemoveTeam={removeTeam}
            onBack={handleBack}
            onNext={handleNext}
            setNewTeamName={setNewTeamName}
          />
        )}

        {currentStep === 5 && (
          <TournamentReviewStep
            formData={formData}
            games={games}
            onBack={handleBack}
            onCreate={handleCreateTournament}
            canProceed={canProceedFromStep(5)}
          />
        )}
      </Stack>
    </Container>
  );
}
