import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MantineProvider } from '@mantine/core';
import { SelectedMapsList } from '../../../../src/components/create-match/SelectedMapsList';
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

function makeMap(overrides: Partial<SelectedMapCard> = {}): SelectedMapCard {
  return {
    id: 'map-1',
    name: 'Hanamura',
    modeId: 'mode-1',
    modeName: 'Control',
    imageUrl: '',
    ...overrides,
  };
}

describe('SelectedMapsList', () => {
  it('renders map names for each selected map', () => {
    const maps = [
      makeMap({ id: 'm-1', name: 'Hanamura' }),
      makeMap({ id: 'm-2', name: 'Kings Row' }),
    ];
    const container = renderWithMantine(
      <SelectedMapsList
        selectedMaps={maps}
        showMapSelector={false}
        onRemoveMap={vi.fn()}
        onOpenNoteModal={vi.fn()}
        onAddMapClick={vi.fn()}
      />
    );
    expect(container.textContent).toContain('Hanamura');
    expect(container.textContent).toContain('Kings Row');
  });

  it('renders Add Map button when showMapSelector=false', () => {
    const container = renderWithMantine(
      <SelectedMapsList
        selectedMaps={[]}
        showMapSelector={false}
        onRemoveMap={vi.fn()}
        onOpenNoteModal={vi.fn()}
        onAddMapClick={vi.fn()}
      />
    );
    expect(container.textContent).toContain('Add Map');
  });

  it('does not render Add Map button when showMapSelector=true', () => {
    const container = renderWithMantine(
      <SelectedMapsList
        selectedMaps={[]}
        showMapSelector={true}
        onRemoveMap={vi.fn()}
        onOpenNoteModal={vi.fn()}
        onAddMapClick={vi.fn()}
      />
    );
    expect(container.textContent).not.toContain('Add Map');
  });

  it('calls onAddMapClick when Add Map card is clicked', () => {
    const onAddMapClick = vi.fn();
    const container = renderWithMantine(
      <SelectedMapsList
        selectedMaps={[]}
        showMapSelector={false}
        onRemoveMap={vi.fn()}
        onOpenNoteModal={vi.fn()}
        onAddMapClick={onAddMapClick}
      />
    );
    const card = container.querySelector('[class*="mantine-Card"]') as HTMLElement | null;
    act(() => { card?.click(); });
    expect(onAddMapClick).toHaveBeenCalledTimes(1);
  });

  it('renders map note when present', () => {
    const maps = [makeMap({ note: 'Use spawn room strategy' })];
    const container = renderWithMantine(
      <SelectedMapsList
        selectedMaps={maps}
        showMapSelector={false}
        onRemoveMap={vi.fn()}
        onOpenNoteModal={vi.fn()}
        onAddMapClick={vi.fn()}
      />
    );
    expect(container.textContent).toContain('Use spawn room strategy');
  });

  it('is a function component', () => {
    expect(typeof SelectedMapsList).toBe('function');
  });
});
