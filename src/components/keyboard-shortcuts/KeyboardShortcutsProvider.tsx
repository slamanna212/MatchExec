'use client'

import { useHotkeys, useDisclosure } from '@mantine/hooks';
import { useRouter } from 'next/navigation';
import { Modal, Table, Kbd, Text, Stack } from '@mantine/core';
import type { ReactNode } from 'react';

interface KeyboardShortcutsProviderProps {
  children: ReactNode;
}

const sections = [
  {
    title: 'Navigation',
    shortcuts: [
      { keys: ['T'], description: 'Go to tournaments' },
      { keys: ['M'], description: 'Go to matches' },
      { keys: ['H'], description: 'Go to home' },
      { keys: ['?'], description: 'Show this help' },
    ],
  },
  {
    title: 'Match',
    shortcuts: [
      { keys: ['Ctrl', 'Enter'], description: 'Move match to next phase' },
    ],
  },
  {
    title: 'Scoring',
    shortcuts: [
      { keys: ['↑', '↓'], description: 'Cycle maps' },
      { keys: ['1'], description: 'Blue team wins map' },
      { keys: ['2'], description: 'Red team wins map' },
    ],
  },
];

export function KeyboardShortcutsProvider({ children }: KeyboardShortcutsProviderProps) {
  const router = useRouter();
  const [opened, { open, close }] = useDisclosure(false);

  useHotkeys([
    ['t', () => router.push('/tournaments')],
    ['m', () => router.push('/matches')],
    ['h', () => router.push('/')],
    ['shift+/', open, { usePhysicalKeys: true }],
  ]);

  return (
    <>
      {children}
      <Modal
        opened={opened}
        onClose={close}
        title="Keyboard Shortcuts"
        size="sm"
      >
        <Stack gap="lg">
          {sections.map(section => (
            <div key={section.title}>
              <Text size="xs" fw={700} tt="uppercase" c="dimmed" mb="xs">
                {section.title}
              </Text>
              <Table withRowBorders={false} verticalSpacing="xs">
                <Table.Tbody>
                  {section.shortcuts.map(shortcut => (
                    <Table.Tr key={shortcut.description}>
                      <Table.Td w={120}>
                        <Text component="span" style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
                          {shortcut.keys.map((key, i) => (
                            <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                              {i > 0 && <span style={{ color: 'var(--mantine-color-dimmed)', fontSize: '0.7rem' }}>+</span>}
                              <Kbd size="xs">{key}</Kbd>
                            </span>
                          ))}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" c="dimmed">{shortcut.description}</Text>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </div>
          ))}
        </Stack>
      </Modal>
    </>
  );
}
