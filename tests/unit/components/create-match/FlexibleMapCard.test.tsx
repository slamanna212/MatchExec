import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MantineProvider } from '@mantine/core';
import { FlexibleMapCard } from '../../../../src/components/create-match/FlexibleMapCard';
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

function makeMap(overrides: Partial<GameMapWithMode> = {}): GameMapWithMode {
  return {
    id: 'map-1',
    name: 'Ascent',
    game_id: 'val',
    created_at: new Date(),
    updated_at: new Date(),
    modeName: 'Unrated',
    imageUrl: '',
    ...overrides,
  };
}

function makeMode(overrides: Partial<GameMode> = {}): GameMode {
  return {
    id: 'mode-1',
    name: 'Unrated',
    ...overrides,
  };
}

describe('FlexibleMapCard', () => {
  it('renders map name', () => {
    const container = renderWithMantine(
      <FlexibleMapCard
        map={makeMap({ name: 'Ascent' })}
        availableModes={[makeMode()]}
        onModeChange={vi.fn()}
        onAddMap={vi.fn()}
      />
    );
    expect(container.textContent).toContain('Ascent');
  });

  it('renders mode selector with available modes', () => {
    const modes = [
      makeMode({ id: 'm-1', name: 'Unrated' }),
      makeMode({ id: 'm-2', name: 'Competitive' }),
    ];
    const container = renderWithMantine(
      <FlexibleMapCard
        map={makeMap()}
        availableModes={modes}
        onModeChange={vi.fn()}
        onAddMap={vi.fn()}
      />
    );
    // Select renders a combobox — input for mode search should be present
    expect(container.querySelector('input')).not.toBeNull();
  });

  it('renders Add Map button', () => {
    const container = renderWithMantine(
      <FlexibleMapCard
        map={makeMap()}
        availableModes={[makeMode()]}
        onModeChange={vi.fn()}
        onAddMap={vi.fn()}
      />
    );
    expect(container.textContent).toContain('Add Map');
  });

  it('disables Add Map button when no mode is selected', () => {
    const container = renderWithMantine(
      <FlexibleMapCard
        map={makeMap()}
        availableModes={[makeMode()]}
        selectedModeId={undefined}
        onModeChange={vi.fn()}
        onAddMap={vi.fn()}
      />
    );
    const buttons = Array.from(container.querySelectorAll('button'));
    const addBtn = buttons.find(b => b.textContent?.includes('Add Map'));
    expect((addBtn as HTMLButtonElement)?.disabled).toBe(true);
  });

  it('enables Add Map button when a mode is selected', () => {
    const container = renderWithMantine(
      <FlexibleMapCard
        map={makeMap()}
        availableModes={[makeMode({ id: 'mode-1' })]}
        selectedModeId="mode-1"
        onModeChange={vi.fn()}
        onAddMap={vi.fn()}
      />
    );
    const buttons = Array.from(container.querySelectorAll('button'));
    const addBtn = buttons.find(b => b.textContent?.includes('Add Map'));
    expect((addBtn as HTMLButtonElement)?.disabled).toBe(false);
  });

  it('is a function component', () => {
    expect(typeof FlexibleMapCard).toBe('function');
  });
});
