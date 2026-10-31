import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MantineProvider } from '@mantine/core';
import { TournamentReviewStep } from '../../../../src/components/create-tournament/TournamentReviewStep';
import type { GameWithIcon } from '../../../../src/components/create-tournament/useTournamentForm';

const roots: Root[] = [];
const divs: HTMLDivElement[] = [];
const originalFetch = globalThis.fetch;

afterEach(() => {
  act(() => { roots.forEach(r => r.unmount()); });
  divs.forEach(d => d.remove());
  roots.length = 0;
  divs.length = 0;
  globalThis.fetch = originalFetch;
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

function defaultProps(overrides = {}) {
  return {
    formData: {
      name: 'Spring Championship',
      gameId: 'ow',
      gameModeId: 'mode-1',
      format: 'single-elimination' as const,
      roundsPerMatch: 3,
      ruleset: 'competitive',
    },
    games: [makeGame()],
    onBack: vi.fn(),
    onCreate: vi.fn(),
    canProceed: true,
    ...overrides,
  };
}

describe('TournamentReviewStep', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ([{ id: 'mode-1', name: 'Control', team_size: 5, max_players: 10 }]),
    }) as never;
  });

  it('renders tournament name in review', () => {
    const container = renderWithMantine(<TournamentReviewStep {...defaultProps()} />);
    expect(container.textContent).toContain('Spring Championship');
  });

  it('renders game name in review', () => {
    const container = renderWithMantine(<TournamentReviewStep {...defaultProps()} />);
    expect(container.textContent).toContain('Overwatch 2');
  });

  it('disables Create Tournament button when canProceed=false', () => {
    const container = renderWithMantine(
      <TournamentReviewStep {...defaultProps({ canProceed: false })} />
    );
    const buttons = Array.from(container.querySelectorAll('button'));
    const createBtn = buttons.find(b => b.textContent?.includes('Create'));
    expect((createBtn as HTMLButtonElement)?.disabled).toBe(true);
  });

  it('enables Create Tournament button when canProceed=true', () => {
    const container = renderWithMantine(
      <TournamentReviewStep {...defaultProps({ canProceed: true })} />
    );
    const buttons = Array.from(container.querySelectorAll('button'));
    const createBtn = buttons.find(b => b.textContent?.includes('Create'));
    expect((createBtn as HTMLButtonElement)?.disabled).toBe(false);
  });

  it('calls onBack when Back button is clicked', () => {
    const onBack = vi.fn();
    const container = renderWithMantine(<TournamentReviewStep {...defaultProps({ onBack })} />);
    const buttons = Array.from(container.querySelectorAll('button'));
    const backBtn = buttons.find(b => b.textContent?.trim() === 'Back');
    act(() => { backBtn?.click(); });
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('is a function component', () => {
    expect(typeof TournamentReviewStep).toBe('function');
  });
});
