import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MantineProvider } from '@mantine/core';

vi.mock('@/hooks/useLazyBackground', () => ({
  useLazyBackground: (url: string | undefined) => ({
    ref: { current: null },
    backgroundImage: url ? `url(${url})` : undefined,
  }),
}));

import { MapCard } from '../../../../src/components/create-match/MapCard';
import type { GameMapWithMode } from '../../../../src/components/create-match/useMatchForm';

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
    name: 'Hanamura',
    game_id: 'ow',
    created_at: new Date(),
    updated_at: new Date(),
    modeName: 'Control',
    imageUrl: 'https://example.com/hanamura.jpg',
    ...overrides,
  };
}

describe('MapCard (create-match)', () => {
  it('renders map name', () => {
    const container = renderWithMantine(
      <MapCard map={makeMap({ name: 'Kings Row' })} onClick={vi.fn()} />
    );
    expect(container.textContent).toContain('Kings Row');
  });

  it('calls onClick when card is clicked', () => {
    const onClick = vi.fn();
    const container = renderWithMantine(
      <MapCard map={makeMap()} onClick={onClick} />
    );
    const div = container.querySelector('div[style]') as HTMLDivElement | null;
    act(() => { div?.click(); });
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders without crashing when imageUrl is empty', () => {
    expect(() => {
      renderWithMantine(<MapCard map={makeMap({ imageUrl: '' })} onClick={vi.fn()} />);
    }).not.toThrow();
  });

  it('is a function component', () => {
    expect(typeof MapCard).toBe('function');
  });
});
