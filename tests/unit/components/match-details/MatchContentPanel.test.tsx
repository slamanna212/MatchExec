import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MantineProvider } from '@mantine/core';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/components/stats/StatsVisualization', () => ({
  StatsVisualization: () => React.createElement('div', { 'data-testid': 'stats-viz' }, 'Stats'),
}));

const originalFetch = globalThis.fetch;

import { MatchContentPanel } from '../../../../src/components/match-details/MatchContentPanel';
import type { MatchWithGameDetails } from '../../../../shared/types';

const roots: Root[] = [];
const divs: HTMLDivElement[] = [];

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

function makeMatch(overrides: Partial<MatchWithGameDetails> = {}): MatchWithGameDetails {
  return {
    id: 'match-1',
    name: 'Test Match',
    status: 'created',
    game_id: 'ow',
    game_name: 'Overwatch 2',
    game_color: '#ff6600',
    max_participants: 10,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    rules: 'competitive',
    rounds: 3,
    player_notifications: 1,
    stats_enabled: 0,
    maps: ['hanamura', 'kings-row'],
    map_codes_supported: false,
    ...overrides,
  } as MatchWithGameDetails;
}

const parseTs = () => new Date('2024-01-01T00:00:00Z');

function defaultPanel(overrides: Partial<React.ComponentProps<typeof MatchContentPanel>> = {}) {
  return (
    <MatchContentPanel
      match={makeMatch()}
      participants={[]}
      reminders={[]}
      mapDetails={{}}
      mapNotes={{}}
      signupConfig={null}
      parseDbTimestamp={parseTs}
      formatMapName={id => id}
      {...overrides}
    />
  );
}

describe('MatchContentPanel', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ enabled: false }),
    }) as never;
  });

  it('renders without crashing', () => {
    expect(() => {
      const container = renderWithMantine(defaultPanel());
      container.remove();
    }).not.toThrow();
  });

  it('renders Players tab by default', () => {
    const container = renderWithMantine(defaultPanel());
    expect(container.textContent).toContain('Players');
  });

  it('shows "No participants yet" when participants is empty', () => {
    const container = renderWithMantine(defaultPanel());
    expect(container.textContent).toContain('No participants');
  });

  it('renders participant usernames in participants tab', () => {
    const participants = [
      { id: 'p-1', user_id: 'u-1', username: 'Alice', joined_at: '2024-01-01T00:00:00Z', signup_data: {} },
    ];
    const container = renderWithMantine(defaultPanel({ participants }));
    expect(container.textContent).toContain('Alice');
  });

  it('renders Maps and Alerts tab buttons in navigation', () => {
    const container = renderWithMantine(defaultPanel());
    expect(container.textContent).toContain('Maps');
    expect(container.textContent).toContain('Alerts');
  });

  it('switches to Maps tab via SegmentedControl radio input', () => {
    const container = renderWithMantine(
      defaultPanel({ match: makeMatch({ maps: [] }) })
    );
    // Mantine SegmentedControl uses <input type="radio"> elements
    const radios = Array.from(container.querySelectorAll('input[type="radio"]')) as HTMLInputElement[];
    const mapsRadio = radios.find(r => r.value === 'maps');
    act(() => {
      if (mapsRadio) {
        mapsRadio.click();
        mapsRadio.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    // After switching, empty maps message should show
    const bodyText = document.body.textContent ?? '';
    // Either container or body should have "No maps configured"
    expect(bodyText).toContain('No maps');
  });

  it('is a function component', () => {
    expect(typeof MatchContentPanel).toBe('function');
  });
});
