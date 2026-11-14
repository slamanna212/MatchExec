// @vitest-environment node
/** CSV import of series entrants and rosters: file validation (pure), preview against the series, atomic import. */
import { describe, expect, it, vi } from 'vitest';
import { setupPgTestFile, getPgTestDb } from '../../utils/pg-test-db';
import { createSeriesWithEntrants, insertSeries } from '../../utils/pg-series-fixtures';
import { importEntrants, listEntrants, planEntrantImport, previewEntrantImport } from '@/lib/series';

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warning: vi.fn(), info: vi.fn(), debug: vi.fn(), reload: vi.fn() } }));

setupPgTestFile();
const pg = () => getPgTestDb();

const ID = (n: number) => `1000000000000000${String(n).padStart(2, '0')}`; // 18 digits
const TEAM = { entrant_type: 'team' as const, roster_max: null };
const SOLO = { entrant_type: 'solo' as const, roster_max: null };
const errors = (issues: Array<{ level: string; line: number | null; message: string }>) => issues.filter((i) => i.level === 'error');

describe('planEntrantImport', () => {
  it('groups team rows by name and takes the first non-empty entrant fields', () => {
    const plan = planEntrantImport([
      'Team,Tag,Division,Seed,Player,Discord ID,Role',
      `Owls,OWL,North,1,Ava,${ID(1)},Captain`,
      `Owls,,,,Ben,${ID(2)},`,
      `Comets,,South,,Cy,${ID(3)},sub`,
    ].join('\n'), TEAM);
    expect(plan.issues).toEqual([]);
    expect(plan.entrants).toEqual([
      { name: 'Owls', line: 2, tag: 'OWL', division: 'North', seed: 1, color: null, members: [
        { line: 2, username: 'Ava', discord_user_id: ID(1), role: 'captain' },
        { line: 3, username: 'Ben', discord_user_id: ID(2), role: 'player' },
      ] },
      { name: 'Comets', line: 4, tag: null, division: 'South', seed: null, color: null, members: [{ line: 4, username: 'Cy', discord_user_id: ID(3), role: 'sub' }] },
    ]);
  });

  it('requires the columns for the entrant type', () => {
    expect(errors(planEntrantImport(`player,discord_id\nAva,${ID(1)}`, TEAM).issues)[0].message).toMatch(/Missing column: team/);
    expect(errors(planEntrantImport('team,player\nA,Ava', SOLO).issues)[0].message).toMatch(/discord_id/);
    expect(errors(planEntrantImport('team,player,discord_id\n', TEAM).issues)[0].message).toMatch(/no data rows/);
  });

  it('reports bad values per line', () => {
    const plan = planEntrantImport([
      'team,player,discord_id,role,seed,color,tag',
      'A,Ava,,,,,',
      'A,Ben,12345,,,,',
      `,Cy,${ID(3)},,,,`,
      `A,Dee,${ID(4)},boss,,,`,
      `A,Eve,${ID(5)},,0,,`,
      `A,Fay,${ID(6)},,,red,`,
      `A,Gus,${ID(7)},,,,WAYTOOLONGTAG`,
      `A,Hal,${ID(4)},,,,`,
    ].join('\n'), TEAM);
    expect(errors(plan.issues).map((i) => [i.line, i.message])).toEqual([
      [2, 'Discord ID is missing'],
      [3, expect.stringMatching(/not a Discord ID/)],
      [4, 'Team name is missing'],
      [5, expect.stringMatching(/Role must be/)],
      [6, expect.stringMatching(/Seed must be/)],
      [7, expect.stringMatching(/Color must/)],
      [8, expect.stringMatching(/Tag is longer/)],
      [9, expect.stringMatching(/already used on line 5/)],
    ]);
  });

  it('refuses a second captain and a roster over roster_max; warns on conflicting fields and unknown columns', () => {
    const plan = planEntrantImport([
      'team,player,discord_id,role,division,notes',
      `A,Ava,${ID(1)},captain,North,x`,
      `A,Ben,${ID(2)},captain,South,`,
      `A,Cy,${ID(3)},,South,`,
      `A,Dee,${ID(4)},,,`,
    ].join('\n'), { entrant_type: 'team', roster_max: 2 });
    expect(errors(plan.issues).map((i) => i.line)).toEqual([3, 5]);
    expect(plan.issues.filter((i) => i.level === 'warning').map((i) => i.message)).toEqual([
      'Ignored column: notes', expect.stringMatching(/division "South" differs/),
    ]);
    expect(plan.entrants[0].members.map((m) => m.username)).toEqual(['Ava', 'Cy']);
  });

  it('solo: one entrant per player, names must be unique, team / role / tag ignored', () => {
    const plan = planEntrantImport(`player,discord_id,seed,role\nAva,${ID(1)},2,captain\nAva,${ID(2)},,\n`, SOLO);
    expect(plan.entrants).toHaveLength(1);
    expect(plan.entrants[0]).toMatchObject({ name: 'Ava', seed: 2, members: [{ role: 'player' }] });
    expect(errors(plan.issues)[0]).toMatchObject({ line: 3, message: expect.stringMatching(/already named "Ava"/) });
    expect(plan.issues.some((i) => i.message === 'Solo series: role ignored')).toBe(true);
  });
});

