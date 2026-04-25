import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { getDbInstance } from '@/lib/database-init';

export async function GET(req: NextRequest) {
  const check = await requirePermission(req, 'admin');
  if (check instanceof NextResponse) return check;

  const db = await getDbInstance();
  const mappings = await new Promise<any[]>((resolve, reject) => {
    db.all(
      'SELECT * FROM role_mappings ORDER BY discord_role_name ASC',
      [],
      (err, rows) => { if (err) reject(err); else resolve(rows as any[]); },
    );
  });

  return NextResponse.json({ mappings });
}

export async function POST(req: NextRequest) {
  const check = await requirePermission(req, 'owner');
  if (check instanceof NextResponse) return check;

  const body = await req.json();
  const { discord_role_id, discord_role_name, discord_role_color, app_role } = body;

  if (!discord_role_id || !discord_role_name || !app_role) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }
  if (!['owner', 'admin', 'moderator', 'viewer'].includes(app_role)) {
    return NextResponse.json({ error: 'Invalid app_role' }, { status: 400 });
  }

  const db = await getDbInstance();
  const id = await new Promise<number>((resolve, reject) => {
    db.run(
      `INSERT INTO role_mappings (discord_role_id, discord_role_name, discord_role_color, app_role)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(discord_role_id) DO UPDATE SET
         discord_role_name  = excluded.discord_role_name,
         discord_role_color = excluded.discord_role_color,
         app_role           = excluded.app_role,
         updated_at         = CURRENT_TIMESTAMP`,
      [discord_role_id, discord_role_name, discord_role_color ?? 0, app_role],
      function (err) { if (err) reject(err); else resolve(this.lastID); },
    );
  });

  return NextResponse.json({ id }, { status: 201 });
}
