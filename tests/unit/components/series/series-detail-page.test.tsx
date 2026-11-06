import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter, useLocation } from 'react-router';

vi.mock('@/lib/logger/client', () => ({ logger: { debug: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() } }));
const showError = vi.fn();
const showSuccess = vi.fn();
// The page reports results through notificationHelper.loading/update; route the final
// update to showError/showSuccess so assertions stay simple.
vi.mock('@/lib/notifications', () => ({
  showError: (m: string) => showError(m),
  showSuccess: (m: string) => showSuccess(m),
  showWarning: vi.fn(),
  notificationHelper: {
    loading: vi.fn(),
    update: (_id: string, o: { type: string; message: string }) => (o.type === 'error' ? showError(o.message) : showSuccess(o.message)),
  },
}));
const openConfirmModal = vi.fn();
vi.mock('@mantine/modals', () => ({ modals: { openConfirmModal: (...a: unknown[]) => openConfirmModal(...a) } }));

import { SeriesDetailPage, parseSeriesTab } from '@/components/series/series-detail-page';

// jsdom has no matchMedia / ResizeObserver, which Mantine components use
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
  act(() => { roots.forEach(r => r.unmount()); });
  divs.forEach(d => d.remove());
  roots.length = 0;
  divs.length = 0;
  vi.unstubAllGlobals();
  showError.mockClear();
  showSuccess.mockClear();
  openConfirmModal.mockClear();
});

type Status = 'created' | 'registration' | 'active' | 'complete' | 'cancelled';

const game = { game_id: 'g1', game_name: 'Game', game_icon: null, game_color: '#ff0000', game_cover: null };
const baseEvent = {
  series_id: 's1', stage_id: null, event_type: 'match', tournament_id: null, event_date: null, role: 'regular', week: null,
  counts_for_standings: true, batch_id: null, status: 'live', entrant_ids: null, seeding_rule: null, target_status: 'created',
  start_date: null, event_image_url: null, ...game,
};
const EVENTS = [
  { ...baseEvent, id: 'e1', match_id: 'm1', event_order: 1, points_multiplier: 1, name: 'Opener', stage_id: 'st1', week: 1, entrants: [
    { entrant_id: 'a', name: 'Alpha', color: '#ff0000', score: 2, is_winner: true }, { entrant_id: 'b', name: 'Bravo', color: null, score: 1, is_winner: false },
  ], target_status: 'complete' },
  { ...baseEvent, id: 'e2', event_type: 'tournament', match_id: null, tournament_id: 't1', event_order: 2, points_multiplier: 2, name: 'Finals', stage_id: 'st1', week: 2 },
  { ...baseEvent, id: 'e3', match_id: 'm3', event_order: 3, points_multiplier: 1, name: 'Exhibition night', role: 'exhibition', counts_for_standings: false },
];
const STAGES = [
  { id: 'st1', series_id: 's1', name: 'Stage 1', stage_order: 1, status: 'active', counts_toward_season: true, scoring_config: null, created_at: '', updated_at: '' },
  { id: 'st2', series_id: 's1', name: 'Playoffs', stage_order: 2, status: 'upcoming', counts_toward_season: false, scoring_config: null, created_at: '', updated_at: '' },
];

interface StubOptions {
  champion?: { entrant_id: string | null; name: string; source: 'season_playoff' | 'standings' } | null;
  events?: unknown[];
  stages?: unknown[];
  patch?: { ok: boolean; body: unknown };
  entrants?: unknown[];
  scoringType?: 'Normal' | 'FFA' | 'Position';
}

