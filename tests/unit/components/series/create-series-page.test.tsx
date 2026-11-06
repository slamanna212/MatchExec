import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router';

const showWarning = vi.fn();
vi.mock('@/lib/logger/client', () => ({ logger: { debug: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/notifications', () => ({
  showError: vi.fn(),
  showSuccess: vi.fn(),
  showWarning: (m: string, t?: string) => showWarning(m, t),
  notificationHelper: { loading: vi.fn(), update: vi.fn() },
}));

import { CreateSeriesPage } from '@/components/series/create-series-page';

beforeEach(() => {
  window.matchMedia = window.matchMedia || ((query: string) => ({
    matches: false, media: query, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  // Mantine's autosizing Textarea (Details step) listens to document.fonts, which the test DOM does not have.
  if (!(document as unknown as { fonts?: unknown }).fonts) {
    Object.defineProperty(document, 'fonts', { value: { addEventListener() {}, removeEventListener() {} }, configurable: true });
  }
  sessionStorage.clear();
});

const roots: Root[] = [];
const divs: HTMLDivElement[] = [];

afterEach(() => {
  act(() => { roots.forEach(r => r.unmount()); });
  divs.forEach(d => d.remove());
  roots.length = 0;
  divs.length = 0;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

function Where(): React.JSX.Element {
  const loc = useLocation();
  return <div data-testid="where">{loc.pathname}{loc.search}</div>;
}

async function flush() {
  await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
}

describe('CreateSeriesPage', () => {
  it('goes to the new series after a successful create instead of back to an empty step 1', async () => {
    sessionStorage.setItem('seriesFormData', JSON.stringify({ name: 'My Series' }));
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/series' && init?.method === 'POST') return { ok: true, status: 201, json: async () => ({ id: 'series-new' }) };
      if (String(url).endsWith('/transition')) return { ok: true, status: 200, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    const container = document.createElement('div');
    document.body.appendChild(container);
    divs.push(container);
    act(() => {
      const root = createRoot(container);
      roots.push(root);
      root.render(
        <MantineProvider>
          <MemoryRouter initialEntries={['/series/create?step=6']}>
            <Where />
            <Routes>
              <Route path="/series/create" element={<CreateSeriesPage />} />
              <Route path="/series/:seriesId" element={<div>series page</div>} />
            </Routes>
          </MemoryRouter>
        </MantineProvider>,
      );
    });

    const create = [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Create Series');
    expect(create).toBeTruthy();
    await act(async () => { create!.click(); });
    await flush();

    expect(container.querySelector('[data-testid="where"]')?.textContent).toBe('/series/series-new');
    expect(container.textContent).toContain('series page');
    expect(JSON.parse(sessionStorage.getItem('seriesFormData') ?? '{}').name ?? '').toBe('');
  });

  it('creates the series with its setup, then copies entrants from the previous series and reports skipped ones', async () => {
    sessionStorage.setItem('seriesFormData', JSON.stringify({
      name: 'Season 2', entrant_type: 'team', roster_min: 5, roster_max: 6, scoring_type: 'Normal',
      game_ids: ['overwatch2'], game_id: 'overwatch2', previous_series_id: 'series-old', copy_include_members: false,
    }));
    const calls: Array<{ url: string; method: string; body?: Record<string, unknown> }> = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(init.body as string) : undefined });
      if (url === '/api/series' && init?.method === 'POST') return { ok: true, status: 201, json: async () => ({ id: 'series-new' }) };
      if (url.endsWith('/entrants/copy')) {
        return { ok: true, status: 201, json: async () => ({ entrants: [], skipped: [{ name: 'Dup Team', reason: 'exists' }] }) };
      }
      if (url === '/api/games') return { ok: true, status: 200, json: async () => [] };
      return { ok: true, status: 200, json: async () => ({}) };
    }));

    const container = document.createElement('div');
    document.body.appendChild(container);
    divs.push(container);
    act(() => {
      const root = createRoot(container);
      roots.push(root);
      root.render(
        <MantineProvider>
          <MemoryRouter initialEntries={['/series/create?step=6']}>
            <Routes>
              <Route path="/series/create" element={<CreateSeriesPage />} />
              <Route path="/series/:seriesId" element={<div>series page</div>} />
            </Routes>
          </MemoryRouter>
        </MantineProvider>,
      );
    });
    await flush();

    const create = [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Create Series');
    await act(async () => { create!.click(); });
    await flush();

    const post = calls.find((c) => c.url === '/api/series' && c.method === 'POST');
    expect(post?.body).toMatchObject({
      name: 'Season 2', entrant_type: 'team', roster_min: 5, roster_max: 6, scoring_type: 'Normal',
      game_id: 'overwatch2', game_ids: ['overwatch2'], previous_series_id: 'series-old',
      scoring_config: { mode: 'head_to_head' },
      discord_config: { registration_posts: true, weekly_schedule: true, standings_posts: true, schedule_lead_hours: 48 },
    });
    const copy = calls.find((c) => c.url === '/api/series/series-new/entrants/copy');
    expect(copy?.body).toEqual({ from_series_id: 'series-old', include_members: false });
    expect(showWarning).toHaveBeenCalledWith('Skipped: Dup Team', 'Entrants copied with problems');
    expect(container.textContent).toContain('series page');
  });

  it('still returns to Details when a later step is opened without a name', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })));
    const container = document.createElement('div');
    document.body.appendChild(container);
    divs.push(container);
    act(() => {
      const root = createRoot(container);
      roots.push(root);
      root.render(
        <MantineProvider>
          <MemoryRouter initialEntries={['/series/create?step=4']}>
            <Where />
            <Routes>
              <Route path="/series/create" element={<CreateSeriesPage />} />
            </Routes>
          </MemoryRouter>
        </MantineProvider>,
      );
    });
    await flush();
    expect(container.querySelector('[data-testid="where"]')?.textContent).toBe('/series/create?step=1');
  });
});
