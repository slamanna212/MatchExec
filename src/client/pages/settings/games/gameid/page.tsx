import { Text, Stack, Group, Button, TextInput, Skeleton, Card, Badge, Switch, Anchor, Breadcrumbs } from '@mantine/core';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { IconSearch, IconDeviceFloppy } from '@tabler/icons-react';
import { logger } from '@/lib/logger/client';
import { showError, showSuccess } from '@/lib/notifications';
import { PageLayout } from '@/components/PageLayout';
import { useLazyBackground } from '@/hooks/useLazyBackground';

interface Game {
  id: string;
  name: string;
  genre: string;
  developer: string;
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
  tournament_enabled?: boolean;
}

interface GameMode {
  id: string;
  name: string;
  description?: string;
}

const FALLBACK_COLOR = '#95a5a6';

function MapTile({ map, enabled, onToggle }: { map: GameMap; enabled: boolean; onToggle: () => void }) {
  const { ref, backgroundImage } = useLazyBackground(map.imageUrl);
  return (
    <div
      ref={ref}
      onClick={onToggle}
      role="switch"
      aria-checked={enabled}
      aria-label={map.name}
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); onToggle(); } }}
      style={{
        position: 'relative',
        aspectRatio: '16 / 10',
        borderRadius: 8,
        overflow: 'hidden',
        cursor: 'pointer',
        backgroundColor: 'var(--mantine-color-dark-5)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundImage,
        filter: enabled ? 'none' : 'grayscale(1) brightness(0.55)',
        transition: 'filter 0.2s ease',
      }}
    >
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.4) 40%, rgba(0,0,0,0.1) 65%)' }} />
      <div style={{ position: 'absolute', top: 8, right: 8 }} onClick={(e) => e.stopPropagation()}>
        <Switch checked={enabled} onChange={onToggle} size="sm" aria-label={`${map.name} in pool`} />
      </div>
      <div style={{ position: 'absolute', left: 10, right: 10, bottom: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', lineHeight: 1.2, textShadow: '0 1px 3px #000' }}>{map.name}</div>
        {map.location && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.75)', marginTop: 2, textShadow: '0 1px 3px #000' }}>{map.location}</div>}
      </div>
    </div>
  );
}