function stubApi(status: Status, opts: StubOptions = {}) {
  const calls: Array<{ url: string; method: string; body?: unknown }> = [];
  const patchResponse = opts.patch ?? { ok: true, body: { event: {}, swapped_with: null } };
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    calls.push({ url, method, body: init?.body ? JSON.parse(init.body as string) : undefined });
    const json = (body: unknown, ok = true) => ({ ok, status: ok ? 200 : 400, json: async () => body });
    if (method === 'PATCH') return json(patchResponse.body, patchResponse.ok);
    if (method === 'DELETE') return json({ success: true, deleted_target: true });
    if (method === 'POST' && url.endsWith('/complete')) return json({ stage: STAGES[0], seedable_event_ids: ['p1'] });
    if (url.includes('/standings')) return json({ series_id: 's1', series_name: 'Season', mode: 'head_to_head', scope: { type: 'season' }, view: 'entrant', events: [], divisions: [], rows: [], standings: [] });
    if (url.endsWith('/events')) return json({ events: opts.events ?? EVENTS });
    if (url.endsWith('/stages')) return json({ stages: opts.stages ?? STAGES });
    if (url.includes('/entrants')) return json({ entrants: opts.entrants ?? [] });
    if (/^\/api\/games\/[^/]+\/modes$/.test(url)) return json([{ id: 'm1', name: 'Control', scoring_type: opts.scoringType ?? 'Normal', team_size: 5 }]);
    if (url === '/api/games') return json([{ id: 'g1', name: 'Game', iconUrl: null, color: '#ff0000' }]);
    if (url.startsWith('/api/settings')) return json({});
    return json({ series: {
      id: 's1', name: 'Season', status, announcements: true, player_notifications: true, entrant_type: 'team', scoring_type: opts.scoringType ?? 'Normal',
      created_at: '2026-01-01 00:00:00', updated_at: '2026-01-01 00:00:00', scoring_config: { mode: 'head_to_head' },
      event_count: 3, completed_event_count: 1, participant_count: 0,
      next_event: null, last_event_game: null, series_game: null, champion: opts.champion ?? null,
    } });
  }));
  return calls;
}

function LocationProbe(): React.ReactElement {
  const location = useLocation();
  return <div data-testid="search">{location.search}</div>;
}

async function renderPage(entry = '/series/s1'): Promise<HTMLDivElement> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  divs.push(container);
  await act(async () => {
    const root = createRoot(container);
    roots.push(root);
    root.render(
      <MantineProvider env="test">
        <MemoryRouter initialEntries={[entry]}>
          <SeriesDetailPage seriesId="s1" />
          <LocationProbe />
        </MemoryRouter>
      </MantineProvider>,
    );
  });
  await act(async () => { await Promise.resolve(); });
  await act(async () => { await Promise.resolve(); });
  return container;
}

const search = () => document.querySelector('[data-testid="search"]')!.textContent;
const tabRadio = (label: string) => Array.from(document.querySelectorAll<HTMLInputElement>('input[type="radio"]')).find((i) => i.value === label)!;
const buttonByText = (text: string) => Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(b => b.textContent?.trim() === text);
const rows = () => Array.from(document.querySelectorAll<HTMLElement>('[data-testid="series-event-row"]'));
const rowButton = (row: HTMLElement, label: string) => row.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;

async function openRowMenu(row: HTMLElement) {
  await act(async () => { rowButton(row, 'Event actions').click(); });
}
const menuItem = (text: string) => Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).find((i) => i.textContent?.trim() === text)!;

