import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MantineProvider } from '@mantine/core';
import type { SeriesEntrantDto, SeriesEntrantMemberDto } from '@/shared/series-types';

vi.mock('@/lib/logger/client', () => ({ logger: { debug: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() } }));
const update = vi.fn();
vi.mock('@/lib/notifications', () => ({
  showError: vi.fn(),
  showSuccess: vi.fn(),
  showWarning: vi.fn(),
  notificationHelper: { loading: vi.fn(), update: (...args: unknown[]) => update(...args) },
}));
vi.mock('@mantine/modals', () => ({ modals: { openConfirmModal: vi.fn() } }));

import { SeriesEntrantsPanel } from '@/components/series/series-entrants-panel';

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
  update.mockClear();
});

const member = (id: string, username: string, role: SeriesEntrantMemberDto['role'] = 'player', left_at: string | null = null): SeriesEntrantMemberDto => ({
  id, entrant_id: 'e', series_id: 's1', user_id: `u-${id}`, discord_user_id: `d-${id}`, username, role, joined_at: '2026-01-01T00:00:00Z', left_at,
});
const entrant = (id: string, name: string, over: Partial<SeriesEntrantDto> = {}): SeriesEntrantDto => ({
  id, series_id: 's1', name, tag: null, color: '#ff0000', logo_url: null, division: null, seed: null, status: 'active', source_entrant_id: null,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', members: [], ...over,
});

const TEAMS: SeriesEntrantDto[] = [
  entrant('t1', 'Boston', { tag: 'BOS', division: 'Atlantic', seed: 1, members: [member('1', 'Cap', 'captain'), member('2', 'Ply'), member('3', 'Bench', 'sub')] }),
  entrant('t2', 'Seoul', { division: 'Pacific', status: 'pending', members: [member('4', 'Kim', 'captain')] }),
];

function stubApi(entrants: SeriesEntrantDto[], former: SeriesEntrantMemberDto[] = []) {
  const calls: Array<{ url: string; method: string; body?: unknown }> = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    calls.push({ url, method, body: init?.body ? JSON.parse(init.body as string) : undefined });
    if (method === 'GET' && url.includes('/entrants')) {
      const history = url.includes('include_left=true');
      const list = history ? entrants.map((e, i) => (i === 0 ? { ...e, members: [...e.members, ...former] } : e)) : entrants;
      return { ok: true, status: 200, json: async () => ({ entrants: list }) };
    }
    return { ok: true, status: 200, json: async () => ({ entrant: entrants[0], cancelled: 2, forfeited: 0 }) };
  }));
  return calls;
}

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

const teamSeries = { id: 's1', status: 'registration' as const, entrant_type: 'team' as const, roster_min: 3, roster_max: 6 };

