'use client'

import { logger } from '@/lib/logger/client';
import React, { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import {
  AppShell,
  NavLink,
  Burger,
  Group,
  ActionIcon,
  useMantineColorScheme,
  Image,
  Drawer,
  Stack
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
import { getVersionInfo } from '@/lib/version-client';

interface NavItemData {
  href: string;
  label: string;
  iconName: string;
  links?: Array<{ href: string; label: string; iconName: string }>;
}

interface NavRenderContext {
  pathname: string | null;
  mounted: boolean;
  iconSize: string;
  fontSize: string | undefined;
  onNavigate?: () => void;
  router: ReturnType<typeof useRouter>;
  getIcon: (name: string) => React.ComponentType<{ size: string }>;
}

function isNavSectionActive(itemHref: string, pathname: string | null): boolean {
  if (itemHref === '/settings') return Boolean(pathname?.startsWith('/settings'));
  if (itemHref === '/tournaments') return Boolean(pathname?.startsWith('/tournaments'));
  if (itemHref === '/matches') return Boolean(pathname?.startsWith('/matches'));
  return false;
}

function SubNavLink({ link, ctx }: { link: { href: string; label: string; iconName: string }; ctx: NavRenderContext }) {
  const isActive = ctx.mounted && ctx.pathname === link.href;
  return (
    <NavLink
      href={link.href}
      label={link.label}
      leftSection={React.createElement(ctx.getIcon(link.iconName), { size: ctx.iconSize })}
      pl="xl"
      c={isActive ? '#f7cc02' : '#F5F5F5'}
      fw={isActive ? 700 : 400}
      fz={ctx.fontSize}
      onClick={(event) => {
        event.preventDefault();
        ctx.router.push(link.href);
        ctx.onNavigate?.();
      }}
    />
  );
}

function NavItem({ item, ctx }: { item: NavItemData; ctx: NavRenderContext }) {
  const sectionActive = isNavSectionActive(item.href, ctx.pathname);
  const isActive = ctx.mounted && (ctx.pathname === item.href || sectionActive);
  const shouldShowLinks = Boolean(item.links) && sectionActive;

  return (
    <div key={item.href}>
      <NavLink
        href={item.href}
        label={item.label}
        leftSection={React.createElement(ctx.getIcon(item.iconName), { size: ctx.iconSize })}
        childrenOffset={0}
        c={isActive ? '#f7cc02' : '#F5F5F5'}
        fw={isActive ? 700 : 400}
        fz={ctx.fontSize}
        onClick={(event) => {
          event.preventDefault();
          ctx.router.push(item.href);
          ctx.onNavigate?.();
        }}
      />
      {shouldShowLinks && item.links?.map((link) => (
        <SubNavLink key={link.href} link={link} ctx={ctx} />
      ))}
    </div>
  );
}

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
        <AppShell.Header hiddenFrom="md" withBorder={false} style={{ background: '#241459' }}>
          <Group h="100%" px="md">
            <Image
              src="/logo.svg"
              alt="MatchExec Logo"
              w={40}
              h={40}
              fit="contain"
            />
            <Burger opened={false} onClick={() => {}} size="sm" aria-label="Open navigation" color="#F5F5F5" />
          </Group>
        </AppShell.Header>
        <AppShell.Navbar p="md" withBorder={false} style={{ background: 'linear-gradient(180deg, #1a0e3d 0%, #241459 40%, #2d1b69 100%)', color: '#F5F5F5', borderRight: '1px solid rgba(124, 58, 237, 0.2)' }}>
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

  const renderNavItems = (options?: { onNavigate?: () => void; large?: boolean }) => {
    const ctx: NavRenderContext = {
      pathname,
      mounted,
      iconSize: options?.large ? '1.25rem' : '1rem',
      fontSize: options?.large ? '1rem' : undefined,
      onNavigate: options?.onNavigate,
      router,
      getIcon
    };
    return navigationItems.map((item) => <NavItem key={item.href} item={item} ctx={ctx} />);
  };

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
      <AppShell.Header hiddenFrom="md" withBorder={false} style={{ background: '#241459', zIndex: 301 }}>
        <Group h="100%" px="md">
          <Link href="/" style={{ display: 'flex' }}>
            <Image
              src="/logo.svg"
              alt="MatchExec Logo"
              w={40}
              h={40}
              fit="contain"
            />
          </Link>
          <Burger
            opened={opened}
            onClick={toggle}
            size="sm"
            aria-label="Toggle navigation"
            color="#F5F5F5"
          />
        </Group>
      </AppShell.Header>

      {/* Mobile Drawer */}
      <Drawer
        opened={opened}
        onClose={toggle}
        position="left"
        size="45%"
        withCloseButton={false}
        hiddenFrom="md"
        styles={{
          body: {
            background: 'linear-gradient(180deg, #1a0e3d 0%, #241459 40%, #2d1b69 100%)',
            height: 'calc(100% - 60px - env(safe-area-inset-top))',
            padding: 0,
            display: 'flex',
            flexDirection: 'column'
          },
          content: {
            background: 'linear-gradient(180deg, #1a0e3d 0%, #241459 40%, #2d1b69 100%)',
            marginTop: 'calc(60px + env(safe-area-inset-top))',
            height: 'calc(100% - 60px - env(safe-area-inset-top))'
          },
          inner: { top: 0 },
          overlay: {
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
            marginTop: 'calc(60px + env(safe-area-inset-top))'
          },
        }}
        transitionProps={{ transition: 'slide-right', duration: 250 }}
      >
        {/* Drawer Nav Items */}
        <Stack gap={4} style={{ flex: 1, overflowY: 'auto' }} p="md" pt="xs">
          {renderNavItems({ onNavigate: toggle, large: true })}
        </Stack>

        {/* Drawer Footer */}
        <div style={{ padding: '16px' }}>
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
          <Group justify="center">
            <ActionIcon
              variant="outline"
              size={30}
              onClick={() => toggleColorScheme()}
              c="#F5F5F5"
              style={{ borderColor: '#F5F5F5' }}
            >
              {colorScheme === 'dark' ? <IconSun size="16" /> : <IconMoon size="16" />}
            </ActionIcon>
          </Group>
        </div>
      </Drawer>

      {/* Desktop Sidebar */}
      <AppShell.Navbar p="md" withBorder={false} style={{ background: 'linear-gradient(180deg, #1a0e3d 0%, #241459 40%, #2d1b69 100%)', color: '#F5F5F5', borderRight: '1px solid rgba(124, 58, 237, 0.2)' }}>
        <AppShell.Section>
          <Group mb="xs" justify="center">
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
          {renderNavItems({})}
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
              {colorScheme === 'dark' ? <IconSun size="16" /> : <IconMoon size="16" />}
            </ActionIcon>
          </Group>
        </AppShell.Section>
      </AppShell.Navbar>

      <AppShell.Main>{children}</AppShell.Main>
    </AppShell>
  )
}