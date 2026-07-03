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

import { TeamMapScoring } from '../../../../src/components/scoring/TeamMapScoring';

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

function makeTeam(overrides = {}) {
  return {
    id: 't-1',
    team_name: 'Blue',
    team_order: 0,
    ...overrides,
  };
}

const defaultProps = {
  matchId: 'm-1',
  gameType: 'ow',
  onResultSubmit: vi.fn().mockResolvedValue(undefined),
  submitting: false,
};

describe('TeamMapScoring', () => {
  it('shows loading state when loading=true', () => {
    mockHookData.loading = true;
    const container = renderWithMantine(<TeamMapScoring {...defaultProps} />);
    expect(container.textContent).toContain('Loading match maps');
  });

  it('shows error state when error is set', () => {
    mockHookData.error = 'Network failure';
    const container = renderWithMantine(<TeamMapScoring {...defaultProps} />);
    expect(container.textContent).toContain('Network failure');
  });

  it('shows empty state when no match games', () => {
    mockHookData.matchGames = [];
    const container = renderWithMantine(<TeamMapScoring {...defaultProps} />);
    expect(container.textContent).toContain('No maps found');
  });

  it('renders map name for the current game', () => {
    mockHookData.matchGames = [makeGame({ map_name: 'Kings Row' })];
    mockHookData.teams = [makeTeam({ id: 't-1', team_name: 'Blue', team_order: 0 }), makeTeam({ id: 't-2', team_name: 'Red', team_order: 1 })];
    const container = renderWithMantine(<TeamMapScoring {...defaultProps} />);
    expect(container.textContent).toContain('Kings Row');
  });

  it('renders one win card per match_teams row for a 2-team match', () => {
    mockHookData.matchGames = [makeGame()];
    mockHookData.teams = [
      makeTeam({ id: 't-1', team_name: 'Blue Squad', team_order: 0 }),
      makeTeam({ id: 't-2', team_name: 'Red Squad', team_order: 1 }),
    ];
    const container = renderWithMantine(<TeamMapScoring {...defaultProps} />);
    expect(container.textContent).toContain('Blue Squad');
    expect(container.textContent).toContain('Red Squad');
  });

  it('renders a win card for every team in a 4-team match (N-team aware)', () => {
    mockHookData.matchGames = [makeGame()];
    mockHookData.teams = [
      makeTeam({ id: 't-1', team_name: 'Team 1', team_order: 0 }),
      makeTeam({ id: 't-2', team_name: 'Team 2', team_order: 1 }),
      makeTeam({ id: 't-3', team_name: 'Team 3', team_order: 2 }),
      makeTeam({ id: 't-4', team_name: 'Team 4', team_order: 3 }),
    ];
    const container = renderWithMantine(<TeamMapScoring {...defaultProps} />);
    expect(container.textContent).toContain('Team 1');
    expect(container.textContent).toContain('Team 2');
    expect(container.textContent).toContain('Team 3');
    expect(container.textContent).toContain('Team 4');
  });

  it('shows completed alert when game status is completed', () => {
    mockHookData.matchGames = [makeGame({ status: 'completed' })];
    mockHookData.teams = [makeTeam()];
    const container = renderWithMantine(<TeamMapScoring {...defaultProps} />);
    expect(container.textContent).toContain('Map complete');
  });

  it('disables team win buttons when submitting=true', () => {
    mockHookData.matchGames = [makeGame()];
    mockHookData.teams = [
      makeTeam({ id: 't-1', team_name: 'Blue', team_order: 0 }),
      makeTeam({ id: 't-2', team_name: 'Red', team_order: 1 }),
    ];
    const container = renderWithMantine(
      <TeamMapScoring {...defaultProps} submitting={true} />
    );
    const buttons = Array.from(container.querySelectorAll('button[type="button"]'));
    const teamButtons = buttons.filter(b => b.textContent?.includes('Wins this map'));
    expect(teamButtons.length).toBeGreaterThan(0);
    teamButtons.forEach(b => {
      expect((b as HTMLButtonElement).disabled).toBe(true);
    });
  });

  it('clicking a team win card selects it as pending (3rd+ team selectable)', () => {
    mockHookData.matchGames = [makeGame()];
    mockHookData.teams = [
      makeTeam({ id: 't-1', team_name: 'Team 1', team_order: 0 }),
      makeTeam({ id: 't-2', team_name: 'Team 2', team_order: 1 }),
      makeTeam({ id: 't-3', team_name: 'Team 3', team_order: 2 }),
    ];
    const container = renderWithMantine(<TeamMapScoring {...defaultProps} />);
    const buttons = Array.from(container.querySelectorAll('button[type="button"]'));
    const team3Button = buttons.find(b => b.textContent?.includes('Team 3'));
    expect(team3Button).toBeDefined();
    act(() => {
      team3Button!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.textContent).toContain('Confirm: Team 3 wins Map');
  });

  it('is a function component', () => {
    expect(typeof TeamMapScoring).toBe('function');
  });
});
