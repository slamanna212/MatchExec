import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MantineProvider } from '@mantine/core';

vi.mock('../../../../src/components/create-match/MapCard', () => ({
  MapCard: ({ map, onClick }: { map: { name: string }; onClick: () => void }) =>
    React.createElement('button', { 'data-testid': 'map-card', onClick }, map.name),
}));

vi.mock('../../../../src/components/create-match/FlexibleMapCard', () => ({
  FlexibleMapCard: ({ map }: { map: { name: string } }) =>
    React.createElement('div', { 'data-testid': 'flexible-map-card' }, map.name),
}));

import { MapSelector } from '../../../../src/components/create-match/MapSelector';
import type { GameMode, GameMapWithMode } from '../../../../src/components/create-match/useMatchForm';

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

function makeMode(overrides: Partial<GameMode> = {}): GameMode {
  return {
    id: 'mode-1',
    name: 'Control',
    ...overrides,
  };
}

function makeMap(overrides: Partial<GameMapWithMode> = {}): GameMapWithMode {
  return {
    id: 'map-1',
    name: 'Hanamura',
    game_id: 'ow',
    created_at: new Date(),
    updated_at: new Date(),
    modeName: 'Control',
    ...overrides,
  };
}

const defaultProps = {
  availableModes: [makeMode()],
  currentGameSupportsAllModes: false,
  allMaps: [],
  mapsForMode: [],
  selectedMode: '',
  loadingMaps: false,
  onModeSelect: vi.fn().mockResolvedValue(undefined),
  onMapSelect: vi.fn(),
  onFlexibleMapSelect: vi.fn(),
  onCancel: vi.fn(),
};

describe('MapSelector', () => {
  it('renders Select a Map heading', () => {
    const container = renderWithMantine(<MapSelector {...defaultProps} />);
    expect(container.textContent).toContain('Select a Map');
  });

  it('renders game mode selector in traditional mode', () => {
    const container = renderWithMantine(<MapSelector {...defaultProps} />);
    expect(container.textContent).toContain('Game Mode');
  });

  it('shows "Loading maps..." when loadingMaps=true with a mode selected', () => {
    const container = renderWithMantine(
      <MapSelector {...defaultProps} selectedMode="mode-1" loadingMaps={true} />
    );
    expect(container.textContent).toContain('Loading maps');
  });

  it('renders MapCard for each map in mapsForMode when mode is selected', () => {
    const maps = [makeMap({ id: 'm-1', name: 'Hanamura' }), makeMap({ id: 'm-2', name: 'Kings Row' })];
    const container = renderWithMantine(
      <MapSelector {...defaultProps} selectedMode="mode-1" mapsForMode={maps} />
    );
    const cards = container.querySelectorAll('[data-testid="map-card"]');
    expect(cards.length).toBe(2);
  });

  it('renders FlexibleMapCard for each map when currentGameSupportsAllModes=true', () => {
    const maps = [makeMap({ id: 'm-1', name: 'Hanamura' })];
    const container = renderWithMantine(
      <MapSelector {...defaultProps} currentGameSupportsAllModes={true} allMaps={maps} />
    );
    expect(container.querySelectorAll('[data-testid="flexible-map-card"]').length).toBe(1);
  });

  it('calls onCancel when Cancel button is clicked', () => {
    const onCancel = vi.fn();
    const container = renderWithMantine(<MapSelector {...defaultProps} onCancel={onCancel} />);
    const buttons = Array.from(container.querySelectorAll('button'));
    const cancelBtn = buttons.find(b => b.textContent?.includes('Cancel'));
    act(() => { cancelBtn?.click(); });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('is a function component', () => {
    expect(typeof MapSelector).toBe('function');
  });
});
