// @vitest-environment node
/** Tournament "Create a team" from the Discord signup (allow_discord_team_creation) and its domain layer. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MessageFlags } from 'discord.js';
import { eq } from 'drizzle-orm';
import { getPgTestDb, setupPgTestFile } from '../../utils/pg-test-db';
import { createGame, createGameMode, createTournament } from '../../utils/pg-fixtures';
import { addParticipant, createTeam } from '../../../src/lib/tournaments';
import { tournamentParticipants, tournamentTeamMembers, tournamentTeams } from '../../../lib/db/schema';

vi.mock('../../../src/lib/logger/server', () => ({ logger: { debug: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn(), critical: vi.fn() } }));
vi.mock('../../../src/lib/logger', () => ({ logger: { debug: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn(), critical: vi.fn(), reload: vi.fn() } }));

import { InteractionHandler } from '../../../processes/discord-bot/modules/interaction-handler';
import { parseModalCustomId } from '../../../processes/discord-bot/utils/id-parsers';

setupPgTestFile();
const pg = () => getPgTestDb();

// overwatch2 has a real signup form in data/games (battlenet_name, roles, competitive_rank)
const GAME_ID = 'overwatch2';
const OW_FIELDS = { battlenet_name: 'Alice#1234', roles: 'Tank', competitive_rank: 'Gold' };

function fake({ customId, userId = 'd-alice', fields = {}, values = [] }: { customId: string; userId?: string; fields?: Record<string, string>; values?: string[] }) {
  return {
    customId,
    replied: false,
    deferred: false,
    guildId: null,
    user: { id: userId, username: 'alice', globalName: null },
    member: { displayName: 'Alice' },
    values,
    fields: {
      getTextInputValue: vi.fn((id: string) => {
        if (fields[id] === undefined) throw new Error('Field not found');
        return fields[id];
      }),
    },
    reply: vi.fn().mockResolvedValue(undefined),
    followUp: vi.fn().mockResolvedValue(undefined),
    showModal: vi.fn().mockResolvedValue(undefined),
  };
}

const client = { users: { fetch: vi.fn(async (id: string) => ({ id, avatar: null })) } };
const handler = () => new InteractionHandler(client as never, null, vi.fn().mockResolvedValue(undefined));
const replyText = (i: ReturnType<typeof fake>): string => i.reply.mock.calls[0][0].content;

let modeId: string;
beforeEach(async () => {
  vi.clearAllMocks();
  await createGame({ id: GAME_ID, name: 'Overwatch 2' });
  modeId = (await createGameMode(GAME_ID)).id;
});

const tournament = (flags: { selection?: boolean; creation?: boolean }) => createTournament(GAME_ID, {
  game_mode_id: modeId, status: 'gather', allow_player_team_selection: flags.selection ?? true, allow_discord_team_creation: flags.creation ?? true,
});

describe('addParticipant with newTeamName', () => {
  it('creates the team and signs the player up as its captain', async () => {
    const t = await tournament({});
    const result = await addParticipant(pg(), { tournamentId: t.id, userId: 'u1', discordUserId: 'u1', username: 'Alice', signupData: null, newTeamName: ' Rockets ' });
    expect(result.status).toBe('added');
    const [team] = await pg().select().from(tournamentTeams).where(eq(tournamentTeams.tournament_id, t.id));
    expect(team.team_name).toBe('Rockets');
    if (result.status === 'added') expect(result.teamId).toBe(team.id);
    const [member] = await pg().select().from(tournamentTeamMembers).where(eq(tournamentTeamMembers.team_id, team.id));
    expect(member).toMatchObject({ user_id: 'u1', is_captain: true });
    const [participant] = await pg().select().from(tournamentParticipants).where(eq(tournamentParticipants.tournament_id, t.id));
    expect(participant.team_assignment).toBe(team.id);
  });

  it('refuses when the tournament does not allow team creation (409) and creates nothing', async () => {
    const t = await tournament({ creation: false });
    await expect(addParticipant(pg(), { tournamentId: t.id, userId: 'u1', discordUserId: 'u1', username: 'A', signupData: null, newTeamName: 'Rockets' }))
      .rejects.toMatchObject({ name: 'TournamentError', status: 409 });
    expect(await pg().select().from(tournamentTeams).where(eq(tournamentTeams.tournament_id, t.id))).toEqual([]);
    expect(await pg().select().from(tournamentParticipants).where(eq(tournamentParticipants.tournament_id, t.id))).toEqual([]);
  });

  it('refuses a taken name (case-insensitive) and an over-long name', async () => {
    const t = await tournament({});
    await createTeam(pg(), t.id, 'Rockets');
    await expect(addParticipant(pg(), { tournamentId: t.id, userId: 'u1', discordUserId: 'u1', username: 'A', signupData: null, newTeamName: 'ROCKETS' }))
      .rejects.toMatchObject({ status: 409, message: expect.stringMatching(/already exists/) });
    await expect(addParticipant(pg(), { tournamentId: t.id, userId: 'u1', discordUserId: 'u1', username: 'A', signupData: null, newTeamName: 'x'.repeat(46) }))
      .rejects.toMatchObject({ status: 400 });
    expect(await pg().select().from(tournamentParticipants).where(eq(tournamentParticipants.tournament_id, t.id))).toEqual([]);
  });

  it('a duplicate signup does not create a team', async () => {
    const t = await tournament({});
    await addParticipant(pg(), { tournamentId: t.id, userId: 'u1', discordUserId: 'u1', username: 'A', signupData: null });
    const again = await addParticipant(pg(), { tournamentId: t.id, userId: 'u1', discordUserId: 'u1', username: 'A', signupData: null, newTeamName: 'Rockets' });
    expect(again.status).toBe('duplicate');
    expect(await pg().select().from(tournamentTeams).where(eq(tournamentTeams.tournament_id, t.id))).toEqual([]);
  });
});

describe('parseModalCustomId', () => {
  it('parses the create-a-team modal id', () => {
    expect(parseModalCustomId('signup_form_newteam:tournament_1_abc')).toEqual({
      eventId: 'tournament_1_abc', selectedTeamId: null, isTournament: true, newTeam: true,
    });
  });
});

describe('Discord signup', () => {
  it('offers a Create a team button next to the team list when enabled', async () => {
    const t = await tournament({});
    await createTeam(pg(), t.id, 'Existing');
    const i = fake({ customId: `signup_${t.id}` });
    await handler().handleButtonInteraction(i as never);
    const payload = i.reply.mock.calls[0][0];
    expect(payload.flags).toBe(MessageFlags.Ephemeral);
    expect(payload.content).toContain('or create your own');
    const rows = payload.components.map((r: { toJSON: () => any }) => r.toJSON().components[0]);
    expect(rows[0].custom_id).toBe(`team_select_${t.id}`);
    expect(rows[0].options.map((o: { label: string }) => o.label)).toEqual(['Existing']);
    expect(rows[1]).toMatchObject({ custom_id: `tournament_newteam:${t.id}`, label: '➕ Create a team' });
  });

  it('shows only the Create a team button when there are no teams yet', async () => {
    const t = await tournament({});
    const i = fake({ customId: `signup_${t.id}` });
    await handler().handleButtonInteraction(i as never);
    const payload = i.reply.mock.calls[0][0];
    expect(payload.components).toHaveLength(1);
    expect(payload.components[0].toJSON().components[0].custom_id).toBe(`tournament_newteam:${t.id}`);
  });

  it('keeps the old behaviour without team creation: team list only, plain signup modal without teams', async () => {
    const t = await tournament({ creation: false });
    const noTeams = fake({ customId: `signup_${t.id}` });
    await handler().handleButtonInteraction(noTeams as never);
    expect(noTeams.reply).not.toHaveBeenCalled();
    expect(noTeams.showModal.mock.calls[0][0].toJSON().custom_id).toBe(`signup_form_${t.id}`);

    await createTeam(pg(), t.id, 'Existing');
    const withTeams = fake({ customId: `signup_${t.id}` });
    await handler().handleButtonInteraction(withTeams as never);
    const payload = withTeams.reply.mock.calls[0][0];
    expect(payload.components).toHaveLength(1);
    expect(payload.components[0].toJSON().components[0].custom_id).toBe(`team_select_${t.id}`);
  });

  it('the Create a team button opens a modal with the team name first, then the signup fields', async () => {
    const t = await tournament({});
    const i = fake({ customId: `tournament_newteam:${t.id}` });
    await handler().handleButtonInteraction(i as never);
    const modal = i.showModal.mock.calls[0][0].toJSON();
    expect(modal.custom_id).toBe(`signup_form_newteam:${t.id}`);
    const ids = modal.components.map((r: any) => r.components[0].custom_id);
    expect(ids).toEqual(['mx_new_team_name', 'battlenet_name', 'roles', 'competitive_rank']);
  });

  it('the Create a team button is refused when creation is off or the player already signed up', async () => {
    const off = await tournament({ creation: false });
    const i = fake({ customId: `tournament_newteam:${off.id}` });
    await handler().handleButtonInteraction(i as never);
    expect(i.showModal).not.toHaveBeenCalled();
    expect(replyText(i)).toContain('can not be created from Discord');

    const on = await tournament({});
    await addParticipant(pg(), { tournamentId: on.id, userId: 'd-alice', discordUserId: 'd-alice', username: 'Alice', signupData: null });
    const dup = fake({ customId: `tournament_newteam:${on.id}` });
    await handler().handleButtonInteraction(dup as never);
    expect(dup.showModal).not.toHaveBeenCalled();
    expect(replyText(dup)).toContain('already signed up');
  });

  it('submitting the modal creates the team, signs the player up as captain and confirms with the team', async () => {
    const t = await tournament({});
    const i = fake({ customId: `signup_form_newteam:${t.id}`, fields: { mx_new_team_name: 'Rockets', ...OW_FIELDS } });
    await handler().handleModalSubmit(i as never);
    expect(replyText(i)).toContain('**Team:** Rockets');
    const [team] = await pg().select().from(tournamentTeams).where(eq(tournamentTeams.tournament_id, t.id));
    expect(team.team_name).toBe('Rockets');
    const [participant] = await pg().select().from(tournamentParticipants).where(eq(tournamentParticipants.tournament_id, t.id));
    expect(participant).toMatchObject({ user_id: 'd-alice', team_assignment: team.id, username: 'Alice#1234' });
  });

  it('a taken team name is reported to the player', async () => {
    const t = await tournament({});
    await createTeam(pg(), t.id, 'Rockets');
    const i = fake({ customId: `signup_form_newteam:${t.id}`, fields: { mx_new_team_name: 'rockets', ...OW_FIELDS } });
    await handler().handleModalSubmit(i as never);
    expect(replyText(i)).toContain('already exists');
    expect(await pg().select().from(tournamentParticipants).where(eq(tournamentParticipants.tournament_id, t.id))).toEqual([]);
  });
});
