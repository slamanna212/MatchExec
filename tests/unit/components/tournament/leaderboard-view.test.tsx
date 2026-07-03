import { describe, it, expect, afterEach } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MantineProvider } from '@mantine/core';
import { LeaderboardView, type CumulativeStanding } from '../../../../src/components/tournament/leaderboard-view';

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

describe('LeaderboardView', () => {
  it('shows empty state when there are no standings', () => {
    const container = renderWithMantine(<LeaderboardView standings={[]} />);
    expect(container.textContent).toContain('No standings yet');
  });

  it('renders each participant with rank, username, and total points', () => {
    const standings: CumulativeStanding[] = [
      { rank: 1, participant_id: 'p1', username: 'Alice', total_points: 43, matches_played: 2, best_position: 1 },
      { rank: 2, participant_id: 'p2', username: 'Bob', total_points: 30, matches_played: 2, best_position: 2 },
    ];
    const container = renderWithMantine(<LeaderboardView standings={standings} />);
    expect(container.textContent).toContain('Alice');
    expect(container.textContent).toContain('43');
    expect(container.textContent).toContain('Bob');
    expect(container.textContent).toContain('30');
    expect(container.textContent).toContain('best finish P1');
  });

  it('does not show best-finish text when best_position is null', () => {
    const standings: CumulativeStanding[] = [
      { rank: 1, participant_id: 'p1', username: 'Alice', total_points: 0, matches_played: 0, best_position: null },
    ];
    const container = renderWithMantine(<LeaderboardView standings={standings} />);
    expect(container.textContent).not.toContain('best finish');
  });
});