export default function GameDetailSettingsPage() {
  const { gameId } = useParams<{ gameId: string }>();
  const [game, setGame] = useState<Game | null>(null);
  const [maps, setMaps] = useState<GameMap[]>([]);
  const [modes, setModes] = useState<GameMode[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [search, setSearch] = useState('');
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!gameId) return;
    async function load() {
      setLoading(true);
      try {
        const [gamesRes, mapsRes, modesRes] = await Promise.all([
          fetch('/api/games'),
          fetch(`/api/games/${gameId}/maps`),
          fetch(`/api/games/${gameId}/modes`),
        ]);
        const games: Game[] = gamesRes.ok ? await gamesRes.json() : [];
        const found = games.find(g => g.id === gameId) ?? null;
        setGame(found);
        setNotFound(!found);
        const mapData: GameMap[] = mapsRes.ok ? await mapsRes.json() : [];
        setMaps(mapData);
        const initial: Record<string, boolean> = {};
        mapData.forEach(m => { initial[m.name] = m.tournament_enabled !== false; });
        setEnabled(initial);
        setSaved(initial);
        setModes(modesRes.ok ? await modesRes.json() : []);
      } catch (error) {
        logger.error('Error loading game:', error);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [gameId]);

  const color = game?.color || FALLBACK_COLOR;
  const poolCount = maps.filter(m => enabled[m.name] ?? true).length;
  const dirty = Object.keys(enabled).some(name => enabled[name] !== saved[name]);

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const visible = maps.filter(m => !q
      || m.name.toLowerCase().includes(q)
      || m.location?.toLowerCase().includes(q)
      || m.modeName?.toLowerCase().includes(q));
    if (!game || game.supportsAllModes || modes.length === 0) {
      return visible.length ? [{ name: 'All maps', description: undefined as string | undefined, maps: visible }] : [];
    }
    const result = modes.map(mode => ({
      name: mode.name,
      description: mode.description,
      maps: visible.filter(m => m.modeName === mode.name),
    }));
    const known = new Set(modes.map(m => m.name));
    const other = visible.filter(m => !known.has(m.modeName));
    if (other.length) result.push({ name: 'Other', description: undefined, maps: other });
    return result.filter(g => g.maps.length > 0);
  }, [maps, modes, game, search]);

  const toggle = (name: string) => setEnabled(prev => ({ ...prev, [name]: !(prev[name] ?? true) }));

  const toggleAll = (group: GameMap[]) => {
    const allOn = group.every(m => enabled[m.name] ?? true);
    setEnabled(prev => {
      const next = { ...prev };
      group.forEach(m => { next[m.name] = !allOn; });
      return next;
    });
  };

  const handleSave = async () => {
    if (!game) return;
    setSaving(true);
    const updates = Object.keys(enabled)
      .filter(name => enabled[name] !== saved[name])
      .map(name => ({ name, tournament_enabled: enabled[name] }));
    try {
      const res = await fetch(`/api/games/${game.id}/maps`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      });
      if (res.ok) {
        setSaved({ ...enabled });
        showSuccess('Map pool saved');
      } else {
        showError('Failed to save map pool');
      }
    } catch (error) {
      logger.error('Error saving map pool:', error);
      showError('An error occurred while saving the map pool');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <PageLayout>
        <Stack gap="lg">
          <Skeleton height={44} width={240} />
          <Skeleton height={172} radius="md" />
          <Skeleton height={400} radius="md" />
        </Stack>
      </PageLayout>
    );
  }

  if (notFound || !game) {
    return (
      <PageLayout>
        <Stack gap="md">
          <Text c="dimmed">Game not found.</Text>
          <Anchor component={Link} to="/settings/games">Back to Games</Anchor>
        </Stack>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <Stack gap="lg">
        <Breadcrumbs>
          <Anchor component={Link} to="/settings" size="sm">Settings</Anchor>
          <Anchor component={Link} to="/settings/games" size="sm">Games</Anchor>
          <Text size="sm" c="dimmed">{game.name}</Text>
        </Breadcrumbs>

        <div style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', border: `1px solid ${color}59`, background: 'var(--mantine-color-dark-6)' }}>
          {game.coverUrl && (
            <img src={game.coverUrl} alt="" aria-hidden style={{ position: 'absolute', inset: -40, width: 'calc(100% + 80px)', height: 'calc(100% + 80px)', objectFit: 'cover', filter: 'blur(28px) brightness(0.4) saturate(1.3)' }} />
          )}
          <Group style={{ position: 'relative' }} p="md" gap="lg" align="center" wrap="nowrap">
            {game.coverUrl && <img src={game.coverUrl} alt="" style={{ width: 88, height: 132, objectFit: 'cover', borderRadius: 6, boxShadow: '0 8px 24px rgba(0,0,0,0.5)', flexShrink: 0 }} />}
            <Stack gap={8} style={{ flex: 1, minWidth: 0 }}>
              <Group gap={10} wrap="nowrap">
                {game.iconUrl && <img src={game.iconUrl} alt="" style={{ width: 34, height: 34, objectFit: 'contain' }} />}
                <Text ff="var(--font-outfit)" fz={{ base: 22, sm: 28 }} fw={700} c="white">{game.name}</Text>
              </Group>
              <Group gap={6}>
                <Badge variant="filled" color="dark" size="sm">{game.mapCount} maps</Badge>
                <Badge variant="filled" color="dark" size="sm">{game.modeCount} modes</Badge>
                <Badge variant="filled" color="dark" size="sm">{game.minPlayers}–{game.maxPlayers} players</Badge>
              </Group>
            </Stack>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <Text ff="var(--font-outfit)" fz={34} fw={700} lh={1} c={color}>
                {poolCount}<Text span fz={20} c="gray.4"> / {maps.length}</Text>
              </Text>
              <Text size="sm" c="gray.4" mt={4}>maps in pool</Text>
            </div>
          </Group>
        </div>

        <Card padding="lg" radius="md" withBorder>
          <Stack gap="xl">
            <Group justify="space-between" align="flex-end" gap="md">
              <div>
                <Text size="lg" fw={600}>Map Pool</Text>
                <Text size="sm" c="dimmed">Maps switched off are never picked for tournaments or series.</Text>
              </div>
              <TextInput
                placeholder="Search maps..."
                leftSection={<IconSearch size={16} />}
                value={search}
                onChange={(e) => setSearch(e.currentTarget.value)}
                w={{ base: '100%', sm: 280 }}
              />
            </Group>

            {groups.length === 0 && (
              <Text c="dimmed" ta="center" py="xl">
                {maps.length === 0 ? 'No maps found for this game.' : `No maps matching "${search}"`}
              </Text>
            )}

            {groups.map(group => {
              const on = group.maps.filter(m => enabled[m.name] ?? true).length;
              return (
                <Stack key={group.name} gap="sm">
                  <Group gap="md" align="baseline" wrap="wrap">
                    <Text fw={600}>{group.name}</Text>
                    {group.description && <Text size="sm" c="dimmed" style={{ flex: 1, minWidth: 160 }}>{group.description}</Text>}
                    <Text size="sm" c="dimmed" ml="auto">{on} of {group.maps.length}</Text>
                    <Anchor component="button" type="button" size="sm" fw={600} onClick={() => toggleAll(group.maps)}>Toggle all</Anchor>
                  </Group>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 12 }}>
                    {group.maps.map(map => (
                      <MapTile key={map.id} map={map} enabled={enabled[map.name] ?? true} onToggle={() => toggle(map.name)} />
                    ))}
                  </div>
                </Stack>
              );
            })}

            <Group justify="flex-end">
              <Button leftSection={<IconDeviceFloppy size={16} />} loading={saving} disabled={!dirty} onClick={handleSave}>
                Save Settings
              </Button>
            </Group>
          </Stack>
        </Card>
      </Stack>
    </PageLayout>
  );
}
