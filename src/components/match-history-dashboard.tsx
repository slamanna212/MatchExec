'use client'

import { logger } from '@/lib/logger/client';
import { useState, useEffect, useCallback, useMemo, memo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Card,
  Text,
  Button,
  Avatar,
  Divider,
  Skeleton,
  Group,
  Stack,
  Grid,
  Image,
  TextInput,
  Center,
} from '@mantine/core';
import type { Match } from '@/shared/types';
import { StageRing } from './StageRing';
import { parseDbTimestamp } from '@/lib/utils/dates';
import { PageLayout } from './PageLayout';

interface MatchWithGame extends Omit<Match, 'created_at' | 'updated_at' | 'start_date' | 'end_date'> {
  game_name?: string;
  game_icon?: string;
  game_color?: string;
  rules?: string;
  rounds?: number;
  maps?: string[];
  livestream_link?: string;
  event_image_url?: string;
  created_at: string;
  updated_at: string;
  start_date?: string;
  end_date?: string;
}

interface HistoryMatchCardProps {
  match: MatchWithGame;
  onViewDetails: (match: MatchWithGame) => void;
}

const HistoryMatchCard = memo(({
  match,
  onViewDetails
}: HistoryMatchCardProps) => {
  return (
    <Card
      shadow="sm"
      padding={0}
      radius="md"
      withBorder
      style={{
        cursor: 'pointer',
        opacity: 0.9,
        transition: 'all 0.2s ease'
      }}
      onMouseOver={(e) => {
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
      }}
      onMouseOut={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.12)';
      }}
      onClick={() => onViewDetails(match)}
    >
      <Card.Section style={{ height: 140, overflow: 'hidden' }}>
        <Image
          src={match.event_image_url || '/assets/placeholder-cover.png'}
          alt={`${match.name} event image`}
          h={140}
          w="100%"
          fit="cover"
          loading="lazy"
          style={{ objectFit: 'cover' }}
        />
      </Card.Section>

      <Group mb="md" p="lg" pb={0}>
        <Avatar
          src={match.game_icon}
          alt={match.game_name}
          size="md"
        />
        <Stack gap="xs" style={{ flex: 1 }}>
          <Text fw={600}>{match.name}</Text>
          <Text size="sm" c="dimmed">{match.game_name}</Text>
        </Stack>
        <StageRing status={match.status} gameColor={match.game_color} />
      </Group>

      <Divider mb="md" mx="lg" />

      <Stack gap="xs" px="lg" pb="lg" style={{ minHeight: '100px' }}>
        <div style={{ minHeight: '20px' }}>
          {match.description && (
            <Text size="sm" c="dimmed">{match.description}</Text>
          )}
        </div>

        <Group justify="space-between">
          <Text size="sm" c="dimmed">Max Participants:</Text>
          <Text size="sm">{match.max_participants}</Text>
        </Group>
        
        <Group justify="space-between">
          <Text size="sm" c="dimmed">Completed:</Text>
          <Text size="sm">{parseDbTimestamp(match.updated_at)?.toLocaleDateString('en-US') || 'N/A'}</Text>
        </Group>
      </Stack>
    </Card>
  );
});

HistoryMatchCard.displayName = 'HistoryMatchCard';

function SkeletonCard() {
  return (
    <Card shadow="sm" padding={0} radius="md" withBorder>
      <Card.Section><Skeleton height={140} /></Card.Section>
      <Stack p="lg" gap="xs">
        <Group>
          <Skeleton height={40} width={40} radius="md" />
          <Stack gap={4} style={{ flex: 1 }}>
            <Skeleton height={16} width="70%" />
            <Skeleton height={12} width="40%" />
          </Stack>
        </Group>
        <Skeleton height={12} width="60%" />
        <Skeleton height={12} width="40%" />
      </Stack>
    </Card>
  );
}

const PAGE_SIZE = 12;

