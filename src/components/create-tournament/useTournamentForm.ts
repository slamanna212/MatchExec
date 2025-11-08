import { useState, useEffect } from 'react';
import type { TournamentFormat } from '@/shared/types';

export interface GameWithIcon {
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

export interface TournamentFormData {
  gameId: string;
  name: string;
  description: string;
  date: string;
  time: string;
  format: TournamentFormat;
  roundsPerMatch: number;
  ruleset: string;
  maxParticipants?: number;
  eventImageUrl?: string;
  preCreatedTeams?: string[];
  allowPlayerTeamSelection?: boolean;
}

/**
 * Custom hook for managing tournament creation form state
 */
export function useTournamentForm() {
  const [formData, setFormData] = useState<Partial<TournamentFormData>>({
    format: 'single-elimination',
    roundsPerMatch: 3,
    ruleset: 'casual',
    preCreatedTeams: [],
    allowPlayerTeamSelection: false
  });

  const [imagePreview, setImagePreview] = useState<string | null>(null);

  // Load from session storage on mount
  useEffect(() => {
    const loadSavedData = () => {
      const savedFormData = sessionStorage.getItem('tournamentFormData');
      if (savedFormData) {
        try {
          const parsedData = JSON.parse(savedFormData);
          setFormData(parsedData);

          if (parsedData.eventImageUrl) {
            setImagePreview(parsedData.eventImageUrl);
          }
        } catch {
          // Failed to parse saved form data
        }
      }
    };

    loadSavedData();
  }, []);

  // Save to session storage on changes
  useEffect(() => {
    sessionStorage.setItem('tournamentFormData', JSON.stringify(formData));
  }, [formData]);

  const updateFormData = (key: keyof TournamentFormData, value: unknown) => {
    setFormData(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const clearFormData = () => {
    setFormData({
      format: 'single-elimination',
      roundsPerMatch: 3,
      ruleset: 'casual',
      preCreatedTeams: [],
      allowPlayerTeamSelection: false
    });
    sessionStorage.removeItem('tournamentFormData');
  };

  const addTeam = (teamName: string) => {
    const currentTeams = formData.preCreatedTeams || [];
    updateFormData('preCreatedTeams', [...currentTeams, teamName]);
  };

  const removeTeam = (teamName: string) => {
    const currentTeams = formData.preCreatedTeams || [];
    updateFormData('preCreatedTeams', currentTeams.filter(team => team !== teamName));
  };

  return {
    formData,
    imagePreview,
    updateFormData,
    clearFormData,
    addTeam,
    removeTeam,
    setImagePreview,
  };
}
