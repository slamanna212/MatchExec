import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter, Routes, Route } from 'react-router';

vi.mock('@/lib/logger/client', () => ({ logger: { debug: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() } }));
const showError = vi.fn();
vi.mock('@/lib/notifications', () => ({
  showError: (m: string) => showError(m),
  showSuccess: vi.fn(),
  showWarning: vi.fn(),
  notificationHelper: { loading: vi.fn(), update: vi.fn() },
}));

import { SeriesSetupFields } from '@/components/series/series-setup-fields';
import { EditSeriesPage } from '@/components/series/edit-series-page';
import { EMPTY_SERIES_FORM } from '@/components/series/series-form';
import type { SeriesFormData } from '@/components/series/series-form';
import type { GameCatalog } from '@/components/series/series-setup';

beforeEach(() => {
  window.matchMedia = window.matchMedia || ((query: string) => ({
    matches: false, media: query, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  if (!(document as unknown as { fonts?: unknown }).fonts) {
    Object.defineProperty(document, 'fonts', { value: { addEventListener() {}, removeEventListener() {} }, configurable: true });
  }
});

const roots: Root[] = [];
const divs: HTMLDivElement[] = [];

afterEach(() => {
  act(() => { roots.forEach((r) => r.unmount()); });
  divs.forEach((d) => d.remove());
  roots.length = 0;
  divs.length = 0;
  vi.unstubAllGlobals();
  showError.mockClear();
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

async function flush() {
  await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
}

const catalog: GameCatalog = {
  games: [{ id: 'ow2', name: 'Overwatch 2' }, { id: 'mk8', name: 'Mario Kart 8' }],
  modesByGame: {
    ow2: [{ id: 'control', name: 'Control', scoring_type: 'Normal' }],
    mk8: [{ id: 'gp', name: 'Grand Prix', scoring_type: 'Position' }],
  },
};

describe('SeriesSetupFields', () => {
  it('shows roster bounds only for team series', () => {
    const solo = render(<SeriesSetupFields form={EMPTY_SERIES_FORM} update={vi.fn()} catalog={catalog} catalogLoaded />);
    expect(solo.textContent).not.toContain('Minimum roster size');
    const team = render(<SeriesSetupFields form={{ ...EMPTY_SERIES_FORM, entrant_type: 'team' }} update={vi.fn()} catalog={catalog} catalogLoaded />);
    expect(team.textContent).toContain('Minimum roster size');
    expect(team.textContent).toContain('Maximum roster size');
  });

  it('explains the locked fields and disables them', () => {
    const container = render(
      <SeriesSetupFields form={EMPTY_SERIES_FORM} update={vi.fn()} catalog={catalog} catalogLoaded locks={{ entrantType: true, scoringType: true }} />,
    );
    expect(container.textContent).toContain('can not change once the series has entrants');
    expect(container.textContent).toContain('can not change once the series has events');
    const radios = [...container.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
    expect(radios.length).toBeGreaterThan(0);
    expect(radios.every((r) => r.disabled)).toBe(true);
  });

  it('describes the games filter for the chosen scoring type', () => {
    const container = render(<SeriesSetupFields form={{ ...EMPTY_SERIES_FORM, scoring_type: 'Position' }} update={vi.fn()} catalog={catalog} catalogLoaded />);
    expect(container.textContent).toContain('Only games with a Racing / Position mode are listed');
  });

  it('switching the scoring type drops incompatible games and follows the default standings mode', () => {
    const update = vi.fn();
    const form: SeriesFormData = {
      ...EMPTY_SERIES_FORM, scoring_type: 'Normal', game_ids: ['ow2', 'mk8'], game_id: 'ow2', game_mode_id: 'control',
    };
    const container = render(<SeriesSetupFields form={form} update={update} catalog={catalog} catalogLoaded />);
    // Scoring type is the Select whose input carries the current label
    const input = [...container.querySelectorAll<HTMLInputElement>('input')].find((i) => i.value === 'Team vs Team')!;
    act(() => { input.focus(); input.click(); });
    const option = [...document.body.querySelectorAll('[role="option"]')].find((o) => o.textContent === 'Racing / Position');
    expect(option).toBeTruthy();
    act(() => { (option as HTMLElement).click(); });
    expect(update).toHaveBeenCalledWith('scoring_type', 'Position');
    expect(update).toHaveBeenCalledWith('game_ids', ['mk8']);
    expect(update).toHaveBeenCalledWith('game_id', 'mk8');
    expect(update).toHaveBeenCalledWith('game_mode_id', null);
    expect(update).toHaveBeenCalledWith('scoring_config', { mode: 'points', position_points: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1] });
  });
});

describe('EditSeriesPage with a legacy series', () => {
  it('saves a rename without sending setup fields and shows the scoring type as unrestricted', async () => {
    const calls: Array<{ url: string; method: string; body?: Record<string, unknown> }> = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      calls.push({ url, method, body: init?.body ? JSON.parse(init.body as string) : undefined });
      const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
      if (url === '/api/series/s1' && method === 'GET') {
        return ok({
          series: {
            id: 's1', name: 'Old Series', status: 'active', announcements: true, player_notifications: true, event_count: 2,
            scoring_config: { match_win_points: 3 }, game_id: 'ow2',
          },
        });
      }
      if (url.startsWith('/api/series/s1/entrants')) return ok({ entrants: [] });
      if (url === '/api/games') return ok([{ id: 'ow2', name: 'Overwatch 2' }]);
      if (url.includes('/modes')) return ok([{ id: 'control', name: 'Control', scoring_type: 'Normal' }]);
      return ok({ success: true });
    }));

    const container = render(
      <MemoryRouter initialEntries={['/series/s1/edit']}>
        <Routes>
          <Route path="/series/s1/edit" element={<EditSeriesPage seriesId="s1" />} />
          <Route path="/series/s1" element={<div>detail</div>} />
        </Routes>
      </MemoryRouter>,
    );
    await flush();
    await flush();
    expect(container.textContent).toContain('can not change once the series has events');

    const save = [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Save Changes');
    await act(async () => { save!.click(); });
    await flush();

    const patch = calls.find((c) => c.method === 'PATCH');
    expect(patch?.url).toBe('/api/series/s1');
    expect(patch?.body).toMatchObject({ name: 'Old Series', scoring_config: { match_win_points: 3 } });
    for (const key of ['entrant_type', 'scoring_type', 'game_id', 'game_ids', 'game_mode_id', 'roster_min', 'roster_max']) {
      expect(patch?.body).not.toHaveProperty(key);
    }
    expect(container.textContent).toContain('detail');
  });
});
