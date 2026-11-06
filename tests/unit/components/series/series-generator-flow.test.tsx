import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MantineProvider } from '@mantine/core';
import type { RoundRobinConfig } from '@/shared/series-types';

vi.mock('@/lib/logger/client', () => ({ logger: { debug: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() } }));
const update = vi.fn();
vi.mock('@/lib/notifications', () => ({
  notificationHelper: { loading: vi.fn(), update: (...a: unknown[]) => update(...a) },
}));

import { GeneratorFlow } from '@/components/series/series-generator-modals';

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

const CONFIG = { double: false, divisions: 'none', start_date: '2026-07-01', match_days: [3], time_slots: ['19:00'], timezone: 'UTC', match: {} } as unknown as RoundRobinConfig;
const NAMES = new Map([['a', 'Alpha'], ['b', 'Bravo'], ['c', 'Charlie'], ['d', 'Delta']]);
const PREVIEW = {
  fixtures: [
    { name: 'Alpha vs Bravo', week: 1, start: '2026-07-01T19:00:00.000Z', entrant_ids: ['a', 'b'] },
    { name: 'Charlie vs Delta', week: 1, start: '2026-07-01T20:00:00.000Z', entrant_ids: ['c', 'd'] },
    { name: 'Alpha vs Charlie', week: 2, start: '2026-07-08T19:00:00.000Z', entrant_ids: ['a', 'c'] },
  ],
  byes: [],
  warnings: ['Two matches fall on a holiday'],
};

function stub(commitOk = true) {
  const calls: Array<{ url: string; method: string; body?: unknown }> = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(init.body as string) : undefined });
    if (url.endsWith('/preview')) return { ok: true, status: 200, json: async () => PREVIEW };
    if (!commitOk) return { ok: false, status: 400, json: async () => ({ error: 'Nope' }) };
    return { ok: true, status: 201, json: async () => ({ batch_id: 'b1', events: [{}, {}] }) };
  }));
  return calls;
}

async function mount(onClose = vi.fn(), onCreated = vi.fn()): Promise<HTMLDivElement> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  divs.push(container);
  await act(async () => {
    const root = createRoot(container);
    roots.push(root);
    root.render(
      <MantineProvider env="test">
        <GeneratorFlow<{ ok: boolean }, RoundRobinConfig>
          kind="round-robin"
          form={{ ok: true }}
          validate={() => null}
          buildConfig={() => CONFIG}
          timezone="UTC"
          names={NAMES}
          seriesId="s1"
          noun="matches"
          fields={<div>config fields</div>}
          onClose={onClose}
          onCreated={onCreated}
        />
      </MantineProvider>,
    );
  });
  return container;
}

const button = (c: HTMLElement, text: string) => Array.from(c.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent?.trim() === text);
const setInput = async (input: HTMLInputElement, value: string) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

describe('generator preview and commit', () => {
  it('previews the schedule grouped by week, with warnings', async () => {
    const calls = stub();
    const c = await mount();
    expect(c.textContent).toContain('config fields');
    await act(async () => { button(c, 'Preview')!.click(); });
    await act(async () => { await Promise.resolve(); });

    expect(calls[0]).toMatchObject({ url: '/api/series/s1/generators/round-robin/preview', method: 'POST', body: CONFIG });
    expect(c.querySelector('[data-testid="preview-week-1"]')!.querySelectorAll('[data-testid="fixture-row"]')).toHaveLength(2);
    expect(c.querySelector('[data-testid="preview-week-2"]')!.querySelectorAll('[data-testid="fixture-row"]')).toHaveLength(1);
    expect(c.textContent).toContain('Alpha vs Bravo');
    expect(c.textContent).toContain('Two matches fall on a holiday');
    expect(button(c, 'Create 3 matches')).toBeTruthy();
  });

  it('commits the edited fixtures: changed time, swapped home / away, removed row', async () => {
    const calls = stub();
    const onClose = vi.fn();
    const onCreated = vi.fn();
    const c = await mount(onClose, onCreated);
    await act(async () => { button(c, 'Preview')!.click(); });
    await act(async () => { await Promise.resolve(); });

    // swap home and away of the first fixture
    await act(async () => { c.querySelector<HTMLButtonElement>('button[aria-label="Swap home and away of Alpha vs Bravo"]')!.click(); });
    expect(c.textContent).toContain('Bravo vs Alpha');
    // move the second fixture to another time
    await setInput(c.querySelector<HTMLInputElement>('input[aria-label="Time of Charlie vs Delta"]')!, '21:30');
    // drop the week 2 fixture
    await act(async () => { c.querySelector<HTMLButtonElement>('button[aria-label="Remove Alpha vs Charlie"]')!.click(); });
    expect(button(c, 'Create 2 matches')).toBeTruthy();

    await act(async () => { button(c, 'Create 2 matches')!.click(); });
    await act(async () => { await Promise.resolve(); });

    const commit = calls.find((x) => x.url === '/api/series/s1/generators/round-robin')!;
    expect(commit.method).toBe('POST');
    expect(commit.body).toEqual({
      config: CONFIG,
      fixtures: [
        { name: 'Bravo vs Alpha', week: 1, start: '2026-07-01T19:00:00.000Z', entrant_ids: ['b', 'a'] },
        { name: 'Charlie vs Delta', week: 1, start: '2026-07-01T21:30:00.000Z', entrant_ids: ['c', 'd'] },
      ],
    });
    expect(onClose).toHaveBeenCalled();
    expect(onCreated).toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith('series-commit-round-robin-s1', expect.objectContaining({ type: 'success', message: '2 matches created' }));
  });

  it('goes back to the settings and keeps the dialog open when the commit fails', async () => {
    stub(false);
    const onClose = vi.fn();
    const c = await mount(onClose);
    await act(async () => { button(c, 'Preview')!.click(); });
    await act(async () => { await Promise.resolve(); });
    await act(async () => { button(c, 'Create 3 matches')!.click(); });
    await act(async () => { await Promise.resolve(); });
    expect(update).toHaveBeenCalledWith('series-commit-round-robin-s1', expect.objectContaining({ type: 'error', message: 'Nope' }));
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => { button(c, 'Back to settings')!.click(); });
    expect(c.textContent).toContain('config fields');
  });
});
