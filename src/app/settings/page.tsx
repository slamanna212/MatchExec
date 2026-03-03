'use client'

import { Card, Text, Stack, Group } from '@mantine/core';
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
    description: 'Configure voice announcements and TTS for matches',
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

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))',
            gap: '1rem',
            gridAutoRows: '1fr'
          }}
        >
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
                  transition: 'all 0.25s ease',
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  borderColor: `${category.color}22`,
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.transform = 'translateY(-3px) scale(1.01)';
                  e.currentTarget.style.boxShadow = `0 8px 28px ${category.color}44`;
                  e.currentTarget.style.borderColor = `${category.color}55`;
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.transform = 'translateY(0) scale(1)';
                  e.currentTarget.style.boxShadow = '';
                  e.currentTarget.style.borderColor = `${category.color}22`;
                }}
                onClick={() => router.push(category.href)}
              >
                <Group align="center" gap="md" style={{ width: '100%' }}>
                  <div
                    style={{
                      background: `linear-gradient(135deg, ${category.color}30, ${category.color}15)`,
                      border: `1px solid ${category.color}40`,
                      color: category.color,
                      padding: '12px',
                      borderRadius: '10px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <IconComponent size="1.5rem" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Text size="md" fw={600} mb="xs">
                      {category.title}
                    </Text>
                    <Text
                      size="sm"
                      c="dimmed"
                      style={{
                        lineHeight: 1.4,
                        wordWrap: 'break-word',
                        hyphens: 'auto'
                      }}
                    >
                      {category.description}
                    </Text>
                  </div>
                </Group>
              </Card>
            );
          })}
        </div>
      </Stack>
    </div>
  );
}