import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MantineProvider } from '@mantine/core';
import { GameSelectionStep } from '../../../../src/components/create-match/GameSelectionStep';
import type { GameWithIcon } from '../../../../src/components/create-match/useMatchForm';

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

function makeGame(overrides: Partial<GameWithIcon> = {}): GameWithIcon {
  return {
    id: 'ow',
    name: 'Overwatch 2',
    genre: 'FPS',
    developer: 'Blizzard',
    description: 'Team-based action game',
    minPlayers: 2,
    maxPlayers: 12,
    iconUrl: '',
    coverUrl: '',
    mapCount: 30,
    modeCount: 4,
    ...overrides,
  };
}

describe('GameSelectionStep', () => {
  it('renders select game prompt', () => {
    const container = renderWithMantine(
      <GameSelectionStep games={[]} onGameSelect={vi.fn()} />
    );
    expect(container.textContent).toContain('Select the game');
  });

  it('renders each game name', () => {
    const games = [
      makeGame({ id: 'ow', name: 'Overwatch 2' }),
      makeGame({ id: 'val', name: 'Valorant', genre: 'Tactical FPS' }),
    ];
    const container = renderWithMantine(
      <GameSelectionStep games={games} onGameSelect={vi.fn()} />
    );
    expect(container.textContent).toContain('Overwatch 2');
    expect(container.textContent).toContain('Valorant');
  });

  it('renders each game genre', () => {
    const games = [makeGame({ genre: 'Battle Royale' })];
    const container = renderWithMantine(
      <GameSelectionStep games={games} onGameSelect={vi.fn()} />
    );
    expect(container.textContent).toContain('Battle Royale');
  });

  it('renders player range badge for each game', () => {
    const games = [makeGame({ minPlayers: 5, maxPlayers: 10 })];
    const container = renderWithMantine(
      <GameSelectionStep games={games} onGameSelect={vi.fn()} />
    );
    expect(container.textContent).toContain('5-10 players');
  });

  it('renders an empty list when games array is empty', () => {
    const container = renderWithMantine(
      <GameSelectionStep games={[]} onGameSelect={vi.fn()} />
    );
    expect(container.querySelectorAll('[class*="mantine-Card"]').length).toBe(0);
  });

  it('calls onGameSelect with correct id when a game card is clicked', () => {
    const onGameSelect = vi.fn();
    const games = [makeGame({ id: 'ow', name: 'Overwatch 2' })];
    const container = renderWithMantine(
      <GameSelectionStep games={games} onGameSelect={onGameSelect} />
    );
    const card = container.querySelector('[class*="mantine-Card"]') as HTMLElement | null;
    act(() => { card?.click(); });
    expect(onGameSelect).toHaveBeenCalledWith('ow');
  });

  it('is a function component', () => {
    expect(typeof GameSelectionStep).toBe('function');
  });
});
