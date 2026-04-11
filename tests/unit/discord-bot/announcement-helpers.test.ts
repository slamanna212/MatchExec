import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/lib/logger/server', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    critical: vi.fn(),
  },
}));

vi.mock('discord.js', () => ({
  AttachmentBuilder: vi.fn().mockImplementation(function(this: any, buffer: any, opts: any) {
    this.buffer = buffer;
    this.name = opts?.name;
  }),
}));

const fsMocks = vi.hoisted(() => ({
  existsSync: vi.fn<() => boolean>(),
  promises: { readFile: vi.fn() },
}));

vi.mock('fs', () => ({
  default: fsMocks,
  existsSync: fsMocks.existsSync,
  promises: fsMocks.promises,
}));

import {
  buildTeamFieldValue,
  getImageAttachmentName,
  fetchMatchStartData,
  buildMapListField,
  fetchTeamAssignments,
  getMatchLink,
  attachEventImage,
  type Participant,
} from '../../../processes/discord-bot/modules/announcement-helpers';
import { getTestDb } from '../../utils/test-db';
import { seedBasicTestData, createMatch } from '../../utils/fixtures';

// Pure function tests — no DB needed
describe('buildTeamFieldValue', () => {
  it('formats participants with discord mentions', () => {
    const participants: Participant[] = [
      { username: 'Alice', discord_user_id: 'u1' },
      { username: 'Bob', discord_user_id: 'u2' },
    ];
    const result = buildTeamFieldValue(participants, null);
    expect(result).toContain('<@u1>');
    expect(result).toContain('<@u2>');
  });

  it('falls back to username when no discord_user_id', () => {
    const participants: Participant[] = [{ username: 'Alice' }];
    const result = buildTeamFieldValue(participants, null);
    expect(result).toContain('Alice');
    expect(result).not.toContain('<@');
  });

  it('appends voice channel link when provided', () => {
    const participants: Participant[] = [{ username: 'Alice', discord_user_id: 'u1' }];
    const result = buildTeamFieldValue(participants, 'vc-123');
    expect(result).toContain('<#vc-123>');
    expect(result).toContain('Voice:');
  });

  it('does not include voice section when voiceChannel is null', () => {
    const participants: Participant[] = [{ username: 'Alice' }];
    const result = buildTeamFieldValue(participants, null);
    expect(result).not.toContain('Voice:');
  });

  it('handles empty participant list', () => {
    const result = buildTeamFieldValue([], null);
    expect(result).toBe('');
  });
});

describe('getImageAttachmentName', () => {
  it('extracts extension from image URL', () => {
    expect(getImageAttachmentName('/uploads/image.png')).toBe('match_start_image.png');
    expect(getImageAttachmentName('/uploads/image.jpg')).toBe('match_start_image.jpg');
    expect(getImageAttachmentName('/uploads/image.webp')).toBe('match_start_image.webp');
  });
});

// DB-backed tests
describe('fetchMatchStartData', () => {
  let db: any;
  let game: any;
  let mode: any;

  beforeEach(async () => {
    const data = await seedBasicTestData();
    game = data.game;
    mode = data.mode;
    db = getTestDb();
    vi.clearAllMocks();
  });

  it('returns game name and defaults when match exists', async () => {
    const match = await createMatch(game.id, mode.id);
    const result = await fetchMatchStartData(db as any, match.id, game.id);
    expect(result.gameName).toBeTruthy();
    expect(result.blueTeamVoiceChannel).toBeNull();
    expect(result.redTeamVoiceChannel).toBeNull();
  });

  it('returns defaults when match not found', async () => {
    const result = await fetchMatchStartData(db as any, 'nonexistent', game.id);
    expect(result.gameName).toBe(game.id); // falls back to gameId
  });
});

