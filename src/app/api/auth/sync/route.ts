import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDbInstance } from '@/lib/database-init';
import { ROLE_PRIORITY, type AppRole } from '@/lib/permissions';

/**
 * Called after Discord OAuth completes. Fetches the user's Discord guild roles,
 * resolves them to the highest app permission level via role_mappings, and
 * updates the user record. Guild owner always gets 'owner' role.
 */
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  try {
    await syncDiscordRole(session.user.id);
  } catch (err) {
    // Non-fatal: proceed even if role sync fails (e.g. Discord bot not yet configured)
    console.error('[auth/sync] Role sync failed:', err);
  }

  const rawRedirect = req.nextUrl.searchParams.get('redirect') || '/';
  // Prevent open redirect — only allow same-origin relative paths
  const redirectPath = rawRedirect.startsWith('/') ? rawRedirect : '/';
  return NextResponse.redirect(new URL(redirectPath, req.url));
}

async function syncDiscordRole(userId: string): Promise<void> {
  const db = await getDbInstance();

  // Get this user's Discord account ID from Better Auth's account table
  const account = await new Promise<{ accountId: string } | null>((resolve, reject) => {
    db.get(
      "SELECT accountId FROM account WHERE userId = ? AND providerId = 'discord' LIMIT 1",
      [userId],
      (err, row) => { if (err) reject(err); else resolve(row as any); },
    );
  });
  if (!account) return;
  const discordId = account.accountId;

  // Get Discord bot settings
  const settings = await new Promise<{ bot_token: string; guild_id: string } | null>(
    (resolve, reject) => {
      db.get(
        'SELECT bot_token, guild_id FROM discord_settings LIMIT 1',
        [],
        (err, row) => { if (err) reject(err); else resolve(row as any); },
      );
    },
  );
  if (!settings?.bot_token || !settings?.guild_id) return;

  const { bot_token, guild_id } = settings;

  // Check if the logging-in user is the Discord guild owner
  const guildRes = await fetch(`https://discord.com/api/v10/guilds/${guild_id}`, {
    headers: { Authorization: `Bot ${bot_token}` },
  });
  if (guildRes.ok) {
    const guild = await guildRes.json();
    if (guild.owner_id === discordId) {
      await updateUserRole(db, userId, 'owner');
      return;
    }
  }

  // Fetch guild member to get their role list
  const memberRes = await fetch(
    `https://discord.com/api/v10/guilds/${guild_id}/members/${discordId}`,
    { headers: { Authorization: `Bot ${bot_token}` } },
  );
  if (!memberRes.ok) return;

  const member = await memberRes.json();
  const memberRoleIds: string[] = member.roles || [];

  // Load all role mappings
  const roleMappings = await new Promise<Array<{ discord_role_id: string; app_role: string }>>(
    (resolve, reject) => {
      db.all(
        'SELECT discord_role_id, app_role FROM role_mappings',
        [],
        (err, rows) => { if (err) reject(err); else resolve(rows as any[]); },
      );
    },
  );

  // Resolve the highest permission level the user holds
  let highestRole: AppRole = 'none';
  let highestPriority = 0;
  for (const roleId of memberRoleIds) {
    const mapping = roleMappings.find(m => m.discord_role_id === roleId);
    if (mapping) {
      const priority = ROLE_PRIORITY[mapping.app_role as AppRole] ?? 0;
      if (priority > highestPriority) {
        highestPriority = priority;
        highestRole = mapping.app_role as AppRole;
      }
    }
  }

  await updateUserRole(db, userId, highestRole);
}

function updateUserRole(db: any, userId: string, role: AppRole): Promise<void> {
  return new Promise((resolve, reject) => {
    db.run(
      'UPDATE "user" SET appRole = ?, updatedAt = ? WHERE id = ?',
      [role, Date.now(), userId],
      (err: Error | null) => { if (err) reject(err); else resolve(); },
    );
  });
}
