import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { getDbInstance } from '@/lib/database-init';

export async function POST(req: NextRequest) {
  const check = await requirePermission(req, 'owner');
  if (check instanceof NextResponse) return check;

  const { name, color } = await req.json();
  if (!name?.trim()) {
    return NextResponse.json({ error: 'Role name is required' }, { status: 400 });
  }

  const db = await getDbInstance();
  const settings = await new Promise<{ bot_token: string; guild_id: string } | null>(
    (resolve, reject) => {
      db.get(
        'SELECT bot_token, guild_id FROM discord_settings LIMIT 1',
        [],
        (err, row) => { if (err) reject(err); else resolve(row as any); },
      );
    },
  );

  if (!settings?.bot_token || !settings?.guild_id) {
    return NextResponse.json({ error: 'Discord bot is not configured yet' }, { status: 400 });
  }

  const res = await fetch(
    `https://discord.com/api/v10/guilds/${settings.guild_id}/roles`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bot ${settings.bot_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: name.trim(),
        color: color ?? 0,
        hoist: false,
        mentionable: false,
      }),
    },
  );

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json({ error: `Discord API error: ${text}` }, { status: 502 });
  }

  const role = await res.json();
  return NextResponse.json(
    { role: { id: role.id, name: role.name, color: role.color } },
    { status: 201 },
  );
}
