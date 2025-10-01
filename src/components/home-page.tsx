'use client'

import { Card, Text, Stack, Group, Button, useMantineColorScheme, SimpleGrid } from '@mantine/core';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { IconTrophy, IconSwords, IconUsers } from '@tabler/icons-react';
import { motion } from 'framer-motion';
import { AnimatedCounter } from './AnimatedCounter';

interface Stats {
  totalMatches: number;
  totalTournaments: number;
  totalSignups: number;
}

interface StatItem {
  title: string;
  value: number;
  icon: typeof IconSwords;
  color: string;
}

export function HomePage() {
  const router = useRouter();
  const { colorScheme } = useMantineColorScheme();
  const [stats, setStats] = useState<Stats>({ totalMatches: 0, totalTournaments: 0, totalSignups: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/stats')
      .then(res => res.json())
      .then(data => {
        setStats(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load stats:', err);
        setLoading(false);
      });
  }, []);

  const statItems = [
    {
      title: 'Total Matches',
      value: stats.totalMatches,
      icon: IconSwords,
      color: '#06B6D4'
    },
    {
      title: 'Total Tournaments',
      value: stats.totalTournaments,
      icon: IconTrophy,
      color: '#4895EF'
    },
    {
      title: 'Total Signups',
      value: stats.totalSignups,
      icon: IconUsers,
      color: '#763c62'
    }
  ];

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.15
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.5
      }
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <Stack gap="xl">
        {/* Stats Section */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="lg">
            {statItems.map((stat: StatItem) => {
              const Icon = stat.icon;
              return (
                <motion.div key={stat.title} variants={itemVariants}>
                  <Card
                key={stat.title}
                shadow={colorScheme === 'light' ? 'lg' : 'sm'}
                p="lg"
                radius="md"
                withBorder
                bg={colorScheme === 'light' ? 'white' : undefined}
                style={{
                  borderColor: colorScheme === 'light' ? 'var(--mantine-color-gray-3)' : undefined
                }}
              >
                <Group justify="space-between">
                  <div>
                    <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                      {stat.title}
                    </Text>
                    <Text fw={700} size="xl" mt="xs">
                      {loading ? '...' : <AnimatedCounter value={stat.value} />}
                    </Text>
                  </div>
                  <Icon size={32} stroke={1.5} style={{ color: stat.color.startsWith('#') ? stat.color : `var(--mantine-color-${stat.color}-6)` }} />
                </Group>
                  </Card>
                </motion.div>
              );
            })}
          </SimpleGrid>
        </motion.div>

        {/* Main Cards Section */}
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
          {/* Matches Card */}
          <Card
            shadow={colorScheme === 'light' ? 'lg' : 'sm'}
            padding="xl"
            radius="md"
            withBorder
            bg={colorScheme === 'light' ? 'white' : undefined}
            style={{
              transition: 'all 0.2s ease',
              borderColor: colorScheme === 'light' ? 'var(--mantine-color-gray-3)' : undefined,
              minHeight: '400px'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.transform = 'translateY(-4px)';
              e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.15)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = colorScheme === 'light' ? '0 1px 3px rgba(0,0,0,0.12)' : '0 1px 3px rgba(0,0,0,0.24)';
            }}
          >
            <Stack gap="md" h="100%" justify="space-between">
              <div>
                <div
                  style={{
                    width: '100%',
                    height: '180px',
                    background: 'linear-gradient(135deg, #06B6D4 0%, #0891B2 50%, #0E7490 100%)',
                    borderRadius: 'var(--mantine-radius-md)',
                    marginBottom: 'var(--mantine-spacing-md)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <IconSwords size={80} stroke={1.5} color="white" />
                </div>
                <Text size="xl" fw={700} mb="sm">Matches</Text>
                <Text c="dimmed" size="sm">
                  Perfect for smaller one-off events. Quick match creation, simple signup management,
                  and real-time match tracking for casual or competitive play.
                </Text>
              </div>
              <Group grow>
                <Button
                  size="md"
                  variant="light"
                  onClick={() => router.push('/matches/create')}
                >
                  Create
                </Button>
                <Button
                  size="md"
                  onClick={() => router.push('/matches')}
                >
                  View All
                </Button>
              </Group>
            </Stack>
          </Card>

          {/* Tournaments Card */}
          <Card
            shadow={colorScheme === 'light' ? 'lg' : 'sm'}
            padding="xl"
            radius="md"
            withBorder
            bg={colorScheme === 'light' ? 'white' : undefined}
            style={{
              transition: 'all 0.2s ease',
              borderColor: colorScheme === 'light' ? 'var(--mantine-color-gray-3)' : undefined,
              minHeight: '400px'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.transform = 'translateY(-4px)';
              e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.15)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = colorScheme === 'light' ? '0 1px 3px rgba(0,0,0,0.12)' : '0 1px 3px rgba(0,0,0,0.24)';
            }}
          >
            <Stack gap="md" h="100%" justify="space-between">
              <div>
                <div
                  style={{
                    width: '100%',
                    height: '180px',
                    background: 'linear-gradient(135deg, #4361EE 0%, #4895EF 50%, #4CC9F0 100%)',
                    borderRadius: 'var(--mantine-radius-md)',
                    marginBottom: 'var(--mantine-spacing-md)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <IconTrophy size={80} stroke={1.5} color="white" />
                </div>
                <Text size="xl" fw={700} mb="sm">Tournaments</Text>
                <Text c="dimmed" size="sm">
                  Designed for bigger events with more players. Full bracket systems, team management,
                  multiple rounds, and comprehensive tournament organization tools.
                </Text>
              </div>
              <Group grow>
                <Button
                  size="md"
                  variant="light"
                  onClick={() => router.push('/tournaments/create')}
                >
                  Create
                </Button>
                <Button
                  size="md"
                  onClick={() => router.push('/tournaments')}
                >
                  View All
                </Button>
              </Group>
            </Stack>
          </Card>
        </SimpleGrid>
      </Stack>
    </div>
  );
}