describe('previewEntrantImport / importEntrants', () => {
  it('creates new teams with rosters in one go', async () => {
    const s = await insertSeries({ entrant_type: 'team', roster_max: 4 });
    const csv = `team,tag,player,discord_id,role\nOwls,OWL,Ava,${ID(1)},captain\nOwls,,Ben,${ID(2)},\nComets,,Cy,${ID(3)},\n`;
    const preview = await previewEntrantImport(pg(), s.id, csv);
    expect(preview.ok).toBe(true);
    expect(preview.entrants.map((e) => [e.name, e.existing, e.members.map((m) => m.action)])).toEqual([['Owls', false, ['new', 'new']], ['Comets', false, ['new']]]);

    const out = await importEntrants(pg(), s.id, csv);
    expect(out.ok && out.result).toEqual({ created: 2, updated: 0, members_added: 3, members_skipped: 0 });
    const entrants = await listEntrants(pg(), s.id);
    const owls = entrants.find((e) => e.name === 'Owls')!;
    expect(owls).toMatchObject({ tag: 'OWL', status: 'active' });
    expect(owls.members.map((m) => [m.username, m.user_id, m.discord_user_id, m.role])).toEqual([
      ['Ava', ID(1), ID(1), 'captain'], ['Ben', ID(2), ID(2), 'player'],
    ]);
  });

  it('adds new players to an existing team, skips those already on it, keeps its fields; re-import is a no-op', async () => {
    const { seriesId } = await createSeriesWithEntrants(pg(), {
      entrantType: 'team', rosterMax: 3, entrants: [{ name: 'Owls', tag: 'OWL', members: [{ username: 'Ava', user_id: ID(1), role: 'captain' }] }],
    });
    const csv = `team,tag,player,discord_id\nOwls,NEW,Ava,${ID(1)}\nOwls,,Ben,${ID(2)}\n`;
    const preview = await previewEntrantImport(pg(), seriesId, csv);
    expect(preview.ok).toBe(true);
    expect(preview.entrants[0]).toMatchObject({ existing: true, tag: 'OWL', members: [{ action: 'existing' }, { action: 'new' }] });
    expect(preview.issues.some((i) => /fields|kept/.test(i.message))).toBe(true);

    const out = await importEntrants(pg(), seriesId, csv);
    expect(out.ok && out.result).toEqual({ created: 0, updated: 1, members_added: 1, members_skipped: 1 });
    const [owls] = await listEntrants(pg(), seriesId);
    expect(owls.tag).toBe('OWL');
    expect(owls.members.map((m) => m.username)).toEqual(['Ava', 'Ben']);

    const again = await importEntrants(pg(), seriesId, csv);
    expect(again.ok && again.result).toEqual({ created: 0, updated: 0, members_added: 0, members_skipped: 2 });
  });

  it('errors for a player on another roster and a full existing roster, and writes nothing', async () => {
    const { seriesId } = await createSeriesWithEntrants(pg(), {
      entrantType: 'team', rosterMax: 2, entrants: [
        { name: 'Owls', members: [{ username: 'Ava', user_id: ID(1) }, { username: 'Ben', user_id: ID(2) }] },
        { name: 'Comets', members: [{ username: 'Cy', user_id: ID(3) }] },
      ],
    });
    const csv = `team,player,discord_id\nNew Team,Dee,${ID(4)}\nNew Team,Cy,${ID(3)}\nOwls,Eve,${ID(5)}\n`;
    const out = await importEntrants(pg(), seriesId, csv);
    expect(out.ok).toBe(false);
    expect(errors(out.preview.issues).map((i) => [i.line, i.message])).toEqual([
      [3, expect.stringMatching(/already on the roster of "Comets"/)],
      [4, expect.stringMatching(/more than 2 players/)],
    ]);
    expect((await listEntrants(pg(), seriesId)).map((e) => e.name).sort()).toEqual(['Comets', 'Owls']);
  });

  it('warns when an imported captain replaces the current one, then demotes them', async () => {
    const { seriesId } = await createSeriesWithEntrants(pg(), {
      entrantType: 'team', entrants: [{ name: 'Owls', members: [{ username: 'Ava', user_id: ID(1), role: 'captain' }] }],
    });
    const csv = `team,player,discord_id,role\nOwls,Ben,${ID(2)},captain\n`;
    expect((await previewEntrantImport(pg(), seriesId, csv)).issues[0].message).toMatch(/replaces Ava as captain/);
    await importEntrants(pg(), seriesId, csv);
    const [owls] = await listEntrants(pg(), seriesId);
    expect(owls.members.map((m) => [m.username, m.role])).toEqual([['Ben', 'captain'], ['Ava', 'player']]);
  });

  it('solo: creates one entrant per player; an existing name with another player is an error', async () => {
    const { seriesId } = await createSeriesWithEntrants(pg(), { entrantType: 'solo', entrants: [{ name: 'Ava', members: [{ username: 'Ava', user_id: ID(1) }] }] });
    const bad = await previewEntrantImport(pg(), seriesId, `player,discord_id\nAva,${ID(9)}\n`);
    expect(errors(bad.issues)[0].message).toMatch(/already exists in this series with another player/);

    const out = await importEntrants(pg(), seriesId, `player,discord_id,division\nAva,${ID(1)},\nBen,${ID(2)},North\n`);
    expect(out.ok && out.result).toEqual({ created: 1, updated: 0, members_added: 1, members_skipped: 1 });
    expect((await listEntrants(pg(), seriesId)).find((e) => e.name === 'Ben')).toMatchObject({ division: 'North', members: [{ discord_user_id: ID(2) }] });
  });

  it('refuses withdrawn entrants and finished series', async () => {
    const { seriesId } = await createSeriesWithEntrants(pg(), { entrantType: 'team', entrants: [{ name: 'Owls', status: 'withdrawn' }] });
    expect(errors((await previewEntrantImport(pg(), seriesId, `team,player,discord_id\nOwls,Ava,${ID(1)}\n`)).issues)[0].message).toMatch(/withdrawn/);

    const done = await insertSeries({ entrant_type: 'team', status: 'complete' });
    expect((await previewEntrantImport(pg(), done.id, `team,player,discord_id\nOwls,Ava,${ID(1)}\n`)).ok).toBe(false);
    await expect(importEntrants(pg(), done.id, `team,player,discord_id\nOwls,Ava,${ID(1)}\n`)).rejects.toMatchObject({ status: 409 });
    await expect(previewEntrantImport(pg(), 'nope', 'a')).rejects.toMatchObject({ status: 404 });
  });
});
