import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MantineProvider } from '@mantine/core';

vi.mock('@/lib/logger/client', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() },
}));

import { PositionScoring } from '../../../../src/components/scoring/PositionScoring';

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

function mockFetchWith(games: unknown[], participants: unknown[]) {
  globalThis.fetch = vi.fn().mockImplementation((url: string) => {
    if (url.includes('/games')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ games }),
      });
    }
    if (url.includes('/participants')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ participants }),
      });
    }
    return Promise.resolve({ ok: true, json: async () => ({}) });
  }) as never;
}

const defaultProps = {
  matchId: 'm-1',
  gameType: 'rl',
  onResultSubmit: vi.fn().mockResolvedValue(undefined),
  submitting: false,
};

describe('PositionScoring', () => {
  beforeEach(() => {
    mockFetchWith([], []);
  });

  it('shows loading state initially', () => {
    const container = renderWithMantine(<PositionScoring {...defaultProps} />);
    // Before fetch resolves, loading should be shown
    expect(container.textContent).toContain('Loading race data');
  });

  it('shows empty state when no games or participants', async () => {
    mockFetchWith([], []);
    let container!: HTMLDivElement;
    await act(async () => {
      container = renderWithMantine(<PositionScoring {...defaultProps} />);
      await new Promise(r => setTimeout(r, 50));
    });
    expect(container.textContent).toContain('No races or participants');
  });

  it('renders race sidebar when games and participants exist', async () => {
    const games = [
      { id: 'mg-1', round: 1, map_id: 'track-a', map_name: 'Track A', mode_id: 'm1', game_id: 'rl', status: 'pending' },
    ];
    const participants = [
      { id: 'p-1', username: 'Alice' },
      { id: 'p-2', username: 'Bob' },
    ];
    mockFetchWith(games, participants);

    let container!: HTMLDivElement;
    await act(async () => {
      container = renderWithMantine(<PositionScoring {...defaultProps} />);
      await new Promise(r => setTimeout(r, 50));
    });
    expect(container.textContent).toContain('Race');
  });

  it('renders participant names in position form', async () => {
    const games = [
      { id: 'mg-1', round: 1, map_id: 'track-a', map_name: 'Track A', mode_id: 'm1', game_id: 'rl', status: 'pending' },
    ];
    const participants = [
      { id: 'p-1', username: 'Alice' },
      { id: 'p-2', username: 'Bob' },
    ];
    mockFetchWith(games, participants);

    let container!: HTMLDivElement;
    await act(async () => {
      container = renderWithMantine(<PositionScoring {...defaultProps} />);
      await new Promise(r => setTimeout(r, 50));
    });
    expect(container.textContent).toContain('Alice');
    expect(container.textContent).toContain('Bob');
  });

  it('shows error state when fetch fails', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('API down')) as never;

    let container!: HTMLDivElement;
    await act(async () => {
      container = renderWithMantine(<PositionScoring {...defaultProps} />);
      await new Promise(r => setTimeout(r, 50));
    });
    expect(container.textContent).toContain('API down');
  });

  it('is a function component', () => {
    expect(typeof PositionScoring).toBe('function');
  });
});
