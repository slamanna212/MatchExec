'use client'

import type { JSX, ReactNode } from 'react';
import { Avatar, Card, Text } from '@mantine/core';
import { SectionLabel } from '../SectionLabel';
import classes from './ranked-table.module.css';

export interface RankedTableColumn<T> {
  key: string;
  header: ReactNode;
  /** CSS grid track size, e.g. '64px' or '84px'. */
  width: string;
  align?: 'left' | 'center' | 'right';
  render: (row: T) => ReactNode;
}

interface RankedTableProps<T> {
  rows: T[];
  getKey: (row: T) => string;
  getRank: (row: T) => number;
  /** Header label for the main (name) column, e.g. "Player" or "Team". */
  primaryHeader: string;
  renderPrimary: (row: T) => ReactNode;
  columns: RankedTableColumn<T>[];
  /** Minimum table width before it scrolls horizontally (useful with many columns). */
  minWidth?: number;
}

const RANK_COLORS: Record<number, string> = {
  1: '#fab005',
  2: '#adb5bd',
  3: '#cd7f32',
};

function RankAvatar({ rank }: { rank: number }): JSX.Element {
  const medal = RANK_COLORS[rank];
  return medal ? (
    <Avatar size={32} radius="xl" variant="filled" color={medal}>
      <Text size="sm" fw={700} c="white">{rank}</Text>
    </Avatar>
  ) : (
    <Avatar size={32} radius="xl" variant="light" color="violet">
      <Text size="sm" fw={700}>{rank}</Text>
    </Avatar>
  );
}

/**
 * Full-width standings table card shared by series standings, tournament team
 * standings and the cumulative-points leaderboard: Rank · Name · N columns.
 * Top three ranks get gold/silver/bronze avatars and the leader row is tinted.
 */
export function RankedTable<T>({
  rows,
  getKey,
  getRank,
  primaryHeader,
  renderPrimary,
  columns,
  minWidth,
}: RankedTableProps<T>): JSX.Element {
  const template = ['48px', 'minmax(120px, 1fr)', ...columns.map(c => c.width)].join(' ');
  const JUSTIFY = { left: 'start', center: 'center', right: 'end' } as const;
  const justify = (align: 'left' | 'center' | 'right' = 'left') => JUSTIFY[align];

  return (
    <Card withBorder radius="md" padding={0}>
      <div className={classes.scroller}>
        <div style={{ minWidth }}>
          <div className={`${classes.row} ${classes.header}`} style={{ gridTemplateColumns: template }}>
            <SectionLabel>Rank</SectionLabel>
            <SectionLabel>{primaryHeader}</SectionLabel>
            {columns.map(c => (
              <div key={c.key} style={{ justifySelf: justify(c.align), textAlign: c.align ?? 'left' }}>
                <SectionLabel>{c.header}</SectionLabel>
              </div>
            ))}
          </div>
          {rows.map(row => {
            const rank = getRank(row);
            return (
              <div
                key={getKey(row)}
                className={`${classes.row} ${rank === 1 ? classes.leader : ''}`}
                style={{ gridTemplateColumns: template }}
              >
                <RankAvatar rank={rank} />
                <div style={{ minWidth: 0 }}>{renderPrimary(row)}</div>
                {columns.map(c => (
                  <div key={c.key} style={{ justifySelf: justify(c.align), textAlign: c.align ?? 'left' }}>
                    {c.render(row)}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
