import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MantineProvider } from '@mantine/core';

vi.mock('@/lib/logger/client', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() },
}));

vi.mock('@/components/scoring/ScorecardUpload', () => ({
  ScorecardUpload: () => React.createElement('div', { 'data-testid': 'scorecard-upload' }, 'Upload'),
}));

const mockHookData = {
  matchGames: [] as import('../../../../src/components/scoring/hooks/useMatchGamesData').MatchGame[],
  participants: [] as import('../../../../src/components/scoring/hooks/useMatchGamesData').MatchParticipant[],
  teams: [] as import('../../../../src/components/scoring/hooks/useMatchGamesData').MatchTeam[],
  team1Name: null as string | null,
  team2Name: null as string | null,
  loading: false,
  error: null as string | null,
  refetch: vi.fn().mockResolvedValue(undefined),
};

vi.mock('../../../../src/components/scoring/hooks/useMatchGamesData', () => ({
  useMatchGamesData: () => mockHookData,
}));

import { FfaMapScoring } from '../../../../src/components/scoring/FfaMapScoring';

const roots: Root[] = [];
const divs: HTMLDivElement[] = [];

afterEach(() => {
  act(() => { roots.forEach(r => r.unmount()); });
  divs.forEach(d => d.remove());
  roots.length = 0;
  divs.length = 0;
  mockHookData.matchGames = [];
  mockHookData.participants = [];
  mockHookData.teams = [];
  mockHookData.loading = false;
  mockHookData.error = null;
  mockHookData.refetch = vi.fn().mockResolvedValue(undefined);
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

function makeGame(overrides = {}) {
  return {
    id: 'mg-1',
    match_id: 'm-1',
    round: 1,
    map_id: 'somemap',
    map_name: 'Some Map',
    mode_id: 'mode-1',
    game_id: 'cs2',
    status: 'ongoing' as const,
    ...overrides,
  };
}

const defaultProps = {
  matchId: 'm-1',
  gameType: 'cs2',
  onResultSubmit: vi.fn().mockResolvedValue(undefined),
  submitting: false,
};

describe('FfaMapScoring', () => {
  it('shows loading state when loading=true', () => {
    mockHookData.loading = true;
    const container = renderWithMantine(<FfaMapScoring {...defaultProps} />);
    expect(container.textContent).toContain('Loading match maps');
  });

  it('shows error state when error is set', () => {
    mockHookData.error = 'Network failure';
    const container = renderWithMantine(<FfaMapScoring {...defaultProps} />);
    expect(container.textContent).toContain('Network failure');
  });

  it('shows empty state when no match games', () => {
    mockHookData.matchGames = [];
    const container = renderWithMantine(<FfaMapScoring {...defaultProps} />);
    expect(container.textContent).toContain('No maps found');
  });

  it('renders a win card per participant', () => {
    mockHookData.matchGames = [makeGame()];
    mockHookData.participants = [
      { id: 'p1', username: 'Alice' },
      { id: 'p2', username: 'Bob' },
      { id: 'p3', username: 'Carol' },
    ];
    const container = renderWithMantine(<FfaMapScoring {...defaultProps} />);
    expect(container.textContent).toContain('Alice Wins');
    expect(container.textContent).toContain('Bob Wins');
    expect(container.textContent).toContain('Carol Wins');
  });

  it('shows completed alert with winner name when game status is completed', () => {
    mockHookData.matchGames = [makeGame({ status: 'completed', participant_winner_id: 'p1' })];
    mockHookData.participants = [{ id: 'p1', username: 'Alice' }];
    const container = renderWithMantine(<FfaMapScoring {...defaultProps} />);
    expect(container.textContent).toContain('Map complete');
    expect(container.textContent).toContain('Alice');
  });

  it('selecting a participant shows the confirm button with their name', () => {
    mockHookData.matchGames = [makeGame()];
    mockHookData.participants = [{ id: 'p1', username: 'Alice' }];
    const container = renderWithMantine(<FfaMapScoring {...defaultProps} />);
    const button = container.querySelector('button[type="button"]');
    expect(button).toBeDefined();
    act(() => {
      button!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.textContent).toContain('Confirm: Alice wins Map');
  });

  it('is a function component', () => {
    expect(typeof FfaMapScoring).toBe('function');
  });
});
