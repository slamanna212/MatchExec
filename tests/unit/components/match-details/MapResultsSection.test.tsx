import { describe, it, expect, afterEach } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MantineProvider } from '@mantine/core';
import { MapResultsSection } from '../../../../src/components/match-details/MapResultsSection';

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

const formatMapName = (id: string) => id.toUpperCase();

describe('MapResultsSection', () => {
  it('renders each map by formatMapName when no mapDetail', () => {
    const container = renderWithMantine(
      <MapResultsSection
        maps={['hanamura', 'kings-row']}
        mapDetails={{}}
        mapNotes={{}}
        formatMapName={formatMapName}
      />
    );
    expect(container.textContent).toContain('HANAMURA');
    expect(container.textContent).toContain('KINGS-ROW');
  });

  it('renders empty Stack when maps array is empty', () => {
    const container = renderWithMantine(
      <MapResultsSection
        maps={[]}
        mapDetails={{}}
        mapNotes={{}}
        formatMapName={formatMapName}
      />
    );
    expect(container.querySelector('[class*="mantine-Card"]')).toBeNull();
  });

  it('renders map names from mapDetails', () => {
    const container = renderWithMantine(
      <MapResultsSection
        maps={['hanamura']}
        mapDetails={{ hanamura: { name: 'Hanamura' } }}
        mapNotes={{}}
        formatMapName={formatMapName}
      />
    );
    expect(container.textContent).toContain('Hanamura');
  });

  it('renders winner badge when showWinner=true and game is completed', () => {
    const matchGames = [{
      id: 'mg-1',
      match_id: 'm-1',
      round: 1,
      map_id: 'hanamura',
      map_name: 'Hanamura',
      winner_id: 'blue',
      status: 'completed' as const,
    }];
    const container = renderWithMantine(
      <MapResultsSection
        maps={['hanamura']}
        mapDetails={{ hanamura: { name: 'Hanamura' } }}
        mapNotes={{}}
        formatMapName={formatMapName}
        matchGames={matchGames}
        showWinner={true}
      />
    );
    // MapCard renders a winner badge when winner is provided
    expect(container.querySelector('svg')).not.toBeNull(); // Trophy icon
  });

  it('does not render winner when showWinner=false', () => {
    const matchGames = [{
      id: 'mg-1', match_id: 'm-1', round: 1,
      map_id: 'hanamura', map_name: 'H',
      winner_id: 'blue', status: 'completed' as const,
    }];
    const container = renderWithMantine(
      <MapResultsSection
        maps={['hanamura']}
        mapDetails={{}}
        mapNotes={{}}
        formatMapName={formatMapName}
        matchGames={matchGames}
        showWinner={false}
      />
    );
    // No trophy icon when showWinner=false
    const trophies = container.querySelectorAll('[data-tabler-icon="trophy"]');
    expect(trophies.length).toBe(0);
  });

  it('passes children render prop through to each MapCard', () => {
    const container = renderWithMantine(
      <MapResultsSection
        maps={['hanamura']}
        mapDetails={{}}
        mapNotes={{}}
        formatMapName={formatMapName}
      >
        {() => <span>custom-child</span>}
      </MapResultsSection>
    );
    expect(container.textContent).toContain('custom-child');
  });

  it('is a function component', () => {
    expect(typeof MapResultsSection).toBe('function');
  });
});
