import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MantineProvider } from '@mantine/core';
import { MapCard, getStatusIcon } from '../../../../src/components/shared/MapCard';

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

function defaultProps(overrides: Partial<React.ComponentProps<typeof MapCard>> = {}) {
  return {
    mapId: 'hanamura',
    gameType: 'ow',
    round: 1,
    status: 'created',
    ...overrides,
  };
}

describe('MapCard', () => {
  it('renders round number', () => {
    const container = renderWithMantine(<MapCard {...defaultProps({ round: 2 })} />);
    expect(container.textContent).toContain('Map 2');
  });

  it('renders status badge', () => {
    const container = renderWithMantine(<MapCard {...defaultProps({ status: 'ongoing' })} />);
    expect(container.textContent).toContain('ongoing');
  });

  it('renders map name when mapName is provided', () => {
    const container = renderWithMantine(
      <MapCard {...defaultProps({ mapId: 'hanamura', mapName: 'Hanamura' })} />
    );
    expect(container.textContent).toContain('Hanamura');
  });

  it('renders map id formatted when mapName is null', () => {
    const container = renderWithMantine(
      <MapCard {...defaultProps({ mapId: 'kings-row', mapName: null })} />
    );
    // formatMapName transforms the id (capitalizes/humanizes)
    expect(container.textContent).toMatch(/kings|Kings|KINGS/i);
  });

  it('renders Blue Wins badge when winner=blue and showWinner=true', () => {
    const container = renderWithMantine(
      <MapCard {...defaultProps({ winner: 'blue', showWinner: true, status: 'completed' })} />
    );
    expect(container.textContent).toContain('Blue Wins');
  });

  it('renders Red Wins badge when winner=red and showWinner=true', () => {
    const container = renderWithMantine(
      <MapCard {...defaultProps({ winner: 'red', showWinner: true, status: 'completed' })} />
    );
    expect(container.textContent).toContain('Red Wins');
  });

  it('does not render winner badge when showWinner=false', () => {
    const container = renderWithMantine(
      <MapCard {...defaultProps({ winner: 'blue', showWinner: false, status: 'completed' })} />
    );
    expect(container.textContent).not.toContain('Blue Wins');
  });

  it('does not render winner badge when winner is null', () => {
    const container = renderWithMantine(
      <MapCard {...defaultProps({ winner: null, showWinner: true, status: 'completed' })} />
    );
    expect(container.textContent).not.toContain('Wins');
  });

  it('calls onClick when card is clicked and not disabled', () => {
    const onClick = vi.fn();
    const container = renderWithMantine(<MapCard {...defaultProps({ onClick })} />);
    const card = container.querySelector('[class*="mantine-Card"]') as HTMLElement | null;
    act(() => { card?.click(); });
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not call onClick when disabled', () => {
    const onClick = vi.fn();
    const container = renderWithMantine(<MapCard {...defaultProps({ onClick, disabled: true })} />);
    const card = container.querySelector('[class*="mantine-Card"]') as HTMLElement | null;
    act(() => { card?.click(); });
    expect(onClick).not.toHaveBeenCalled();
  });

  it('renders without crashing when no onClick provided', () => {
    expect(() => {
      renderWithMantine(<MapCard {...defaultProps()} />);
    }).not.toThrow();
  });

  it('is a function component', () => {
    expect(typeof MapCard).toBe('function');
  });
});

describe('getStatusIcon', () => {
  it('returns JSX for completed status', () => {
    const icon = getStatusIcon('completed');
    expect(icon).not.toBeNull();
  });

  it('returns JSX for ongoing status', () => {
    const icon = getStatusIcon('ongoing');
    expect(icon).not.toBeNull();
  });

  it('returns JSX for created status', () => {
    const icon = getStatusIcon('created');
    expect(icon).not.toBeNull();
  });

  it('returns JSX for unknown status (fallback)', () => {
    const icon = getStatusIcon('unknown');
    expect(icon).not.toBeNull();
  });
});
