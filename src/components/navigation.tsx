'use client'

import { logger } from '@/lib/logger/client';
import React, { useState, useEffect, useMemo } from 'react'
import type { JSX } from 'react';
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
  Stack,
  Tooltip,
  UnstyledButton,
  Avatar,
  ScrollArea,
  Text
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
  IconSwords,
  IconDatabaseExport,
  IconChartBar,
  IconRss,
  IconTimeline,
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
  desktopCollapsed: boolean;
}

function isNavSectionActive(itemHref: string, pathname: string | null): boolean {
  if (itemHref === '/settings') return Boolean(pathname?.startsWith('/settings'));
  if (itemHref === '/tournaments') return Boolean(pathname?.startsWith('/tournaments'));
  if (itemHref === '/matches') return Boolean(pathname?.startsWith('/matches'));
  if (itemHref === '/series') return Boolean(pathname?.startsWith('/series'));
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

  if (ctx.desktopCollapsed) {
    return (
      <Tooltip key={item.href} label={item.label} position="right" withArrow>
        <UnstyledButton
          className="sidebar-icon-btn"
          onClick={() => {
            ctx.router.push(item.href);
            ctx.onNavigate?.();
          }}
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            width: '100%',
            height: 40,
            borderRadius: 8,
            color: isActive ? '#f7cc02' : '#F5F5F5',
            background: isActive
              ? 'linear-gradient(135deg, rgba(109, 40, 217, 0.7), rgba(76, 29, 149, 0.5))'
              : 'transparent',
          }}
        >
          {React.createElement(ctx.getIcon(item.iconName), { size: ctx.iconSize })}
        </UnstyledButton>
      </Tooltip>
    );
  }

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

// Icon map defined once outside the component — avoids object recreation on every render
const ICON_MAP: Record<string, React.ComponentType<{ size: string }>> = {
  home: IconHome,
  feed: IconRss,
  swords: IconSwords,
  history: IconHistory,
  trophy: IconTrophy,
  series: IconTimeline,
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
  database: IconDatabaseExport,
  chart: IconChartBar,
};

function getIcon(name: string): React.ComponentType<{ size: string }> {
  return ICON_MAP[name] ?? IconHome;
}

// Static navigation structure — defined outside the component so it's never re-allocated
const STATIC_NAV_ITEMS: NavItemData[] = [
  { label: 'Home',        href: '/',            iconName: 'home' },
  { label: 'Feed',        href: '/feed',         iconName: 'feed' },
  {
    label: 'Matches',
    href: '/matches',
    iconName: 'swords',
    links: [{ label: 'History', href: '/matches/history', iconName: 'history' }],
  },
  {
    label: 'Tournaments',
    href: '/tournaments',
    iconName: 'trophy',
    links: [{ label: 'History', href: '/tournaments/history', iconName: 'history' }],
  },
  {
    label: 'Series',
    href: '/series',
    iconName: 'series',
    links: [{ label: 'History', href: '/series/history', iconName: 'history' }],
  },
  { label: 'Games',    href: '/games',    iconName: 'gamepad' },
  { label: 'Channels', href: '/channels', iconName: 'hash' },
  { label: 'Info',     href: '/info',     iconName: 'info' },
  {
    label: 'Settings',
    href: '/settings',
    iconName: 'settings',
    links: [
      { label: 'Application',   href: '/settings/application',   iconName: 'adjustments' },
      { label: 'Stats',         href: '/settings/stats',         iconName: 'chart' },
      { label: 'Announcer',     href: '/settings/announcer',     iconName: 'volume' },
      { label: 'Discord',       href: '/settings/discord',       iconName: 'discord' },
      { label: 'Scheduler',     href: '/settings/scheduler',     iconName: 'clock' },
      { label: 'UI',            href: '/settings/ui',            iconName: 'paint' },
      { label: 'Backup & Restore', href: '/settings/backup-restore', iconName: 'database' },
    ],
  },
];

interface NavigationProps {
  children: React.ReactNode
}

