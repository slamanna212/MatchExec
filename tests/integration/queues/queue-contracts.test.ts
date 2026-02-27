import { describe, it, expect, beforeEach } from 'vitest';
import { getTestDb } from '../../utils/test-db';
import { createMatch, seedBasicTestData } from '../../utils/fixtures';

describe('Queue Contracts', () => {
  let game: any;
  let mode: any;

  beforeEach(async () => {
    const data = await seedBasicTestData();
    game = data.game;
    mode = data.mode;
  });

  describe('discord_announcement_queue', () => {
    it('should have required fields for AnnouncementHandler', async () => {
      const db = getTestDb();
      const match = await createMatch(game.id, mode.id);

      // Insert via the same code path as production
      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO discord_announcement_queue
           (id, match_id, announcement_type, announcement_data, status, created_at)
           VALUES (?, ?, ?, ?, ?, datetime('now'))`,
          ['announcement_1', match.id, 'match_created', null, 'pending'],
          (err) => err ? reject(err) : resolve()
        );
      });

      // Verify structure matches what consumer expects
      const entry = await new Promise<any>((resolve, reject) => {
        db.get(
          `SELECT * FROM discord_announcement_queue WHERE match_id = ?`,
          [match.id],
          (err, row) => err ? reject(err) : resolve(row)
        );
      });

      expect(entry).toHaveProperty('id');
      expect(entry).toHaveProperty('match_id');
      expect(entry).toHaveProperty('announcement_type');
      expect(entry).toHaveProperty('announcement_data');
      expect(entry).toHaveProperty('status');
      expect(entry).toHaveProperty('created_at');
      expect(entry).toHaveProperty('retry_count');
      expect(entry).toHaveProperty('processed_at');
      expect(entry).toHaveProperty('posted_at');
      expect(entry).toHaveProperty('error_message');
      expect(entry.status).toBe('pending');
      expect(entry.match_id).toBe(match.id);
    });

    it('should accept tournament announcements', async () => {
      const db = getTestDb();

      // Create a tournament ID (tournaments use tournament_ prefix)
      const tournamentId = `tournament_${  Date.now()}`;

      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO discord_announcement_queue
           (id, match_id, announcement_type, status, created_at)
           VALUES (?, ?, ?, ?, datetime('now'))`,
          ['announcement_2', tournamentId, 'tournament', 'pending'],
          (err) => err ? reject(err) : resolve()
        );
      });

      const entry = await new Promise<any>((resolve, reject) => {
        db.get(
          `SELECT * FROM discord_announcement_queue WHERE match_id = ?`,
          [tournamentId],
          (err, row) => err ? reject(err) : resolve(row)
        );
      });

      expect(entry.announcement_type).toBe('tournament');
      expect(entry.match_id).toBe(tournamentId);
    });
  });

  describe('discord_status_update_queue', () => {
    it('should have required fields for status update processor', async () => {
      const db = getTestDb();
      const match = await createMatch(game.id, mode.id);

      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO discord_status_update_queue
           (id, match_id, new_status, status, created_at)
           VALUES (?, ?, ?, ?, datetime('now'))`,
          ['status_update_1', match.id, 'assign', 'pending'],
          (err) => err ? reject(err) : resolve()
        );
      });

      const entry = await new Promise<any>((resolve, reject) => {
        db.get(
          `SELECT * FROM discord_status_update_queue WHERE match_id = ?`,
          [match.id],
          (err, row) => err ? reject(err) : resolve(row)
        );
      });

      expect(entry).toHaveProperty('id');
      expect(entry).toHaveProperty('match_id');
      expect(entry).toHaveProperty('new_status');
      expect(entry).toHaveProperty('status');
      expect(entry).toHaveProperty('retry_count');
      expect(entry).toHaveProperty('created_at');
      expect(entry).toHaveProperty('processed_at');
      expect(entry).toHaveProperty('error_message');
      expect(entry.new_status).toBe('assign');
      expect(entry.status).toBe('pending');
    });
  });

  describe('discord_reminder_queue', () => {
    it('should have required fields for ReminderHandler', async () => {
      const db = getTestDb();
      const match = await createMatch(game.id, mode.id);

      const reminderTime = new Date(Date.now() + 3600000).toISOString(); // 1 hour from now

      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO discord_reminder_queue
           (id, match_id, reminder_type, minutes_before, reminder_time, scheduled_for, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
          ['reminder_1', match.id, 'match_start', 60, reminderTime, reminderTime, 'pending'],
          (err) => err ? reject(err) : resolve()
        );
      });

      const entry = await new Promise<any>((resolve, reject) => {
        db.get(
          `SELECT * FROM discord_reminder_queue WHERE match_id = ?`,
          [match.id],
          (err, row) => err ? reject(err) : resolve(row)
        );
      });

      expect(entry).toHaveProperty('id');
      expect(entry).toHaveProperty('match_id');
      expect(entry).toHaveProperty('reminder_type');
      expect(entry).toHaveProperty('minutes_before');
      expect(entry).toHaveProperty('reminder_time');
      expect(entry).toHaveProperty('scheduled_for');
      expect(entry).toHaveProperty('status');
      expect(entry).toHaveProperty('retry_count');
      expect(entry).toHaveProperty('created_at');
      expect(entry).toHaveProperty('processed_at');
      expect(entry).toHaveProperty('sent_at');
      expect(entry).toHaveProperty('error_message');
      expect(entry.status).toBe('pending');
    });
  });

  describe('discord_match_reminder_queue', () => {
    it('should have required fields for match reminder processor', async () => {
      const db = getTestDb();
      const match = await createMatch(game.id, mode.id);

      const scheduledFor = new Date(Date.now() + 3600000).toISOString();

      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO discord_match_reminder_queue
           (id, match_id, reminder_type, scheduled_for, status, created_at)
           VALUES (?, ?, ?, ?, ?, datetime('now'))`,
          ['match_reminder_1', match.id, 'match_starting', scheduledFor, 'pending'],
          (err) => err ? reject(err) : resolve()
        );
      });

      const entry = await new Promise<any>((resolve, reject) => {
        db.get(
          `SELECT * FROM discord_match_reminder_queue WHERE match_id = ?`,
          [match.id],
          (err, row) => err ? reject(err) : resolve(row)
        );
      });

      expect(entry).toHaveProperty('id');
      expect(entry).toHaveProperty('match_id');
      expect(entry).toHaveProperty('reminder_type');
      expect(entry).toHaveProperty('scheduled_for');
      expect(entry).toHaveProperty('status');
      expect(entry).toHaveProperty('retry_count');
      expect(entry).toHaveProperty('created_at');
      expect(entry).toHaveProperty('processed_at');
      expect(entry.status).toBe('pending');
    });
  });

  describe('discord_player_reminder_queue', () => {
    it('should have required fields for player reminder processor', async () => {
      const db = getTestDb();
      const match = await createMatch(game.id, mode.id);

      const reminderTime = new Date(Date.now() + 7200000).toISOString(); // 2 hours from now

      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO discord_player_reminder_queue
           (id, match_id, user_id, reminder_type, reminder_time, scheduled_for, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
          ['player_reminder_1', match.id, 'discord_user_123', 'player_notification', reminderTime, reminderTime, 'pending'],
          (err) => err ? reject(err) : resolve()
        );
      });

      const entry = await new Promise<any>((resolve, reject) => {
        db.get(
          `SELECT * FROM discord_player_reminder_queue WHERE match_id = ?`,
          [match.id],
          (err, row) => err ? reject(err) : resolve(row)
        );
      });

      expect(entry).toHaveProperty('id');
      expect(entry).toHaveProperty('match_id');
      expect(entry).toHaveProperty('user_id');
      expect(entry).toHaveProperty('reminder_type');
      expect(entry).toHaveProperty('reminder_time');
      expect(entry).toHaveProperty('scheduled_for');
      expect(entry).toHaveProperty('status');
      expect(entry).toHaveProperty('retry_count');
      expect(entry).toHaveProperty('created_at');
      expect(entry).toHaveProperty('processed_at');
      expect(entry).toHaveProperty('sent_at');
      expect(entry).toHaveProperty('error_message');
      expect(entry.user_id).toBe('discord_user_123');
      expect(entry.status).toBe('pending');
    });
  });

  describe('discord_match_start_queue', () => {
    it('should have required fields for match start processor', async () => {
      const db = getTestDb();
      const match = await createMatch(game.id, mode.id);

      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO discord_match_start_queue
           (id, match_id, status, created_at)
           VALUES (?, ?, ?, datetime('now'))`,
          ['match_start_1', match.id, 'pending'],
          (err) => err ? reject(err) : resolve()
        );
      });

      const entry = await new Promise<any>((resolve, reject) => {
        db.get(
          `SELECT * FROM discord_match_start_queue WHERE match_id = ?`,
          [match.id],
          (err, row) => err ? reject(err) : resolve(row)
        );
      });

      expect(entry).toHaveProperty('id');
      expect(entry).toHaveProperty('match_id');
      expect(entry).toHaveProperty('status');
      expect(entry).toHaveProperty('retry_count');
      expect(entry).toHaveProperty('created_at');
      expect(entry).toHaveProperty('processed_at');
      expect(entry.status).toBe('pending');
    });
  });

  describe('discord_deletion_queue', () => {
    it('should have required fields for deletion processor', async () => {
      const db = getTestDb();
      const match = await createMatch(game.id, mode.id);

      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO discord_deletion_queue
           (id, match_id, status, created_at)
           VALUES (?, ?, ?, datetime('now'))`,
          ['deletion_1', match.id, 'pending'],
          (err) => err ? reject(err) : resolve()
        );
      });

      const entry = await new Promise<any>((resolve, reject) => {
        db.get(
          `SELECT * FROM discord_deletion_queue WHERE match_id = ?`,
          [match.id],
          (err, row) => err ? reject(err) : resolve(row)
        );
      });

      expect(entry).toHaveProperty('id');
      expect(entry).toHaveProperty('match_id');
      expect(entry).toHaveProperty('status');
      expect(entry).toHaveProperty('retry_count');
      expect(entry).toHaveProperty('created_at');
      expect(entry).toHaveProperty('processed_at');
      expect(entry.status).toBe('pending');
    });
  });

  describe('discord_score_notification_queue', () => {
    it('should have required fields for score notification handler', async () => {
      const db = getTestDb();
      const match = await createMatch(game.id, mode.id);

      // First create a match_game to get a valid game_id
      const gameId = await new Promise<string>((resolve, reject) => {
        const id = `game_${Date.now()}`;
        db.run(
          `INSERT INTO match_games
           (id, match_id, round, status, created_at)
           VALUES (?, ?, ?, ?, datetime('now'))`,
          [id, match.id, 1, 'completed'],
          (err) => {
            if (err) reject(err);
            else resolve(id);
          }
        );
      });

      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO discord_score_notification_queue
           (id, match_id, game_id, map_id, game_number, winner, winning_team_name, winning_players, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
          [
            'score_notif_1',
            match.id,
            gameId,
            'map_123',
            1,
            'team1',
            'Blue Team',
            JSON.stringify(['player1', 'player2']),
            'pending'
          ],
          (err) => err ? reject(err) : resolve()
        );
      });

      const entry = await new Promise<any>((resolve, reject) => {
        db.get(
          `SELECT * FROM discord_score_notification_queue WHERE match_id = ?`,
          [match.id],
          (err, row) => err ? reject(err) : resolve(row)
        );
      });

      expect(entry).toHaveProperty('id');
      expect(entry).toHaveProperty('match_id');
      expect(entry).toHaveProperty('game_id');
      expect(entry).toHaveProperty('map_id');
      expect(entry).toHaveProperty('game_number');
      expect(entry).toHaveProperty('winner');
      expect(entry).toHaveProperty('winning_team_name');
      expect(entry).toHaveProperty('winning_players');
      expect(entry).toHaveProperty('status');
      expect(entry).toHaveProperty('retry_count');
      expect(entry).toHaveProperty('created_at');
      expect(entry).toHaveProperty('processed_at');
      expect(entry).toHaveProperty('sent_at');
      expect(entry).toHaveProperty('error_message');
      expect(entry.winner).toBe('team1');
      expect(entry.status).toBe('pending');

      // Verify winning_players can be parsed as JSON
      const winningPlayers = JSON.parse(entry.winning_players);
      expect(winningPlayers).toEqual(['player1', 'player2']);
    });
  });

  describe('discord_voice_announcement_queue', () => {
    it('should have required fields for VoiceHandler', async () => {
      const db = getTestDb();
      const match = await createMatch(game.id, mode.id);

      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO discord_voice_announcement_queue
           (id, match_id, announcement_type, blue_team_voice_channel, red_team_voice_channel,
            first_team, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
          [
            'voice_announce_1',
            match.id,
            'welcome',
            'channel_blue_123',
            'channel_red_456',
            'blue',
            'pending'
          ],
          (err) => err ? reject(err) : resolve()
        );
      });

      const entry = await new Promise<any>((resolve, reject) => {
        db.get(
          `SELECT * FROM discord_voice_announcement_queue WHERE match_id = ?`,
          [match.id],
          (err, row) => err ? reject(err) : resolve(row)
        );
      });

      expect(entry).toHaveProperty('id');
      expect(entry).toHaveProperty('match_id');
      expect(entry).toHaveProperty('announcement_type');
      expect(entry).toHaveProperty('blue_team_voice_channel');
      expect(entry).toHaveProperty('red_team_voice_channel');
      expect(entry).toHaveProperty('first_team');
      expect(entry).toHaveProperty('status');
      expect(entry).toHaveProperty('retry_count');
      expect(entry).toHaveProperty('created_at');
      expect(entry).toHaveProperty('processed_at');
      expect(entry).toHaveProperty('updated_at');
      expect(entry).toHaveProperty('completed_at');
      expect(entry).toHaveProperty('error_message');
      expect(entry.announcement_type).toBe('welcome');
      expect(entry.first_team).toBe('blue');
      expect(entry.status).toBe('pending');
    });

    it('should handle different announcement types', async () => {
      const db = getTestDb();
      const match = await createMatch(game.id, mode.id);

      const types = ['welcome', 'nextround', 'finish'];

      for (const type of types) {
        await new Promise<void>((resolve, reject) => {
          db.run(
            `INSERT INTO discord_voice_announcement_queue
             (id, match_id, announcement_type, blue_team_voice_channel, red_team_voice_channel,
              first_team, status, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
            [
              `voice_${type}_${Date.now()}`,
              match.id,
              type,
              'channel_blue',
              'channel_red',
              'red',
              'pending'
            ],
            (err) => err ? reject(err) : resolve()
          );
        });
      }

      const entries = await new Promise<any[]>((resolve, reject) => {
        db.all(
          `SELECT * FROM discord_voice_announcement_queue WHERE match_id = ? ORDER BY created_at`,
          [match.id],
          (err, rows) => err ? reject(err) : resolve(rows)
        );
      });

      expect(entries).toHaveLength(types.length);
      expect(entries.map(e => e.announcement_type)).toEqual(types);
    });
  });

  describe('discord_map_code_queue', () => {
    it('should have required fields for map code handler', async () => {
      const db = getTestDb();
      const match = await createMatch(game.id, mode.id);

      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO discord_map_code_queue
           (id, match_id, user_id, map_name, map_code, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
          [
            'map_code_1',
            match.id,
            'discord_user_789',
            'Ilios',
            'ABC123',
            'pending'
          ],
          (err) => err ? reject(err) : resolve()
        );
      });

      const entry = await new Promise<any>((resolve, reject) => {
        db.get(
          `SELECT * FROM discord_map_code_queue WHERE match_id = ?`,
          [match.id],
          (err, row) => err ? reject(err) : resolve(row)
        );
      });

      expect(entry).toHaveProperty('id');
      expect(entry).toHaveProperty('match_id');
      expect(entry).toHaveProperty('user_id');
      expect(entry).toHaveProperty('map_name');
      expect(entry).toHaveProperty('map_code');
      expect(entry).toHaveProperty('status');
      expect(entry).toHaveProperty('retry_count');
      expect(entry).toHaveProperty('created_at');
      expect(entry).toHaveProperty('processed_at');
      expect(entry.map_name).toBe('Ilios');
      expect(entry.map_code).toBe('ABC123');
      expect(entry.status).toBe('pending');
    });
  });

  describe('discord_match_winner_queue', () => {
    it('should have required fields for match winner handler', async () => {
      const db = getTestDb();
      const match = await createMatch(game.id, mode.id);

      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO discord_match_winner_queue
           (id, match_id, match_name, game_id, winner, winning_team_name, winning_players,
            team1_score, team2_score, total_maps, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
          [
            'winner_1',
            match.id,
            'Epic Match',
            game.id,
            'team1',
            'Blue Team',
            JSON.stringify(['player1', 'player2', 'player3']),
            3,
            1,
            5,
            'pending'
          ],
          (err) => err ? reject(err) : resolve()
        );
      });

      const entry = await new Promise<any>((resolve, reject) => {
        db.get(
          `SELECT * FROM discord_match_winner_queue WHERE match_id = ?`,
          [match.id],
          (err, row) => err ? reject(err) : resolve(row)
        );
      });

      expect(entry).toHaveProperty('id');
      expect(entry).toHaveProperty('match_id');
      expect(entry).toHaveProperty('match_name');
      expect(entry).toHaveProperty('game_id');
      expect(entry).toHaveProperty('winner');
      expect(entry).toHaveProperty('winning_team_name');
      expect(entry).toHaveProperty('winning_players');
      expect(entry).toHaveProperty('team1_score');
      expect(entry).toHaveProperty('team2_score');
      expect(entry).toHaveProperty('total_maps');
      expect(entry).toHaveProperty('status');
      expect(entry).toHaveProperty('retry_count');
      expect(entry).toHaveProperty('created_at');
      expect(entry).toHaveProperty('processed_at');
      expect(entry).toHaveProperty('sent_at');
      expect(entry).toHaveProperty('error_message');
      expect(entry.winner).toBe('team1');
      expect(entry.team1_score).toBe(3);
      expect(entry.team2_score).toBe(1);
      expect(entry.status).toBe('pending');

      // Verify winning_players can be parsed as JSON
      const winningPlayers = JSON.parse(entry.winning_players);
      expect(winningPlayers).toEqual(['player1', 'player2', 'player3']);
    });

    it('should support tournament winner notifications', async () => {
      const db = getTestDb();
      const tournamentId = `tournament_${  Date.now()}`;

      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO discord_match_winner_queue
           (id, match_id, match_name, game_id, winner, winning_team_name, winning_players,
            team1_score, team2_score, total_maps, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
          [
            'winner_tournament_1',
            tournamentId,
            '🏆 Summer Championship',
            game.id,
            'tournament',
            'Champions',
            JSON.stringify(['player1', 'player2']),
            8, // total participants
            1, // format indicator (1 = double elimination)
            0, // not used for tournaments
            'pending'
          ],
          (err) => err ? reject(err) : resolve()
        );
      });

      const entry = await new Promise<any>((resolve, reject) => {
        db.get(
          `SELECT * FROM discord_match_winner_queue WHERE match_id = ?`,
          [tournamentId],
          (err, row) => err ? reject(err) : resolve(row)
        );
      });

      expect(entry.winner).toBe('tournament');
      expect(entry.match_id).toBe(tournamentId);
      expect(entry.match_name).toBe('🏆 Summer Championship');
    });
  });

  describe('discord_bot_requests', () => {
    it('should have required fields for bot request processor', async () => {
      const db = getTestDb();

      const requestData = {
        matchId: 'match_123',
        categoryId: 'category_456',
        blueChannelName: 'Blue Team',
        redChannelName: 'Red Team',
        isSingleTeam: false
      };

      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO discord_bot_requests
           (id, type, data, status, created_at)
           VALUES (?, ?, ?, ?, datetime('now'))`,
          [
            'bot_request_1',
            'voice_channel_create',
            JSON.stringify(requestData),
            'pending'
          ],
          (err) => err ? reject(err) : resolve()
        );
      });

      const entry = await new Promise<any>((resolve, reject) => {
        db.get(
          `SELECT * FROM discord_bot_requests WHERE id = ?`,
          ['bot_request_1'],
          (err, row) => err ? reject(err) : resolve(row)
        );
      });

      expect(entry).toHaveProperty('id');
      expect(entry).toHaveProperty('type');
      expect(entry).toHaveProperty('data');
      expect(entry).toHaveProperty('result');
      expect(entry).toHaveProperty('status');
      expect(entry).toHaveProperty('retry_count');
      expect(entry).toHaveProperty('created_at');
      expect(entry).toHaveProperty('processed_at');
      expect(entry).toHaveProperty('updated_at');
      expect(entry.status).toBe('pending');

      // Verify data can be parsed as JSON
      const parsedData = JSON.parse(entry.data);
      expect(parsedData).toEqual(requestData);
    });

    it('should support different request types', async () => {
      const db = getTestDb();

      const requestTypes = [
        'voice_channel_create',
        'voice_channel_delete',
        'voice_test'
      ];

      for (const type of requestTypes) {
        await new Promise<void>((resolve, reject) => {
          db.run(
            `INSERT INTO discord_bot_requests
             (id, type, data, status, created_at)
             VALUES (?, ?, ?, ?, datetime('now'))`,
            [`bot_request_${type}`, type, JSON.stringify({ testData: true }), 'pending'],
            (err) => err ? reject(err) : resolve()
          );
        });
      }

      const entries = await new Promise<any[]>((resolve, reject) => {
        db.all(
          `SELECT * FROM discord_bot_requests WHERE id LIKE 'bot_request_%' ORDER BY created_at`,
          (err, rows) => err ? reject(err) : resolve(rows)
        );
      });

      expect(entries.length).toBeGreaterThanOrEqual(requestTypes.length);
      const foundTypes = entries.map(e => e.type).filter(t => requestTypes.includes(t));
      expect(foundTypes.length).toBe(requestTypes.length);
    });
  });

  describe('Queue Status Values', () => {
    it('should enforce valid status values with CHECK constraint', async () => {
      const db = getTestDb();
      const match = await createMatch(game.id, mode.id);

      // Valid statuses should work
      const validStatuses = ['pending', 'processing', 'completed', 'failed'];

      for (const status of validStatuses) {
        await expect(
          new Promise<void>((resolve, reject) => {
            db.run(
              `INSERT INTO discord_deletion_queue (id, match_id, status, created_at)
               VALUES (?, ?, ?, datetime('now'))`,
              [`deletion_status_${status}`, match.id, status],
              (err) => err ? reject(err) : resolve()
            );
          })
        ).resolves.not.toThrow();
      }

      // Invalid status should fail
      await expect(
        new Promise<void>((resolve, reject) => {
          db.run(
            `INSERT INTO discord_deletion_queue (id, match_id, status, created_at)
             VALUES (?, ?, ?, datetime('now'))`,
            ['deletion_invalid', match.id, 'invalid_status'],
            (err) => err ? reject(err) : resolve()
          );
        })
      ).rejects.toThrow();
    });
  });
});
