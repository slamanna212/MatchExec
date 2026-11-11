import { Text, Stack, Skeleton, Progress, SimpleGrid } from '@mantine/core';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { IconDeviceGamepad2 } from '@tabler/icons-react';
import { logger } from '@/lib/logger/client';
import { PageLayout } from '@/components/PageLayout';
import { PageHeader } from '@/components/PageHeader';

interface Game {
  id: string;
  name: string;
  genre: string;
  developer: string;
  iconUrl: string;
  coverUrl?: string;
  color?: string;
  mapCount: number;
}

interface MapPoolRow {
  tournament_enabled?: boolean;
}

const FALLBACK_COLOR = '#95a5a6';

export default function GamesSettingsPage() {
  const [games, setGames] = useState<Game[]>([]);
  const [pools, setPools] = useState<Record<string, { pool: number; total: number }>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch('/api/games');
        if (!response.ok) {
          logger.error('Failed to fetch games');
          return;
        }
        const data: Game[] = await response.json();
        setGames(data);
        setLoading(false);

        const entries = await Promise.all(data.map(async (game) => {
          try {
            const res = await fetch(`/api/games/${game.id}/maps`);
            if (!res.ok) return [game.id, { pool: game.mapCount, total: game.mapCount }] as const;
            const maps: MapPoolRow[] = await res.json();
            return [game.id, { pool: maps.filter(m => m.tournament_enabled !== false).length, total: maps.length }] as const;
          } catch {
            return [game.id, { pool: game.mapCount, total: game.mapCount }] as const;
          }
        }));
        setPools(Object.fromEntries(entries));
      } catch (error) {
        logger.error('Error fetching games:', error);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <PageLayout>
      <Stack gap="lg">
        <PageHeader
          icon={IconDeviceGamepad2}
          title="Games"
          subtitle="Choose which maps each game can use in tournaments and series"
          breadcrumbs={[{ title: 'Settings', href: '/settings' }]}
        />

        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
          {loading
            ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} height={135} radius="md" />)
            : games.map((game) => {
              const color = game.color || FALLBACK_COLOR;
              const p = pools[game.id];
              const total = p?.total ?? game.mapCount;
              const pool = p?.pool ?? total;
              const pct = total > 0 ? Math.round((pool / total) * 100) : 0;
              return (
                <Link
                  key={game.id}
                  to={`/settings/games/${game.id}`}
                  style={{
                    display: 'flex',
                    borderRadius: 8,
                    overflow: 'hidden',
                    textDecoration: 'none',
                    color: 'inherit',
                    background: 'var(--mantine-color-dark-6)',
                    border: `1px solid ${color}40`,
                    transition: 'all 0.25s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-3px)';
                    e.currentTarget.style.boxShadow = `0 4px 14px ${color}33`;
                    e.currentTarget.style.borderColor = `${color}88`;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '';
                    e.currentTarget.style.borderColor = `${color}40`;
                  }}
                >
                  {game.coverUrl ? (
                    <img src={game.coverUrl} alt="" loading="lazy" style={{ width: 90, height: 135, objectFit: 'cover', flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: 90, height: 135, flexShrink: 0, background: 'var(--mantine-color-dark-5)' }} />
                  )}
                  <Stack gap={6} p="sm" style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {game.iconUrl && <img src={game.iconUrl} alt="" style={{ width: 28, height: 28, objectFit: 'contain', flexShrink: 0 }} />}
                      <Text fw={600} size="sm" lh={1.25}>{game.name}</Text>
                    </div>
                    <Text size="xs" c="dimmed">{game.genre} · {game.developer}</Text>
                    <Stack gap={6} mt="auto">
                      <Progress value={pct} size={4} color={color} />
                      <Text size="xs" c="dimmed">{pool} of {total} maps in pool</Text>
                    </Stack>
                  </Stack>
                </Link>
              );
            })}
        </SimpleGrid>
      </Stack>
    </PageLayout>
  );
}
