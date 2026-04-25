import { betterAuth } from 'better-auth';
import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = process.env.DATABASE_PATH
  ? path.resolve(process.env.DATABASE_PATH)
  : path.resolve('./app_data/data/matchexec.db');

// better-sqlite3 is used exclusively for Better Auth's adapter (synchronous driver).
// All application code continues to use the sqlite3 async driver via database-init.ts.
const authDb = new Database(DB_PATH);

const discordProvider =
  process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET
    ? {
        discord: {
          clientId: process.env.DISCORD_CLIENT_ID,
          clientSecret: process.env.DISCORD_CLIENT_SECRET,
          scope: ['identify', 'email'],
        },
      }
    : {};

export const auth = betterAuth({
  database: authDb,
  baseURL:
    process.env.BETTER_AUTH_URL ||
    process.env.PUBLIC_URL ||
    'http://localhost:3000',
  secret:
    process.env.BETTER_AUTH_SECRET ||
    'dev-secret-set-BETTER_AUTH_SECRET-in-production',
  socialProviders: discordProvider,
  user: {
    additionalFields: {
      appRole: {
        type: 'string',
        defaultValue: 'none',
        required: false,
      },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24,       // refresh if older than 1 day
  },
});

export type AuthUser = typeof auth.$Infer.Session.user & { appRole: string };
export type AuthSession = typeof auth.$Infer.Session;
