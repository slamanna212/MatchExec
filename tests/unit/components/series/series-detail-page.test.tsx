import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MantineProvider } from '@mantine/core';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/lib/logger/client', () => ({ logger: { debug: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() } }));
const showError = vi.fn();
const showSuccess = vi.fn();
vi.mock('@/lib/notifications', () => ({ showError: (m: string) => showError(m), showSuccess: (m: string) => showSuccess(m) }));

import { SeriesDetailPage } from '@/components/series/series-detail-page';

// jsdom has no matchMedia / ResizeObserver, which Mantine components use
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
  vi.restoreAllMocks();
  showError.mockClear();
  showSuccess.mockClear();
});

type Status = 'created' | 'active' | 'complete' | 'cancelled';

function stubApi(status: Status, patchResponse: { ok: boolean; body: unknown } = { ok: true, body: { event: {}, swapped_with: null } }) {
  const calls: Array<{ url: string; method: string; body?: unknown }> = [];
  const events = [
    { id: 'e1', series_id: 's1', event_type: 'match', match_id: 'm1', event_order: 1, points_multiplier: 1 },
    { id: 'e2', series_id: 's1', event_type: 'tournament', tournament_id: 't1', event_order: 2, points_multiplier: 2 },
  ];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    calls.push({ url, method, body: init?.body ? JSON.parse(init.body as string) : undefined });
    const json = (body: unknown, ok = true) => ({ ok, status: ok ? 200 : 400, json: async () => body });
    if (method === 'PATCH') return json(patchResponse.body, patchResponse.ok);
    if (url.endsWith('/events')) return json({ events });
    if (url.endsWith('/standings')) return json({ standings: [] });
    return json({ series: {
      id: 's1', name: 'Season', status, announcements: true, player_notifications: true,
      created_at: '2026-01-01 00:00:00', updated_at: '2026-01-01 00:00:00',
    } });
  }));
  return calls;
}

async function renderPage(): Promise<HTMLDivElement> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  divs.push(container);
  await act(async () => {
    const root = createRoot(container);
    roots.push(root);
    root.render(<MantineProvider env="test"><SeriesDetailPage seriesId="s1" /></MantineProvider>);
  });
  await act(async () => { await Promise.resolve(); });
  return container;
}

const editButtons = () => Array.from(document.querySelectorAll<HTMLButtonElement>('button[aria-label="Edit event"]'));
const removeButtons = () => Array.from(document.querySelectorAll<HTMLButtonElement>('button[aria-label="Remove event"]'));
const buttonByText = (text: string) => Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(b => b.textContent?.trim() === text);

async function typeInto(input: HTMLInputElement, value: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('SeriesDetailPage event editing', () => {
  it('enables the edit buttons while the series has not started', async () => {
    stubApi('created');
    await renderPage();
    expect(editButtons()).toHaveLength(2);
    expect(editButtons().every(b => !b.disabled)).toBe(true);
    expect(document.body.textContent).not.toContain('locked once the series starts');
  });

  it.each(['active', 'complete', 'cancelled'] as const)('disables editing (and says why) when the series is %s', async (status) => {
    stubApi(status);
    await renderPage();
    expect(editButtons().every(b => b.disabled)).toBe(true);
    expect(document.body.textContent).toContain('locked once the series starts');
  });

  it('removing events stays available while a series is active (only complete/cancelled lock it)', async () => {
    stubApi('active');
    await renderPage();
    expect(removeButtons().every(b => !b.disabled)).toBe(true);
  });

  it('opens a modal pre-filled with the event, and saving unchanged values sends nothing', async () => {
    const calls = stubApi('created');
    await renderPage();
    await act(async () => { editButtons()[1].click(); });

    expect(document.body.textContent).toContain('Edit Event');
    const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('.mantine-NumberInput-input'));
    expect(inputs.map(i => i.value)).toEqual(['2', '2']); // multiplier x2, order 2

    await act(async () => { buttonByText('Save')!.click(); });
    expect(calls.some(c => c.method === 'PATCH')).toBe(false);
    expect(document.body.textContent).not.toContain('Edit Event');
  });

  it('sends only the changed fields', async () => {
    const calls = stubApi('created');
    await renderPage();
    await act(async () => { editButtons()[0].click(); });
    const [multiplier] = Array.from(document.querySelectorAll<HTMLInputElement>('.mantine-NumberInput-input'));
    await typeInto(multiplier, '3');
    await act(async () => { buttonByText('Save')!.click(); });
    await act(async () => { await Promise.resolve(); });

    const patch = calls.find(c => c.method === 'PATCH')!;
    expect(patch.url).toBe('/api/series/s1/events/e1');
    expect(patch.body).toEqual({ points_multiplier: 3 });
    expect(showSuccess).toHaveBeenCalled();
  });

  it('sends the new order, and mentions a swap when the API reports one', async () => {
    const calls = stubApi('created', { ok: true, body: { event: {}, swapped_with: 'e2' } });
    await renderPage();
    await act(async () => { editButtons()[0].click(); });
    const [, order] = Array.from(document.querySelectorAll<HTMLInputElement>('.mantine-NumberInput-input'));
    await typeInto(order, '2');
    await act(async () => { buttonByText('Save')!.click(); });
    await act(async () => { await Promise.resolve(); });

    expect(calls.find(c => c.method === 'PATCH')!.body).toEqual({ event_order: 2 });
    expect(showSuccess.mock.calls[0][0]).toMatch(/swapped/);
  });

  it('rejects an out-of-range multiplier without calling the API', async () => {
    const calls = stubApi('created');
    await renderPage();
    await act(async () => { editButtons()[0].click(); });
    const [multiplier] = Array.from(document.querySelectorAll<HTMLInputElement>('.mantine-NumberInput-input'));
    await typeInto(multiplier, '50');
    await act(async () => { buttonByText('Save')!.click(); });
    expect(calls.some(c => c.method === 'PATCH')).toBe(false);
    expect(showError).toHaveBeenCalled();
    expect(document.body.textContent).toContain('Edit Event'); // stays open for correction
  });

  it('shows the server error and keeps the modal open when the update is refused', async () => {
    stubApi('created', { ok: false, body: { error: 'Events can only be edited before the series starts (series is active)' } });
    await renderPage();
    await act(async () => { editButtons()[0].click(); });
    const [multiplier] = Array.from(document.querySelectorAll<HTMLInputElement>('.mantine-NumberInput-input'));
    await typeInto(multiplier, '4');
    await act(async () => { buttonByText('Save')!.click(); });
    await act(async () => { await Promise.resolve(); });
    expect(showError).toHaveBeenCalledWith('Events can only be edited before the series starts (series is active)');
    expect(document.body.textContent).toContain('Edit Event');
  });
});
