import { describe, it, expect, afterEach } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MantineProvider } from '@mantine/core';
import { MapCard } from '../../../../src/components/match-details/MapCard';

const roots: Root[] = [];
const divs: HTMLDivElement[] = [];

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

const formatMapName = (id: string) => id.toUpperCase();

describe('MapCard', () => {
  afterEach(() => {
    act(() => { roots.forEach(r => r.unmount()); });
    divs.forEach(d => d.remove());
    roots.length = 0;
    divs.length = 0;
  });

  it('renders map name from mapDetail', () => {
    const container = renderWithMantine(
      <MapCard mapId="map-1" mapDetail={{ name: 'Hanamura' }} formatMapName={formatMapName} />
    );
    expect(container.textContent).toContain('Hanamura');
  });

  it('falls back to formatMapName when no mapDetail', () => {
    const container = renderWithMantine(
      <MapCard mapId="hanamura" formatMapName={formatMapName} />
    );
    expect(container.textContent).toContain('HANAMURA');
  });

  it('renders mode name as a badge', () => {
    const container = renderWithMantine(
      <MapCard
        mapId="map-1"
        mapDetail={{ name: 'Kings Row', modeName: 'Control' }}
        formatMapName={formatMapName}
      />
    );
    expect(container.textContent).toContain('Control');
  });

  it('renders map note when provided', () => {
    const container = renderWithMantine(
      <MapCard mapId="map-1" mapNote="Check the left flank" formatMapName={formatMapName} />
    );
    expect(container.textContent).toContain('Check the left flank');
  });

  it('does not render note when mapNote is not provided', () => {
    const container = renderWithMantine(
      <MapCard mapId="map-1" mapDetail={{ name: 'Hanamura' }} formatMapName={formatMapName} />
    );
    expect(container.textContent).not.toContain('📝');
  });

  it('renders winner badge when winner is provided', () => {
    const container = renderWithMantine(
      <MapCard
        mapId="map-1"
        mapDetail={{ name: 'Map' }}
        formatMapName={formatMapName}
        winner={{ team: 'Blue Team', color: 'blue' }}
      />
    );
    expect(container.textContent).toContain('Blue Team');
  });

  it('does not render winner section when winner is null', () => {
    const container = renderWithMantine(
      <MapCard mapId="map-1" formatMapName={formatMapName} winner={null} />
    );
    // No trophy icon or team badge visible
    expect(container.querySelector('[data-testid="winner"]')).toBeNull();
  });

  it('renders location when mapDetail has location', () => {
    const container = renderWithMantine(
      <MapCard
        mapId="map-1"
        mapDetail={{ name: 'Map', location: 'Numbani' }}
        formatMapName={formatMapName}
      />
    );
    expect(container.textContent).toContain('Numbani');
  });

  it('renders children when provided', () => {
    const container = renderWithMantine(
      <MapCard mapId="map-1" formatMapName={formatMapName}>
        <button>Edit</button>
      </MapCard>
    );
    expect(container.textContent).toContain('Edit');
  });

  it('is a function component', () => {
    expect(typeof MapCard).toBe('function');
  });
});
