import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { getDbInstance } from '@/lib/database-init';

export async function GET(req: NextRequest) {
  const check = await requirePermission(req, 'admin');
  if (check instanceof NextResponse) return check;

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
    return NextResponse.json(
      { error: 'Discord bot is not configured yet' },
      { status: 400 },
    );
  }

  const res = await fetch(
    `https://discord.com/api/v10/guilds/${settings.guild_id}/roles`,
    { headers: { Authorization: `Bot ${settings.bot_token}` } },
  );

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json(
      { error: `Discord API error: ${text}` },
      { status: 502 },
    );
  }

  const roles: any[] = await res.json();
  const filtered = roles
    .filter(r => r.name !== '@everyone')
    .sort((a, b) => b.position - a.position)
    .map(r => ({
      id: r.id,
      name: r.name,
      color: r.color,
      position: r.position,
      managed: r.managed,
    }));

  return NextResponse.json({ roles: filtered });
}
