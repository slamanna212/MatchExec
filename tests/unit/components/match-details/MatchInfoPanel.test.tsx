import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';

vi.mock('@mantine/modals', () => ({
  modals: { openConfirmModal: vi.fn() },
}));

import { modals } from '@mantine/modals';
import { MatchInfoPanel } from '../../../../src/components/match-details/MatchInfoPanel';
import type { MatchWithGameDetails } from '../../../../shared/types';

const roots: Root[] = [];
const divs: HTMLDivElement[] = [];

// The details card looks up series membership; default to "not in a series".
let memberships: unknown[] = [];
beforeEach(() => {
  memberships = [];
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ memberships }) })));
});

afterEach(() => {
  vi.unstubAllGlobals();
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
    root.render(<MantineProvider><MemoryRouter>{element}</MemoryRouter></MantineProvider>);
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
    game_icon: undefined,
    max_participants: 10,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    rules: 'competitive',
    rounds: 3,
    player_notifications: 1,
    stats_enabled: 0,
    description: undefined,
    event_image_url: undefined,
    livestream_link: undefined,
    start_date: undefined,
    tournament_id: undefined,
    tournament_allow_match_editing: true,
    ...overrides,
  } as MatchWithGameDetails;
}

const parseTs = () => new Date('2024-01-01T00:00:00Z');

describe('MatchInfoPanel', () => {
  it('renders match name', () => {
    const container = renderWithMantine(
      <MatchInfoPanel
        match={makeMatch({ name: 'Grand Final' })}
        mapDetails={{}} mapNotes={{}}
        formatMapName={id => id}
        parseDbTimestamp={parseTs}
      />
    );
    expect(container.textContent).toContain('Grand Final');
  });

  it('renders game name', () => {
    const container = renderWithMantine(
      <MatchInfoPanel
        match={makeMatch({ game_name: 'Valorant' })}
        mapDetails={{}} mapNotes={{}}
        formatMapName={id => id}
        parseDbTimestamp={parseTs}
      />
    );
    expect(container.textContent).toContain('Valorant');
  });

  it('renders description when present', () => {
    const container = renderWithMantine(
      <MatchInfoPanel
        match={makeMatch({ description: 'Finals tournament' })}
        mapDetails={{}} mapNotes={{}}
        formatMapName={id => id}
        parseDbTimestamp={parseTs}
      />
    );
    expect(container.textContent).toContain('Finals tournament');
  });

  it('does not render description section when null', () => {
    const container = renderWithMantine(
      <MatchInfoPanel
        match={makeMatch({ description: undefined })}
        mapDetails={{}} mapNotes={{}}
        formatMapName={id => id}
        parseDbTimestamp={parseTs}
      />
    );
    expect(container.textContent).not.toContain('Description:');
  });

  it('renders StageRing (ring progress) based on status', () => {
    const container = renderWithMantine(
      <MatchInfoPanel
        match={makeMatch({ status: 'battle' })}
        mapDetails={{}} mapNotes={{}}
        formatMapName={id => id}
        parseDbTimestamp={parseTs}
      />
    );
    // StageRing renders an SVG ring
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('does not render actions when showActions=false', () => {
    const onDelete = vi.fn();
    const container = renderWithMantine(
      <MatchInfoPanel
        match={makeMatch()}
        mapDetails={{}} mapNotes={{}}
        formatMapName={id => id}
        parseDbTimestamp={parseTs}
        showActions={false}
        onDelete={onDelete}
      />
    );
    expect(container.textContent).not.toContain('Delete Match');
  });

  it('renders Delete button when onDelete is provided and showActions=true', () => {
    const container = renderWithMantine(
      <MatchInfoPanel
        match={makeMatch()}
        mapDetails={{}} mapNotes={{}}
        formatMapName={id => id}
        parseDbTimestamp={parseTs}
        showActions={true}
        onDelete={vi.fn()}
      />
    );
    expect(container.textContent).toContain('Delete Match');
  });

  it('asks for confirmation before closing signups, and only then transitions', () => {
    const onStatusTransition = vi.fn();
    vi.mocked(modals.openConfirmModal).mockClear();
    const container = renderWithMantine(
      <MatchInfoPanel
        match={makeMatch({ status: 'gather' })}
        mapDetails={{}} mapNotes={{}}
        formatMapName={id => id}
        parseDbTimestamp={parseTs}
        onStatusTransition={onStatusTransition}
      />
    );
    const button = [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Close Signups');
    expect(button).toBeTruthy();
    act(() => { button!.click(); });
    expect(onStatusTransition).not.toHaveBeenCalled();
    expect(modals.openConfirmModal).toHaveBeenCalledTimes(1);
    const config = vi.mocked(modals.openConfirmModal).mock.calls[0][0];
    expect(config.title).toBe('Close Signups');
    config.onConfirm?.();
    expect(onStatusTransition).toHaveBeenCalledWith('assign');
  });

  it('shows "Unscheduled" instead of the 2099 placeholder start date', () => {
    const container = renderWithMantine(
      <MatchInfoPanel
        match={makeMatch({ start_date: '2099-12-31T23:59:59.999Z' })}
        mapDetails={{}} mapNotes={{}}
        formatMapName={id => id}
        parseDbTimestamp={(ts) => (ts ? new Date(ts) : null)}
      />
    );
    expect(container.textContent).toContain('Unscheduled');
    expect(container.textContent).not.toContain('2099');
  });

  it('shows a Series row linking to the series when the match belongs to one', async () => {
    memberships = [{
      series_id: 's1', series_name: 'Fall 2026 Championship', series_status: 'active',
      series_event_id: 'e1', points_multiplier: 1.5, event_order: 2, via: 'direct',
    }];
    const container = renderWithMantine(
      <MatchInfoPanel match={makeMatch()} mapDetails={{}} mapNotes={{}} formatMapName={id => id} parseDbTimestamp={parseTs} />
    );
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(fetch).toHaveBeenCalledWith('/api/series?match_id=match-1');
    expect(container.textContent).toContain('Series:');
    expect(container.textContent).toContain('Fall 2026 Championship');
    expect(container.textContent).toContain('×1.5');
    expect(container.querySelector('a[href="/series/s1"]')).not.toBeNull();
  });

  it('omits the Series row when the match is not in a series', async () => {
    const container = renderWithMantine(
      <MatchInfoPanel match={makeMatch()} mapDetails={{}} mapNotes={{}} formatMapName={id => id} parseDbTimestamp={parseTs} />
    );
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(container.textContent).not.toContain('Series:');
  });

  it('is a function component', () => {
    expect(typeof MatchInfoPanel).toBe('function');
  });
});
