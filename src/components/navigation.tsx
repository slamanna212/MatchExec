'use client'

import { logger } from '@/lib/logger/client';
import React, { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import {
  AppShell,
  NavLink,
  Burger,
  Group,
  ActionIcon,
  useMantineColorScheme,
  Image
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import {
  IconTrophy,
  IconDeviceGamepad2,
  IconSettings,
  IconCode,
  IconSun,
  IconMoon,
  IconHistory,
  IconHash,
  IconAdjustments,
  IconClock,
  IconBrandDiscord,
  IconPaint,
  IconVolume,
  IconInfoCircle,
  IconHome,
  IconSwords
} from '@tabler/icons-react'
import type { VersionInfo } from '@/lib/version-client';
import { getVersionInfo } from '@/lib/version-client'

interface NavigationProps {
  children: React.ReactNode
}

export function Navigation({ children }: NavigationProps) {
  const [opened, { toggle }] = useDisclosure(false)
  const { colorScheme, toggleColorScheme } = useMantineColorScheme()
  const router = useRouter()
  const pathname = usePathname()
  const [mounted, setMounted] = useState(false)
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null)

  // Fix hydration issues by ensuring component is mounted on client
  useEffect(() => {
    // Use requestAnimationFrame to avoid synchronous setState in effect
    const frame = requestAnimationFrame(() => {
      setMounted(true);
    });

    // Fetch version info from API
    getVersionInfo().then(setVersionInfo).catch((error) => {
      logger.error('Failed to fetch version info:', error);
    });

    return () => cancelAnimationFrame(frame);
  }, [])

  // Icon mapping to avoid serialization issues with SSR
  const getIcon = (name: string) => {
    const iconMap: Record<string, React.ComponentType<{ size: string }>> = {
      home: IconHome,
      swords: IconSwords,
      history: IconHistory,
      trophy: IconTrophy,
      gamepad: IconDeviceGamepad2,
      hash: IconHash,
      settings: IconSettings,
      adjustments: IconAdjustments,
      volume: IconVolume,
      clock: IconClock,
      discord: IconBrandDiscord,
      paint: IconPaint,
      info: IconInfoCircle,
      code: IconCode,
    };
    return iconMap[name] || IconHome;
  };

  const navigationItems = [
    {
      label: 'Home',
      href: '/',
      iconName: 'home'
    },
    {
      label: 'Matches',
      href: '/matches',
      iconName: 'swords',
      links: [
        { label: 'History', href: '/matches/history', iconName: 'history' }
      ]
    },
    {
      label: 'Tournaments',
      href: '/tournaments',
      iconName: 'trophy',
      links: [
        { label: 'History', href: '/tournaments/history', iconName: 'history' }
      ]
    },
    { label: 'Games', href: '/games', iconName: 'gamepad' },
    { label: 'Channels', href: '/channels', iconName: 'hash' },
    {
      label: 'Settings',
      href: '/settings',
      iconName: 'settings',
      links: [
        { label: 'Application', href: '/settings/application', iconName: 'adjustments' },
        { label: 'Announcer', href: '/settings/announcer', iconName: 'volume' },
        { label: 'Scheduler', href: '/settings/scheduler', iconName: 'clock' },
        { label: 'Discord', href: '/settings/discord', iconName: 'discord' },
        { label: 'UI', href: '/settings/ui', iconName: 'paint' }
      ]
    },
    { label: 'Info', href: '/info', iconName: 'info' },
    ...(process.env.NODE_ENV === 'development' ? [{ label: 'Dev', href: '/dev', iconName: 'code' }] : []),
  ]

  // Prevent hydration mismatch by not rendering until mounted
  if (!mounted) {
    return (
      <AppShell
        header={{ height: { base: 60, md: 0 } }}
        navbar={{
          width: { base: 200, md: 250 },
          breakpoint: 'md',
          collapsed: { mobile: true, desktop: false },
        }}
        padding="md"
      >
        <AppShell.Header hiddenFrom="md" withBorder={false} style={{ backgroundColor: '#241459' }}>
          <Group h="100%" px="md">
            <Burger opened={false} onClick={() => {}} size="sm" aria-label="Open navigation" color="#F5F5F5" />
            <Image
              src="/logo.svg"
              alt="MatchExec Logo"
              w={40}
              h={40}
              fit="contain"
            />
          </Group>
        </AppShell.Header>
        <AppShell.Navbar p="md" withBorder={false} style={{ backgroundColor: '#241459', color: '#F5F5F5' }}>
          <AppShell.Section>
            <Group mb="md" justify="center" hiddenFrom="base" visibleFrom="md">
              <Image
                src="/logo.svg"
                alt="MatchExec Logo"
                w={80}
                h={80}
                fit="contain"
              />
            </Group>
          </AppShell.Section>
          <AppShell.Section grow />
          <AppShell.Section>
            <Group mt="md" justify="center">
              <ActionIcon variant="outline" size={30} onClick={() => {}} c="#F5F5F5" style={{ borderColor: '#F5F5F5' }}>
                <IconMoon size="16" />
              </ActionIcon>
            </Group>
          </AppShell.Section>
        </AppShell.Navbar>
        <AppShell.Main>{children}</AppShell.Main>
      </AppShell>
    )
  }

  return (
    <AppShell
      header={{ height: { base: 60, md: 0 } }}
      navbar={{
        width: { base: 200, md: 250 },
        breakpoint: 'md',
        collapsed: { mobile: !opened, desktop: false },
      }}
      padding="md"
    >
      <AppShell.Header hiddenFrom="md" withBorder={false} style={{ backgroundColor: '#241459' }}>
        <Group h="100%" px="md">
          <Burger 
            opened={opened} 
            onClick={toggle} 
            size="sm"
            aria-label="Open navigation"
            color="#F5F5F5"
          />
          <Image
            src="/logo.svg"
            alt="MatchExec Logo"
            w={40}
            h={40}
            fit="contain"
          />
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="md" withBorder={false} style={{ backgroundColor: '#241459', color: '#F5F5F5' }}>
        <AppShell.Section>
          <Group mb="xs" justify="center" hiddenFrom="base" visibleFrom="md">
            <Image
              src="/logo.svg"
              alt="MatchExec Logo"
              w={140}
              h={140}
              fit="contain"
            />
          </Group>
        </AppShell.Section>

        <AppShell.Section grow>
          {navigationItems.map((item) => {
            // If item has links, don't handle click on parent (let it toggle)
            // const hasChildren = item.links && item.links.length > 0;
            const isSettingsPage = pathname?.startsWith('/settings');
            const isTournamentsPage = pathname?.startsWith('/tournaments');
            const isMatchesPage = pathname?.startsWith('/matches');
            
            return (
              <div key={item.href}>
                <NavLink
                  href={item.href}
                  label={item.label}
                  leftSection={React.createElement(getIcon(item.iconName), { size: "1rem" })}
                  active={mounted && (
                    pathname === item.href ||
                    (item.href === '/settings' && pathname?.startsWith('/settings')) ||
                    (item.href === '/tournaments' && pathname?.startsWith('/tournaments')) ||
                    (item.href === '/matches' && pathname?.startsWith('/matches'))
                  )}
                  childrenOffset={0}
                  c="#F5F5F5"
                  styles={{
                    root: {
                      '&:hover': {
                        backgroundColor: '#3d2563 !important'
                      },
                      '&[dataActive="true"]': {
                        backgroundColor: '#4c1d95 !important'
                      }
                    }
                  }}
                  onClick={(event) => {
                    event.preventDefault()
                    router.push(item.href)
                    if (opened) toggle() // Close mobile menu after navigation only if open
                  }}
                />
                {/* Show nested links based on current page */}
                {item.links && (
                  (item.href === '/settings' && isSettingsPage) ||
                  (item.href === '/tournaments' && isTournamentsPage) ||
                  (item.href === '/matches' && isMatchesPage)
                ) && item.links.map((link) => (
                  <NavLink
                    key={link.href}
                    href={link.href}
                    label={link.label}
                    leftSection={React.createElement(getIcon(link.iconName), { size: "1rem" })}
                    active={mounted && pathname === link.href}
                    pl="xl"
                    c="#F5F5F5"
                    styles={{
                      root: {
                        '&:hover': {
                          backgroundColor: '#3d2563 !important'
                        },
                        '&[dataActive="true"]': {
                          backgroundColor: '#4c1d95 !important'
                        }
                      }
                    }}
                    onClick={(event) => {
                      event.preventDefault()
                      router.push(link.href)
                      if (opened) toggle() // Close mobile menu after navigation only if open
                    }}
                  />
                ))}
              </div>
            );
          })}
        </AppShell.Section>

        <AppShell.Section>
          {versionInfo && (
            <div 
              title={`Branch: ${versionInfo.branch} | Commit: ${versionInfo.commitHash}`}
              style={{
                fontSize: '11px',
                fontFamily: 'monospace',
                color: '#C1C2C5',
                textAlign: 'center',
                marginBottom: '8px',
                cursor: 'help'
              }}
            >
              {versionInfo.version}
            </div>
          )}
          <Group mt="md" justify="center">
            <ActionIcon
              variant="outline"
              size={30}
              onClick={() => toggleColorScheme()}
              c="#F5F5F5"
              style={{ borderColor: '#F5F5F5' }}
            >
              {mounted ? (
                colorScheme === 'dark' ? <IconSun size="16" /> : <IconMoon size="16" />
              ) : (
                <IconMoon size="16" />
              )}
            </ActionIcon>
          </Group>
        </AppShell.Section>
      </AppShell.Navbar>

      <AppShell.Main>{children}</AppShell.Main>
    </AppShell>
  )
}