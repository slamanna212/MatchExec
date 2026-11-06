import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MantineProvider } from '@mantine/core';
import { ScoringConfigEditor } from '@/components/series/scoring-config-editor';

beforeEach(() => {
  window.matchMedia = window.matchMedia || ((query: string) => ({
    matches: false, media: query, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
});

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

  it('shows legacy configs (no mode) with the legacy fields and a notice', () => {
    const container = render(<ScoringConfigEditor value={{ match_win_points: 3, tournament_position_points: [10] }} onChange={vi.fn()} />);
    expect(container.textContent).toContain('saved before standings modes existed');
    expect(container.textContent).toContain('Points for a match win');
    expect(container.textContent).not.toContain('Position points');
    expect(container.textContent).not.toContain('Tiebreakers');
  });

  it('switches a legacy config to a mode without losing the legacy keys', () => {
    const onChange = vi.fn();
    const container = render(<ScoringConfigEditor value={{ match_win_points: 3 }} onChange={onChange} />);
    const radio = [...container.querySelectorAll<HTMLInputElement>('input[type="radio"]')].find((i) => i.value === 'head_to_head');
    act(() => { radio!.click(); });
    expect(onChange).toHaveBeenLastCalledWith({ match_win_points: 3, mode: 'head_to_head' });
  });

  describe('head_to_head', () => {
    it('shows win / loss / tie points and no points-mode fields', () => {
      const container = render(<ScoringConfigEditor value={{ mode: 'head_to_head' }} onChange={vi.fn()} />);
      expect(container.textContent).toContain('Points for a win');
      expect(container.textContent).toContain('Points for a loss');
      expect(container.textContent).toContain('Points for a tie');
      expect(container.textContent).not.toContain('Position points');
    });

    it('lists the default tiebreakers in order and moves one up', () => {
      const onChange = vi.fn();
      const container = render(<ScoringConfigEditor value={{ mode: 'head_to_head' }} onChange={onChange} />);
      const labels = [...container.querySelectorAll('button[aria-label^="Move"][aria-label$="up"]')].map((b) => b.getAttribute('aria-label'));
      expect(labels[0]).toBe('Move Match wins up');
      expect((container.querySelector('button[aria-label="Move Match wins up"]') as HTMLButtonElement).disabled).toBe(true);
      act(() => { container.querySelector<HTMLButtonElement>('button[aria-label="Move Map difference up"]')!.click(); });
      expect(onChange).toHaveBeenLastCalledWith({
        mode: 'head_to_head', tiebreakers: ['map_diff', 'match_wins', 'head_to_head', 'maps_won'],
      });
    });

    it('moves a tiebreaker down and removes one (never the last)', () => {
      const onChange = vi.fn();
      const container = render(<ScoringConfigEditor value={{ mode: 'head_to_head', tiebreakers: ['match_wins', 'maps_won'] }} onChange={onChange} />);
      act(() => { container.querySelector<HTMLButtonElement>('button[aria-label="Move Match wins down"]')!.click(); });
      expect(onChange).toHaveBeenLastCalledWith({ mode: 'head_to_head', tiebreakers: ['maps_won', 'match_wins'] });
      act(() => { container.querySelector<HTMLButtonElement>('button[aria-label="Remove Maps won"]')!.click(); });
      expect(onChange).toHaveBeenLastCalledWith({ mode: 'head_to_head', tiebreakers: ['match_wins'] });
    });

    it('does not offer the last remaining tiebreaker for removal', () => {
      const container = render(<ScoringConfigEditor value={{ mode: 'head_to_head', tiebreakers: ['match_wins'] }} onChange={vi.fn()} />);
      expect((container.querySelector('button[aria-label="Remove Match wins"]') as HTMLButtonElement).disabled).toBe(true);
    });
  });

  describe('points', () => {
    it('renders the position spread, drop worst and the points tiebreakers', () => {
      const container = render(
        <ScoringConfigEditor value={{ mode: 'points', position_points: [25, 18, 15], drop_worst: 1 }} onChange={vi.fn()} />,
      );
      expect(container.querySelector<HTMLInputElement>('input[aria-label="1st position points"]')!.value).toBe('25');
      expect(container.querySelector<HTMLInputElement>('input[aria-label="3rd position points"]')!.value).toBe('15');
      expect(container.textContent).toContain('Drop worst results');
      expect(container.textContent).toContain('Tournament placement points');
      expect(container.textContent).toContain('Event wins');
      expect(container.textContent).not.toContain('Win percentage');
    });

    it('adds and removes positions without touching the tournament placement spread', () => {
      const onChange = vi.fn();
      const container = render(
        <ScoringConfigEditor value={{ mode: 'points', position_points: [25, 18], tournament_position_points: [10] }} onChange={onChange} />,
      );
      act(() => { container.querySelector<HTMLButtonElement>('button[aria-label="Add a position"]')!.click(); });
      expect(onChange).toHaveBeenLastCalledWith({ mode: 'points', position_points: [25, 18, 16], tournament_position_points: [10] });
      act(() => { container.querySelector<HTMLButtonElement>('button[aria-label="Remove 2nd position"]')!.click(); });
      expect(onChange).toHaveBeenLastCalledWith({ mode: 'points', position_points: [25], tournament_position_points: [10] });
    });

    it('applies a preset', () => {
      const onChange = vi.fn();
      const container = render(<ScoringConfigEditor value={{ mode: 'points', position_points: [1] }} onChange={onChange} />);
      act(() => { [...container.querySelectorAll('button')].find((b) => b.textContent === 'Presets')!.click(); });
      const item = [...document.body.querySelectorAll('button')].find((b) => b.textContent?.startsWith('Mario Kart 8'));
      expect(item).toBeTruthy();
      act(() => { item!.click(); });
      expect(onChange).toHaveBeenLastCalledWith({ mode: 'points', position_points: [15, 12, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1] });
    });

    it('toggles the event spread switch', () => {
      const onChange = vi.fn();
      const container = render(<ScoringConfigEditor value={{ mode: 'points', position_points: [10] }} onChange={onChange} />);
      const toggle = container.querySelector<HTMLInputElement>('input[type="checkbox"]');
      expect(toggle!.checked).toBe(true);
      act(() => { toggle!.click(); });
      expect(onChange).toHaveBeenLastCalledWith({ mode: 'points', position_points: [10], position_event_use_event_spread: false });
    });
  });
});