export function MatchHistoryDashboard() {
  const router = useRouter();
  const [matches, setMatches] = useState<MatchWithGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const etagRef = useRef<string | null>(null);

  const fetchMatches = useCallback(async (silent = false) => {
    try {
      const headers: Record<string, string> = {};
      if (silent && etagRef.current) {
        headers['If-None-Match'] = etagRef.current;
      }
      const response = await fetch(`/api/matches?status=complete&limit=${PAGE_SIZE}&offset=0`, { headers });

      if (response.status === 304) return;

      const newEtag = response.headers.get('etag');
      if (newEtag) etagRef.current = newEtag;

      if (response.ok) {
        const data = await response.json();
        setMatches(data);
        setHasMore(data.length >= PAGE_SIZE);
        setPage(0);
      }
    } catch (error) {
      logger.error('Error fetching matches:', error);
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, []);

  const loadMore = useCallback(async () => {
    const nextPage = page + 1;
    setLoadingMore(true);
    try {
      const response = await fetch(`/api/matches?status=complete&limit=${PAGE_SIZE}&offset=${nextPage * PAGE_SIZE}`);
      if (response.ok) {
        const data = await response.json();
        setMatches(prev => [...prev, ...data]);
        setHasMore(data.length >= PAGE_SIZE);
        setPage(nextPage);
      }
    } catch (error) {
      logger.error('Error loading more matches:', error);
    } finally {
      setLoadingMore(false);
    }
  }, [page]);

  useEffect(() => {
    fetchMatches();
  }, [fetchMatches]);

  const handleViewDetails = useCallback((match: MatchWithGame) => {
    router.push(`/matches/history/${match.id}`);
  }, [router]);

  // Filter matches based on search query
  const filteredMatches = useMemo(() => {
    return matches.filter(match =>
      match.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      match.game_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      match.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      match.rules?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [matches, searchQuery]);

  // Animation variants for staggered entrance
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  // Memoize expensive match card rendering
  const memoizedMatchCards = useMemo(() => {
    const itemVariants = {
      hidden: { opacity: 0, y: 20 },
      visible: {
        opacity: 1,
        y: 0,
        transition: {
          duration: 0.4
        }
      }
    };

    return filteredMatches.map((match, index) => (
      <Grid.Col key={match.id} span={{ base: 12, md: 6, lg: 4 }}>
        <motion.div
          variants={itemVariants}
          initial="hidden"
          animate="visible"
          custom={index}
        >
          <HistoryMatchCard
            match={match}
            onViewDetails={handleViewDetails}
          />
        </motion.div>
      </Grid.Col>
    ));
  }, [filteredMatches, handleViewDetails]);


  if (loading) {
    return (
      <PageLayout>
        <Grid>
          {Array.from({ length: 6 }).map((_, i) => (
            <Grid.Col key={i} span={{ base: 12, md: 6, lg: 4 }}>
              <SkeletonCard />
            </Grid.Col>
          ))}
        </Grid>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <Group justify="flex-end" mb="xl">
        {matches.length > 0 && (
          <TextInput
            placeholder="Search history..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.currentTarget.value)}
            style={{ width: 300 }}
          />
        )}
      </Group>

      <Divider mb="xl" />

      {matches.length === 0 ? (
        <Card p="xl">
          <Stack align="center">
            <Text size="xl" fw={600}>No completed matches yet</Text>
            <Text c="dimmed" mb="md">
              Completed matches will appear here
            </Text>
            <Button
              component="a"
              href="/matches"
            >
              View Active Matches
            </Button>
          </Stack>
        </Card>
      ) : filteredMatches.length === 0 && searchQuery ? (
        <Card p="xl">
          <Stack align="center">
            <Text size="xl" fw={600}>No matches found</Text>
            <Text c="dimmed" mb="md">
              No completed matches match your search for &quot;{searchQuery}&quot;
            </Text>
            <Button
              component="a"
              href="/matches"
            >
              View Active Matches
            </Button>
          </Stack>
        </Card>
      ) : (
        <>
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            <Grid>
              {memoizedMatchCards}
            </Grid>
          </motion.div>
          {hasMore && !searchQuery && (
            <Center mt="xl">
              <Button
                variant="default"
                loading={loadingMore}
                onClick={loadMore}
              >
                Load More
              </Button>
            </Center>
          )}
        </>
      )}
    </PageLayout>
  );
}