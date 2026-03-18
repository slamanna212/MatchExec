'use client'

import { Text, Badge, Button, Center, Loader, TextInput, Skeleton } from '@mantine/core';
import { useEffect, useState, useRef, useCallback } from 'react';
import { IconSearch, IconDeviceGamepad2, IconTrophy, IconDeviceFloppy } from '@tabler/icons-react';
import { motion, AnimatePresence } from 'framer-motion';
import { logger } from '@/lib/logger/client';
import styles from './games-page.module.css';

interface Game {
  id: string;
  name: string;
  genre: string;
  developer: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
  iconUrl: string;
  coverUrl?: string;
  color?: string;
  supportsAllModes: boolean;
  mapCount: number;
  modeCount: number;
}

interface GameMap {
  id: string;
  name: string;
  modeId: string;
  imageUrl?: string;
  location?: string;
  modeName: string;
  modeDescription?: string;
  supportedModes?: string;
  tournament_enabled?: number;
}

interface GameMode {
  id: string;
  name: string;
  description?: string;
}

const FALLBACK_COLOR = '#95a5a6';

export default function GamesPage() {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [maps, setMaps] = useState<GameMap[]>([]);
  const [mapsLoading, setMapsLoading] = useState(false);
  const [mapSearchQuery, setMapSearchQuery] = useState('');
  const [modes, setModes] = useState<GameMode[]>([]);
  const [selectedMode, setSelectedMode] = useState<string | null>(null);

  const [tournamentEnabled, setTournamentEnabled] = useState<Record<string, boolean>>({});
  const [savedTournamentEnabled, setSavedTournamentEnabled] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  const mapCache = useRef<Record<string, GameMap[]>>({});
  const modeCache = useRef<Record<string, GameMode[]>>({});

  // Mobile list drag-to-scroll
  const mobileListRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragScrollLeftRef = useRef(0);
  const hasDraggedRef = useRef(false);
  const [listDragging, setListDragging] = useState(false);

  const handleListMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = mobileListRef.current;
    if (!el) return;
    isDraggingRef.current = true;
    hasDraggedRef.current = false;
    dragStartXRef.current = e.pageX - el.offsetLeft;
    dragScrollLeftRef.current = el.scrollLeft;
    setListDragging(true);
  }, []);

  const handleListMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    const el = mobileListRef.current;
    if (!el) return;
    e.preventDefault();
    const x = e.pageX - el.offsetLeft;
    const walk = x - dragStartXRef.current;
    if (Math.abs(walk) > 5) hasDraggedRef.current = true;
    el.scrollLeft = dragScrollLeftRef.current - walk;
  }, []);

  const handleListMouseUp = useCallback(() => {
    isDraggingRef.current = false;
    setListDragging(false);
  }, []);

  useEffect(() => {
    async function fetchGames() {
      try {
        const response = await fetch('/api/games');
        if (response.ok) {
          const gamesData = await response.json();
          setGames(gamesData);
        } else {
          logger.error('Failed to fetch games');
        }
      } catch (error) {
        logger.error('Error fetching games:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchGames();
  }, []);

  const handleSelectGame = useCallback(async (game: Game) => {
    if (selectedGame?.id === game.id) return;
    setSelectedGame(game);
    setMapSearchQuery('');
    setSelectedMode(null);
    setTournamentEnabled({});
    setSavedTournamentEnabled({});

    // Fetch maps
    if (mapCache.current[game.id]) {
      const cached = mapCache.current[game.id];
      setMaps(cached);
      const initial: Record<string, boolean> = {};
      cached.forEach(m => { initial[m.name] = m.tournament_enabled !== 0; });
      setTournamentEnabled(initial);
      setSavedTournamentEnabled(initial);
    } else {
      setMapsLoading(true);
      try {
        const response = await fetch(`/api/games/${game.id}/maps`);
        if (response.ok) {
          const mapsData = await response.json();
          mapCache.current[game.id] = mapsData;
          setMaps(mapsData);
          const initial: Record<string, boolean> = {};
          mapsData.forEach((m: GameMap) => { initial[m.name] = m.tournament_enabled !== 0; });
          setTournamentEnabled(initial);
          setSavedTournamentEnabled(initial);
        }
      } catch (error) {
        logger.error('Error fetching maps:', error);
      } finally {
        setMapsLoading(false);
      }
    }

    // Fetch modes
    if (modeCache.current[game.id]) {
      setModes(modeCache.current[game.id]);
    } else {
      try {
        const response = await fetch(`/api/games/${game.id}/modes`);
        if (response.ok) {
          const modesData = await response.json();
          modeCache.current[game.id] = modesData;
          setModes(modesData);
        }
      } catch (error) {
        logger.error('Error fetching modes:', error);
      }
    }
  }, [selectedGame?.id]);

  const toggleMode = useCallback((modeName: string) => {
    setSelectedMode(prev => prev === modeName ? null : modeName);
  }, []);

  const handleTournamentToggle = useCallback((mapName: string) => {
    setTournamentEnabled(prev => ({ ...prev, [mapName]: !prev[mapName] }));
  }, []);

  const handleSaveTournament = async () => {
    if (!selectedGame) return;
    setSaving(true);
    const updates = Object.keys(tournamentEnabled)
      .filter(name => tournamentEnabled[name] !== savedTournamentEnabled[name])
      .map(name => ({ name, tournament_enabled: tournamentEnabled[name] ? 1 : 0 }));
    try {
      const res = await fetch(`/api/games/${selectedGame.id}/maps`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      });
      if (res.ok) {
        setSavedTournamentEnabled({ ...tournamentEnabled });
        delete mapCache.current[selectedGame.id];
      }
    } finally {
      setSaving(false);
    }
  };

  const hasUnsavedChanges = Object.keys(tournamentEnabled).some(
    name => tournamentEnabled[name] !== savedTournamentEnabled[name]
  );

  // Filter maps by search query and selected mode
  const filteredMaps = maps.filter(map => {
    if (mapSearchQuery) {
      const q = mapSearchQuery.toLowerCase();
      const nameMatch = map.name?.toLowerCase().includes(q);
      const locMatch = map.location?.toLowerCase().includes(q);
      const modeMatch = map.modeName?.toLowerCase().includes(q);
      if (!nameMatch && !locMatch && !modeMatch) return false;
    }

    if (selectedMode) {
      if (map.supportedModes) {
        const mapModes = map.supportedModes.split(',').map(m => m.trim());
        if (!mapModes.includes(selectedMode)) return false;
      } else if (map.modeName !== selectedMode) {
        return false;
      }
    }

    return true;
  });

  const gameColor = selectedGame?.color || FALLBACK_COLOR;

  if (loading) {
    return (
      <div className={styles.container}>
        <Center style={{ gridColumn: '1 / -1' }} h="100%">
          <Loader size="lg" />
        </Center>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Desktop sidebar */}
      <div className={styles.sidebarWrapper}>
        <div className={styles.sidebar}>
          {games.map(game => (
            <div
              key={game.id}
              className={selectedGame?.id === game.id ? styles.gameItemSelected : styles.gameItem}
              style={selectedGame?.id === game.id ? {
                borderLeftColor: game.color || FALLBACK_COLOR,
                background: `${game.color || FALLBACK_COLOR}12`,
              } : undefined}
              onClick={() => handleSelectGame(game)}
            >
              {game.coverUrl ? (
                <img
                  src={game.coverUrl}
                  alt={game.name}
                  className={styles.gameItemCover}
                />
              ) : (
                <div className={styles.gameItemCover} />
              )}
              <div className={styles.gameItemInfo}>
                <div className={styles.gameItemName}>{game.name}</div>
                <Badge variant="light" size="xs">{game.genre}</Badge>
                <Text size="xs" c="dimmed" mt={2}>{game.developer}</Text>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Mobile horizontal game list */}
      <div
        ref={mobileListRef}
        className={listDragging ? `${styles.mobileGameList} ${styles.mobileGameListDragging}` : styles.mobileGameList}
        onMouseDown={handleListMouseDown}
        onMouseMove={handleListMouseMove}
        onMouseUp={handleListMouseUp}
        onMouseLeave={handleListMouseUp}
      >
        {games.map(game => (
          <div
            key={game.id}
            className={selectedGame?.id === game.id ? styles.mobileGameCardSelected : styles.mobileGameCard}
            onClick={() => { if (!hasDraggedRef.current) handleSelectGame(game); }}
          >
            <img
              src={game.coverUrl || ''}
              alt={game.name}
              className={styles.mobileGameCardImage}
              style={{
                borderColor: selectedGame?.id === game.id ? (game.color || FALLBACK_COLOR) : 'transparent',
              }}
            />
            <span className={styles.mobileGameCardName}>{game.name}</span>
          </div>
        ))}
      </div>

      {/* Detail panel */}
      <div className={styles.detailPanel}>
        <AnimatePresence mode="wait">
          {!selectedGame ? (
            <motion.div
              key="empty"
              className={styles.emptyState}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <IconDeviceGamepad2 size={64} className={styles.emptyStateIcon} />
              <Text size="lg" c="dimmed">Select a game to view its maps</Text>
            </motion.div>
          ) : mapsLoading ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <div className={styles.detailHeader} style={{ borderBottomColor: gameColor }}>
                <div className={styles.detailHeaderTop}>
                  <Skeleton width={36} height={36} radius={8} />
                  <Skeleton width={200} height={28} />
                </div>
              </div>
              <div className={styles.skeletonGrid}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} height={190} radius={10} />
                ))}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key={selectedGame.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.25 }}
            >
              {/* Header */}
              <div className={styles.detailHeader} style={{ borderBottomColor: gameColor }}>
                <div className={styles.detailHeaderTop}>
                  {selectedGame.iconUrl && (
                    <img
                      src={selectedGame.iconUrl}
                      alt={selectedGame.name}
                      className={styles.detailHeaderIcon}
                    />
                  )}
                  <span className={styles.detailHeaderTitle}>{selectedGame.name}</span>
                  <div style={{ marginLeft: 'auto', minWidth: 80, display: 'flex', justifyContent: 'flex-end' }}>
                    <AnimatePresence mode="wait">
                      {hasUnsavedChanges ? (
                        <motion.div key="save" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}>
                          <Button size="xs" loading={saving} style={{ backgroundColor: gameColor, border: 'none' }}
                            leftSection={<IconDeviceFloppy size={13} />} onClick={handleSaveTournament}>
                            Save
                          </Button>
                        </motion.div>
                      ) : (
                        <motion.span key="count" className={styles.detailHeaderCount}
                          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                          {filteredMaps.length} {filteredMaps.length === 1 ? 'map' : 'maps'}
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
                <div className={styles.filterRow}>
                  <TextInput
                    className={styles.searchInput}
                    placeholder="Search maps..."
                    leftSection={<IconSearch size={16} />}
                    value={mapSearchQuery}
                    onChange={(e) => setMapSearchQuery(e.currentTarget.value)}
                    size="sm"
                  />
                </div>
                {modes.length > 0 && !selectedGame.supportsAllModes && (
                  <div className={styles.modeBadges} style={{ marginTop: 10 }}>
                    <Button
                      variant={selectedMode === null ? 'filled' : 'default'}
                      size="xs"
                      radius="md"
                      onClick={() => setSelectedMode(null)}
                    >
                      All
                    </Button>
                    {modes.map(mode => (
                      <Button
                        key={mode.id}
                        variant={selectedMode === mode.name ? 'filled' : 'default'}
                        size="xs"
                        radius="md"
                        style={selectedMode === mode.name ? {
                          backgroundColor: gameColor,
                          borderColor: gameColor,
                        } : undefined}
                        onClick={() => toggleMode(mode.name)}
                      >
                        {mode.name}
                      </Button>
                    ))}
                  </div>
                )}
              </div>

              {/* Map cards */}
              {filteredMaps.length === 0 ? (
                <div className={styles.emptyState} style={{ minHeight: 200 }}>
                  <Text c="dimmed">
                    {maps.length === 0
                      ? 'No maps found for this game.'
                      : `No maps matching "${mapSearchQuery}"`}
                  </Text>
                </div>
              ) : (
                <div className={styles.mapGrid}>
                  <AnimatePresence>
                  {filteredMaps.map(map => {
                    const mapModes = map.supportedModes
                      ? map.supportedModes.split(',').map(m => m.trim())
                      : map.modeName ? [map.modeName] : [];

                    const isEnabled = tournamentEnabled[map.name] ?? true;

                    return (
                      <motion.div
                        key={map.id}
                        layout
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.2 }}
                      >
                        <div
                          className={styles.mapCard}
                          style={{
                            backgroundImage: map.imageUrl
                              ? `url(${map.imageUrl})`
                              : undefined,
                          }}
                        >
                          <button
                            className={`${styles.tournamentToggle} ${isEnabled ? styles.tournamentToggleOn : ''}`}
                            style={isEnabled ? { '--accent': gameColor } as React.CSSProperties : undefined}
                            onClick={(e) => { e.stopPropagation(); handleTournamentToggle(map.name); }}
                            title={isEnabled ? 'Remove from tournament pool' : 'Add to tournament pool'}
                          >
                            <IconTrophy size={22} />
                          </button>
                          <div className={styles.mapCardOverlay}>
                            <div className={styles.mapCardBottom}>
                              <div>
                                <div className={styles.mapCardName}>{map.name}</div>
                                {map.location && (
                                  <div className={styles.mapCardLocation}>{map.location}</div>
                                )}
                              </div>
                              {!selectedGame.supportsAllModes && mapModes.length > 0 && (
                                <div className={styles.mapCardModes}>
                                  {mapModes.map((mode, i) => (
                                    <span
                                      key={i}
                                      className={styles.mapCardModeBadge}
                                      style={{ backgroundColor: `${gameColor}cc` }}
                                    >
                                      {mode}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                  </AnimatePresence>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
