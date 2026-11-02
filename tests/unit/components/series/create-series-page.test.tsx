import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router';

vi.mock('@/lib/logger/client', () => ({ logger: { debug: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/notifications', () => ({
  showError: vi.fn(),
  showSuccess: vi.fn(),
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
          <MemoryRouter initialEntries={['/series/create?step=5']}>
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
