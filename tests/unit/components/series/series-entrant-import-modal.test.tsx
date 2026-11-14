import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MantineProvider } from '@mantine/core';
import type { EntrantImportPreview } from '@/shared/series-types';

vi.mock('@/lib/logger/client', () => ({ logger: { debug: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() } }));
const update = vi.fn();
vi.mock('@/lib/notifications', () => ({ notificationHelper: { loading: vi.fn(), update: (...args: unknown[]) => update(...args) } }));

import { ImportEntrantsModal, entrantImportTemplate, summariseImport } from '@/components/series/series-entrant-import-modal';
import { parseCsv } from '@/shared/csv';

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
afterEach(() => {
  act(() => { roots.forEach((r) => r.unmount()); });
  roots.length = 0;
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
  update.mockClear();
});

const PREVIEW: EntrantImportPreview = {
  ok: true,
  issues: [{ line: 3, level: 'warning', message: 'division "South" differs' }],
  entrants: [
    { name: 'Owls', existing: false, tag: 'OWL', division: 'North', seed: 1, color: null, members: [
      { line: 2, username: 'Ava', discord_user_id: '100000000000000001', role: 'captain', action: 'new' },
      { line: 3, username: 'Ben', discord_user_id: '100000000000000002', role: 'player', action: 'new' },
    ] },
    { name: 'Comets', existing: true, tag: null, division: null, seed: null, color: null, members: [
      { line: 4, username: 'Cy', discord_user_id: '100000000000000003', role: 'player', action: 'existing' },
    ] },
  ],
};

function render(element: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    const root = createRoot(container);
    roots.push(root);
    root.render(<MantineProvider env="test">{element}</MantineProvider>);
  });
}

const flush = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 20)); }); };
const button = (label: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === label) as HTMLButtonElement | undefined;

async function pickFile(text: string) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File([text], 'teams.csv', { type: 'text/csv' });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
  await flush();
}

describe('ImportEntrantsModal', () => {
  it('previews the chosen file, then imports it and reports the result', async () => {
    const calls: Array<{ url: string; body: { csv: string } }> = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: JSON.parse(init!.body as string) });
      return url.endsWith('/preview')
        ? { ok: true, status: 200, json: async () => ({ preview: PREVIEW }) }
        : { ok: true, status: 201, json: async () => ({ result: { created: 1, updated: 0, members_added: 2, members_skipped: 1 } }) };
    }));
    const onImported = vi.fn();
    const onClose = vi.fn();
    render(<ImportEntrantsModal opened onClose={onClose} seriesId="s1" entrantType="team" onImported={onImported} />);
    expect(button('Import')?.disabled).toBe(true);

    await pickFile('team,player,discord_id\nOwls,Ava,100000000000000001\n');
    expect(calls[0]).toEqual({ url: '/api/series/s1/entrants/import/preview', body: { csv: 'team,player,discord_id\nOwls,Ava,100000000000000001\n' } });
    const text = document.body.textContent ?? '';
    expect(text).toContain('1 new teams');
    expect(text).toContain('2 players to add');
    expect(text).toContain('1 already rostered');
    expect(text).toContain('Line 3: division "South" differs');
    expect(text).toContain('Ava (Captain)');

    await act(async () => { button('Import')!.click(); });
    await flush();
    expect(calls[1].url).toBe('/api/series/s1/entrants/import');
    expect(update).toHaveBeenCalledWith('series-import-entrants-s1', expect.objectContaining({ type: 'success', message: expect.stringContaining('1 new team') }));
    expect(onImported).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('keeps Import disabled while the preview has errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, status: 200,
      json: async () => ({ preview: { ...PREVIEW, ok: false, issues: [{ line: 2, level: 'error', message: 'Discord ID is missing' }] } }),
    })));
    render(<ImportEntrantsModal opened onClose={vi.fn()} seriesId="s1" entrantType="team" onImported={vi.fn()} />);
    await pickFile('x');
    expect(document.body.textContent).toContain('Line 2: Discord ID is missing');
    expect(button('Fix errors to import')?.disabled).toBe(true);
  });
});

describe('import helpers', () => {
  it('summariseImport counts new / existing entrants and players', () => {
    expect(summariseImport(PREVIEW)).toEqual({ created: 1, updated: 0, add: 2, skip: 1 });
  });

  it('templates parse back with the required columns', () => {
    expect(parseCsv(entrantImportTemplate('team'))!.headers).toEqual(['team', 'tag', 'division', 'seed', 'player', 'discord_id', 'role']);
    expect(parseCsv(entrantImportTemplate('solo'))!.headers).toEqual(['player', 'discord_id', 'division', 'seed']);
  });
});
