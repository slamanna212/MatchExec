import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getDbInstance } from '../../../lib/database-init';
import { logger } from '@/lib/logger';

interface FeedRow {
  id: string;
  event_type: string;
  priority: number;
  title: string;
  description: string | null;
  match_id: string | null;
  tournament_id: string | null;
  metadata: string | null;
  created_at: string;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get('limit');
    const offsetParam = searchParams.get('offset');
    const eventType = searchParams.get('event_type');
    const matchId = searchParams.get('match_id');
    const tournamentId = searchParams.get('tournament_id');
    const dateFrom = searchParams.get('date_from');
    const dateTo = searchParams.get('date_to');

    const limit = limitParam ? Math.min(parseInt(limitParam, 10), 100) : 20;
    const offset = offsetParam ? parseInt(offsetParam, 10) : 0;
    const hasDateFilter = !!(dateFrom || dateTo);

    const db = await getDbInstance();

    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (eventType) { conditions.push('event_type = ?'); params.push(eventType); }
    if (matchId)   { conditions.push('match_id = ?');   params.push(matchId);   }
    if (tournamentId) { conditions.push('tournament_id = ?'); params.push(tournamentId); }
    if (dateFrom)  { conditions.push('created_at >= ?'); params.push(dateFrom); }
    if (dateTo)    { conditions.push('created_at <= ?'); params.push(dateTo);   }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const events = await db.all<FeedRow>(
      `SELECT * FROM activity_feed
       ${where}
       ORDER BY priority ASC, created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const parsed = events.map(e => ({
      ...e,
      metadata: e.metadata ? JSON.parse(e.metadata) : null,
    }));

    const countRow = await db.get<{ total: number }>(
      `SELECT COUNT(*) as total FROM activity_feed ${where}`,
      params
    );
    const total = countRow?.total ?? 0;

    const maxCreatedAt = events[0]?.created_at ?? '';
    const etag = `"${total}:${maxCreatedAt}"`;
    const ifNoneMatch = request.headers.get('if-none-match');

    if (!hasDateFilter && offset === 0 && ifNoneMatch === etag) {
      return new Response(null, { status: 304, headers: { ETag: etag } });
    }

    return NextResponse.json(
      { events: parsed, total, limit, offset },
      { headers: { ETag: etag } }
    );
  } catch (error) {
    logger.error('Error fetching activity feed:', error);
    return NextResponse.json({ error: 'Failed to fetch activity feed' }, { status: 500 });
  }
}