describe('buildMapListField', () => {
  let db: any;
  let game: any;

  beforeEach(async () => {
    const data = await seedBasicTestData();
    game = data.game;
    db = getTestDb();
    vi.clearAllMocks();
  });

  it('returns fallback string when map IDs not in database', async () => {
    const result = await buildMapListField(db as any, ['unknown-map'], game.id);
    expect(result).toBe('unknown-map');
  });

  it('returns comma-separated IDs when no maps provided', async () => {
    const result = await buildMapListField(db as any, [], game.id);
    expect(result).toBe('');
  });

  it('truncates to first 3 maps with +N more', async () => {
    const maps = ['m1', 'm2', 'm3', 'm4', 'm5'];
    const result = await buildMapListField(db as any, maps, game.id);
    expect(result).toContain('+2 more');
  });
});

describe('fetchTeamAssignments', () => {
  let db: any;
  let game: any;
  let mode: any;

  beforeEach(async () => {
    const data = await seedBasicTestData();
    game = data.game;
    mode = data.mode;
    db = getTestDb();
    vi.clearAllMocks();
  });

  it('returns empty teams when no participants', async () => {
    const match = await createMatch(game.id, mode.id);
    const result = await fetchTeamAssignments(db as any, match.id);
    expect(result.blueTeam).toHaveLength(0);
    expect(result.redTeam).toHaveLength(0);
    expect(result.reserves).toHaveLength(0);
  });

  it('categorizes participants by team assignment', async () => {
    const match = await createMatch(game.id, mode.id);
    await db.run(
      `INSERT INTO match_participants (id, match_id, user_id, discord_user_id, username, team_assignment)
       VALUES ('p1', ?, 'u1', 'd1', 'BluePlayer', 'blue'),
              ('p2', ?, 'u2', 'd2', 'RedPlayer', 'red'),
              ('p3', ?, 'u3', 'd3', 'ReservePlayer', NULL)`,
      [match.id, match.id, match.id]
    );

    const result = await fetchTeamAssignments(db as any, match.id);
    expect(result.blueTeam).toHaveLength(1);
    expect(result.redTeam).toHaveLength(1);
    expect(result.reserves).toHaveLength(1);
  });
});

describe('getMatchLink', () => {
  let db: any;
  let game: any;
  let mode: any;

  beforeEach(async () => {
    const data = await seedBasicTestData();
    game = data.game;
    mode = data.mode;
    db = getTestDb();
    vi.clearAllMocks();
  });

  it('returns null when no announcement message exists', async () => {
    const match = await createMatch(game.id, mode.id);
    const mockClient = { guilds: { cache: { first: () => null } } };
    const result = await getMatchLink(db as any, match.id, mockClient);
    expect(result).toBeNull();
  });

  it('returns link when announcement message and guild exist', async () => {
    const match = await createMatch(game.id, mode.id);
    await db.run(`
      INSERT INTO discord_match_messages (id, match_id, message_id, channel_id, message_type)
      VALUES ('msg1', ?, 'msg-123', 'ch-456', 'announcement')
    `, [match.id]);

    const mockClient = {
      guilds: { cache: { first: () => ({ id: 'guild-789' }) } }
    };
    const result = await getMatchLink(db as any, match.id, mockClient);
    expect(result).toContain('guild-789');
    expect(result).toContain('ch-456');
    expect(result).toContain('msg-123');
  });
});

describe('attachEventImage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns undefined for empty imageUrl', async () => {
    const result = await attachEventImage('');
    expect(result).toBeUndefined();
  });

  it('returns undefined when image file does not exist', async () => {
    fsMocks.existsSync.mockReturnValue(false);
    const result = await attachEventImage('/uploads/missing.png');
    expect(result).toBeUndefined();
  });

  it('returns AttachmentBuilder when image exists and has content', async () => {
    fsMocks.existsSync.mockReturnValue(true);
    fsMocks.promises.readFile.mockResolvedValue(Buffer.from('fake-image-data'));
    const result = await attachEventImage('/uploads/image.png');
    expect(result).toBeDefined();
  });

  it('returns undefined when image buffer is empty', async () => {
    fsMocks.existsSync.mockReturnValue(true);
    fsMocks.promises.readFile.mockResolvedValue(Buffer.alloc(0));
    const result = await attachEventImage('/uploads/empty.png');
    expect(result).toBeUndefined();
  });
});
