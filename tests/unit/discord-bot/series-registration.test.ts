// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MessageFlags } from 'discord.js';
import { eq } from 'drizzle-orm';
import { getPgTestDb, setupPgTestFile } from '../../utils/pg-test-db';
import { insertSeries } from '../../utils/pg-series-fixtures';
import { getEntrant, joinSeriesEntrant, listEntrants, registerForSeries, transitionSeries } from '../../../src/lib/series';
import { seriesEntrants } from '../../../lib/db/schema';

vi.mock('../../../src/lib/logger/server', () => ({ logger: { debug: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn(), critical: vi.fn() } }));
vi.mock('../../../src/lib/logger', () => ({ logger: { debug: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn(), critical: vi.fn(), reload: vi.fn() } }));

import { SeriesRegistrationHandler } from '../../../processes/discord-bot/modules/series-registration-handler';
import { InteractionHandler } from '../../../processes/discord-bot/modules/interaction-handler';
import { logger } from '../../../src/lib/logger/server';
import { db } from '../../../lib/db';

setupPgTestFile();
const pg = () => getPgTestDb();
const EPHEMERAL = MessageFlags.Ephemeral;

interface FakeOptions {
  customId: string;
  userId?: string;
  username?: string;
  nickname?: string | null;
  fields?: Record<string, string | undefined>;
  values?: string[];
}

function fake({ customId, userId = 'd-alice', username = 'alice', nickname = 'Alice', fields = {}, values = [] }: FakeOptions) {
  const i = {
    customId,
    replied: false,
    deferred: false,
    user: { id: userId, username, globalName: null },
    member: nickname === null ? null : { displayName: nickname },
    values,
    fields: {
      getTextInputValue: vi.fn((id: string) => {
        if (fields[id] === undefined) throw new Error('Field not found');
        return fields[id];
      }),
    },
    reply: vi.fn().mockResolvedValue(undefined),
    followUp: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    showModal: vi.fn().mockResolvedValue(undefined),
  };
  return i;
}

const handler = () => new SeriesRegistrationHandler();
const replyText = (i: ReturnType<typeof fake>): string => i.reply.mock.calls[0][0].content;

let solo: Awaited<ReturnType<typeof insertSeries>>;
let team: Awaited<ReturnType<typeof insertSeries>>;

beforeEach(async () => {
  vi.clearAllMocks();
  solo = await insertSeries({ entrant_type: 'solo', status: 'registration', name: 'Solo Cup' });
  team = await insertSeries({ entrant_type: 'team', status: 'registration', name: 'Team League', roster_max: 3 });
});

describe('routing of customIds', () => {
  it('ignores interactions that are not series registration ones', async () => {
    expect(await handler().handleButton(fake({ customId: 'signup_match_1' }) as never)).toBe(false);
    expect(await handler().handleModalSubmit(fake({ customId: 'signup_form_1' }) as never)).toBe(false);
    expect(await handler().handleStringSelectMenu(fake({ customId: 'team_select_1' }) as never)).toBe(false);
  });

  it('is wired into the interaction handler for buttons, modals and selects', async () => {
    const ih = new InteractionHandler({} as never, null, vi.fn());
    const button = fake({ customId: `series_reg:${solo.id}` });
    await ih.handleButtonInteraction(button as never);
    expect(replyText(button)).toContain('You are registered for **Solo Cup**');

    const t = await registerForSeries(pg(), team.id, { user_id: 'cap', username: 'Cap' }, { team: { name: 'Rockets' } });
    const select = fake({ customId: `series_joinsel:${team.id}`, userId: 'd-bob', nickname: 'Bob', values: [t.entrant_id] });
    await ih.handleStringSelectMenu(select as never);
    expect(select.update).toHaveBeenCalledWith({ content: '✅ You joined **Rockets**.', components: [] });

    const modal = fake({ customId: `series_regteam:${team.id}`, userId: 'd-cara', fields: { team_name: 'Comets' } });
    await ih.handleModalSubmit(modal as never);
    expect(replyText(modal)).toContain('Team **Comets** is registered');
  });
});