describe('SeriesEntrantsPanel (team series)', () => {
  it('lists teams grouped by division with roster roles, tag, seed and status', async () => {
    stubApi(TEAMS);
    const container = render(<SeriesEntrantsPanel series={teamSeries} />);
    await flush();
    const text = container.textContent ?? '';
    expect(text).toContain('Atlantic (1)');
    expect(text).toContain('Pacific (1)');
    expect(text.indexOf('Atlantic')).toBeLessThan(text.indexOf('Pacific'));
    expect(text).toContain('Boston');
    expect(text).toContain('BOS');
    expect(text).toContain('#1');
    expect(text).toContain('Captain');
    expect(text).toContain('Sub');
    expect(text).toContain('pending');
    // Seoul has one of the required three players
    expect(text).toContain('Needs 2 more');
    expect(text).toContain('Roster · 3 / 6 players');
    expect(text).toContain('Add team');
  });

  it('approves a pending entrant with a PATCH and tells the page to refresh', async () => {
    const calls = stubApi(TEAMS);
    const onChanged = vi.fn();
    const container = render(<SeriesEntrantsPanel series={teamSeries} onChanged={onChanged} />);
    await flush();
    const approve = [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Approve');
    expect(approve).toBeTruthy();
    await act(async () => { approve!.click(); });
    await flush();
    const patch = calls.find((c) => c.method === 'PATCH');
    expect(patch?.url).toBe('/api/series/s1/entrants/t2');
    expect(patch?.body).toEqual({ status: 'active' });
    expect(onChanged).toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ type: 'success' }));
  });

  it('reloads with roster history when the toggle is switched on', async () => {
    const calls = stubApi(TEAMS, [member('9', 'OldTimer', 'player', '2026-03-01T00:00:00Z')]);
    const container = render(<SeriesEntrantsPanel series={teamSeries} />);
    await flush();
    expect(container.textContent).not.toContain('OldTimer');
    const toggle = [...container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')][0];
    await act(async () => { toggle.click(); });
    await flush();
    expect(calls.some((c) => c.url.endsWith('/entrants?include_left=true'))).toBe(true);
    expect(container.textContent).toContain('Former players');
    expect(container.textContent).toContain('OldTimer');
  });

  it('shows the server message when the entrants can not be loaded', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({ error: 'Boom' }) })));
    const container = render(<SeriesEntrantsPanel series={teamSeries} />);
    await flush();
    expect(container.textContent).toContain('Boom');
  });

  it('is read-only once the series is over', async () => {
    stubApi(TEAMS);
    const container = render(<SeriesEntrantsPanel series={{ ...teamSeries, status: 'complete' }} />);
    await flush();
    expect(container.textContent).toContain('can no longer be changed');
    expect(container.textContent).not.toContain('Add team');
    expect([...container.querySelectorAll('button')].some((b) => b.textContent?.trim() === 'Approve')).toBe(false);
    expect(container.querySelector('button[aria-label^="Actions for"]')).toBeNull();
  });

  it('opens the withdraw modal with both unplayed-match choices and posts the choice', async () => {
    const calls = stubApi(TEAMS);
    const container = render(<SeriesEntrantsPanel series={teamSeries} />);
    await flush();
    await act(async () => { container.querySelector<HTMLButtonElement>('button[aria-label="Actions for Boston"]')!.click(); });
    const item = [...document.body.querySelectorAll('button')].find((b) => b.textContent?.startsWith('Withdraw'));
    expect(item).toBeTruthy();
    await act(async () => { item!.click(); });
    await flush();
    expect(document.body.textContent).toContain('Cancel unplayed matches');
    expect(document.body.textContent).toContain('Forfeit unplayed matches');
    const forfeit = [...document.body.querySelectorAll<HTMLInputElement>('input[type="radio"]')].find((i) => i.value === 'forfeit');
    await act(async () => { forfeit!.click(); });
    const confirm = [...document.body.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Withdraw');
    await act(async () => { confirm!.click(); });
    await flush();
    const post = calls.find((c) => c.method === 'POST' && c.url.endsWith('/withdraw'));
    expect(post?.url).toBe('/api/series/s1/entrants/t1/withdraw');
    expect(post?.body).toEqual({ unplayed: 'forfeit' });
  });
});

describe('SeriesEntrantsPanel (solo series)', () => {
  const soloSeries = { id: 's1', status: 'created' as const, entrant_type: 'solo' as const, roster_min: null, roster_max: null };

  it('lists players without rosters and offers "Add player"', async () => {
    stubApi([
      entrant('p1', 'Racer One', { members: [member('1', 'RacerOne')] }),
      entrant('p2', 'Racer Two', { members: [member('2', 'RacerTwo')] }),
    ]);
    const container = render(<SeriesEntrantsPanel series={soloSeries} />);
    await flush();
    const text = container.textContent ?? '';
    expect(text).toContain('Players (2)');
    expect(text).toContain('Racer One');
    expect(text).toContain('Add player');
    expect(text).not.toContain('Roster ·');
    expect(text).not.toContain('Show roster history');
  });

  it('shows an empty state for a series without entrants', async () => {
    stubApi([]);
    const container = render(<SeriesEntrantsPanel series={soloSeries} />);
    await flush();
    expect(container.textContent).toContain('No players yet');
  });
});
