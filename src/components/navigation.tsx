'use client'

import { useRouter, usePathname } from 'next/navigation'
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
            <Burger opened={opened} onClick={toggle} size="sm" />
            <Text size="lg" fw={700}>MatchExec</Text>
          </Group>
          <ActionIcon
            variant="outline"
            size={30}
            onClick={() => toggleColorScheme()}
          >
            {colorScheme === 'dark' ? <IconSun size="16" /> : <IconMoon size="16" />}
          </ActionIcon>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="md">
        <AppShell.Section>
          <Group justify="space-between" mb="md" visibleFrom="md">
            <Text size="xl" fw={700}>MatchExec</Text>
            <ActionIcon
              variant="outline"
              size={30}
              onClick={() => toggleColorScheme()}
            >
              {colorScheme === 'dark' ? <IconSun size="16" /> : <IconMoon size="16" />}
            </ActionIcon>
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
                  active={pathname === item.href}
                  childrenOffset={0}
                  onClick={(event) => {
                    event.preventDefault()
                    router.push(item.href)
                    toggle() // Close mobile menu after navigation
                  }}
                />
                {item.links?.map((link) => (
                  <NavLink
                    key={link.href}
                    href={link.href}
                    label={link.label}
                    leftSection={<link.icon size="1rem" />}
                    active={pathname === link.href}
                    pl="xl"
                    onClick={(event) => {
                      event.preventDefault()
                      router.push(link.href)
                      toggle() // Close mobile menu after navigation
                    }}
                  />
                ))}
              </div>
            );
          })}
        </AppShell.Section>
      </AppShell.Navbar>

      <AppShell.Main>{children}</AppShell.Main>
    </AppShell>
  )
}