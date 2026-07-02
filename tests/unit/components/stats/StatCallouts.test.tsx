import { describe, it, expect, afterEach } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MantineProvider } from '@mantine/core';
import { StatCallouts, type PlayerStatEntry } from '../../../../src/components/stats/StatCallouts';
import type { GameStatDefinition } from '../../../../shared/types';

const roots: Root[] = [];
const divs: HTMLDivElement[] = [];

afterEach(() => {
  act(() => { roots.forEach(r => r.unmount()); });
  divs.forEach(d => d.remove());
  roots.length = 0;
  divs.length = 0;
});

function renderWithMantine(element: React.ReactElement): HTMLDivElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  divs.push(container);
  act(() => {
    const root = createRoot(container);
    roots.push(root);
    root.render(<MantineProvider>{element}</MantineProvider>);
  });
  return container;
}

function makeStatDef(overrides: Partial<GameStatDefinition> = {}): GameStatDefinition {
  return {
    id: 'def-1',
    game_id: 'ow',
    name: 'kills',
    display_name: 'Kills',
    stat_type: 'integer',
    sort_order: 1,
    is_primary: true,
    ...overrides,
  };
}

function makePlayer(overrides: Partial<PlayerStatEntry> = {}): PlayerStatEntry {
  return {
    participantId: 'p-1',
    username: 'Alice',
    team: 'blue',
    stats: { kills: 10 },
    ...overrides,
  };
}

describe('StatCallouts', () => {
  it('returns null when players array is empty', () => {
    const container = renderWithMantine(
      <StatCallouts players={[]} statDefs={[makeStatDef()]} />
    );
    expect(container.querySelector('[class*="mantine-Card"]')).toBeNull();
  });

  it('returns null when no primary statDefs', () => {
    const container = renderWithMantine(
      <StatCallouts
        players={[makePlayer()]}
        statDefs={[makeStatDef({ is_primary: false })]}
      />
    );
    expect(container.querySelector('[class*="mantine-Card"]')).toBeNull();
  });

  it('returns null when all top values are 0', () => {
    const container = renderWithMantine(
      <StatCallouts
        players={[makePlayer({ stats: { kills: 0 } })]}
        statDefs={[makeStatDef()]}
      />
    );
    expect(container.querySelector('[class*="mantine-Card"]')).toBeNull();
  });

  it('renders a callout card for each primary stat with a positive top value', () => {
    const statDefs = [
      makeStatDef({ id: 'd-1', name: 'kills', display_name: 'Kills' }),
      makeStatDef({ id: 'd-2', name: 'assists', display_name: 'Assists' }),
    ];
    const players = [makePlayer({ stats: { kills: 10, assists: 5 } })];
    const container = renderWithMantine(
      <StatCallouts players={players} statDefs={statDefs} />
    );
    expect(container.textContent).toContain('Most Kills');
    expect(container.textContent).toContain('Most Assists');
  });

  it('shows the top player name for each stat', () => {
    const players = [
      makePlayer({ participantId: 'p-1', username: 'Alice', stats: { kills: 20 } }),
      makePlayer({ participantId: 'p-2', username: 'Bob', team: 'red', stats: { kills: 10 } }),
    ];
    const container = renderWithMantine(
      <StatCallouts players={players} statDefs={[makeStatDef()]} />
    );
    expect(container.textContent).toContain('Alice');
    expect(container.textContent).not.toContain('Bob');
  });

  it('shows top value formatted correctly (integer)', () => {
    const container = renderWithMantine(
      <StatCallouts
        players={[makePlayer({ stats: { kills: 17 } })]}
        statDefs={[makeStatDef()]}
      />
    );
    expect(container.textContent).toContain('17');
  });

  it('formats thousands stat values with K suffix', () => {
    const container = renderWithMantine(
      <StatCallouts
        players={[makePlayer({ stats: { damage: 22500 } })]}
        statDefs={[makeStatDef({ name: 'damage', display_name: 'Damage', format: 'thousands' })]}
      />
    );
    expect(container.textContent).toContain('22.5K');
  });

  it('formats percentage stat values with % suffix', () => {
    const container = renderWithMantine(
      <StatCallouts
        players={[makePlayer({ stats: { accuracy: 68 } })]}
        statDefs={[makeStatDef({ name: 'accuracy', display_name: 'Accuracy', format: 'percentage' })]}
      />
    );
    expect(container.textContent).toContain('68%');
  });

  it('skips non-primary stat defs', () => {
    const statDefs = [
      makeStatDef({ id: 'd-1', name: 'kills', display_name: 'Kills', is_primary: true }),
      makeStatDef({ id: 'd-2', name: 'deaths', display_name: 'Deaths', is_primary: false }),
    ];
    const container = renderWithMantine(
      <StatCallouts
        players={[makePlayer({ stats: { kills: 10, deaths: 5 } })]}
        statDefs={statDefs}
      />
    );
    expect(container.textContent).toContain('Most Kills');
    expect(container.textContent).not.toContain('Most Deaths');
  });

  it('is a function component', () => {
    expect(typeof StatCallouts).toBe('function');
  });
});
