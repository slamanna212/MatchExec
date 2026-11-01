import type { JSX } from 'react';
import { Link } from 'react-router';
import { Anchor, Group, Text } from '@mantine/core';
import { IconTrophy } from '@tabler/icons-react';

export interface SeriesRef {
  id: string;
  name: string;
}

/**
 * Compact "part of series" line for match/tournament cards. Each series name
 * links to its page; clicks don't bubble to the card's own onClick.
 * Renders nothing when the entity isn't in any series.
 */
export function SeriesCardLinks({ series }: { series?: SeriesRef[] }): JSX.Element | null {
  if (!series || series.length === 0) return null;

  return (
    <Group gap={4} wrap="nowrap" style={{ minWidth: 0 }}>
      <IconTrophy size={12} color="var(--mantine-color-teal-6)" style={{ flexShrink: 0 }} />
      <Text size="xs" fw={500} c="teal" truncate>
        {series.map((s, i) => (
          <span key={s.id}>
            {i > 0 && ', '}
            <Anchor
              component={Link}
              to={`/series/${s.id}`}
              size="xs"
              c="teal"
              fw={500}
              onClick={(e) => e.stopPropagation()}
            >
              {s.name}
            </Anchor>
          </span>
        ))}
      </Text>
    </Group>
  );
}
