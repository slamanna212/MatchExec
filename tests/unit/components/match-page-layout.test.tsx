import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MantineProvider } from '@mantine/core';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@mantine/modals', () => ({
  modals: { openConfirmModal: vi.fn() },
}));

vi.mock('@/components/stats/StatsVisualization', () => ({
  StatsVisualization: () => React.createElement('div', { 'data-testid': 'stats-viz' }, 'Stats'),
}));

import { MatchPageLayout } from '../../../src/components/match-page-layout';

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

const BASE_MATCH = {
  id: 'match-1',
  name: 'Grand Final',
  status: 'created' as const,
  game_id: 'ow',
  guild_id: 'guild-1',
  channel_id: 'chan-1',
  match_format: 'competitive' as const,
  game_name: 'Overwatch 2',
  game_color: '#ff6600',
  max_participants: 10,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  rules: 'competitive',
  rounds: 3,
  player_notifications: 1,
  stats_enabled: 0,
  maps: ['hanamura'],
  map_codes_supported: false,
};

function makeMatch(overrides = {}) {
  return { ...BASE_MATCH, ...overrides };
}

const parseTs = () => new Date('2024-01-01T00:00:00Z');

function defaultProps(overrides = {}) {
  return {
    match: makeMatch(),
    participants: [],
    reminders: [],
    mapDetails: {},
    mapNotes: {},
    signupConfig: null,
    parseDbTimestamp: parseTs,
    formatMapName: (id: string) => id,
    ...overrides,
  };
}

describe('MatchPageLayout', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ enabled: false }),
    }) as never;
  });

  it('renders without crashing', () => {
    expect(() => {
      renderWithMantine(<MatchPageLayout {...defaultProps()} />);
    }).not.toThrow();
  });

  it('renders match name in the layout', () => {
    const container = renderWithMantine(
      <MatchPageLayout {...defaultProps({ match: makeMatch({ name: 'Grand Final' }) })} />
    );
    expect(container.textContent).toContain('Grand Final');
  });

  it('renders game name in info panel', () => {
    const container = renderWithMantine(
      <MatchPageLayout {...defaultProps({ match: makeMatch({ game_name: 'Valorant' }) })} />
    );
    expect(container.textContent).toContain('Valorant');
  });

  it('renders breadcrumbs when showBreadcrumbs=true', () => {
    const container = renderWithMantine(
      <MatchPageLayout {...defaultProps({ showBreadcrumbs: true })} />
    );
    expect(container.textContent).toContain('Matches');
  });

  it('does not render breadcrumbs when showBreadcrumbs=false', () => {
    const container = renderWithMantine(
      <MatchPageLayout {...defaultProps({ showBreadcrumbs: false })} />
    );
    // "Match History" and "Matches" breadcrumbs should not appear
    const anchors = Array.from(container.querySelectorAll('a'));
    const breadcrumb = anchors.find(a => a.href?.includes('/matches') && a.textContent?.trim() === 'Matches');
    expect(breadcrumb).toBeUndefined();
  });

  it('shows Match History breadcrumb when isHistory=true', () => {
    const container = renderWithMantine(
      <MatchPageLayout {...defaultProps({ showBreadcrumbs: true, isHistory: true })} />
    );
    expect(container.textContent).toContain('Match History');
  });

  it('renders participants tab with player names', () => {
    const participants = [
      { id: 'p-1', user_id: 'u-1', username: 'Alice', joined_at: '2024-01-01T00:00:00Z', signup_data: {} },
    ];
    const container = renderWithMantine(
      <MatchPageLayout {...defaultProps({ participants })} />
    );
    expect(container.textContent).toContain('Alice');
  });

  it('is a function component', () => {
    expect(typeof MatchPageLayout).toBe('function');
  });
});
