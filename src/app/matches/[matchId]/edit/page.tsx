'use client'

import { use, useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Container,
  Stack,
  TextInput,
  Textarea,
  Select,
  Button,
  Group,
  Text,
  Title,
  Breadcrumbs,
  Anchor,
  Card,
  Loader,
  Center,
  Modal
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { logger } from '@/lib/logger/client';
import { showError, notificationHelper } from '@/lib/notifications';
import type { GameMode, GameMapWithMode, SelectedMapCard } from '@/components/create-match/useMatchForm';
import { MapSelector } from '@/components/create-match/MapSelector';
import { SelectedMapsList } from '@/components/create-match/SelectedMapsList';

interface MatchData {
  id: string;
  name: string;
  description?: string;
  game_id: string;
  game_name?: string;
  start_date?: string;
  rules?: string;
  rounds?: number;
  livestream_link?: string;
  maps?: string[];
  status: string;
}

interface MapDetail {
  id: string;
  name: string;
  imageUrl?: string;
  modeName?: string;
  mode_id?: string;
}

export default function EditMatchPage({
  params
}: {
  params: Promise<{ matchId: string }>
}) {
  const { matchId } = use(params);
  const router = useRouter();

  const [match, setMatch] = useState<MatchData | null>(null);
  const [loading, setLoading] = useState(true);

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [rules, setRules] = useState<string>('casual');
  const [livestreamLink, setLivestreamLink] = useState('');
  const [saving, setSaving] = useState(false);

  // Map state
  const [selectedMaps, setSelectedMaps] = useState<SelectedMapCard[]>([]);
  const [showMapSelector, setShowMapSelector] = useState(false);
  const [mapModalOpen, { open: openMapModal, close: closeMapModal }] = useDisclosure(false);

  // Map selection data
  const [availableModes, setAvailableModes] = useState<GameMode[]>([]);
  const [currentGameSupportsAllModes, setCurrentGameSupportsAllModes] = useState(false);
  const [allMaps, setAllMaps] = useState<GameMapWithMode[]>([]);
  const [mapsForMode, setMapsForMode] = useState<GameMapWithMode[]>([]);
  const [selectedMode, setSelectedMode] = useState('');
  const [loadingMaps, setLoadingMaps] = useState(false);

  const loadGameData = useCallback(async (gameId: string) => {
    try {
      const [gameRes, modesRes] = await Promise.all([
        fetch(`/api/games/${gameId}`),
        fetch(`/api/games/${gameId}/modes`)
      ]);

      let supportsAllModes = false;
      if (gameRes.ok) {
        const gameInfo = await gameRes.json();
        supportsAllModes = gameInfo.supportsAllModes || false;
      }
      setCurrentGameSupportsAllModes(supportsAllModes);

      if (modesRes.ok) {
        const modes = await modesRes.json();
        setAvailableModes(modes);

        if (supportsAllModes) {
          const allMapsRes = await fetch(`/api/games/${gameId}/maps`);
          if (allMapsRes.ok) {
            const maps = await allMapsRes.json();
            setAllMaps(maps);
          }
        }
      }
    } catch (error) {
      logger.error('Error loading game data:', error);
    }
  }, []);

  const convertMapsToCards = useCallback(async (mapIds: string[], gameId: string, modes: GameMode[]): Promise<SelectedMapCard[]> => {
    try {
      const allMapsRes = await fetch(`/api/games/${gameId}/maps`);
      if (!allMapsRes.ok) return [];
      const allMapsData: MapDetail[] = await allMapsRes.json();

      const mapsById: Record<string, MapDetail> = {};
      allMapsData.forEach(m => { mapsById[m.id] = m; });

      // Also build a lookup by base ID (without mode suffix)
      const mapsByBaseId: Record<string, MapDetail[]> = {};
      allMapsData.forEach(m => {
        const baseId = m.id.replace(/-[^-]+$/, '');
        if (!mapsByBaseId[baseId]) mapsByBaseId[baseId] = [];
        mapsByBaseId[baseId].push(m);
      });

      return mapIds.map((mapId) => {
        // Try exact match first
        let mapDetail = mapsById[mapId];

        // Strip timestamp suffix if present: e.g. "hanamura-control-1234567890-abc"
        if (!mapDetail) {
          const baseId = mapId.replace(/-\d+-[a-zA-Z0-9]+$/, '');
          mapDetail = mapsById[baseId];

          // If still not found, try stripping one segment at a time
          if (!mapDetail) {
            const parts = baseId.split('-');
            for (let i = parts.length - 1; i >= 1; i--) {
              const tryId = parts.slice(0, i + 1).join('-');
              const candidates = mapsByBaseId[tryId];
              if (candidates && candidates.length > 0) {
                mapDetail = candidates[0];
                break;
              }
            }
          }
        }

        // Determine mode from mapDetail or modes list
        let modeId = mapDetail?.mode_id || '';
        let modeName = mapDetail?.modeName || '';

        if (!modeName && modes.length > 0) {
          // Try to extract mode from map ID
          const modeMatch = mapId.match(/[^-]+-([^-]+)/);
          if (modeMatch) {
            const modeCandidate = modes.find(m => mapId.includes(m.id));
            if (modeCandidate) {
              modeId = modeCandidate.id;
              modeName = modeCandidate.name;
            } else {
              modeId = modes[0].id;
              modeName = modes[0].name;
            }
          } else {
            modeId = modes[0]?.id || '';
            modeName = modes[0]?.name || '';
          }
        }

        return {
          id: mapId,
          name: mapDetail?.name || mapId,
          modeId,
          modeName,
          imageUrl: mapDetail?.imageUrl
        };
      });
    } catch (error) {
      logger.error('Error converting maps:', error);
      return [];
    }
  }, []);

  useEffect(() => {
    const fetchMatch = async () => {
      try {
        const res = await fetch(`/api/matches/${matchId}`);
        if (!res.ok) {
          showError('Match not found');
          router.push('/matches');
          return;
        }
        const data: MatchData = await res.json();

        if (['battle', 'complete', 'cancelled'].includes(data.status)) {
          showError('Match cannot be edited once it has started');
          router.push(`/matches/${matchId}`);
          return;
        }

        setMatch(data);
        setName(data.name || '');
        setDescription(data.description || '');
        setRules(data.rules || 'casual');
        setLivestreamLink(data.livestream_link || '');

        if (data.start_date) {
          const d = new Date(`${data.start_date}${data.start_date.includes('Z') || /[+-]\d{2}:?\d{2}$/.test(data.start_date) ? '' : 'Z'}`);
          setDate(d.toISOString().split('T')[0]);
          setTime(d.toISOString().split('T')[1].substring(0, 5));
        }

        // Load game data and convert maps
        await loadGameData(data.game_id);

        if (data.maps && data.maps.length > 0) {
          const modesRes = await fetch(`/api/games/${data.game_id}/modes`);
          const modes: GameMode[] = modesRes.ok ? await modesRes.json() : [];
          const cards = await convertMapsToCards(data.maps, data.game_id, modes);
          setSelectedMaps(cards);
        }
      } catch (error) {
        logger.error('Error fetching match:', error);
        showError('Failed to load match');
      } finally {
        setLoading(false);
      }
    };

    fetchMatch();
  }, [matchId, router, loadGameData, convertMapsToCards]);

  const handleModeSelect = async (modeId: string) => {
    if (!match) return;
    setSelectedMode(modeId);
    setLoadingMaps(true);
    try {
      const res = await fetch(`/api/games/${match.game_id}/modes/${modeId}/maps`);
      if (res.ok) {
        const maps = await res.json();
        setMapsForMode(maps);
      }
    } catch (error) {
      logger.error('Error loading maps for mode:', error);
    } finally {
      setLoadingMaps(false);
    }
  };

  const handleMapSelect = (map: GameMapWithMode) => {
    const uniqueId = `${map.id}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    setSelectedMaps(prev => [...prev, {
      id: uniqueId,
      name: map.name,
      modeId: map.mode_id || selectedMode,
      modeName: map.modeName || availableModes.find(m => m.id === selectedMode)?.name || '',
      imageUrl: map.imageUrl
    }]);
    setShowMapSelector(false);
  };

  const handleFlexibleMapSelect = (map: GameMapWithMode, modeId: string) => {
    const uniqueId = `${map.id}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const mode = availableModes.find(m => m.id === modeId);
    setSelectedMaps(prev => [...prev, {
      id: uniqueId,
      name: map.name,
      modeId,
      modeName: mode?.name || '',
      imageUrl: map.imageUrl
    }]);
    setShowMapSelector(false);
  };

  const handleRemoveMap = (mapId: string) => {
    setSelectedMaps(prev => prev.filter(m => m.id !== mapId));
  };

  const handleOpenNoteModal = (_map: SelectedMapCard) => {
    // Notes editing not supported in edit page for simplicity
  };

  const handleSave = async () => {
    if (!name.trim()) {
      showError('Match name is required');
      return;
    }

    setSaving(true);
    const notificationId = 'match-edit-save';
    notificationHelper.loading({ id: notificationId, message: 'Saving changes...' });

    try {
      let startDate: string | null = null;
      if (date && time) {
        startDate = new Date(`${date}T${time}:00`).toISOString();
      }

      const mapIds = selectedMaps.map(m => {
        // Strip the unique timestamp suffix added during selection to get canonical map ID
        return m.id.replace(/-\d+-[a-zA-Z0-9]+$/, '');
      });

      const res = await fetch(`/api/matches/${matchId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description || null,
          startDate,
          rules,
          rounds: selectedMaps.length || null,
          livestreamLink: livestreamLink || null,
          maps: mapIds
        })
      });

      if (res.ok) {
        notificationHelper.update(notificationId, {
          type: 'success',
          message: 'Match updated successfully!'
        });
        router.push(`/matches/${matchId}`);
      } else {
        const err = await res.json();
        notificationHelper.update(notificationId, {
          type: 'error',
          message: err.error || 'Failed to save changes'
        });
      }
    } catch (error) {
      logger.error('Error saving match:', error);
      notificationHelper.update(notificationId, {
        type: 'error',
        message: 'An error occurred while saving'
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Container>
        <Center style={{ minHeight: '400px' }}>
          <Loader size="lg" />
        </Center>
      </Container>
    );
  }

  if (!match) return null;

  return (
    <Container size="md" py="xl">
      <Stack gap="lg">
        <div>
          <Breadcrumbs mb="sm">
            <Anchor onClick={() => router.push('/matches')} style={{ cursor: 'pointer' }}>Matches</Anchor>
            <Anchor onClick={() => router.push(`/matches/${matchId}`)} style={{ cursor: 'pointer' }}>{match.name}</Anchor>
            <Text>Edit Match</Text>
          </Breadcrumbs>
          <Title order={2}>Edit Match</Title>
        </div>

        <Card withBorder padding="lg" shadow="sm">
          <Stack gap="md">
            <TextInput
              label="Event Name"
              placeholder="Enter match name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />

            <Textarea
              label="Description"
              placeholder="Enter match description (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />

            <Group grow>
              <TextInput
                label="Date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
              <TextInput
                label="Time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                step="60"
              />
            </Group>

            <Select
              label="Rules Type"
              value={rules}
              onChange={(value) => setRules(value || 'casual')}
              data={[
                { value: 'casual', label: 'Casual' },
                { value: 'competitive', label: 'Competitive' }
              ]}
            />

            <TextInput
              label="Livestream Link"
              placeholder="https://twitch.tv/... (optional)"
              value={livestreamLink}
              onChange={(e) => setLivestreamLink(e.target.value)}
            />
          </Stack>
        </Card>

        <Card withBorder padding="lg" shadow="sm">
          <Stack gap="md">
            <Group justify="space-between" align="center">
              <Text fw={500}>Maps</Text>
              <Button variant="light" color="blue" size="sm" onClick={openMapModal}>
                Change Maps
              </Button>
            </Group>

            {selectedMaps.length === 0 ? (
              <Text size="sm" c="dimmed">No maps selected</Text>
            ) : (
              <SelectedMapsList
                selectedMaps={selectedMaps}
                showMapSelector={false}
                supportsAllModes={currentGameSupportsAllModes}
                onRemoveMap={handleRemoveMap}
                onOpenNoteModal={handleOpenNoteModal}
                onAddMapClick={openMapModal}
              />
            )}
          </Stack>
        </Card>

        <Group justify="space-between">
          <Button variant="outline" onClick={() => router.push(`/matches/${matchId}`)}>
            Cancel
          </Button>
          <Button onClick={handleSave} loading={saving} disabled={!name.trim()}>
            Save Changes
          </Button>
        </Group>
      </Stack>

      {/* Map Selection Modal */}
      <Modal
        opened={mapModalOpen}
        onClose={() => { closeMapModal(); setShowMapSelector(false); }}
        title="Change Maps"
        size="xl"
      >
        <Stack gap="md">
          <SelectedMapsList
            selectedMaps={selectedMaps}
            showMapSelector={showMapSelector}
            supportsAllModes={currentGameSupportsAllModes}
            onRemoveMap={handleRemoveMap}
            onOpenNoteModal={handleOpenNoteModal}
            onAddMapClick={() => setShowMapSelector(true)}
          />

          {showMapSelector && (
            <MapSelector
              availableModes={availableModes}
              currentGameSupportsAllModes={currentGameSupportsAllModes}
              allMaps={allMaps}
              mapsForMode={mapsForMode}
              selectedMode={selectedMode}
              loadingMaps={loadingMaps}
              onModeSelect={handleModeSelect}
              onMapSelect={handleMapSelect}
              onFlexibleMapSelect={handleFlexibleMapSelect}
              onCancel={() => setShowMapSelector(false)}
            />
          )}

          <Group justify="flex-end">
            <Button onClick={() => { closeMapModal(); setShowMapSelector(false); }}>
              Done
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Container>
  );
}
