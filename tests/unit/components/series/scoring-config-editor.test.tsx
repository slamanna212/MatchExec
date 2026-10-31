import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MantineProvider } from '@mantine/core';
import { ScoringConfigEditor } from '@/components/series/scoring-config-editor';

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
    root.render(<MantineProvider env="test">{element}</MantineProvider>);
  });
  return container;
}

describe('ScoringConfigEditor', () => {
  it('renders one labelled input per placement', () => {
    const container = render(
      <ScoringConfigEditor value={{ tournament_position_points: [25, 18, 15] }} onChange={vi.fn()} />
    );
    for (const label of ['1st place points', '2nd place points', '3rd place points']) {
      const input = container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
      expect(input).not.toBeNull();
    }
    expect(container.querySelector<HTMLInputElement>('input[aria-label="1st place points"]')!.value).toBe('25');
    expect(container.textContent).toContain('Places beyond the last one score 0.');
  });

  it('adds a place below the last value and removes the last place', () => {
    const onChange = vi.fn();
    const container = render(
      <ScoringConfigEditor value={{ match_win_points: 3, tournament_position_points: [25, 18] }} onChange={onChange} />
    );
    act(() => { container.querySelector<HTMLButtonElement>('button[aria-label="Add a place"]')!.click(); });
    expect(onChange).toHaveBeenLastCalledWith({ match_win_points: 3, tournament_position_points: [25, 18, 16] });

    act(() => { container.querySelector<HTMLButtonElement>('button[aria-label="Remove 2nd place"]')!.click(); });
    expect(onChange).toHaveBeenLastCalledWith({ match_win_points: 3, tournament_position_points: [25] });
  });

  it('starts an empty placement list at 10 points', () => {
    const onChange = vi.fn();
    const container = render(<ScoringConfigEditor value={{}} onChange={onChange} />);
    act(() => { container.querySelector<HTMLButtonElement>('button[aria-label="Add a place"]')!.click(); });
    expect(onChange).toHaveBeenLastCalledWith({ tournament_position_points: [10] });
  });
});
