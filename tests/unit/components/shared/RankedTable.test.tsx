import { describe, it, expect, afterEach } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MantineProvider } from '@mantine/core';
import { RankedTable } from '../../../../src/components/shared/RankedTable';

const roots: Root[] = [];
const divs: HTMLDivElement[] = [];

afterEach(() => {
  act(() => { roots.forEach(r => r.unmount()); });
  divs.forEach(d => d.remove());
  roots.length = 0;
  divs.length = 0;
});

function render(element: React.ReactElement): HTMLDivElement {
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

interface Row { id: string; name: string; rank: number; pts: number }

const rows: Row[] = [
  { id: 'a', name: 'Alice', rank: 1, pts: 30 },
  { id: 'b', name: 'Bob', rank: 2, pts: 20 },
  { id: 'c', name: 'Cara', rank: 2, pts: 20 },
  { id: 'd', name: 'Dan', rank: 4, pts: 5 },
];

describe('RankedTable', () => {
  it('renders the header, a row per entry with its rank, and custom columns', () => {
    const container = render(
      <RankedTable
        rows={rows}
        getKey={r => r.id}
        getRank={r => r.rank}
        primaryHeader="Player"
        renderPrimary={r => <span>{r.name}</span>}
        columns={[{ key: 'pts', header: 'Points', width: '84px', align: 'right', render: r => <span>{r.pts}pts</span> }]}
      />
    );
    const text = container.textContent ?? '';
    expect(text).toContain('Rank');
    expect(text).toContain('Player');
    expect(text).toContain('Points');
    for (const r of rows) {
      expect(text).toContain(r.name);
      expect(text).toContain(`${r.pts}pts`);
    }
    // header + 4 rows, each a grid with rank + name + 1 column
    const grids = Array.from(container.querySelectorAll<HTMLDivElement>('div')).filter(d => d.style.gridTemplateColumns);
    expect(grids).toHaveLength(5);
    expect(grids[0].style.gridTemplateColumns).toBe('48px minmax(120px, 1fr) 84px');
  });

  it('tints only rank-1 rows as leaders', () => {
    const container = render(
      <RankedTable
        rows={rows}
        getKey={r => r.id}
        getRank={r => r.rank}
        primaryHeader="Player"
        renderPrimary={r => r.name}
        columns={[]}
      />
    );
    const grids = Array.from(container.querySelectorAll<HTMLDivElement>('div')).filter(d => d.style.gridTemplateColumns);
    const body = grids.slice(1);
    const leaderClass = body[0].className.split(' ').find(c => !body[1].className.split(' ').includes(c));
    expect(leaderClass).toBeTruthy();
    expect(body.filter(g => g.className.includes(leaderClass!))).toHaveLength(1);
  });
});