async function typeInto(input: HTMLInputElement, value: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('tabs and URL persistence', () => {
  it('parses unknown tab values as the overview', () => {
    expect(parseSeriesTab(null)).toBe('overview');
    expect(parseSeriesTab('nope')).toBe('overview');
    expect(parseSeriesTab('standings')).toBe('standings');
  });

  it('opens on the overview without a tab parameter', async () => {
    stubApi('active');
    const c = await renderPage();
    expect(c.textContent).toContain('Up next');
    expect(search()).toBe('');
  });

  it('opens the tab named in the URL', async () => {
    stubApi('active');
    await renderPage('/series/s1?tab=schedule');
    expect(rows()).toHaveLength(3);
    expect(tabRadio('schedule').checked).toBe(true);
  });

  it('writes the tab to the URL when switching and removes it for the overview', async () => {
    stubApi('active');
    const c = await renderPage();
    await act(async () => { tabRadio('standings').click(); });
    expect(search()).toBe('?tab=standings');
    expect(c.textContent).toContain('No standings yet');

    await act(async () => { tabRadio('entrants').click(); });
    expect(search()).toBe('?tab=entrants');

    await act(async () => { tabRadio('overview').click(); });
    expect(search()).toBe('');
  });
});

describe('overview', () => {
  it('shows the champion banner when the series has a champion', async () => {
    stubApi('complete', { champion: { entrant_id: 'a', name: 'Alpha', source: 'season_playoff' } });
    const c = await renderPage();
    const banner = c.querySelector('[data-testid="champion-banner"]')!;
    expect(banner.textContent).toContain('Alpha');
    expect(banner.textContent).toContain('Won the season playoffs');
  });

  it('has no banner without a champion and lists the unfinished events', async () => {
    stubApi('active');
    const c = await renderPage();
    expect(c.querySelector('[data-testid="champion-banner"]')).toBeNull();
    expect(rows().map((r) => r.textContent)).toEqual(expect.arrayContaining([expect.stringContaining('Finals')]));
  });
});

describe('schedule tab', () => {
  it('groups events by stage and week, with an Unstaged group for the rest', async () => {
    stubApi('active');
    await renderPage('/series/s1?tab=schedule');
    const stage1 = document.querySelector('[data-testid="stage-section-st1"]')!;
    expect(stage1.textContent).toContain('Stage 1');
    expect(stage1.textContent).toContain('Week 1');
    expect(stage1.textContent).toContain('Week 2');
    expect(stage1.textContent).toContain('Opener');
    expect(stage1.textContent).toContain('Finals');
    expect(stage1.textContent).not.toContain('Exhibition night');

    const playoffs = document.querySelector('[data-testid="stage-section-st2"]')!;
    expect(playoffs.textContent).toContain('No events in this stage');
    expect(playoffs.textContent).toContain('Not in season');

    const unstaged = document.querySelector('[data-testid="stage-section-__unstaged"]')!;
    expect(unstaged.textContent).toContain('Exhibition night');
    expect(unstaged.textContent).toContain('Exhibition');
  });

  it('hides the Unstaged group once every event has a stage', async () => {
    stubApi('active', { events: EVENTS.slice(0, 2) });
    await renderPage('/series/s1?tab=schedule');
    expect(document.querySelector('[data-testid="stage-section-__unstaged"]')).toBeNull();
  });

  it('shows "A vs B" with the score for a two-entrant match', async () => {
    stubApi('active');
    await renderPage('/series/s1?tab=schedule');
    const versus = document.querySelector('[data-testid="versus"]')!;
    expect(versus.textContent).toContain('Alpha');
    expect(versus.textContent).toContain('Bravo');
    expect(versus.textContent).toContain('2');
    expect(versus.textContent).toContain('vs');
  });

  it('reorders with the up / down buttons before the series starts (patches the neighbour\'s order)', async () => {
    const calls = stubApi('created');
    await renderPage('/series/s1?tab=schedule');
    expect(rowButton(rows()[0], 'Move event up').disabled).toBe(true);
    await act(async () => { rowButton(rows()[1], 'Move event up').click(); });
    await act(async () => { await Promise.resolve(); });
    const patch = calls.find((c) => c.method === 'PATCH')!;
    expect(patch.url).toBe('/api/series/s1/events/e2');
    expect(patch.body).toEqual({ event_order: 1 });
  });

  it('locks reordering once the series is running but still allows moving between stages', async () => {
    const calls = stubApi('active');
    await renderPage('/series/s1?tab=schedule');
    expect(rowButton(rows()[1], 'Move event up').disabled).toBe(true);
    await openRowMenu(rows()[0]);
    await act(async () => { menuItem('Playoffs').click(); });
    await act(async () => { await Promise.resolve(); });
    const patch = calls.find((c) => c.method === 'PATCH')!;
    expect(patch.url).toBe('/api/series/s1/events/e1');
    expect(patch.body).toEqual({ stage_id: 'st2' });
  });

  it.each(['complete', 'cancelled'] as const)('is read-only when the series is %s', async (status) => {
    stubApi(status);
    const c = await renderPage('/series/s1?tab=schedule');
    expect(rows()).toHaveLength(3);
    expect(c.querySelector('button[aria-label="Event actions"]')).toBeNull();
    expect(buttonByText('Add event')!.disabled).toBe(true);
    expect(buttonByText('Add stage')).toBeUndefined();
    expect(c.textContent).toContain('can no longer be changed');
  });

  it('confirms removal, mentioning that unstarted series-created events are deleted too', async () => {
    const calls = stubApi('created');
    await renderPage('/series/s1?tab=schedule');
    await openRowMenu(rows()[1]);
    await act(async () => { menuItem('Remove from series').click(); });
    expect(openConfirmModal).toHaveBeenCalledTimes(1);
    const config = openConfirmModal.mock.calls[0][0] as { children: React.ReactElement<{ children: string }>; onConfirm: () => void };
    expect(config.children.props.children).toContain('it is deleted too');
    await act(async () => { config.onConfirm(); });
    await act(async () => { await Promise.resolve(); });
    expect(calls.find((c) => c.method === 'DELETE')!.url).toBe('/api/series/s1/events/e2');
    expect(showSuccess).toHaveBeenCalledWith(expect.stringContaining('removed'));
  });

  it('offers regenerate / remove for events of a generated batch', async () => {
    const calls = stubApi('active', { events: [{ ...EVENTS[1], batch_id: 'b1' }] });
    await renderPage('/series/s1?tab=schedule');
    await openRowMenu(rows()[0]);
    await act(async () => { menuItem('Regenerate unplayed').click(); });
    const config = openConfirmModal.mock.calls[0][0] as { onConfirm: () => void };
    await act(async () => { config.onConfirm(); });
    await act(async () => { await Promise.resolve(); });
    expect(calls.some((c) => c.method === 'POST' && c.url === '/api/series/s1/batches/b1/regenerate')).toBe(true);

    await openRowMenu(rows()[0]);
    await act(async () => { menuItem('Remove unplayed').click(); });
    const remove = openConfirmModal.mock.calls[1][0] as { onConfirm: () => void };
    await act(async () => { remove.onConfirm(); });
    await act(async () => { await Promise.resolve(); });
    expect(calls.some((c) => c.method === 'DELETE' && c.url === '/api/series/s1/batches/b1')).toBe(true);
  });

  it('shows Seed playoffs for a planned event and highlights it once its stage is complete', async () => {
    const planned = {
      ...baseEvent, id: 'p1', event_type: 'tournament', match_id: null, event_order: 4, points_multiplier: 1, name: 'Stage playoffs', status: 'planned',
      target_status: null, role: 'stage_playoff', counts_for_standings: false, stage_id: 'st2',
      seeding_rule: { source: 'stage', stage_id: 'st1', top: 4, format: 'single-elimination', template: { name: 'Stage playoffs' } },
    };
    stubApi('active', { events: [planned], stages: [{ ...STAGES[0], status: 'complete' }, STAGES[1]] });
    await renderPage('/series/s1?tab=schedule');
    const row = rows()[0];
    expect(row.textContent).toContain('Ready to seed');
    expect(row.textContent).toContain('Stage playoff');
    expect(buttonByText('Seed playoffs')).toBeTruthy();
  });

  it('completes a stage through the confirm dialog', async () => {
    const calls = stubApi('active');
    await renderPage('/series/s1?tab=schedule');
    await act(async () => { buttonByText('Complete stage')!.click(); });
    const config = openConfirmModal.mock.calls[0][0] as { onConfirm: () => void };
    await act(async () => { config.onConfirm(); });
    await act(async () => { await Promise.resolve(); });
    expect(calls.some((c) => c.method === 'POST' && c.url === '/api/series/s1/stages/st1/complete')).toBe(true);
  });
});

describe('event editing', () => {
  const openEdit = async () => {
    await openRowMenu(rows()[0]);
    await act(async () => { menuItem('Edit...').click(); });
  };
  const numberInputs = () => Array.from(document.querySelectorAll<HTMLInputElement>('.mantine-NumberInput-input'));

  it('opens a modal pre-filled with the event, and saving unchanged values sends nothing', async () => {
    const calls = stubApi('created');
    await renderPage('/series/s1?tab=schedule');
    await openEdit();
    expect(document.body.textContent).toContain('Edit Event');
    expect(numberInputs().map(i => i.value)).toEqual(['1', '1', '1']); // multiplier x1, order 1, week 1

    await act(async () => { buttonByText('Save')!.click(); });
    expect(calls.some(c => c.method === 'PATCH')).toBe(false);
    expect(document.body.textContent).not.toContain('Edit Event');
  });

  it('sends only the changed fields', async () => {
    const calls = stubApi('created');
    await renderPage('/series/s1?tab=schedule');
    await openEdit();
    await typeInto(numberInputs()[0], '3');
    await act(async () => { buttonByText('Save')!.click(); });
    await act(async () => { await Promise.resolve(); });

    const patch = calls.find((c) => c.method === 'PATCH')!;
    expect(patch.url).toBe('/api/series/s1/events/e1');
    expect(patch.body).toEqual({ points_multiplier: 3 });
    expect(showSuccess).toHaveBeenCalled();
  });

  it('sends the new order, and mentions a swap when the API reports one', async () => {
    const calls = stubApi('created', { patch: { ok: true, body: { event: {}, swapped_with: 'e2' } } });
    await renderPage('/series/s1?tab=schedule');
    await openEdit();
    await typeInto(numberInputs()[1], '2');
    await act(async () => { buttonByText('Save')!.click(); });
    await act(async () => { await Promise.resolve(); });

    expect(calls.find((c) => c.method === 'PATCH')!.body).toEqual({ event_order: 2 });
    expect(showSuccess.mock.calls.at(-1)![0]).toMatch(/swapped/);
  });

  it('rejects an out-of-range multiplier without calling the API', async () => {
    const calls = stubApi('created');
    await renderPage('/series/s1?tab=schedule');
    await openEdit();
    await typeInto(numberInputs()[0], '50');
    expect(buttonByText('Save')!.disabled).toBe(true);
    await act(async () => { buttonByText('Save')!.click(); });
    expect(calls.some(c => c.method === 'PATCH')).toBe(false);
    expect(document.body.textContent).toContain('Must be between 0.1 and 10');
    expect(document.body.textContent).toContain('Edit Event');
  });

  it('only the week is editable once the series is running', async () => {
    const calls = stubApi('active');
    await renderPage('/series/s1?tab=schedule');
    await openEdit();
    expect(numberInputs()[0].disabled).toBe(true); // multiplier
    expect(numberInputs()[1].disabled).toBe(true); // order
    expect(numberInputs()[2].disabled).toBe(false); // week
    expect(document.body.textContent).toContain('locked once the series starts');
    await typeInto(numberInputs()[2], '4');
    await act(async () => { buttonByText('Save')!.click(); });
    await act(async () => { await Promise.resolve(); });
    expect(calls.find((c) => c.method === 'PATCH')!.body).toEqual({ week: 4 });
  });

  it('shows the server error and keeps the modal open when the update is refused', async () => {
    stubApi('created', { patch: { ok: false, body: { error: 'Events can only be edited before the series starts (series is active)' } } });
    await renderPage('/series/s1?tab=schedule');
    await openEdit();
    await typeInto(numberInputs()[0], '4');
    await act(async () => { buttonByText('Save')!.click(); });
    await act(async () => { await Promise.resolve(); });
    expect(showError).toHaveBeenCalledWith('Events can only be edited before the series starts (series is active)');
    expect(document.body.textContent).toContain('Edit Event');
  });
});

const ENTRANTS = ['a', 'b', 'c'].map((id, i) => ({
  id, series_id: 's1', name: `Team ${id.toUpperCase()}`, tag: null, color: null, logo_url: null, division: null, seed: i + 1, status: 'active',
  source_entrant_id: null, created_at: '', updated_at: '', members: [],
}));

describe('add event menu', () => {
  it('disables the builder entries without entrants but keeps attach available', async () => {
    stubApi('active');
    await renderPage('/series/s1?tab=schedule');
    await act(async () => { buttonByText('Add event')!.click(); });
    expect(menuItem('Match').getAttribute('data-disabled')).not.toBeNull();
    expect(menuItem('Attach existing...').getAttribute('data-disabled')).toBeNull();
    expect(document.body.textContent).toContain('Add and approve entrants to create events');
  });

  it.each([
    ['Match', 'Create match'],
    ['Tournament', 'Create tournament'],
    ['Round robin', 'Double round robin'],
    ['Playoff placeholder', 'Add playoffs'],
    ['Attach existing...', 'Attach existing event'],
  ])('opens the %s dialog', async (item, marker) => {
    stubApi('active', { entrants: ENTRANTS });
    await renderPage('/series/s1?tab=schedule');
    await act(async () => { buttonByText('Add event')!.click(); });
    expect(menuItem(item).getAttribute('data-disabled')).toBeNull();
    await act(async () => { menuItem(item).click(); });
    await act(async () => { await Promise.resolve(); });
    expect(document.body.textContent).toContain(marker);
  });

  it('offers a race calendar instead of a round robin for racing series', async () => {
    stubApi('active', { entrants: ENTRANTS, scoringType: 'Position' });
    await renderPage('/series/s1?tab=schedule');
    await act(async () => { buttonByText('Add event')!.click(); });
    expect(Array.from(document.querySelectorAll('[role="menuitem"]')).map((i) => i.textContent?.trim())).toContain('Race calendar');
    expect(Array.from(document.querySelectorAll('[role="menuitem"]')).map((i) => i.textContent?.trim())).not.toContain('Round robin');
    await act(async () => { menuItem('Race calendar').click(); });
    await act(async () => { await Promise.resolve(); });
    expect(document.body.textContent).toContain('Days between events');
  });

  it('creates a stage through the Add stage dialog', async () => {
    const calls = stubApi('active');
    await renderPage('/series/s1?tab=schedule');
    await act(async () => { buttonByText('Add stage')!.click(); });
    const input = document.querySelector<HTMLInputElement>('input[placeholder="Stage 1"]')!;
    await typeInto(input, 'Stage 3');
    await act(async () => { document.querySelector<HTMLButtonElement>('button[type="submit"]')!.click(); });
    await act(async () => { await Promise.resolve(); });
    const post = calls.find((c) => c.method === 'POST' && c.url === '/api/series/s1/stages');
    expect(post?.body).toEqual({ name: 'Stage 3', counts_toward_season: true });
  });
});