export function Navigation({ children }: NavigationProps): JSX.Element {
  const [opened, { toggle }] = useDisclosure(false)
  const { colorScheme, toggleColorScheme } = useMantineColorScheme()
  const router = useRouter()
  const pathname = usePathname()
  const [mounted, setMounted] = useState(false)
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null)
  const [desktopCollapsed, setDesktopCollapsed] = useState(false)

  // Delay rendering until client is mounted to avoid hydration mismatches
  // rAF defers the setState call out of the synchronous effect body, satisfying the
  // react-compiler rule while still giving us the client-only flag we need.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const saved = localStorage.getItem('sidebar-collapsed');
      if (saved === 'true') setDesktopCollapsed(true);
      setMounted(true);
    });

    // Fetch version info from API
    getVersionInfo().then(setVersionInfo).catch((error) => {
      logger.error('Failed to fetch version info:', error);
    });

    return () => cancelAnimationFrame(frame);
  }, [])

  const toggleDesktopSidebar = () => {
    setDesktopCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('sidebar-collapsed', String(next));
      return next;
    });
  };

  // Append dev-only item at runtime so the static array stays pure
  const navigationItems = useMemo(() => [
    ...STATIC_NAV_ITEMS,
    ...(process.env.NODE_ENV === 'development' ? [{ label: 'Dev', href: '/dev', iconName: 'code' }] : []),
  ], [])

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

  const renderNavItems = (options?: { onNavigate?: () => void; large?: boolean; collapsed?: boolean }) => {
    const ctx: NavRenderContext = {
      pathname,
      mounted,
      iconSize: options?.large ? '1.25rem' : '1rem',
      fontSize: options?.large ? '1rem' : undefined,
      onNavigate: options?.onNavigate,
      router,
      getIcon,
      desktopCollapsed: options?.collapsed ?? false,
    };
    return navigationItems.map((item) => <NavItem key={item.href} item={item} ctx={ctx} />);
  };

  return (
    <>
    <style>{`
      .nav-update-badge-dot {
        display: inline-block;
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: var(--mantine-color-orange-5, #f97316);
        flex-shrink: 0;
        animation: navUpdatePulse 2s ease-in-out infinite;
      }
      @keyframes navUpdatePulse {
        0%, 100% { opacity: 1; }
        50%       { opacity: 0.35; }
      }
    `}</style>
    <AppShell
      header={{ height: { base: 60, md: 0 } }}
      navbar={{
        width: { base: 200, md: desktopCollapsed ? 60 : 250 },
        breakpoint: 'md',
        collapsed: { mobile: true, desktop: false },
      }}
      transitionDuration={250}
      transitionTimingFunction="ease"
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
        <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {/* Gradient separator */}
          <div style={{
            height: '1px',
            background: 'linear-gradient(90deg, transparent, rgba(124, 58, 237, 0.55), rgba(247, 204, 2, 0.25), transparent)',
          }} />

          {/* Version + theme toggle row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
            {versionInfo ? (
              versionInfo.updateAvailable ? (
                <Tooltip label={`Update available: ${versionInfo.latestVersion}`} position="top" withArrow>
                  <div
                    onClick={() => router.push('/feed')}
                    style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer', userSelect: 'none' }}
                  >
                    <span style={{ fontSize: '11px', fontFamily: 'monospace', color: '#f7cc02' }}>{versionInfo.version}</span>
                    <span className="nav-update-badge-dot" />
                  </div>
                </Tooltip>
              ) : (
                <div
                  title={versionInfo.isDev ? `Branch: ${versionInfo.branch} | Commit: ${versionInfo.commitHash}` : `Branch: ${versionInfo.branch} | Env: ${versionInfo.platform ?? 'unknown'}`}
                  style={{ fontSize: '11px', fontFamily: 'monospace', color: '#f7cc02', cursor: 'help', userSelect: 'none' }}
                >
                  {versionInfo.version}
                </div>
              )
            ) : <div />}

            {/* Sun / Moon pill toggle */}
            <div
              onClick={() => toggleColorScheme()}
              role="button"
              aria-label="Toggle color scheme"
              style={{
                display: 'flex', alignItems: 'center',
                background: 'rgba(0, 0, 0, 0.3)',
                border: '1px solid rgba(124, 58, 237, 0.4)',
                borderRadius: '20px', padding: '3px', gap: '2px', cursor: 'pointer',
              }}
            >
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: '24px', height: '24px', borderRadius: '50%',
                background: colorScheme === 'light' ? 'rgba(247, 204, 2, 0.22)' : 'transparent',
                color: colorScheme === 'light' ? '#f7cc02' : 'rgba(245, 245, 245, 0.28)',
                transition: 'all 200ms ease',
              }}>
                <IconSun size="14" />
              </div>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: '24px', height: '24px', borderRadius: '50%',
                background: colorScheme === 'dark' ? 'rgba(124, 58, 237, 0.4)' : 'transparent',
                color: colorScheme === 'dark' ? '#c084fc' : 'rgba(245, 245, 245, 0.28)',
                transition: 'all 200ms ease',
              }}>
                <IconMoon size="14" />
              </div>
            </div>
          </div>

          {/* User card */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '9px',
            padding: '7px 8px', borderRadius: '8px',
            background: 'rgba(124, 58, 237, 0.09)',
            border: '1px solid rgba(124, 58, 237, 0.18)',
          }}>
            <Avatar
              size={34}
              radius="xl"
              style={{
                background: 'linear-gradient(135deg, rgba(109, 40, 217, 0.7), rgba(76, 29, 149, 0.5))',
                border: '2px solid rgba(124, 58, 237, 0.5)',
                fontSize: '17px',
                flexShrink: 0,
              }}
            >
              👽
            </Avatar>
            <Text fw={600} c="#F5F5F5" style={{ lineHeight: 1.25, fontSize: '13px' }}>
              Space Man
            </Text>
          </div>
        </div>
      </Drawer>

      {/* Desktop Sidebar */}
      <AppShell.Navbar p={desktopCollapsed ? 'xs' : 'md'} withBorder={false} style={{ background: 'linear-gradient(180deg, #1a0e3d 0%, #241459 40%, #2d1b69 100%)', color: '#F5F5F5', borderRight: '1px solid rgba(124, 58, 237, 0.2)' }}>
        <AppShell.Section>
          <Group mb="xs" justify="center">
            <Tooltip label={desktopCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} position="right" withArrow>
              <UnstyledButton onClick={toggleDesktopSidebar} style={{ display: 'flex', cursor: 'pointer' }}>
                <Image
                  src="/logo.svg"
                  alt="MatchExec Logo"
                  w={desktopCollapsed ? 36 : 140}
                  h={desktopCollapsed ? 36 : 140}
                  fit="contain"
                  style={{ transition: 'width 250ms ease, height 250ms ease' }}
                />
              </UnstyledButton>
            </Tooltip>
          </Group>
        </AppShell.Section>

        <AppShell.Section grow component={ScrollArea}>
          {renderNavItems({ collapsed: desktopCollapsed })}
        </AppShell.Section>

        <AppShell.Section>
          <div style={{ padding: desktopCollapsed ? '12px 6px' : '12px 12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {/* Gradient separator */}
            <div style={{
              height: '1px',
              background: 'linear-gradient(90deg, transparent, rgba(124, 58, 237, 0.55), rgba(247, 204, 2, 0.25), transparent)',
            }} />

            {/* Version + theme toggle row (expanded) */}
            {!desktopCollapsed && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                {versionInfo ? (
                  versionInfo.updateAvailable ? (
                    <Tooltip label={`Update available: ${versionInfo.latestVersion}`} position="top" withArrow>
                      <div
                        onClick={() => router.push('/feed')}
                        style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer', userSelect: 'none' }}
                      >
                        <span style={{ fontSize: '11px', fontFamily: 'monospace', color: '#f7cc02' }}>{versionInfo.version}</span>
                        <span className="nav-update-badge-dot" />
                      </div>
                    </Tooltip>
                  ) : (
                    <Tooltip label={versionInfo.isDev ? `Branch: ${versionInfo.branch} | Commit: ${versionInfo.commitHash}` : `Branch: ${versionInfo.branch} | Env: ${versionInfo.platform ?? 'unknown'}`} position="top" withArrow>
                      <div style={{ fontSize: '11px', fontFamily: 'monospace', color: '#f7cc02', cursor: 'help', userSelect: 'none' }}>
                        {versionInfo.version}
                      </div>
                    </Tooltip>
                  )
                ) : <div />}

                {/* Sun / Moon pill toggle */}
                <div
                  onClick={() => toggleColorScheme()}
                  role="button"
                  aria-label="Toggle color scheme"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    background: 'rgba(0, 0, 0, 0.3)',
                    border: '1px solid rgba(124, 58, 237, 0.4)',
                    borderRadius: '20px',
                    padding: '3px',
                    gap: '2px',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: '24px', height: '24px', borderRadius: '50%',
                    background: colorScheme === 'light' ? 'rgba(247, 204, 2, 0.22)' : 'transparent',
                    color: colorScheme === 'light' ? '#f7cc02' : 'rgba(245, 245, 245, 0.28)',
                    transition: 'all 200ms ease',
                  }}>
                    <IconSun size="14" />
                  </div>
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: '24px', height: '24px', borderRadius: '50%',
                    background: colorScheme === 'dark' ? 'rgba(124, 58, 237, 0.4)' : 'transparent',
                    color: colorScheme === 'dark' ? '#c084fc' : 'rgba(245, 245, 245, 0.28)',
                    transition: 'all 200ms ease',
                  }}>
                    <IconMoon size="14" />
                  </div>
                </div>
              </div>
            )}

            {/* Collapsed: update badge dot */}
            {desktopCollapsed && versionInfo?.updateAvailable && (
              <Tooltip label={`Update available: ${versionInfo.latestVersion}`} position="right" withArrow>
                <div
                  onClick={() => router.push('/feed')}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', margin: '0 auto' }}
                >
                  <span className="nav-update-badge-dot" />
                </div>
              </Tooltip>
            )}

            {/* Collapsed: centered theme toggle */}
            {desktopCollapsed && (
              <Tooltip label={colorScheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} position="right" withArrow>
                <div
                  onClick={() => toggleColorScheme()}
                  role="button"
                  aria-label="Toggle color scheme"
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: '36px', height: '36px', margin: '0 auto',
                    borderRadius: '10px',
                    background: 'rgba(0, 0, 0, 0.3)',
                    border: '1px solid rgba(124, 58, 237, 0.4)',
                    color: colorScheme === 'dark' ? '#c084fc' : '#f7cc02',
                    cursor: 'pointer',
                    transition: 'all 200ms ease',
                  }}
                >
                  {colorScheme === 'dark' ? <IconSun size="15" /> : <IconMoon size="15" />}
                </div>
              </Tooltip>
            )}

            {/* User card */}
            <Tooltip label="Space Man" position="right" withArrow disabled={!desktopCollapsed}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: desktopCollapsed ? 0 : '9px',
                justifyContent: desktopCollapsed ? 'center' : 'flex-start',
                padding: desktopCollapsed ? '5px' : '7px 8px',
                borderRadius: '8px',
                background: 'rgba(124, 58, 237, 0.09)',
                border: '1px solid rgba(124, 58, 237, 0.18)',
              }}>
                <Avatar
                  size={desktopCollapsed ? 30 : 34}
                  radius="xl"
                  style={{
                    background: 'linear-gradient(135deg, rgba(109, 40, 217, 0.7), rgba(76, 29, 149, 0.5))',
                    border: '2px solid rgba(124, 58, 237, 0.5)',
                    fontSize: desktopCollapsed ? '14px' : '17px',
                    flexShrink: 0,
                  }}
                >
                  👽
                </Avatar>
                {!desktopCollapsed && (
                  <Text fw={600} c="#F5F5F5" style={{ lineHeight: 1.25, fontSize: '13px' }}>
                    Space Man
                  </Text>
                )}
              </div>
            </Tooltip>
          </div>
        </AppShell.Section>
      </AppShell.Navbar>

      <AppShell.Main>{children}</AppShell.Main>
    </AppShell>
    </>
  )
}