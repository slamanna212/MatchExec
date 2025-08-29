'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
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
  IconTournament,
  IconDeviceGamepad2,
  IconSettings,
  IconCode,
  IconSun,
  IconMoon,
  IconHistory,
  IconHash,
  IconApps,
  IconClock,
  IconBrandDiscord,
  IconPaint,
  IconVolume,
  IconInfoCircle
} from '@tabler/icons-react'
import { getVersionInfo, VersionInfo } from '@/lib/version-client'

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
    setMounted(true)
    
    // Fetch version info from API
    getVersionInfo().then(setVersionInfo).catch(console.error)
  }, [])

  const navigationItems = [
    { 
      label: 'Matches', 
      href: '/', 
      icon: IconTournament,
      links: [
        { label: 'History', href: '/matches/history', icon: IconHistory }
      ]
    },
    { label: 'Games', href: '/games', icon: IconDeviceGamepad2 },
    { label: 'Channels', href: '/channels', icon: IconHash },
    { 
      label: 'Settings', 
      href: '/settings', 
      icon: IconSettings,
      links: [
        { label: 'Application', href: '/settings#application', icon: IconApps },
        { label: 'Announcer', href: '/settings#announcer', icon: IconVolume },
        { label: 'Scheduler', href: '/settings#scheduler', icon: IconClock },
        { label: 'Discord', href: '/settings#discord', icon: IconBrandDiscord },
        { label: 'UI', href: '/settings#ui', icon: IconPaint }
      ]
    },
    { label: 'Info', href: '/info', icon: IconInfoCircle },
    ...(process.env.NODE_ENV === 'development' ? [{ label: 'Dev', href: '/dev', icon: IconCode }] : []),
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
        <AppShell.Header hiddenFrom="md" style={{ backgroundColor: '#241459' }}>
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
        <AppShell.Navbar p="md" style={{ backgroundColor: '#241459', color: '#F5F5F5' }}>
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
      <AppShell.Header hiddenFrom="md" style={{ backgroundColor: '#241459' }}>
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

      <AppShell.Navbar p="md" style={{ backgroundColor: '#241459', color: '#F5F5F5' }}>
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
            
            return (
              <div key={item.href}>
                <NavLink
                  href={item.href}
                  label={item.label}
                  leftSection={<item.icon size="1rem" />}
                  active={mounted && pathname === item.href}
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
                {/* Only show nested links for Settings when on settings page */}
                {item.links && (item.href === '/settings' ? isSettingsPage : true) && item.links.map((link) => (
                  <NavLink
                    key={link.href}
                    href={link.href}
                    label={link.label}
                    leftSection={<link.icon size="1rem" />}
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
                      if (link.href.includes('#')) {
                        // Handle hash links for same-page navigation
                        const [path, hash] = link.href.split('#')
                        if (pathname === path) {
                          // Already on the correct page, just scroll to section
                          const element = document.getElementById(hash)
                          if (element) {
                            element.scrollIntoView({ behavior: 'smooth', block: 'start' })
                          }
                        } else {
                          // Navigate to page with hash
                          router.push(link.href)
                        }
                      } else {
                        router.push(link.href)
                      }
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