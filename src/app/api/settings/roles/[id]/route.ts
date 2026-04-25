import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { getDbInstance } from '@/lib/database-init';

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const check = await requirePermission(req, 'owner');
  if (check instanceof NextResponse) return check;

  const { id } = await params;
  const body = await req.json();
  const { app_role } = body;

  if (!app_role || !['owner', 'admin', 'moderator', 'viewer'].includes(app_role)) {
    return NextResponse.json({ error: 'Invalid app_role' }, { status: 400 });
  }

  const db = await getDbInstance();
  const changes = await new Promise<number>((resolve, reject) => {
    db.run(
      'UPDATE role_mappings SET app_role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [app_role, id],
      function (err) { if (err) reject(err); else resolve(this.changes); },
    );
  });

  if (changes === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const check = await requirePermission(req, 'owner');
  if (check instanceof NextResponse) return check;

  const { id } = await params;
  const db = await getDbInstance();
  const changes = await new Promise<number>((resolve, reject) => {
    db.run(
      'DELETE FROM role_mappings WHERE id = ?',
      [id],
      function (err) { if (err) reject(err); else resolve(this.changes); },
    );
  });

  if (changes === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
