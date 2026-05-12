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
  color?: string;
  mapCount: number;
  modeCount: number;
}

export interface TournamentFormData {
  gameId: string;
  gameModeId: string;
  name: string;
  description: string;
  dateTime?: Date | null;
  format: TournamentFormat;
  roundsPerMatch: number;
  ruleset: string;
  maxParticipants?: number;
  eventImageUrl?: string;
  preCreatedTeams?: string[];
  allowPlayerTeamSelection?: boolean;
  allowMatchEditing?: boolean;
  statsEnabled?: boolean;
}

/**
 * Custom hook for managing tournament creation form state
 */
export function useTournamentForm() {
  const [formData, setFormData] = useState<Partial<TournamentFormData>>(() => {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem('tournamentFormData');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (parsed.dateTime && typeof parsed.dateTime === 'string') {
            parsed.dateTime = new Date(parsed.dateTime);
          }
          return parsed;
        } catch {
          sessionStorage.removeItem('tournamentFormData');
        }
      }
    }
    return {
      format: 'single-elimination',
      roundsPerMatch: 3,
      ruleset: 'casual',
      preCreatedTeams: [],
      allowPlayerTeamSelection: false,
      allowMatchEditing: true,
      statsEnabled: false
    };
  });

  const [imagePreview, setImagePreview] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem('tournamentFormData');
      if (saved) {
        try {
          return JSON.parse(saved).eventImageUrl ?? null;
        } catch {
          return null;
        }
      }
    }
    return null;
  });

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
      allowPlayerTeamSelection: false,
      allowMatchEditing: true,
      statsEnabled: false
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