describe('Register (solo)', () => {
  it('registers the user with their server nickname and confirms ephemerally', async () => {
    const i = fake({ customId: `series_reg:${solo.id}`, nickname: 'Ally' });
    expect(await handler().handleButton(i as never)).toBe(true);
    expect(i.reply).toHaveBeenCalledWith({ content: expect.stringContaining('registered for **Solo Cup** as **Ally**'), flags: EPHEMERAL });
    const [e] = await listEntrants(pg(), solo.id);
    expect(e).toMatchObject({ name: 'Ally', status: 'pending' });
    expect(e.members[0]).toMatchObject({ user_id: 'd-alice', discord_user_id: 'd-alice', username: 'Ally' });
  });

  it('falls back to the username without a member object', async () => {
    const i = fake({ customId: `series_reg:${solo.id}`, nickname: null, username: 'plainuser' });
    await handler().handleButton(i as never);
    expect((await listEntrants(pg(), solo.id))[0].name).toBe('plainuser');
  });

  it('rejects a second registration ephemerally', async () => {
    await handler().handleButton(fake({ customId: `series_reg:${solo.id}` }) as never);
    const again = fake({ customId: `series_reg:${solo.id}` });
    await handler().handleButton(again as never);
    expect(again.reply).toHaveBeenCalledWith({ content: expect.stringMatching(/^❌ Player is already on the roster/), flags: EPHEMERAL });
    expect(await listEntrants(pg(), solo.id)).toHaveLength(1);
  });

  it('rejects when registration is closed or the series is gone', async () => {
    await transitionSeries(pg(), solo.id, 'active');
    const closed = fake({ customId: `series_reg:${solo.id}` });
    await handler().handleButton(closed as never);
    expect(closed.reply).toHaveBeenCalledWith({ content: '❌ Registration for this series is not open.', flags: EPHEMERAL });

    const gone = fake({ customId: 'series_reg:nope' });
    await handler().handleButton(gone as never);
    expect(gone.reply).toHaveBeenCalledWith({ content: '❌ This series no longer exists.', flags: EPHEMERAL });
    expect(await listEntrants(pg(), solo.id)).toEqual([]);
  });
});

describe('Register (team) via modal', () => {
  it('the button opens a modal with a team name and an optional tag (nothing is created yet)', async () => {
    const i = fake({ customId: `series_reg:${team.id}` });
    await handler().handleButton(i as never);
    expect(i.reply).not.toHaveBeenCalled();
    const modal = i.showModal.mock.calls[0][0].toJSON();
    expect(modal.custom_id).toBe(`series_regteam:${team.id}`);
    expect(modal.title).toBe('Register a team - Team League');
    const inputs = modal.components.map((r: any) => r.components[0]);
    expect(inputs.map((c: any) => [c.custom_id, c.required ?? false])).toEqual([['team_name', true], ['team_tag', false]]);
    expect(await listEntrants(pg(), team.id)).toEqual([]);
  });

  it('keeps the modal title within Discord limits for a long series name', async () => {
    const long = await insertSeries({ entrant_type: 'team', status: 'registration', name: 'A'.repeat(120) });
    const i = fake({ customId: `series_reg:${long.id}` });
    await handler().handleButton(i as never);
    expect(i.showModal.mock.calls[0][0].toJSON().title.length).toBeLessThanOrEqual(45);
  });

  it('does not open the modal when registration is closed', async () => {
    await transitionSeries(pg(), team.id, 'active');
    const i = fake({ customId: `series_reg:${team.id}` });
    await handler().handleButton(i as never);
    expect(i.showModal).not.toHaveBeenCalled();
    expect(replyText(i)).toBe('❌ Registration for this series is not open.');
  });

  it('the submission creates a pending team with the user as captain', async () => {
    const i = fake({ customId: `series_regteam:${team.id}`, fields: { team_name: ' Rockets ', team_tag: 'RKT' } });
    expect(await handler().handleModalSubmit(i as never)).toBe(true);
    expect(i.reply).toHaveBeenCalledWith({ content: expect.stringContaining('Team **Rockets** is registered and you are its captain'), flags: EPHEMERAL });
    const [e] = await listEntrants(pg(), team.id);
    expect(e).toMatchObject({ name: 'Rockets', tag: 'RKT', status: 'pending' });
    expect(e.members[0]).toMatchObject({ user_id: 'd-alice', role: 'captain' });
  });

  it('works when the tag field is missing from the submission', async () => {
    const i = fake({ customId: `series_regteam:${team.id}`, fields: { team_name: 'No Tag' } });
    await handler().handleModalSubmit(i as never);
    expect((await listEntrants(pg(), team.id))[0]).toMatchObject({ name: 'No Tag', tag: null });
  });

  it('replies ephemerally for a taken team name or a player already on a roster', async () => {
    await registerForSeries(pg(), team.id, { user_id: 'other', username: 'Other' }, { team: { name: 'Rockets' } });
    const taken = fake({ customId: `series_regteam:${team.id}`, fields: { team_name: 'rockets' } });
    await handler().handleModalSubmit(taken as never);
    expect(taken.reply).toHaveBeenCalledWith({ content: '❌ A team with this name already exists in this series', flags: EPHEMERAL });

    await registerForSeries(pg(), team.id, { user_id: 'd-alice', username: 'Alice' }, { team: { name: 'Mine' } });
    const twice = fake({ customId: `series_regteam:${team.id}`, fields: { team_name: 'Another' } });
    await handler().handleModalSubmit(twice as never);
    expect(replyText(twice)).toMatch(/already on the roster of "Mine"/);
    expect(await listEntrants(pg(), team.id)).toHaveLength(2);
  });
});

