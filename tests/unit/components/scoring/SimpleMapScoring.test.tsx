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
  team1Name: null as string | null,
  team2Name: null as string | null,
  loading: false,
  error: null as string | null,
  refetch: vi.fn().mockResolvedValue(undefined),
};

vi.mock('../../../../src/components/scoring/hooks/useMatchGamesData', () => ({
  useMatchGamesData: () => mockHookData,
}));

import { SimpleMapScoring } from '../../../../src/components/scoring/SimpleMapScoring';

const roots: Root[] = [];
const divs: HTMLDivElement[] = [];

afterEach(() => {
  act(() => { roots.forEach(r => r.unmount()); });
  divs.forEach(d => d.remove());
  roots.length = 0;
  divs.length = 0;
  mockHookData.matchGames = [];
  mockHookData.participants = [];
  mockHookData.team1Name = null;
  mockHookData.team2Name = null;
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
    map_id: 'hanamura',
    map_name: 'Hanamura',
    mode_id: 'mode-1',
    game_id: 'ow',
    status: 'ongoing' as const,
    ...overrides,
  };
}

const defaultProps = {
  matchId: 'm-1',
  gameType: 'ow',
  onResultSubmit: vi.fn().mockResolvedValue(undefined),
  submitting: false,
};

describe('SimpleMapScoring', () => {
  it('shows loading state when loading=true', () => {
    mockHookData.loading = true;
    const container = renderWithMantine(<SimpleMapScoring {...defaultProps} />);
    expect(container.textContent).toContain('Loading match maps');
  });

  it('shows error state when error is set', () => {
    mockHookData.error = 'Network failure';
    const container = renderWithMantine(<SimpleMapScoring {...defaultProps} />);
    expect(container.textContent).toContain('Network failure');
  });

  it('shows empty state when no match games', () => {
    mockHookData.matchGames = [];
    const container = renderWithMantine(<SimpleMapScoring {...defaultProps} />);
    expect(container.textContent).toContain('No maps found');
  });

  it('renders map name for the current game', () => {
    mockHookData.matchGames = [makeGame({ map_name: 'Kings Row' })];
    const container = renderWithMantine(<SimpleMapScoring {...defaultProps} />);
    expect(container.textContent).toContain('Kings Row');
  });

  it('shows team win buttons for Normal scoring mode', () => {
    mockHookData.matchGames = [makeGame({ mode_scoring_type: 'Normal' })];
    mockHookData.team1Name = 'Blue Squad';
    mockHookData.team2Name = 'Red Squad';
    const container = renderWithMantine(<SimpleMapScoring {...defaultProps} />);
    expect(container.textContent).toContain('Blue Squad');
    expect(container.textContent).toContain('Red Squad');
  });

  it('shows default team names when team names are null', () => {
    mockHookData.matchGames = [makeGame({ mode_scoring_type: 'Normal' })];
    const container = renderWithMantine(<SimpleMapScoring {...defaultProps} />);
    expect(container.textContent).toContain('Blue Team');
    expect(container.textContent).toContain('Red Team');
  });

  it('shows completed alert when game status is completed', () => {
    mockHookData.matchGames = [makeGame({ status: 'completed', winner_id: 'team1' })];
    mockHookData.team1Name = 'Alpha';
    const container = renderWithMantine(<SimpleMapScoring {...defaultProps} />);
    expect(container.textContent).toContain('Map complete');
  });

  it('disables team win buttons when submitting=true', () => {
    mockHookData.matchGames = [makeGame({ mode_scoring_type: 'Normal' })];
    const container = renderWithMantine(
      <SimpleMapScoring {...defaultProps} submitting={true} />
    );
    const buttons = Array.from(container.querySelectorAll('button[type="button"]'));
    const teamButtons = buttons.filter(b =>
      b.textContent?.includes('Wins this map') || b.textContent?.includes('Blue') || b.textContent?.includes('Red')
    );
    teamButtons.forEach(b => {
      expect((b as HTMLButtonElement).disabled).toBe(true);
    });
  });

  it('is a function component', () => {
    expect(typeof SimpleMapScoring).toBe('function');
  });
});
