import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MantineProvider } from '@mantine/core';

vi.mock('../../../../src/components/create-match/SelectedMapsList', () => ({
  SelectedMapsList: ({ selectedMaps, onAddMapClick }: { selectedMaps: unknown[]; onAddMapClick: () => void }) =>
    React.createElement('div', { 'data-testid': 'selected-maps-list' },
      React.createElement('span', null, `${selectedMaps.length} maps`),
      React.createElement('button', { onClick: onAddMapClick }, 'Add Map'),
    ),
}));

vi.mock('../../../../src/components/create-match/MapSelector', () => ({
  MapSelector: () => React.createElement('div', { 'data-testid': 'map-selector' }, 'MapSelector'),
}));

import { MapConfigurationStep } from '../../../../src/components/create-match/MapConfigurationStep';
import type { SelectedMapCard } from '../../../../src/components/create-match/useMatchForm';

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

function makeMap(id: string, name: string): SelectedMapCard {
  return { id, name, modeId: 'mode-1', modeName: 'Control' };
}

function defaultProps(overrides = {}) {
  return {
    selectedMaps: [] as SelectedMapCard[],
    showMapSelector: false,
    availableModes: [],
    currentGameSupportsAllModes: false,
    allMaps: [],
    mapsForMode: [],
    selectedMode: '',
    loadingMaps: false,
    startSignups: false,
    onAddMapClick: vi.fn(),
    onRemoveMap: vi.fn(),
    onOpenNoteModal: vi.fn(),
    onModeSelect: vi.fn().mockResolvedValue(undefined),
    onMapSelect: vi.fn(),
    onFlexibleMapSelect: vi.fn(),
    onCancelMapSelector: vi.fn(),
    onBack: vi.fn(),
    onCreate: vi.fn(),
    setStartSignups: vi.fn(),
    ...overrides,
  };
}

describe('MapConfigurationStep', () => {
  it('renders Maps Configuration heading', () => {
    const container = renderWithMantine(<MapConfigurationStep {...defaultProps()} />);
    expect(container.textContent).toContain('Maps Configuration');
  });

  it('disables Create Match button when no maps selected', () => {
    const container = renderWithMantine(<MapConfigurationStep {...defaultProps()} />);
    const buttons = Array.from(container.querySelectorAll('button'));
    const createBtn = buttons.find(b => b.textContent?.includes('Create Match'));
    expect((createBtn as HTMLButtonElement)?.disabled).toBe(true);
  });

  it('enables Create Match button when maps are selected', () => {
    const container = renderWithMantine(
      <MapConfigurationStep {...defaultProps({ selectedMaps: [makeMap('m-1', 'Hanamura')] })} />
    );
    const buttons = Array.from(container.querySelectorAll('button'));
    const createBtn = buttons.find(b => b.textContent?.includes('Create Match'));
    expect((createBtn as HTMLButtonElement)?.disabled).toBe(false);
  });

  it('shows Rounds count when maps are selected', () => {
    const container = renderWithMantine(
      <MapConfigurationStep {...defaultProps({ selectedMaps: [makeMap('m-1', 'H'), makeMap('m-2', 'K')] })} />
    );
    expect(container.textContent).toContain('Rounds');
    expect(container.textContent).toContain('2');
  });

  it('renders MapSelector when showMapSelector=true', () => {
    const container = renderWithMantine(
      <MapConfigurationStep {...defaultProps({ showMapSelector: true })} />
    );
    expect(container.querySelector('[data-testid="map-selector"]')).not.toBeNull();
  });

  it('does not render MapSelector when showMapSelector=false', () => {
    const container = renderWithMantine(<MapConfigurationStep {...defaultProps()} />);
    expect(container.querySelector('[data-testid="map-selector"]')).toBeNull();
  });

  it('calls onBack when Back button is clicked', () => {
    const onBack = vi.fn();
    const container = renderWithMantine(<MapConfigurationStep {...defaultProps({ onBack })} />);
    const buttons = Array.from(container.querySelectorAll('button'));
    const backBtn = buttons.find(b => b.textContent?.trim() === 'Back');
    act(() => { backBtn?.click(); });
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('renders Start Signups checkbox', () => {
    const container = renderWithMantine(<MapConfigurationStep {...defaultProps()} />);
    expect(container.textContent).toContain('Start Signups');
  });

  it('is a function component', () => {
    expect(typeof MapConfigurationStep).toBe('function');
  });
});