describe('Join team', () => {
  it('shows an ephemeral select of teams with room', async () => {
    const full = await registerForSeries(pg(), team.id, { user_id: 'f1', username: 'F1' }, { team: { name: 'Full', tag: 'FUL' } });
    await joinSeriesEntrant(pg(), team.id, full.entrant_id, { user_id: 'f2', username: 'F2' });
    await joinSeriesEntrant(pg(), team.id, full.entrant_id, { user_id: 'f3', username: 'F3' });
    const open = await registerForSeries(pg(), team.id, { user_id: 'o1', username: 'O1' }, { team: { name: 'Open', tag: 'OPN' } });

    const i = fake({ customId: `series_join:${team.id}` });
    await handler().handleButton(i as never);
    const payload = i.reply.mock.calls[0][0];
    expect(payload.flags).toBe(EPHEMERAL);
    const menu = payload.components[0].toJSON().components[0];
    expect(menu.custom_id).toBe(`series_joinsel:${team.id}`);
    expect(menu.options).toEqual([{ label: '[OPN] Open', value: open.entrant_id, description: '1/3 players' }]);
  });

  it('caps the select at 25 options', async () => {
    const big = await insertSeries({ entrant_type: 'team', status: 'registration', roster_max: null });
    for (let n = 0; n < 30; n++) await registerForSeries(pg(), big.id, { user_id: `p${n}`, username: `P${n}` }, { team: { name: `Team ${String(n).padStart(2, '0')}` } });
    const i = fake({ customId: `series_join:${big.id}` });
    await handler().handleButton(i as never);
    const menu = i.reply.mock.calls[0][0].components[0].toJSON().components[0];
    expect(menu.options).toHaveLength(25);
    expect(menu.options[0].description).toBe('1 player(s)');
  });

  it('says so when there is no team with room, for a solo series and for closed registration', async () => {
    const none = fake({ customId: `series_join:${team.id}` });
    await handler().handleButton(none as never);
    expect(replyText(none)).toBe('❌ There is no team with a free spot. Register a new team instead.');

    const soloJoin = fake({ customId: `series_join:${solo.id}` });
    await handler().handleButton(soloJoin as never);
    expect(replyText(soloJoin)).toContain('solo entrants');

    await transitionSeries(pg(), team.id, 'active');
    const closed = fake({ customId: `series_join:${team.id}` });
    await handler().handleButton(closed as never);
    expect(replyText(closed)).toBe('❌ Registration for this series is not open.');
  });

  it('the selection adds the user as a player and replaces the menu', async () => {
    const t = await registerForSeries(pg(), team.id, { user_id: 'cap', username: 'Cap' }, { team: { name: 'Rockets' } });
    const i = fake({ customId: `series_joinsel:${team.id}`, userId: 'd-bob', nickname: 'Bob', values: [t.entrant_id] });
    expect(await handler().handleStringSelectMenu(i as never)).toBe(true);
    expect(i.update).toHaveBeenCalledWith({ content: '✅ You joined **Rockets**.', components: [] });
    const roster = (await getEntrant(pg(), team.id, t.entrant_id))!.members;
    expect(roster.map((m) => [m.username, m.role])).toEqual([['Cap', 'captain'], ['Bob', 'player']]);
  });

  it('rejects a full roster or a player who is already on one, ephemerally', async () => {
    const t = await registerForSeries(pg(), team.id, { user_id: 'cap', username: 'Cap' }, { team: { name: 'Rockets' } });
    await joinSeriesEntrant(pg(), team.id, t.entrant_id, { user_id: 'm2', username: 'M2' });
    await joinSeriesEntrant(pg(), team.id, t.entrant_id, { user_id: 'm3', username: 'M3' });

    const full = fake({ customId: `series_joinsel:${team.id}`, userId: 'late', values: [t.entrant_id] });
    await handler().handleStringSelectMenu(full as never);
    expect(full.update).not.toHaveBeenCalled();
    expect(replyText(full)).toMatch(/^❌ This roster is full/);

    const other = await registerForSeries(pg(), team.id, { user_id: 'o1', username: 'O1' }, { team: { name: 'Other' } });
    const member = fake({ customId: `series_joinsel:${team.id}`, userId: 'm2', values: [other.entrant_id] });
    await handler().handleStringSelectMenu(member as never);
    expect(replyText(member)).toMatch(/already on the roster of "Rockets"/);
  });
});

