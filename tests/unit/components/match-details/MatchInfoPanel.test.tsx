import { describe, it, expect, vi, afterEach } from 'vitest';
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

import { MatchInfoPanel } from '../../../../src/components/match-details/MatchInfoPanel';
import type { MatchWithGameDetails } from '../../../../shared/types';

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

  it('is a function component', () => {
    expect(typeof MatchInfoPanel).toBe('function');
  });
});
