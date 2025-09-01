'use client'

import { Card, Text, Stack, Group, SimpleGrid } from '@mantine/core';
import { useRouter } from 'next/navigation';
import { 
  IconAdjustments, 
  IconVolume, 
  IconClock, 
  IconBrandDiscord, 
  IconPaint,
  IconSettings
} from '@tabler/icons-react';

const settingsCategories = [
  {
    title: 'Application',
    description: 'Configure general application behavior and timing',
    href: '/settings/application',
    icon: IconAdjustments,
    color: '#27ae60',
  },
  {
    title: 'Announcer', 
    description: 'Configure voice announcements for matches',
    href: '/settings/announcer',
    icon: IconVolume,
    color: '#e67e22',
  },
  {
    title: 'Scheduler',
    description: 'Configure automated tasks and their timing',
    href: '/settings/scheduler', 
    icon: IconClock,
    color: '#9b59b6',
  },
  {
    title: 'Discord',
    description: 'Configure Discord bot connection and permissions',
    href: '/settings/discord',
    icon: IconBrandDiscord,
    color: '#5865f2',
  },
  {
    title: 'UI',
    description: 'Configure user interface behavior and appearance', 
    href: '/settings/ui',
    icon: IconPaint,
    color: '#f39c12',
  },
];

export default function SettingsPage() {
  const router = useRouter();

  return (
    <div className="max-w-6xl mx-auto">
      <Stack gap="lg">
        <div>
          <Group>
            <IconSettings size="2rem" />
            <div>
              <Text size="xl" fw={700}>Settings</Text>
              <Text size="sm" c="dimmed">Configure MatchExec to match your needs</Text>
            </div>
          </Group>
        </div>

        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
          {settingsCategories.map((category) => {
            const IconComponent = category.icon;
            return (
              <Card
                key={category.href}
                shadow="sm"
                padding="lg"
                radius="md"
                withBorder
                style={{ 
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  height: '100%'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.12)';
                }}
                onClick={() => router.push(category.href)}
              >
                <Group align="flex-start" gap="md">
                  <div 
                    style={{ 
                      backgroundColor: `${category.color}15`,
                      color: category.color,
                      padding: '12px',
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    <IconComponent size="1.5rem" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <Text size="md" fw={600} mb="xs">
                      {category.title}
                    </Text>
                    <Text size="sm" c="dimmed" style={{ lineHeight: 1.4 }}>
                      {category.description}
                    </Text>
                  </div>
                </Group>
              </Card>
            );
          })}
        </SimpleGrid>
      </Stack>
    </div>
  );
}