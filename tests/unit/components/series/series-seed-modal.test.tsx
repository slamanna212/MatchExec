import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MantineProvider } from '@mantine/core';
import type { SeriesEventView } from '@/components/series/series-shared';

vi.mock('@/lib/logger/client', () => ({ logger: { debug: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() } }));
const update = vi.fn();
vi.mock('@/lib/notifications', () => ({
  notificationHelper: { loading: vi.fn(), update: (...a: unknown[]) => update(...a) },
}));

import { SeedPlayoffsModal } from '@/components/series/series-seed-modal';

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
  act(() => { roots.forEach((r) => r.unmount()); });
  divs.forEach((d) => d.remove());
  roots.length = 0;
  divs.length = 0;
  vi.unstubAllGlobals();
  update.mockClear();
});

const EVENT = { id: 'p1', name: 'Playoffs' } as SeriesEventView;
const PREVIEW = {
  qualifiers: [
    { entrant_id: 'a', name: 'Boston', seed: 1, rank: 1, division: 'Atlantic' },
    { entrant_id: 'b', name: 'Seoul', seed: 2, rank: 2, division: 'Pacific' },
    { entrant_id: 'c', name: 'Dallas', seed: 3, rank: 3, division: null },
  ],
  warnings: ['Stage 1 is not complete yet'],
  blockers: ['Stage 1 is not complete yet'],
};
const CLEAN_PREVIEW = { ...PREVIEW, warnings: [], blockers: [] };

function stub(preview: typeof PREVIEW = PREVIEW) {
  const calls: Array<{ url: string; method: string; body?: unknown }> = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(init.body as string) : undefined });
    if (url.endsWith('/seed-preview')) return { ok: true, status: 200, json: async () => preview };
    return { ok: true, status: 200, json: async () => ({ event: {}, tournament_id: 't1' }) };
  }));
  return calls;
}

async function mount(onClose = vi.fn(), onSeeded = vi.fn()) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  divs.push(container);
  await act(async () => {
    const root = createRoot(container);
    roots.push(root);
    root.render(<MantineProvider env="test"><SeedPlayoffsModal seriesId="s1" event={EVENT} onClose={onClose} onSeeded={onSeeded} /></MantineProvider>);
  });
  await act(async () => { await Promise.resolve(); });
  return { onClose, onSeeded };
}

const seedNames = () => Array.from(document.querySelectorAll('[data-testid="seed-row"]')).map((r) => r.textContent ?? '');
const button = (label: string) => Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent?.trim() === label || b.getAttribute('aria-label') === label);

describe('SeedPlayoffsModal', () => {
  it('loads the qualifiers in seed order with their rank, division and the warnings', async () => {
    const calls = stub();
    await mount();
    expect(calls[0].url).toBe('/api/series/s1/events/p1/seed-preview');
    const rows = seedNames();
    expect(rows).toHaveLength(3);
    expect(rows[0]).toContain('Boston');
    expect(rows[0]).toContain('Atlantic');
    expect(rows[0]).toContain('Rank 1');
    expect(document.body.textContent).toContain('Stage 1 is not complete yet');
  });

  it('seeds with the standings order (no override) when nothing was moved and nothing blocks', async () => {
    const calls = stub(CLEAN_PREVIEW);
    const { onClose, onSeeded } = await mount();
    await act(async () => { button('Seed playoffs')!.click(); });
    await act(async () => { await Promise.resolve(); });
    const seed = calls.find((c) => c.url.endsWith('/seed'))!;
    expect(seed.method).toBe('POST');
    expect(seed.body).toEqual({});
    expect(onClose).toHaveBeenCalled();
    expect(onSeeded).toHaveBeenCalled();
  });

  it('blocks seeding on an unfinished source until "Seed anyway" is ticked, then sends force', async () => {
    const calls = stub();
    await mount();
    expect(button('Seed playoffs')!.disabled).toBe(true);
    await act(async () => { document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click(); });
    expect(button('Seed playoffs')!.disabled).toBe(false);
    await act(async () => { button('Seed playoffs')!.click(); });
    await act(async () => { await Promise.resolve(); });
    expect(calls.find((c) => c.url.endsWith('/seed'))!.body).toEqual({ force: true });
  });

  it('sends the manual order when qualifiers were reordered (no confirmation needed)', async () => {
    const calls = stub();
    await mount();
    await act(async () => { button('Move Boston down')!.click(); });
    await act(async () => { button('Move Dallas up')!.click(); });
    expect(seedNames().map((t) => /Boston|Seoul|Dallas/.exec(t)![0])).toEqual(['Seoul', 'Dallas', 'Boston']);
    expect(document.body.textContent).toContain('Custom seed order');
    expect(button('Seed playoffs')!.disabled).toBe(false); // a manual order skips the stage check

    await act(async () => { button('Seed playoffs')!.click(); });
    await act(async () => { await Promise.resolve(); });
    expect(calls.find((c) => c.url.endsWith('/seed'))!.body).toEqual({ entrant_ids: ['b', 'c', 'a'] });
  });

  it('shows the error when the preview is refused', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 409, json: async () => ({ error: 'Event is already seeded' }) })));
    await mount();
    expect(document.body.textContent).toContain('Event is already seeded');
    expect(button('Seed playoffs')!.disabled).toBe(true);
  });
});
