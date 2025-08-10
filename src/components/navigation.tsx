'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import {
  AppShell,
  Text,
  NavLink,
  Burger,
  Group,
  ActionIcon,
  useMantineColorScheme
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import {
  IconTournament,
  IconDeviceGamepad2,
  IconSettings,
  IconCode,
  IconSun,
  IconMoon,
  IconHistory
} from '@tabler/icons-react'

interface NavigationProps {
  children: React.ReactNode
}

export function Navigation({ children }: NavigationProps) {
  const [opened, { toggle }] = useDisclosure(false)
  const { colorScheme, toggleColorScheme } = useMantineColorScheme()
  const router = useRouter()
  const pathname = usePathname()
  const [mounted, setMounted] = useState(false)

  // Fix hydration issues by ensuring component is mounted on client
  useEffect(() => {
    setMounted(true)
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
    { label: 'Settings', href: '/settings', icon: IconSettings },
    { label: 'Dev', href: '/dev', icon: IconCode },
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
        <AppShell.Header hiddenFrom="md">
          <Group h="100%" px="md" justify="space-between">
            <Group>
              <Burger opened={false} onClick={() => {}} size="sm" aria-label="Open navigation" />
              <Text size="lg" fw={700}>MatchExec</Text>
            </Group>
            <ActionIcon variant="outline" size={30} onClick={() => {}} aria-label="Toggle color scheme">
              <IconMoon size="16" />
            </ActionIcon>
          </Group>
        </AppShell.Header>
        <AppShell.Navbar p="md">
          <AppShell.Section>
            <Group mb="md" visibleFrom="md">
              <Text size="xl" fw={700}>MatchExec</Text>
            </Group>
          </AppShell.Section>
          <AppShell.Section grow />
          <AppShell.Section>
            <Group mt="md">
              <ActionIcon variant="outline" size={30} onClick={() => {}}>
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
      <AppShell.Header hiddenFrom="md">
        <Group h="100%" px="md" justify="space-between">
          <Group>
            <Burger 
              opened={opened} 
              onClick={toggle} 
              size="sm"
              aria-label="Open navigation"
            />
            <Text size="lg" fw={700}>MatchExec</Text>
          </Group>
          <ActionIcon
            variant="outline"
            size={30}
            onClick={() => toggleColorScheme()}
            aria-label="Toggle color scheme"
          >
            {mounted ? (
              colorScheme === 'dark' ? <IconSun size="16" /> : <IconMoon size="16" />
            ) : (
              <IconMoon size="16" />
            )}
          </ActionIcon>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="md">
        <AppShell.Section>
          <Group mb="md" visibleFrom="md">
            <Text size="xl" fw={700}>MatchExec</Text>
          </Group>
        </AppShell.Section>

        <AppShell.Section grow>
          {navigationItems.map((item) => {
            // If item has links, don't handle click on parent (let it toggle)
            const hasChildren = item.links && item.links.length > 0;
            
            return (
              <div key={item.href}>
                <NavLink
                  href={item.href}
                  label={item.label}
                  leftSection={<item.icon size="1rem" />}
                  active={mounted && pathname === item.href}
                  childrenOffset={0}
                  onClick={(event) => {
                    event.preventDefault()
                    router.push(item.href)
                    if (opened) toggle() // Close mobile menu after navigation only if open
                  }}
                />
                {item.links?.map((link) => (
                  <NavLink
                    key={link.href}
                    href={link.href}
                    label={link.label}
                    leftSection={<link.icon size="1rem" />}
                    active={mounted && pathname === link.href}
                    pl="xl"
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
          <Group mt="md">
            <ActionIcon
              variant="outline"
              size={30}
              onClick={() => toggleColorScheme()}
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