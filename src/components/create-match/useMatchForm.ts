import { useState, useEffect } from 'react';
import type { GameMap } from '@/shared/types';

export interface GameWithIcon {
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

export interface MatchFormData {
  gameId: string;
  name: string;
  description: string;
  dateTime?: Date | null;
  livestreamLink: string;
  rules: 'casual' | 'competitive';
  rounds: number;
  maps: string[];
  eventImageUrl?: string;
  playerNotifications?: boolean;
  announcementVoiceChannel?: string;
  announcements?: AnnouncementTime[];
}

export interface AnnouncementTime {
  id: string;
  value: number;
  unit: 'minutes' | 'hours' | 'days';
}

export interface GameMode {
  id: string;
  name: string;
  description?: string;
}

export interface GameMapWithMode extends GameMap {
  modeName?: string;
  modeDescription?: string;
  imageUrl?: string;
}

export interface SelectedMapCard {
  id: string;
  name: string;
  modeId: string;
  modeName: string;
  imageUrl?: string;
  note?: string;
}

/**
 * Custom hook for managing match creation form state
 */
export function useMatchForm() {
  const [formData, setFormData] = useState<Partial<MatchFormData>>(() => {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem('createMatchFormData');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (parsed.dateTime && typeof parsed.dateTime === 'string') {
            parsed.dateTime = new Date(parsed.dateTime);
          }
          return parsed;
        } catch { /* ignore */ }
      }
    }
    return { rules: 'casual', playerNotifications: true, announcements: [] };
  });

  const [selectedMaps, setSelectedMaps] = useState<SelectedMapCard[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem('createMatchSelectedMaps');
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch { /* ignore */ }
      }
    }
    return [];
  });

  const [imagePreview, setImagePreview] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem('createMatchFormData');
      if (saved) {
        try {
          return JSON.parse(saved).eventImageUrl ?? null;
        } catch { /* ignore */ }
      }
    }
    return null;
  });

  const [startSignups, setStartSignups] = useState(true);
  const [mapNotes, setMapNotes] = useState<Record<string, string>>({});

  // Save to session storage on changes
  useEffect(() => {
    sessionStorage.setItem('createMatchFormData', JSON.stringify(formData));
  }, [formData]);

  useEffect(() => {
    sessionStorage.setItem('createMatchSelectedMaps', JSON.stringify(selectedMaps));
  }, [selectedMaps]);

  const updateFormData = (field: keyof MatchFormData, value: unknown) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const clearFormData = () => {
    sessionStorage.removeItem('createMatchFormData');
    sessionStorage.removeItem('createMatchSelectedMaps');
  };

  const addMap = (map: SelectedMapCard) => {
    const newSelectedMaps = [...selectedMaps, map];
    const newMapIds = newSelectedMaps.map(m => m.id);

    setSelectedMaps(newSelectedMaps);
    setFormData(prev => ({
      ...prev,
      maps: newMapIds,
      rounds: newMapIds.length
    }));
  };

  const removeMap = (mapId: string) => {
    const newSelectedMaps = selectedMaps.filter(map => map.id !== mapId);
    const newMapIds = newSelectedMaps.map(m => m.id);

    setSelectedMaps(newSelectedMaps);
    setFormData(prev => ({
      ...prev,
      maps: newMapIds,
      rounds: newMapIds.length
    }));
  };

  const updateMapNote = (mapId: string, note: string) => {
    setMapNotes(prev => ({
      ...prev,
      [mapId]: note
    }));

    setSelectedMaps(prev =>
      prev.map(map =>
        map.id === mapId ? { ...map, note } : map
      )
    );
  };

  return {
    formData,
    selectedMaps,
    imagePreview,
    startSignups,
    mapNotes,
    updateFormData,
    clearFormData,
    addMap,
    removeMap,
    updateMapNote,
    setImagePreview,
    setStartSignups,
  };
}