describe('Leave', () => {
  it('removes a pending solo entrant that is left empty', async () => {
    await handler().handleButton(fake({ customId: `series_reg:${solo.id}` }) as never);
    const i = fake({ customId: `series_leave:${solo.id}` });
    await handler().handleButton(i as never);
    expect(i.reply).toHaveBeenCalledWith({ content: expect.stringContaining('You left **Alice**'), flags: EPHEMERAL });
    expect(await listEntrants(pg(), solo.id)).toEqual([]);
  });

  it('leaves a team that has other players', async () => {
    const t = await registerForSeries(pg(), team.id, { user_id: 'cap', username: 'Cap' }, { team: { name: 'Rockets' } });
    await joinSeriesEntrant(pg(), team.id, t.entrant_id, { user_id: 'd-bob', username: 'Bob' });
    const i = fake({ customId: `series_leave:${team.id}`, userId: 'd-bob' });
    await handler().handleButton(i as never);
    expect(replyText(i)).toBe('✅ You left **Rockets**.');
    expect((await getEntrant(pg(), team.id, t.entrant_id))!.members.map((m) => m.username)).toEqual(['Cap']);
  });

  it('tells the team that disbanded when the last player leaves a pending team', async () => {
    await registerForSeries(pg(), team.id, { user_id: 'd-alice', username: 'Alice' }, { team: { name: 'Solo Team' } });
    const i = fake({ customId: `series_leave:${team.id}` });
    await handler().handleButton(i as never);
    expect(replyText(i)).toContain('The team had no other players, so it was removed.');
    // an approved (active) team stays
    const t = await registerForSeries(pg(), team.id, { user_id: 'd-alice', username: 'Alice' }, { team: { name: 'Approved' } });
    await pg().update(seriesEntrants).set({ status: 'active' }).where(eq(seriesEntrants.id, t.entrant_id));
    const stay = fake({ customId: `series_leave:${team.id}` });
    await handler().handleButton(stay as never);
    expect(replyText(stay)).toBe('✅ You left **Approved**.');
    expect(await listEntrants(pg(), team.id)).toHaveLength(1);
  });

  it('rejects when the user is on no roster or registration is closed', async () => {
    const i = fake({ customId: `series_leave:${solo.id}` });
    await handler().handleButton(i as never);
    expect(replyText(i)).toBe('❌ You are not on a roster in this series');
    await transitionSeries(pg(), solo.id, 'active');
    const closed = fake({ customId: `series_leave:${solo.id}` });
    await handler().handleButton(closed as never);
    expect(replyText(closed)).toBe('❌ Registration for this series is not open');
  });
});

describe('unexpected errors', () => {
  it('log and answer with a generic ephemeral error, without leaking details', async () => {
    const broken = new SeriesRegistrationHandler({ select: () => { throw new Error('connection refused to 10.0.0.1'); } } as never);
    const i = fake({ customId: `series_reg:${solo.id}` });
    expect(await broken.handleButton(i as never)).toBe(true);
    expect(i.reply).toHaveBeenCalledWith({ content: '❌ Something went wrong. Please try again.', flags: EPHEMERAL });
    expect(logger.error).toHaveBeenCalled();
  });

  it('follows up instead of replying when the interaction was already answered', async () => {
    const broken = new SeriesRegistrationHandler({ select: () => { throw new Error('boom'); } } as never);
    const i = fake({ customId: `series_leave:${solo.id}` });
    i.replied = true;
    await broken.handleButton(i as never);
    expect(i.reply).not.toHaveBeenCalled();
    expect(i.followUp).toHaveBeenCalledWith({ content: '❌ Something went wrong. Please try again.', flags: EPHEMERAL });
  });

  it('uses the shared connection by default', async () => {
    const i = fake({ customId: `series_reg:${solo.id}` });
    await new SeriesRegistrationHandler(db).handleButton(i as never);
    expect(await listEntrants(pg(), solo.id)).toHaveLength(1);
  });
});
