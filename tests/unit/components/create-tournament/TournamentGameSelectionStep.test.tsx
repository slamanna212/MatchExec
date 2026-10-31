import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MantineProvider } from '@mantine/core';
import { TournamentGameSelectionStep } from '../../../../src/components/create-tournament/TournamentGameSelectionStep';
import type { GameWithIcon } from '../../../../src/components/create-tournament/useTournamentForm';

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
    description: '',
    minPlayers: 2,
    maxPlayers: 12,
    iconUrl: '',
    coverUrl: '',
    mapCount: 30,
    modeCount: 4,
    ...overrides,
  };
}

describe('TournamentGameSelectionStep', () => {
  it('renders select game heading', () => {
    const container = renderWithMantine(
      <TournamentGameSelectionStep games={[]} onGameSelect={vi.fn()} onNext={vi.fn()} canProceed={false} />
    );
    expect(container.textContent).toContain('Select the game');
  });

  it('renders each game name', () => {
    const games = [makeGame({ name: 'Overwatch 2' }), makeGame({ id: 'val', name: 'Valorant' })];
    const container = renderWithMantine(
      <TournamentGameSelectionStep games={games} onGameSelect={vi.fn()} onNext={vi.fn()} canProceed={false} />
    );
    expect(container.textContent).toContain('Overwatch 2');
    expect(container.textContent).toContain('Valorant');
  });

  it('renders map and mode count badges', () => {
    const container = renderWithMantine(
      <TournamentGameSelectionStep
        games={[makeGame({ mapCount: 25, modeCount: 3 })]}
        onGameSelect={vi.fn()} onNext={vi.fn()} canProceed={false}
      />
    );
    expect(container.textContent).toContain('25 maps');
    expect(container.textContent).toContain('3 modes');
  });

  it('calls onGameSelect when a game card is clicked', () => {
    const onGameSelect = vi.fn();
    const onNext = vi.fn();
    const container = renderWithMantine(
      <TournamentGameSelectionStep
        games={[makeGame({ id: 'ow' })]}
        onGameSelect={onGameSelect} onNext={onNext} canProceed={false}
      />
    );
    const card = container.querySelector('[class*="mantine-Card"]') as HTMLElement | null;
    act(() => { card?.click(); });
    expect(onGameSelect).toHaveBeenCalledWith('ow');
  });

  it('disables Next button when canProceed=false', () => {
    const container = renderWithMantine(
      <TournamentGameSelectionStep games={[]} onGameSelect={vi.fn()} onNext={vi.fn()} canProceed={false} />
    );
    const buttons = Array.from(container.querySelectorAll('button'));
    const nextBtn = buttons.find(b => b.textContent?.includes('Next'));
    expect((nextBtn as HTMLButtonElement)?.disabled).toBe(true);
  });

  it('is a function component', () => {
    expect(typeof TournamentGameSelectionStep).toBe('function');
  });
});
