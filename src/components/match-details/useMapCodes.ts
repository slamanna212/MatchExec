import { useState, useEffect } from 'react';
import { logger } from '@/lib/logger/client';

interface Match {
  id: string;
  maps?: string[];
  map_codes?: Record<string, string>;
}

export function useMapCodes(match: Match | null, opened: boolean) {
  const [mapCodes, setMapCodes] = useState<Record<string, string>>({});
  const [mapCodesSaving, setMapCodesSaving] = useState(false);

  // Load map codes when modal opens
  useEffect(() => {
    if (!match || !opened) return;

    if (match.map_codes) {
      setMapCodes(match.map_codes);
    } else {
      const initialMapCodes: Record<string, string> = {};
      match.maps?.forEach(mapId => {
        initialMapCodes[mapId] = '';
      });
      setMapCodes(initialMapCodes);
    }
  }, [match, opened]);

  const saveMapCodes = async () => {
    if (!match) return;

    try {
      setMapCodesSaving(true);
      const response = await fetch(`/api/matches/${match.id}/map-codes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ mapCodes }),
      });

      if (!response.ok) {
        throw new Error('Failed to save map codes');
      }

      if (match) {
        match.map_codes = mapCodes;
      }
    } catch (error) {
      logger.error('Failed to save map codes:', error);
    } finally {
      setMapCodesSaving(false);
    }
  };

  const updateMapCode = (mapId: string, code: string) => {
    const trimmedCode = code.slice(0, 24);
    setMapCodes(prev => ({
      ...prev,
      [mapId]: trimmedCode
    }));
  };

  return { mapCodes, mapCodesSaving, saveMapCodes, updateMapCode };
}
